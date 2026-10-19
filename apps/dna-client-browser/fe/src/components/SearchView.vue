<script setup lang="ts">
// A search, keyword or url tab uses the same sorting and reading state as News.
// Votes update through the feed model; new news reruns the search.
import { computed, shallowRef, watch } from "vue";
import type { Card, TabBy } from "@dna/sdk";
import { api, attempt, feed, feedState } from "../client/store";
import { reading, sortCards } from "../client/feed-preferences";
import FeedPane from "./FeedPane.vue";
import FeedRow from "./FeedRow.vue";
import LoadingRows from "./LoadingRows.vue";

const props = defineProps<{ by: TabBy; value: string }>();
const WHAT = { search: "matching", keyword: "about", url: "linking to" };
const found = shallowRef<Card[]>();
async function run() {
  const cards = await attempt(() => api.search({ q: props.value, by: props.by, limit: 1000 }));
  if (cards) found.value = cards;
}
watch(() => [props.by, props.value], run, { immediate: true });
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => feedState.value.news.map((c) => `${c.id}:${c.sources?.length ?? 0}`).join(","),
  () => {
    clearTimeout(timer);
    timer = setTimeout(run, 500);
  },
);
const cards = computed(() =>
  sortCards(
    (feedState.value, found.value ?? [])
      .map((c) => feed.card(c.id) ?? c)
      .filter((c) => !c.hiddenFromFeed),
  ),
);
</script>

<template>
  <FeedPane
    :key="`${reading.sortBy}-${reading.direction}`"
    :count="cards.length"
    :newest-first="reading.direction === 'desc'"
    label="Search"
    class="feed-list"
    :data-search="`${by}-${value}`"
  >
    <LoadingRows v-if="!found" kind="cards" :count="2" label="Searching the news" />
    <template v-else>
      <header class="timeline-head search-head">
        <strong>{{ cards.length }} {{ cards.length === 1 ? "card" : "cards" }}</strong>
        <span>{{ WHAT[by] }} "{{ value }}"</span>
      </header>
      <p v-if="!cards.length" class="empty">No news {{ WHAT[by] }} "{{ value }}" yet.</p>
      <FeedRow v-for="card in cards" :key="card.id" :card="card" />
    </template>
  </FeedPane>
</template>
