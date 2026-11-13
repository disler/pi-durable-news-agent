// Server configuration from the root .env and flags. Every default here is documented in .env.example.
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadNetwork, repoRoot } from "@dna/sdk/node";

export interface Config {
  device: string;
  /** The device's name in dna-network.yaml (DNA_DEVICE_LABEL on devices, written by `just net`). */
  deviceName: string;
  mode: string;
  host: string;
  port: number;
  dataDir: string;
  rootDir: string;
  configDir: string;
  promptsDir: string;
  provider: "openrouter" | "litellm" | "faux";
  /** The LiteLLM proxy's OpenAI-compatible URL; read when provider is litellm. */
  litellmBaseUrl?: string;
  /** DNA_LITELLM_MODELS: catalogId=proxyName[@contextWindow] routes; unset serves every catalog id by its own name. */
  litellmModels?: string;
  jevBackend: "auto" | "fixture" | "mock" | "openrouter" | "typesafe";
  /** auto | web | fallback | firecrawl | fixture; SearchService warns on anything else and searches the web. */
  searchMode: string;
  firecrawlKey?: string;
  sweepCredits: number;
  dailyCredits: number;
  /** Topic keywords searched per sweep, heaviest and least recently searched first. */
  sweepQueries: number;
  /** Cap on sources the agent saves with save_source. */
  maxSavedSources: number;
  model: string;
  researchModel: string;
  imageModel: string;
  imageQuality: string;
  openaiKey?: string;
  cronSchedule: string;
  clientToken: string;
  cronToken: string;
  stallMinutes: number;
}

/** apps/dna-server-api: its prompts and default config live with it. */
const APP_DIR = resolve(import.meta.dirname, "..");

const int = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function loadConfig(argv = process.argv.slice(2), env = process.env): Config {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: "string" },
      host: { type: "string" },
      "data-dir": { type: "string" },
      device: { type: "string" },
    },
    allowPositionals: true,
    strict: false,
  });
  const rootDir = repoRoot();
  const provider =
    env.DNA_PROVIDER === "faux" ? "faux" : env.DNA_PROVIDER === "litellm" ? "litellm" : "openrouter";
  const searchMode = env.DNA_SEARCH_MODE?.trim() || "auto";
  const config: Config = {
    device: String(values.device ?? env.DNA_DEVICE_NAME ?? "local"),
    deviceName: "",
    mode: env.DNA_MODE ?? (provider === "faux" ? "faux" : "live"),
    host: String(values.host ?? env.DNA_HOST ?? "127.0.0.1"),
    port: int(values.port as string | undefined, int(env.DNA_PORT, 4850)),
    dataDir: resolve(String(values["data-dir"] ?? env.DNA_DATA_DIR ?? join(rootDir, "data"))),
    rootDir,
    configDir: join(APP_DIR, "config"),
    promptsDir: join(APP_DIR, "prompt_engineering"),
    provider,
    litellmBaseUrl: env.LITELLM_BASE_URL?.trim() || undefined,
    litellmModels: env.DNA_LITELLM_MODELS?.trim() || undefined,
    jevBackend:
      (env.JEV_BACKEND as Config["jevBackend"]) ?? (searchMode === "fixture" ? "fixture" : "auto"),
    searchMode,
    firecrawlKey: env.FIRECRAWL_API_KEY?.trim() || undefined,
    sweepCredits: int(env.DNA_FIRECRAWL_SWEEP_CREDITS, 5),
    dailyCredits: int(env.DNA_FIRECRAWL_DAILY_CREDITS, 40),
    sweepQueries: int(env.DNA_SWEEP_QUERIES, 15),
    maxSavedSources: int(env.DNA_MAX_SAVED_SOURCES, 25),
    model: env.DNA_MODEL ?? "anthropic/claude-haiku-5.5",
    researchModel: env.DNA_RESEARCH_MODEL ?? env.DNA_MODEL ?? "anthropic/claude-haiku-5.5",
    imageModel: env.DNA_IMAGE_MODEL ?? "gpt-image-2.5-flare",
    imageQuality: env.DNA_IMAGE_QUALITY ?? "low",
    openaiKey: env.OPENAI_API_KEY?.trim() || undefined,
    cronSchedule: env.DNA_CRON_SCHEDULE ?? "* * * * *",
    clientToken: env.DNA_CLIENT_TOKEN?.trim() ?? "",
    cronToken: env.DNA_CRON_TOKEN?.trim() ?? "",
    stallMinutes: int(env.DNA_STALL_MINUTES, 30),
  };
  config.deviceName =
    env.DNA_DEVICE_LABEL?.trim() ||
    (() => {
      try {
        return loadNetwork().devices[config.device]?.name;
      } catch {
        return undefined;
      }
    })() ||
    config.device;
  return config;
}

export function assertTokens(config: Config): void {
  for (const [name, token] of [
    ["DNA_CLIENT_TOKEN", config.clientToken],
    ["DNA_CRON_TOKEN", config.cronToken],
  ] as const) {
    if (token.length < 32)
      throw new Error(`${name} must be at least 32 characters. Run: just api tokens`);
  }
  if (config.clientToken === config.cronToken)
    throw new Error("DNA_CLIENT_TOKEN and DNA_CRON_TOKEN must differ. Run: just api tokens");
}

// Next fire time of an every-N-minutes or fixed-minute schedule; enough for the default cron line.
export function nextRun(schedule: string, now = new Date()): Date | undefined {
  const minute = schedule.trim().split(/\s+/)[0];
  const step = minute.match(/^\*\/(\d+)$/)?.[1];
  const next = new Date(now);
  next.setSeconds(0, 0);
  if (step) {
    const n = Number(step);
    next.setMinutes(Math.floor(now.getMinutes() / n) * n + n);
    return next;
  }
  if (/^\d+$/.test(minute)) {
    next.setMinutes(Number(minute));
    if (next <= now) next.setHours(next.getHours() + 1);
    return next;
  }
  return undefined;
}
