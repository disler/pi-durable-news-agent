<script setup lang="ts">
// Every card, one fixed height: the image (3:2, links to the source; a skeleton while it generates), then source,
// time, the timeline chip and links, the generative body (clamped), H/F/S and feedback.
import { computed, ref } from "vue";
import { ExternalLink, GitCommitVertical, ImageOff, Info, MessageSquareQuote } from "@lucide/vue";
import { ago, type Card } from "@dna/sdk";
import { openTimeline } from "../../client/layout";
import { hasViewed, markViewed } from "../../client/feed-preferences";
import { clean } from "../../client/text";
import { now, referenceInChat, ui } from "../../client/store";
import FeedbackBar from "../FeedbackBar.vue";
import HfsPill from "../HfsPill.vue";
import { cardComponent } from "./registry";

const props = defineProps<{ card: Card }>();
const body = computed(() => cardComponent(props.card.component));
const viewed = computed(() => hasViewed(props.card));
const broken = ref(false);
const when = computed(() =>
  props.card.publishedAt ? (now.value, ago(props.card.publishedAt)) : "date unknown",
);
/** Drop "card 22 "Title"" into the composer so the agent knows exactly which card you mean. */
const reference = () => referenceInChat(`card ${props.card.id} "${clean(props.card.title)}"`);
/** The title and the source open the article in a new tab. */
function openFromBody(e: MouseEvent) {
  if (!props.card.url) return;
  if ((e.target as HTMLElement).closest(".card-title"))
    window.open(props.card.url, "_blank", "noopener");
}
const image = computed(() =>
  props.card.image?.status === "ready" && !broken.value
    ? `/api/v1/images/${props.card.image.id}`
    : undefined,
);
</script>

<template>
  <article
    class="card"
    :class="[card.component, { unread: !viewed }]"
    :data-card-id="card.id"
    :data-kind="card.kind"
    :data-component="card.component"
    :data-viewed="viewed"
    @click.capture="markViewed(card)"
    @auxclick.capture="markViewed(card)"
  >
    <span class="card-view-status" :class="{ unread: !viewed }">{{
      viewed ? "Viewed" : "Unread"
    }}</span>
    <a
      class="card-media"
      :class="{ skeleton: card.image?.status === 'pending', empty: !image }"
      :href="card.url"
      target="_blank"
      rel="noopener"
      :aria-label="`Open the source: ${clean(card.title)}`"
      :title="card.url ? `Open ${card.sourceName ?? 'the source'}` : undefined"
    >
      <img v-if="image" :src="image" alt="" loading="lazy" @error="broken = true" />
      <ImageOff v-else-if="card.image?.status !== 'pending'" :size="22" />
    </a>
    <div class="card-content">
      <div class="card-meta">
        <a
          v-if="card.url"
          class="source"
          :href="card.url"
          target="_blank"
          rel="noopener"
          :title="`Open ${clean(card.sourceName ?? 'the source')}`"
          >{{ clean(card.sourceName ?? "Web") }}</a
        >
        <span v-else class="source">{{ clean(card.sourceName ?? "Web") }}</span>
        <span class="time">{{ when }}</span>
        <button
          v-if="card.timeline"
          class="timeline-chip"
          data-cap="timelines.read"
          :aria-label="`Open the ${clean(card.timeline.title)} timeline, item ${card.timeline.index} of ${card.timeline.count}`"
          :title="`Timeline: ${clean(card.timeline.title)}`"
          @click="openTimeline(card.timeline)"
        >
          <GitCommitVertical :size="13" /><span>Timeline</span
          ><strong>{{ card.timeline.index }}/{{ card.timeline.count }}</strong>
        </button>
        <button
          v-if="(card.sources?.length ?? 0) > 1"
          class="timeline-chip"
          :aria-label="`Open ${card.sources!.length} story sources`"
          @click="ui.card = card.id"
        >
          {{ card.sources!.length }} sources
        </button>
        <span class="grow" />
        <button
          class="icon-button small"
          aria-label="Reference in chat"
          title="Reference this card in the chat"
          @click="reference"
        >
          <MessageSquareQuote :size="14" />
        </button>
        <button
          class="icon-button small"
          data-cap="card.read"
          aria-label="Card details"
          title="Details"
          @click="ui.card = card.id"
        >
          <Info :size="14" />
        </button>
        <a
          v-if="card.url"
          class="icon-button small"
          :href="card.url"
          target="_blank"
          rel="noopener"
          aria-label="Open the source"
          title="Open the source"
          ><ExternalLink :size="14"
        /></a>
      </div>
      <div class="card-main" :class="{ linked: !!card.url }" @click="openFromBody">
        <component :is="body" :card="card" />
      </div>
      <div class="card-foot">
        <HfsPill :hfs="card.hfs" />
        <FeedbackBar :card="card" />
      </div>
    </div>
  </article>
</template>
