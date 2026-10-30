import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ContractError, JevClient, noul, choice, score } from "../src/index.ts";

const questions = {
  kind: choice("Which kind is `text`?", {
    release: "A version shipped",
    opinion: "An opinion piece",
  }),
  worth: noul("Is `text` worth reading?"),
  level: score("How actionable is `text`?", ["None", "Some", "Very"]),
};

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const valid = {
  model: "jev-1.13.0",
  answers: {
    kind: {
      type: "choice",
      choice: "release",
      probabilities: { release: 0.9, opinion: 0.1 },
      confidence: 0.85,
    },
    worth: { type: "noul", noul: 0.8 },
    level: {
      type: "score",
      score: 1.6,
      legend: { "0": "None", "1": "Some", "2": "Very" },
      probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 },
      confidence: 0.6,
    },
  },
  usage: { input_tokens: 1000, output_tokens: 3 },
};

function stub(t: TestContext, impl: () => Promise<Response>) {
  return t.mock.method(globalThis, "fetch", impl);
}
const live = () => new JevClient({ provider: "openrouter", apiKey: "dummy-key", retryDelayMs: 0 });

test("TypeSafe translates the OpenRouter Jev alias to its native model ID", async (t) => {
  let model = "";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      model = JSON.parse(String(init?.body)).model;
      return ok(valid);
    },
  );
  const client = new JevClient({ provider: "typesafe", apiKey: "dummy-key" });
  await client.systemOne({ text: "x" }, questions, { model: "~typesafe/jev-latest" });
  assert.equal(model, "jev-latest");
});

test("mock is forced under node:test and answers every question", async () => {
  const client = new JevClient();
  assert.equal(client.provider, "mock");
  const result = await client.systemOne({ text: "v2 release notes" }, questions);
  assert.deepEqual(Object.keys(result.answers).sort(), ["kind", "level", "worth"]);
  assert.equal(result.meta.cost.source, "mock");
});

test("retries 503 then succeeds, estimating cost from the default OpenRouter price", async (t) => {
  let calls = 0;
  const fetch = stub(t, async () => (++calls === 1 ? ok({}, 503) : ok(valid)));
  const result = await live().systemOne({ text: "x" }, questions);
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(result.meta.attempts, 2);
  assert.equal(result.meta.cost.source, "estimated");
  assert.equal(result.meta.cost.amount, (1000 / 1_000_000) * 0.042);
});

test("reported cost wins over the estimate", async (t) => {
  stub(t, async () => ok({ ...valid, usage: { ...valid.usage, cost: 0.00005 } }));
  const result = await live().systemOne({ text: "x" }, questions);
  assert.deepEqual(result.meta.cost, { amount: 0.00005, source: "reported" });
});

test("does not retry a 400", async (t) => {
  const fetch = stub(t, async () => ok({ error: "bad" }, 400));
  await assert.rejects(live().systemOne({ text: "x" }, questions), /HTTP 400/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("an undeclared choice is a contract error, never retried", async (t) => {
  const bad = structuredClone(valid) as any;
  bad.answers.kind.choice = "rumor";
  const fetch = stub(t, async () => ok(bad));
  await assert.rejects(live().systemOne({ text: "x" }, questions), ContractError);
  assert.equal(fetch.mock.callCount(), 1);
});

test("a score legend that does not match the criteria is a contract error", async (t) => {
  const bad = structuredClone(valid) as any;
  bad.answers.level.legend = { "0": "None", "1": "Some", "2": "Lots" };
  stub(t, async () => ok(bad));
  await assert.rejects(live().systemOne({ text: "x" }, questions), /legend/);
});
