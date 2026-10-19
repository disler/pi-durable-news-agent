// Browser-only reading state. Agent identity and card creation time prevent reused IDs from looking viewed.
import { computed, reactive, shallowRef, watch } from "vue";
import type { Card } from "@dna/sdk";
import { info } from "./store";

type SortBy = "published" | "added";
type Direction = "desc" | "asc";
interface Preferences {
  sortBy: SortBy;
  direction: Direction;
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return undefined;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Reading and sorting still work when browser storage is unavailable or full.
  }
}

const scope = computed(() => `dna.reading.v1:${info.value?.device ?? "local"}`);
export const reading = reactive<Preferences>({ sortBy: "published", direction: "desc" });
const viewed = shallowRef(new Set<string>());
const cardKey = (card: Card) => `${card.id}:${card.createdAt}`;

function load() {
  const saved = read(scope.value) as Partial<Preferences> & { viewed?: unknown };
  reading.sortBy = saved?.sortBy === "added" ? "added" : "published";
  reading.direction = saved?.direction === "asc" ? "asc" : "desc";
  viewed.value = new Set(
    Array.isArray(saved?.viewed)
      ? saved.viewed.filter((v): v is string => typeof v === "string")
      : [],
  );
}
watch(scope, load, { immediate: true, flush: "sync" });
watch([() => reading.sortBy, () => reading.direction, viewed], () =>
  write(scope.value, { ...reading, viewed: [...viewed.value] }),
);
window.addEventListener("storage", (event) => {
  if (event.key === scope.value || event.key === null) load();
});

export const hasViewed = (card: Card) => viewed.value.has(cardKey(card));
export function markViewed(card: Card) {
  if (!hasViewed(card)) viewed.value = new Set([...viewed.value, cardKey(card)]);
}

/** Undated stories stay last in either direction; arrival time and ID break equal-date ties. */
export function sortCards(cards: Card[]): Card[] {
  const timestamp = (value?: string) => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? time : undefined;
  };
  const direction = reading.direction === "desc" ? -1 : 1;
  return [...cards].sort((a, b) => {
    const left = timestamp(reading.sortBy === "published" ? a.publishedAt : a.createdAt);
    const right = timestamp(reading.sortBy === "published" ? b.publishedAt : b.createdAt);
    if (left === undefined && right !== undefined) return 1;
    if (right === undefined && left !== undefined) return -1;
    return (
      direction * ((left ?? 0) - (right ?? 0)) ||
      direction * ((timestamp(a.createdAt) ?? 0) - (timestamp(b.createdAt) ?? 0)) ||
      direction * (a.id - b.id)
    );
  });
}
