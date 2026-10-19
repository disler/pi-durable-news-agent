<script setup lang="ts">
// News and its tabs. News is always the first tab; timelines open from a card's chip, searches from the search box
// or the agent's open_tab. A card you voted down leaves News (search and timeline tabs still show it).
import { computed } from "vue";
import { GitCommitVertical, Hash, Link, Newspaper, Search, X } from "@lucide/vue";
import { closeTab, layout, tabKey, type FeedTab } from "../client/layout";
import { reading, sortCards } from "../client/feed-preferences";
import { feed, feedState, loaded } from "../client/store";
import FeedPane from "./FeedPane.vue";
import FeedRow from "./FeedRow.vue";
import LoadingRows from "./LoadingRows.vue";
import SearchBox from "./SearchBox.vue";
import SearchView from "./SearchView.vue";
import TimelineView from "./TimelineView.vue";

const ICONS = { timeline: GitCommitVertical, search: Search, keyword: Hash, url: Link };
const counts = computed(() => {
  const out = new Map<number, number>();
  for (const c of feedState.value.news)
    if (c.timeline) out.set(c.timeline.id, Math.max(out.get(c.timeline.id) ?? 0, c.timeline.count));
  return out;
});
/** The reader's selected date and direction, newest published first by default. */
const news = computed(() =>
  sortCards(feedState.value.news.filter((c) => c.feedback?.signal !== "less")),
);
const label = (t: FeedTab) =>
  t.kind === "timeline" ? (feed.timeline(t.id)[0]?.timeline?.title ?? t.title) : t.value;
const active = computed(() => layout.tabs.find((t) => tabKey(t) === layout.tab));
</script>

<template>
  <section class="column feed-column" data-col="feed" data-cap="feed.read" aria-label="News">
    <div class="feed-bar">
      <nav class="feed-tabs" role="tablist" aria-label="News and tabs" data-cap="timelines.read">
        <button
          role="tab"
          class="feed-tab"
          data-tab="news"
          :aria-selected="layout.tab === 'news'"
          @click="layout.tab = 'news'"
        >
          <Newspaper :size="15" /><span>News</span><small>{{ news.length }}</small>
        </button>
        <div
          v-for="t in layout.tabs"
          :key="tabKey(t)"
          class="feed-tab closable"
          :class="[t.kind, { on: layout.tab === tabKey(t) }]"
          :data-tab="tabKey(t)"
        >
          <button
            role="tab"
            :aria-selected="layout.tab === tabKey(t)"
            :title="t.kind === 'timeline' ? undefined : `${t.kind}: ${t.value}`"
            @click="layout.tab = tabKey(t)"
          >
            <component :is="ICONS[t.kind]" :size="15" /><span>{{ label(t) }}</span
            ><small v-if="t.kind === 'timeline'">{{ counts.get(t.id) ?? "" }}</small>
          </button>
          <button
            class="tab-close"
            :aria-label="`Close the ${label(t)} ${t.kind === 'timeline' ? 'timeline' : t.kind}`"
            @click="closeTab(tabKey(t))"
          >
            <X :size="13" />
          </button>
        </div>
      </nav>
      <SearchBox />
    </div>
    <div class="feed-sort">
      <label
        >Sort by
        <select v-model="reading.sortBy" aria-label="Sort by">
          <option value="published">Publication date</option>
          <option value="added">Date added</option>
        </select>
      </label>
      <select v-model="reading.direction" aria-label="Sort direction">
        <option value="desc">Newest first</option>
        <option value="asc">Oldest first</option>
      </select>
    </div>
    <FeedPane
      v-if="!active"
      :key="`${reading.sortBy}-${reading.direction}`"
      :count="news.length"
      :newest-first="reading.direction === 'desc'"
      label="News"
      class="feed-list"
    >
      <LoadingRows v-if="!loaded" kind="cards" :count="3" label="Loading the news" />
      <p v-else-if="!news.length" class="empty">
        Nothing yet. The agent sweeps on its schedule and only presents news worth your attention.
      </p>
      <FeedRow v-for="card in news" :key="card.id" :card="card" />
    </FeedPane>
    <TimelineView v-else-if="active.kind === 'timeline'" :id="active.id" :key="layout.tab" />
    <SearchView v-else :by="active.kind" :value="active.value" :key="layout.tab" />
  </section>
</template>
