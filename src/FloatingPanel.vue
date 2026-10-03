<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
const props = withDefaults(
  defineProps<{
    x: number;
    y: number;
    width?: number;
    draggable?: boolean;
    label?: string;
  }>(),
  { width: 300 },
);
const panel = ref<HTMLElement>();
const position = ref({ x: 8, y: 8 });
let observer: ResizeObserver | undefined;
let moved = false;
let start: { x: number; y: number; left: number; top: number } | undefined;
function clamp(x: number, y: number) {
  const bounds = panel.value?.getBoundingClientRect();
  position.value = {
    x: Math.max(
      6,
      Math.min(x, innerWidth - (bounds?.width ?? props.width) - 6),
    ),
    y: Math.max(6, Math.min(y, innerHeight - (bounds?.height ?? 40) - 6)),
  };
}
function place() {
  clamp(moved ? position.value.x : props.x, moved ? position.value.y : props.y);
}
watch(
  () => [props.x, props.y],
  async () => {
    moved = false;
    await nextTick();
    place();
  },
);
function dragStart(e: PointerEvent) {
  if (
    e.button !== 0 ||
    !props.draggable ||
    (e.target as HTMLElement).closest("button")
  )
    return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  start = {
    x: e.clientX,
    y: e.clientY,
    left: position.value.x,
    top: position.value.y,
  };
}
function dragMove(e: PointerEvent) {
  if (!start) return;
  moved = true;
  clamp(start.left + e.clientX - start.x, start.top + e.clientY - start.y);
}
onMounted(() => {
  place();
  observer = new ResizeObserver(place);
  if (panel.value) observer.observe(panel.value);
  window.addEventListener("resize", place);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener("resize", place);
});
</script>
<template>
  <div
    ref="panel"
    class="floating-panel"
    :style="{
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${width}px`,
    }"
    @pointerdown.stop
  >
    <div
      v-if="draggable"
      class="panel-grip"
      @pointerdown="dragStart"
      @pointermove="dragMove"
      @pointerup="start = undefined"
      @lostpointercapture="start = undefined"
    >
      <span class="grip-dots" aria-hidden="true">⠿</span><span>{{ label }}</span
      ><slot name="header" />
    </div>
    <slot />
  </div>
</template>
