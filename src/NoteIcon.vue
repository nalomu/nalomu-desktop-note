<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string, string> = {
  note: "M6 3h12a1 1 0 0 1 1 1v12l-5 5H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M14 21v-5h5 M9 8h6 M9 12h4",
  settings:
    "M9 3h6l.5 3 2 1.2 2.8-1 3 5.2-2.3 2v2.3l2.3 2-3 5.2-2.8-1-2 1.2-.5 3H9l-.5-3-2-1.2-2.8 1-3-5.2 2.3-2v-2.3l-2.3-2 3-5.2 2.8 1 2-1.2.5-3Z M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  pin: "M8 3h8 M9 3v6l-4 5h14l-4-5V3 M12 14v8",
  close: "M6 6l12 12 M18 6 6 18",
  minus: "M5 12h14",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  list: "M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01",
  ordered:
    "M10 6h10 M10 12h10 M10 18h10 M3 4h1v4 M2 11q3-2 3 0l-3 3h3 M2 17h3l-2 2 2 1H2",
  task: "M9 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9 M3 4l3 3 6-6 M8 13l3 3 6-6",
  quote: "M10 5H4v8h6v-3H4 M20 5h-6v8h6v-3h-6 M4 13q0 5 6 5 M14 13q0 5 6 5",
  code: "M7 6l-6 6 6 6 M17 6l6 6-6 6 M14 4l-4 16",
  image: "M3 3h18v18H3Z M3 17l5-5 4 4 3-3 6 6 M16 7h.01",
  clipboard: "M8 5H4v16h16V5h-4 M8 3h8v4H8Z M7 17l3-4 3 3 2-2 2 3",
  undo: "M8 4 3 9l5 5 M3 9h10a7 7 0 0 1 0 14",
  redo: "M16 4l5 5-5 5 M21 9H11a7 7 0 0 0 0 14",
};
</script>
<template>
  <svg
    class="note-icon"
    viewBox="0 0 24 26"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>
