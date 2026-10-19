<script setup lang="ts">
// Feed lists start at the first sorted record. Incoming cards keep the reader's place away from the newest edge.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowDown, ArrowUp } from "@lucide/vue";

const props = defineProps<{ count: number; label: string; newestFirst: boolean }>();
const scroller = ref<HTMLElement>();
const unseen = ref(0);
let pinned = true;
function onScroll() {
  const el = scroller.value;
  if (!el) return;
  pinned = props.newestFirst
    ? el.scrollTop <= 120
    : el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
  if (pinned) unseen.value = 0;
}
function newest(behavior: ScrollBehavior = "instant") {
  const el = scroller.value;
  el?.scrollTo({ top: props.newestFirst ? 0 : el.scrollHeight, behavior });
}
function jump() {
  unseen.value = 0;
  pinned = true;
  newest("smooth");
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  scroller.value?.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  observer = new ResizeObserver(() => {
    if (pinned) newest();
  });
  if (scroller.value?.firstElementChild) observer.observe(scroller.value.firstElementChild);
});
onBeforeUnmount(() => {
  scroller.value?.removeEventListener("scroll", onScroll);
  observer?.disconnect();
});
watch(
  () => props.count,
  async (count, old) => {
    const el = scroller.value;
    if (!el || count <= old) return;
    const viewportTop = el.getBoundingClientRect().top;
    const anchor = [...el.querySelectorAll<HTMLElement>("[data-row]")].find(
      (row) => row.getBoundingClientRect().bottom > viewportTop,
    );
    const offset = anchor ? anchor.getBoundingClientRect().top - viewportTop : 0;
    const wasPinned = pinned;
    await nextTick();
    if (wasPinned) newest();
    else {
      unseen.value += count - old;
      if (anchor?.isConnected)
        el.scrollTop += anchor.getBoundingClientRect().top - viewportTop - offset;
    }
  },
);
</script>

<template>
  <div class="bottom-pane feed-pane">
    <div ref="scroller" class="bottom-scroll" :aria-label="label">
      <div class="bottom-inner"><slot /></div>
    </div>
    <button
      v-if="unseen > 0"
      class="new-items"
      :class="{ 'newest-top': newestFirst }"
      :aria-label="`${unseen} new, jump to the newest`"
      @click="jump"
    >
      <component :is="newestFirst ? ArrowUp : ArrowDown" :size="15" />{{ unseen }} new
    </button>
  </div>
</template>
