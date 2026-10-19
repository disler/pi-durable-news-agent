<script setup lang="ts">
// One timeline: its news cards in the selected date order. Loads the whole timeline once (older cards may predate the feed
// snapshot), then follows live updates through the feed model.
import { computed, onMounted } from "vue";
import { api, attempt, feed, feedState } from "../client/store";
import { reading, sortCards } from "../client/feed-preferences";
import FeedPane from "./FeedPane.vue";
import FeedRow from "./FeedRow.vue";
import LoadingRows from "./LoadingRows.vue";

const props = defineProps<{ id: number }>();
const cards = computed(() => (feedState.value, sortCards(feed.timeline(props.id))));
onMounted(async () => {
  const t = await attempt(() => api.timeline(props.id));
  if (t) feed.load({ cards: t.cards });
});
</script>

<template>
  <FeedPane
    :key="`${reading.sortBy}-${reading.direction}`"
    :count="cards.length"
    :newest-first="reading.direction === 'desc'"
    label="Timeline"
    class="feed-list"
    :data-timeline="id"
  >
    <header v-if="cards.length" class="timeline-head">
      <strong>{{ cards[0].timeline?.title }}</strong>
      <span
        >{{ cards.length }} items,
        {{ reading.direction === "desc" ? "newest" : "oldest" }} first</span
      >
    </header>
    <LoadingRows v-else kind="cards" :count="2" label="Loading the timeline" />
    <FeedRow v-for="card in cards" :key="card.id" :card="card" />
  </FeedPane>
</template>
