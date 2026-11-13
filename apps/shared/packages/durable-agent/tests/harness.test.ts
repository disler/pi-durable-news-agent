import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  CATALOG,
  createModelCatalog,
  DEFAULT_MODEL,
  parseLiteLLMRoutes,
  say,
} from "../src/index.ts";
import { ask, fauxHarness, tempDir } from "./helpers.ts";

test("the catalog defaults to Haiku 5.5 and every id resolves in pi-ai 1.1.0 OpenRouter", () => {
  assert.equal(DEFAULT_MODEL, "anthropic/claude-haiku-5.5");
  assert.equal(CATALOG.length, 30);
  const catalog = createModelCatalog({ provider: "openrouter" });
  assert.deepEqual(catalog.defaultModel, {
    provider: "openrouter",
    modelId: "anthropic/claude-haiku-5.5",
  });
  const list = catalog.list();
  assert.equal(list.length, 30);
  assert.equal(list[0].contextWindow, 1_000_000);
  assert.throws(() => catalog.ref("made/up-model"), /Unknown model/);
});

test("DNA_PROVIDER=litellm serves the same catalog ids through the proxy's Chat Completions API", () => {
  const catalog = createModelCatalog({
    provider: "litellm",
    litellm: { baseUrl: "http://127.0.0.1:4000/v1/" },
  });
  assert.equal(catalog.provider, "litellm");
  assert.deepEqual(catalog.defaultModel, {
    provider: "litellm",
    modelId: "anthropic/claude-haiku-5.5",
  });
  const list = catalog.list();
  assert.equal(list.length, 30);
  assert.equal(list[0].provider, "litellm");
  assert.equal(list[0].contextWindow, 1_000_000);
  const model = catalog.models.getModel("litellm", "anthropic/claude-haiku-5.5");
  assert.ok(model);
  assert.equal(model.api, "openai-completions");
  assert.equal(model.baseUrl, "http://127.0.0.1:4000/v1");
  assert.equal(catalog.models.getModel("openrouter", "anthropic/claude-haiku-5.5"), undefined);
  assert.throws(() => catalog.ref("made/up-model"), /Unknown model/);
  assert.throws(() => createModelCatalog({ provider: "litellm" }), /LITELLM_BASE_URL/);
});

test("DNA_LITELLM_MODELS parses catalogId=proxyName[@window] routes and rejects mistakes", () => {
  assert.equal(parseLiteLLMRoutes(undefined), undefined);
  assert.equal(parseLiteLLMRoutes("  "), undefined);
  const routes = parseLiteLLMRoutes(
    "anthropic/claude-haiku-5.5=claude-haiku-5-5, openai/gpt-6-sol=gpt-6-sol@272000,openai/gpt-6-luna",
  )!;
  assert.deepEqual([...routes], [
    ["anthropic/claude-haiku-5.5", { proxyName: "claude-haiku-5-5" }],
    ["openai/gpt-6-sol", { proxyName: "gpt-6-sol", contextWindow: 272_000 }],
    ["openai/gpt-6-luna", { proxyName: "openai/gpt-6-luna" }],
  ]);
  assert.throws(
    () => parseLiteLLMRoutes("claude-haiku-5-5=claude-haiku-5-5"),
    /not a catalog id \(did you mean anthropic\/claude-haiku-5\.5\?\)/,
  );
  assert.throws(() => parseLiteLLMRoutes("openai/gpt-6-sol=a,openai/gpt-6-sol=b"), /twice/);
  assert.throws(() => parseLiteLLMRoutes("openai/gpt-6-sol=gpt-6-sol@big"), /invalid context window/);
  assert.throws(() => parseLiteLLMRoutes("openai/gpt-6-sol="), /no proxy model name/);
});

test("LiteLLM routes narrow the catalog, override windows, and rename only on the wire", async () => {
  const catalog = createModelCatalog({
    provider: "litellm",
    litellm: {
      baseUrl: "http://127.0.0.1:9/v1",
      models: "anthropic/claude-haiku-5.5=claude-haiku-5-5,openai/gpt-6-sol=gpt-6-sol@272000",
    },
  });
  // Catalog order, only the routed models.
  assert.deepEqual(
    catalog.list().map((m) => m.id),
    ["anthropic/claude-haiku-5.5", "openai/gpt-6-sol"],
  );
  assert.equal(catalog.info("openai/gpt-6-sol")?.contextWindow, 272_000);
  assert.equal(catalog.models.getModel("litellm", "openai/gpt-6-sol")?.contextWindow, 272_000);
  assert.throws(() => catalog.ref("anthropic/claude-opus-5.5"), /not in DNA_LITELLM_MODELS/);
  assert.throws(
    () =>
      createModelCatalog({
        provider: "litellm",
        defaultModel: "anthropic/claude-opus-5.5",
        litellm: { baseUrl: "http://127.0.0.1:9/v1", models: "openai/gpt-6-sol=gpt-6-sol" },
      }),
    /not in DNA_LITELLM_MODELS/,
  );

  // The request body carries the proxy name; Model.id stays the catalog id. No key is set, so this also covers the
  // keyless path. The callback throws to stop before any request leaves; port 9 refuses it anyway.
  const model = catalog.models.getModel("litellm", "anthropic/claude-haiku-5.5")!;
  assert.equal(model.id, "anthropic/claude-haiku-5.5");
  let sent: unknown;
  const reply = await catalog.models
    .completeSimple(
      model,
      { systemPrompt: "s", messages: [{ role: "user", content: "hi", timestamp: 0 }] },
      {
        signal: AbortSignal.timeout(5_000),
        onPayload: (payload) => {
          sent = (payload as { model?: unknown }).model;
          throw new Error("stop before sending");
        },
      },
    )
    .catch((error: unknown) => ({ error }));
  assert.equal(sent, "claude-haiku-5-5", `payload not built: ${JSON.stringify(reply)}`);
});

test("the harness stores in WAL, answers on the faux model, and offers no bash or file tools", async () => {
  const t = tempDir();
  try {
    const { ctx, root, close } = await fauxHarness(
      t.dir,
      [(turn) => say(`hello ${turn.lastUser}`)],
      [],
    );
    const settled = await ask(root, ctx, "world");
    assert.equal(settled.status, "done");
    const agent = await root.agent(ctx);
    assert.deepEqual(
      agent.tools.map((x) => x.name),
      [],
    );
    const db = new DatabaseSync(join(t.dir, "agent.sqlite"));
    assert.equal((db.prepare("PRAGMA journal_mode").get() as any).journal_mode, "wal");
    db.close();
    await close();
  } finally {
    t.cleanup();
  }
});

test("a second process cannot open the same agent database", async () => {
  const t = tempDir();
  try {
    const first = await fauxHarness(t.dir, [], []);
    const other = spawnSync(
      process.execPath,
      ["--import", "tsx", join(import.meta.dirname, "fixtures/host.ts"), t.dir, "resume"],
      { encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
    );
    assert.notEqual(other.status, 0);
    assert.match(other.stderr, /already owned by process/);
    await first.close();
  } finally {
    t.cleanup();
  }
});
