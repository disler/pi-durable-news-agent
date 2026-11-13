// dna doctor: Node 24, keys present (names only), the API, the scope matrix, the crontab line, search mode and credits.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DnaClient } from "@dna/sdk";
import { repoRoot } from "@dna/sdk/node";
import { managedLine, readCrontab } from "../../dna-server-cron/src/crontab.ts";
import { probe, type Check } from "./net/probe.ts";
import { searchEngines } from "./print.ts";

const SHARED_KEYS = ["OPENAI_API_KEY", "FIRECRAWL_API_KEY", "DNA_CLIENT_TOKEN", "DNA_CRON_TOKEN"];
// DNA_PROVIDER=litellm serves the agents through a LiteLLM proxy; jev then needs its own key (TypeSafe or OpenRouter).
const PROVIDER_KEYS = {
  openrouter: ["OPENROUTER_API_KEY"],
  litellm: ["LITELLM_BASE_URL", "LITELLM_API_KEY", "DNA_LITELLM_MODELS"],
} as const;
const OPTIONAL: Record<string, string> = {
  OPENAI_API_KEY: "missing, cards without a source image show none",
  FIRECRAWL_API_KEY: "missing, search and page reads use the free engines",
  LITELLM_API_KEY: "missing, requests go to the proxy without a key",
  DNA_LITELLM_MODELS: "missing, every catalog id is sent under its own name",
};

export async function doctor(
  client: DnaClient,
  tokens: { client?: string; cron?: string },
): Promise<Check[]> {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({ name: "Node 24", ok: major >= 24, detail: process.versions.node });
  const envFile = join(repoRoot(), ".env");
  const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const isSet = (key: string) => new RegExp(`^${key}=.+`, "m").test(env) || !!process.env[key];
  const provider =
    (process.env.DNA_PROVIDER ?? env.match(/^DNA_PROVIDER=(\S+)/m)?.[1]) === "litellm"
      ? "litellm"
      : "openrouter";
  for (const key of [...PROVIDER_KEYS[provider], ...SHARED_KEYS]) {
    const present = isSet(key);
    checks.push({
      name: `${key} is set`,
      ok: present || key in OPTIONAL,
      detail: present ? "present" : (OPTIONAL[key] ?? "missing"),
    });
  }
  if (provider === "litellm") {
    const jevKey = ["TYPESAFE_API_KEY", "OPENROUTER_API_KEY"].find(isSet);
    checks.push({
      name: "jev key is set",
      ok: !!jevKey,
      detail: jevKey ? `${jevKey} present` : "missing: set TYPESAFE_API_KEY (or OPENROUTER_API_KEY)",
    });
  }
  checks.push(...(await probe(client.baseUrl, tokens)));
  let cronLine: string | undefined;
  try {
    cronLine = managedLine(readCrontab());
  } catch {}
  checks.push({
    name: "crontab line on this machine",
    ok: true,
    detail: cronLine ?? "none: this Mac sweeps on `just cron tick` (always on: just combos local)",
  });
  try {
    const info = await client.info();
    checks.push({ name: "search mode", ok: true, detail: info.searchMode });
    const engines = info.search?.engines ?? [];
    if (engines.length) {
      const resting = (name: string) => {
        const until = engines.find((e) => e.name === name)?.coolingUntil;
        return !!until && Date.parse(until) > Date.now();
      };
      checks.push({
        name: "search engines",
        // News search works while one news engine is not resting (Firecrawl counts in firecrawl mode).
        ok:
          !resting("bing-news") ||
          !resting("google-news") ||
          (info.searchMode === "firecrawl" && !resting("firecrawl")),
        detail: searchEngines(engines),
      });
    }
    if (info.searchMode === "firecrawl")
      checks.push({
        name: "Firecrawl credits",
        ok: (info.firecrawl?.creditsLeft ?? 1) > 0,
        detail: `${info.firecrawl?.creditsLeft ?? "unknown"} left, ${info.firecrawl?.creditsToday ?? 0} of ${info.firecrawl?.dailyCap} used today`,
      });
  } catch (error) {
    checks.push({ name: "API info", ok: false, detail: String((error as Error).message) });
  }
  return checks;
}
