// The model catalog: Haiku 5.5 (default) plus 29 more models, through OpenRouter (default) or a LiteLLM proxy.
// DNA_PROVIDER=litellm serves the catalog through LITELLM_BASE_URL, renamed and narrowed by DNA_LITELLM_MODELS;
// DNA_PROVIDER=faux swaps in a free deterministic model with the same 1M window.
import {
  envApiKeyAuth,
  type Api,
  type Model,
  type ProviderStreams,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import {
  createModels,
  createProvider,
  type MutableModels,
  type Provider,
} from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import type { ModelRef } from "@earendil-works/pi-durable";

export interface CatalogEntry {
  id: string;
  name: string;
  tier: string;
  icon: string;
}

export interface ModelInfo extends CatalogEntry {
  provider: string;
  contextWindow: number;
  reasoning: boolean;
  cost: { input: number; output: number };
}

export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
export const FAUX_WINDOW = 1_000_000;
export const FAUX_MODEL = "faux-haiku";

export const CATALOG: readonly CatalogEntry[] = [
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", tier: "A", icon: "anthropic.png" },
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", tier: "S+", icon: "anthropic.png" },
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    tier: "S+",
    icon: "anthropic.png",
  },
  { id: "anthropic/claude-fable-5.1", name: "Claude Fable 5.1", tier: "S+", icon: "anthropic.png" },
  { id: "openai/gpt-6-astra", name: "GPT-6 Astra", tier: "S+", icon: "openai.png" },
  { id: "anthropic/claude-opus-5", name: "Opus 5", tier: "S+", icon: "anthropic.png" },
  { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", tier: "S+", icon: "openai.png" },
  { id: "anthropic/claude-fable-5", name: "Fable 5", tier: "S", icon: "anthropic.png" },
  { id: "meta/muse-spark-1.3", name: "Muse Spark 1.3", tier: "S", icon: "meta.png" },
  { id: "openai/gpt-6-sol", name: "GPT-6 Sol", tier: "S", icon: "openai.png" },
  { id: "x-ai/grok-4.7", name: "Grok 4.7", tier: "S", icon: "grok.png" },
  { id: "xiaomi/mimo-v2.6-pro", name: "MiMo-V2.6-Pro", tier: "S", icon: "xiaomi.png" },
  { id: "x-ai/grok-4.6", name: "Grok 4.6", tier: "S", icon: "grok.png" },
  { id: "z-ai/glm-5.3", name: "GLM-5.3", tier: "A", icon: "zai.png" },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", tier: "A", icon: "kimi.png" },
  { id: "openai/gpt-5.6-terra", name: "GPT 5.6 Terra", tier: "A", icon: "openai.png" },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", tier: "A", icon: "gemini.png" },
  { id: "qwen/qwen3.8-2.4t-a95b", name: "Qwen3.8-2.4T-A95B", tier: "A", icon: "qwen.png" },
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    tier: "A",
    icon: "deepseek.png",
  },
  { id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash", tier: "A", icon: "gemini.png" },
  { id: "anthropic/claude-sonnet-5", name: "Sonnet 5", tier: "A", icon: "anthropic.png" },
  { id: "openai/gpt-6-luna", name: "GPT-6 Luna", tier: "A", icon: "openai.png" },
  { id: "xiaomi/mimo-v2.6-flash", name: "MiMo-V2.6-Flash", tier: "A", icon: "xiaomi.png" },
  { id: "openai/gpt-5.6-luna", name: "GPT 5.6 Luna", tier: "A", icon: "openai.png" },
  {
    id: "deepseek/deepseek-v4-pro-0813",
    name: "DeepSeek V4 Pro 0813",
    tier: "A",
    icon: "deepseek.png",
  },
  { id: "z-ai/glm-5.2", name: "GLM-5.2", tier: "A", icon: "zai.png" },
  { id: "z-ai/glm-5.3-flash", name: "GLM-5.3-Flash", tier: "B", icon: "zai.png" },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", tier: "B", icon: "gemini.png" },
  { id: "minimax/minimax-m3", name: "MiniMax-M3", tier: "B", icon: "minimax.png" },
  {
    id: "google/gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    tier: "B",
    icon: "gemini.png",
  },
];

/** Where catalog models are served: OpenRouter (default), a LiteLLM proxy, or the free faux model. */
export type ModelProvider = "openrouter" | "litellm" | "faux";

export interface LiteLLMOptions {
  /** The proxy's OpenAI-compatible URL, e.g. http://127.0.0.1:4000/v1. */
  baseUrl: string;
  /** DNA_LITELLM_MODELS, see parseLiteLLMRoutes(). Unset: every catalog id, sent under its own name. */
  models?: string;
}

export interface LiteLLMRoute {
  /** The proxy's model_name for this catalog id. */
  proxyName: string;
  /** Replaces the catalog's context window when the proxy's deployment has a smaller one (GPT-6 on Azure: 272000). */
  contextWindow?: number;
}

/**
 * DNA_LITELLM_MODELS: comma-separated `catalogId=proxyName[@contextWindow]` entries; a bare `catalogId` keeps its own
 * name. Only listed models are served. Returns undefined when unset, so every catalog id goes out under its own name.
 */
export function parseLiteLLMRoutes(spec: string | undefined): Map<string, LiteLLMRoute> | undefined {
  if (!spec?.trim()) return undefined;
  const routes = new Map<string, LiteLLMRoute>();
  const dashed = (id: string) => id.replace(/\./g, "-");
  for (const raw of spec.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const at = entry.lastIndexOf("@");
    const body = at < 0 ? entry : entry.slice(0, at);
    const eq = body.indexOf("=");
    const catalogId = (eq < 0 ? body : body.slice(0, eq)).trim();
    const proxyName = (eq < 0 ? catalogId : body.slice(eq + 1)).trim();
    if (!CATALOG.some((c) => c.id === catalogId)) {
      const hint = CATALOG.find(
        (c) => dashed(c.id) === dashed(catalogId) || dashed(c.id.split("/")[1]) === dashed(catalogId),
      );
      throw new Error(
        `DNA_LITELLM_MODELS: ${catalogId} is not a catalog id${hint ? ` (did you mean ${hint.id}?)` : ""}. ` +
          "Write catalogId=proxyName, e.g. anthropic/claude-haiku-5.5=claude-haiku-5-5",
      );
    }
    if (!proxyName) throw new Error(`DNA_LITELLM_MODELS: ${entry} has no proxy model name after =`);
    if (routes.has(catalogId)) throw new Error(`DNA_LITELLM_MODELS lists ${catalogId} twice`);
    const route: LiteLLMRoute = { proxyName };
    if (at >= 0) {
      const tokens = Number(entry.slice(at + 1).trim());
      if (!Number.isInteger(tokens) || tokens <= 0)
        throw new Error(
          `DNA_LITELLM_MODELS: ${entry} has an invalid context window; write @<tokens>, e.g. @272000`,
        );
      route.contextWindow = tokens;
    }
    routes.set(catalogId, route);
  }
  return routes.size ? routes : undefined;
}

export interface ModelCatalog {
  readonly models: MutableModels;
  readonly provider: ModelProvider;
  readonly defaultModel: ModelRef;
  list(): ModelInfo[];
  /** A catalog id to a pi-durable model reference; throws for ids outside the catalog. */
  ref(id: string): ModelRef;
  info(id: string): ModelInfo | undefined;
}

export function createModelCatalog(options: {
  provider: ModelProvider;
  installFaux?: (models: MutableModels) => void;
  defaultModel?: string;
  /** Required when provider is "litellm". */
  litellm?: LiteLLMOptions;
}): ModelCatalog {
  const models = createModels();
  if (options.provider === "faux") {
    if (!options.installFaux) throw new Error("A faux catalog needs installFaux");
    options.installFaux(models);
    const free = {
      provider: "faux",
      contextWindow: FAUX_WINDOW,
      reasoning: false,
      cost: { input: 0, output: 0 },
    };
    const all: ModelInfo[] = [
      { id: FAUX_MODEL, name: "Faux Haiku", tier: "T", icon: "lab.png", ...free },
      ...CATALOG.map((c) => ({ ...c, ...free })),
    ];
    return {
      models,
      provider: "faux",
      defaultModel: { provider: "faux", modelId: FAUX_MODEL },
      list: () => all,
      ref: (id) => {
        if (!all.some((m) => m.id === id))
          throw new Error(
            `Unknown model ${id}. The faux catalog mirrors the ${CATALOG.length} catalog models plus ${FAUX_MODEL}.`,
          );
        return { provider: "faux", modelId: id };
      },
      info: (id) => all.find((m) => m.id === id),
    };
  }
  // pi-ai's built-in OpenRouter catalog is static data: reading it sends no request to OpenRouter.
  // It supplies each model's window, token limit, reasoning flag and list price for both providers.
  const openrouter = openrouterProvider();
  const known = openrouter.getModels();
  const missing = CATALOG.filter((c) => !known.some((m) => m.id === c.id)).map((c) => c.id);
  if (missing.length) throw new Error(`OpenRouter catalog is missing: ${missing.join(", ")}`);
  const id = options.provider;
  // With DNA_LITELLM_MODELS set, only the routed models exist: the picker, DNA_MODEL and saved settings see no others.
  const routes = id === "litellm" ? parseLiteLLMRoutes(options.litellm?.models) : undefined;
  const served = routes ? CATALOG.filter((c) => routes.has(c.id)) : CATALOG;
  if (id === "litellm") models.setProvider(liteLLMProvider(options.litellm, known, served, routes));
  else models.setProvider(openrouter);
  const list = () =>
    served.map((c) => {
      const m = known.find((x) => x.id === c.id)!;
      return {
        ...c,
        provider: id,
        contextWindow: routes?.get(c.id)?.contextWindow ?? m.contextWindow,
        reasoning: m.reasoning,
        cost: { input: m.cost.input, output: m.cost.output },
      };
    });
  const defaultId = options.defaultModel ?? DEFAULT_MODEL;
  const ref = (modelId: string): ModelRef => {
    if (routes && !routes.has(modelId))
      throw new Error(
        `Model ${modelId} is not in DNA_LITELLM_MODELS. Routed: ${[...routes.keys()].join(", ")}`,
      );
    if (!served.some((c) => c.id === modelId))
      throw new Error(`Unknown model ${modelId}. Pick one of the ${CATALOG.length} catalog models.`);
    return { provider: id, modelId };
  };
  return {
    models,
    provider: id,
    defaultModel: ref(defaultId),
    list,
    ref,
    info: (modelId) => list().find((m) => m.id === modelId),
  };
}

/**
 * The catalog served by a LiteLLM proxy over its OpenAI-compatible API. Model.id stays the catalog id everywhere
 * (ModelRefs, saved settings, DNA_MODEL); a route's proxy name replaces it only in the request body. Without routes,
 * the proxy's model_name for each model is its catalog id. LITELLM_API_KEY is sent as the bearer key when set; a proxy
 * without a master key needs none.
 */
function liteLLMProvider(
  options: LiteLLMOptions | undefined,
  known: readonly Pick<
    Model<Api>,
    "id" | "reasoning" | "input" | "cost" | "contextWindow" | "maxTokens"
  >[],
  served: readonly CatalogEntry[],
  routes: ReadonlyMap<string, LiteLLMRoute> | undefined,
): Provider<"openai-completions"> {
  const baseUrl = options?.baseUrl?.trim().replace(/\/+$/, "");
  if (!baseUrl)
    throw new Error(
      "DNA_PROVIDER=litellm needs LITELLM_BASE_URL, the proxy's OpenAI-compatible URL (e.g. http://127.0.0.1:4000/v1)",
    );
  const servedModels = served.map((c): Model<"openai-completions"> => {
    const m = known.find((x) => x.id === c.id)!;
    const contextWindow = routes?.get(c.id)?.contextWindow ?? m.contextWindow;
    return {
      id: c.id,
      name: c.name,
      api: "openai-completions",
      provider: "litellm",
      baseUrl,
      reasoning: m.reasoning,
      input: m.input,
      cost: m.cost,
      contextWindow,
      maxTokens: Math.min(m.maxTokens, contextWindow),
      // LiteLLM does not accept OpenAI's `store` field for every backend.
      compat: { supportsStore: false },
    };
  });
  const keyed = !!process.env.LITELLM_API_KEY?.trim();
  const streams = openAICompletionsApi();
  return createProvider({
    id: "litellm",
    name: "LiteLLM",
    baseUrl,
    auth: {
      apiKey: keyed
        ? envApiKeyAuth("LiteLLM key", ["LITELLM_API_KEY"])
        : // The OpenAI client refuses an empty key; a keyless proxy ignores this placeholder.
          { name: "LiteLLM (no key)", resolve: async () => ({ auth: { apiKey: "unused" } }) },
    },
    models: servedModels,
    api: routes
      ? withProxyNames(streams, new Map([...routes].map(([catalogId, r]) => [catalogId, r.proxyName])))
      : streams,
  });
}

/** Sends each model's proxy name as the request's model, keeping Model.id the catalog id (pi-ai's Azure pattern). */
function withProxyNames(
  streams: ProviderStreams,
  proxyNames: ReadonlyMap<string, string>,
): ProviderStreams {
  const rename = <T extends StreamOptions>(model: Model<Api>, options?: T): T | undefined => {
    const proxyName = proxyNames.get(model.id);
    if (!proxyName || proxyName === model.id) return options;
    return {
      ...options,
      onPayload: async (payload: unknown, payloadModel: Model<Api>) => {
        const params = { ...(payload as Record<string, unknown>), model: proxyName };
        return (await options?.onPayload?.(params, payloadModel)) ?? params;
      },
    } as T;
  };
  return {
    stream: (model, context, options) => streams.stream(model, context, rename(model, options)),
    streamSimple: (model, context, options) =>
      streams.streamSimple(model, context, rename(model, options)),
  };
}
