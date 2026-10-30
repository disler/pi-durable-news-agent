// Fetch one source and cache what it returns. Every sweep checks every source: a hash of the listed entries tells
// whether anything changed, and an unchanged source returns nothing for the sweep to judge. A third failure in a row
// disables the source; a 429 (rate limited) or a 403 (blocked, as reddit and Cloudflare do to servers) is a skip for
// this sweep, not a failure, and neither is retried.
import { createHash } from "node:crypto";
import type { Source } from "@dna/sdk";
import type { Logger } from "@dna/sdk/node";
import type { CachedDoc } from "../../db/repos/sources.ts";
import type { Store } from "../../db/store.ts";
import type { Http } from "../http.ts";
import { NO_RETRY } from "../search/web.ts";
import { fetchGithubReleases } from "./github.ts";
import { fetchHnFront, fetchHnSearch } from "./hn.ts";
import { fetchFeed } from "./rss.ts";
import type { Fetcher } from "./types.ts";
import { fetchWebPage } from "./webpage.ts";

export const FETCHERS: Record<Source["kind"], Fetcher> = {
  rss: fetchFeed,
  atom: fetchFeed,
  hn_front: fetchHnFront,
  hn_search: fetchHnSearch,
  github_releases: fetchGithubReleases,
  web_page: fetchWebPage,
};

/** Feed entries live a day in the cache. */
export const ENTRY_TTL_MIN = 24 * 60;

/** What a source listed, as one hash: entry urls, titles and dates in order. */
export const entriesHash = (entries: { url: string; title: string; publishedAt?: string }[]) =>
  createHash("sha256")
    .update(entries.map((e) => `${e.url}\t${e.title}\t${e.publishedAt ?? ""}`).join("\n"))
    .digest("hex");

export interface SourceFetch {
  source: Source;
  ok: boolean;
  status: string;
  docs: CachedDoc[];
  disabled: boolean;
  error?: string;
}

export async function fetchSource(
  source: Source,
  deps: { http: Http; store: Store; log?: Logger; queries?: string[]; since: Date },
): Promise<SourceFetch> {
  const validators = deps.store.sources.validators(source.id);
  try {
    // A feed that answers 404 is often a cold cache rather than a gone feed (YouTube's
    // per-channel feeds alternate between 200, 404 and 500), so try again before giving up.
    const retryStatuses = source.kind === "rss" || source.kind === "atom" ? [404] : undefined;
    const http: Http = {
      ...deps.http,
      get: (url, options) => deps.http.get(url, { noRetryOn: NO_RETRY, retryStatuses, ...options }),
    };
    const result = await FETCHERS[source.kind](source, {
      http,
      log: deps.log,
      validators,
      queries: deps.queries,
      since: deps.since,
    });
    const hash = entriesHash(result.entries);
    if (
      !result.notModified &&
      result.entries.length &&
      deps.store.sources.contentHash(source.id) === hash
    ) {
      deps.store.sources.fetched(source.id, { ok: true, status: "unchanged" });
      deps.log?.debug("source.unchanged", { sourceId: source.id, source: source.name });
      return { source, ok: true, status: "unchanged", docs: [], disabled: false };
    }
    if (result.entries.length) deps.store.sources.setContentHash(source.id, hash);
    const docs = result.entries.map((e) =>
      deps.store.sources.cache({
        sourceId: source.id,
        url: e.url,
        title: e.title,
        author: e.author,
        publishedAt: e.publishedAt,
        excerpt: e.excerpt,
        contentMd: e.contentMd,
        imageUrl: e.imageUrl,
        discussionUrl: e.discussionUrl,
        points: e.points,
        comments: e.comments,
        fetchVia: "feed",
        ttlMinutes: ENTRY_TTL_MIN,
      }),
    );
    deps.store.sources.fetched(source.id, {
      ok: true,
      status: result.status,
      etag: result.etag,
      lastModified: result.lastModified,
    });
    deps.log?.info("source.fetched", {
      sourceId: source.id,
      source: source.name,
      status: result.status,
      entries: docs.length,
    });
    return { source, ok: true, status: result.status, docs, disabled: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number }).status;
    if (status === 429 || status === 403) {
      const reason = status === 429 ? "429 rate limited" : "403 blocked";
      deps.log?.warn("source.skipped", { sourceId: source.id, source: source.name, reason });
      return { source, ok: false, status: reason, docs: [], disabled: false };
    }
    // 404 on a feed is ambiguous: the feed may be a cold cache (YouTube) rather than gone.
    // Skip this sweep instead of counting a failure, so a flaky feed is never disabled.
    if (status === 404 && (source.kind === "rss" || source.kind === "atom")) {
      const reason = "404 not found (feed skipped, not counted as a failure)";
      deps.log?.warn("source.skipped", { sourceId: source.id, source: source.name, reason });
      return { source, ok: false, status: reason, docs: [], disabled: false };
    }
    const { disabled } = deps.store.sources.fetched(source.id, {
      ok: false,
      status: "error",
      error: message.slice(0, 500),
    });
    deps.log?.[disabled ? "error" : "warn"](disabled ? "source.disabled" : "source.failed", {
      sourceId: source.id,
      source: source.name,
      error: message,
    });
    return { source, ok: false, status: "error", docs: [], disabled, error: message };
  }
}
