// Outbound HTTP for sources and articles: timeout, size cap, named User-Agent, retries on transient failures.
import { HttpError, isRetryable, retryAfterMs, withRetry } from "@dna/sdk";
import type { Logger } from "@dna/sdk/node";

export interface HttpResponse {
  status: number;
  url: string;
  headers: Headers;
  text: string;
}

export interface GetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  /** Return 304 and other non-2xx responses instead of throwing (conditional GET). */
  allowStatus?: number[];
  /** Statuses that are not retried (a rate limit or block the caller handles itself). */
  noRetryOn?: number[];
  /** Extra statuses to retry even when they are not retryable by default (a flaky feed). */
  retryStatuses?: number[];
}

export interface Http {
  get(url: string, options?: GetOptions): Promise<HttpResponse>;
  postJson(
    url: string,
    body: unknown,
    headers: Record<string, string>,
    options?: { timeoutMs?: number },
  ): Promise<HttpResponse>;
  /** A form POST (application/x-www-form-urlencoded). Live only: fixtures leave it out. */
  postForm?(url: string, form: string, options?: GetOptions): Promise<HttpResponse>;
}

export const USER_AGENT =
  "durable-news-agent/0.1 (+https://github.com/disler/pi-durable-news-agent)";

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function liveHttp(log?: Logger): Http {
  const run = async (url: string, init: RequestInit, options: GetOptions): Promise<HttpResponse> =>
    withRetry(
      async () => {
        const res = await fetch(url, {
          ...init,
          redirect: "follow",
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
        if (!res.ok && !(options.allowStatus ?? []).includes(res.status)) {
          const body = (await readCapped(res, 4000)).slice(0, 500);
          throw new HttpError(res.status, `GET ${new URL(url).host} HTTP ${res.status}`, {
            retryAfterMs: retryAfterMs(res.headers.get("retry-after")),
            body,
          });
        }
        return {
          status: res.status,
          url: res.url || url,
          headers: res.headers,
          text: await readCapped(res, options.maxBytes ?? 2 * 1024 * 1024),
        };
      },
      {
        attempts: 3,
        retryOn: (error) =>
          (isRetryable(error) ||
            (error instanceof HttpError && (options.retryStatuses?.includes(error.status) ?? false))) &&
          !(error instanceof HttpError && options.noRetryOn?.includes(error.status)),
        baseMs: 800,
        maxMs: 8000,
        onRetry: (i) =>
          log?.warn("http.retry", {
            url,
            attempt: i.attempt,
            delayMs: i.delayMs,
            error: String(i.error),
          }),
      },
    );
  return {
    get: (url, options = {}) =>
      run(
        url,
        { headers: { "user-agent": USER_AGENT, accept: "*/*", ...options.headers } },
        options,
      ),
    postJson: (url, body, headers, options = {}) =>
      run(
        url,
        {
          method: "POST",
          headers: { "user-agent": USER_AGENT, "content-type": "application/json", ...headers },
          body: JSON.stringify(body),
        },
        { timeoutMs: options.timeoutMs ?? 60_000 },
      ),
    postForm: (url, form, options = {}) =>
      run(
        url,
        {
          method: "POST",
          headers: {
            "user-agent": USER_AGENT,
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            ...options.headers,
          },
          body: form,
        },
        options,
      ),
  };
}

/** Plain text from HTML snippets (feed descriptions). */
export function stripHtml(html: string | undefined, max = 600): string | undefined {
  if (!html) return undefined;
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}` : text || undefined;
}

export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    hellip: "\u2026",
    mdash: "\u2014",
    ndash: "\u2013",
    rsquo: "'",
    lsquo: "'",
    ldquo: '"',
    rdquo: '"',
  };
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}
