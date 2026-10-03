<script setup lang="ts">
import type { CSSProperties } from "vue";
import type { Settings } from "./settings";
const settings = defineModel<Settings>({ required: true });
defineProps<{
  ready: boolean;
  status: string;
  error: string;
  previewStyle: CSSProperties;
  saving: boolean;
}>();
defineEmits<{ save: [] }>();
const alignments = [
  { value: "left", label: "左对齐" },
  { value: "center", label: "居中" },
  { value: "right", label: "右对齐" },
  { value: "justify", label: "两端对齐" },
] as const;
</script>
<template>
  <main class="settings">
    <div class="settings-heading">
      <h1>便签设置</h1>
      <p>让便签更适合你的桌面</p>
    </div>
    <form v-if="ready" class="settings-form" @submit.prevent="$emit('save')">
      <div class="preview-section">
        <span class="preview-label">实时预览</span>
        <div class="preview-checker">
          <div class="settings-preview" :style="previewStyle">
            <p>记录此刻的灵感</p>
            <p>随手写下，让想法慢慢生长。</p>
          </div>
        </div>
      </div>
      <fieldset>
        <legend>颜色与透明度</legend>
        <div class="settings-columns">
          <label class="setting-field"
            >文字颜色<span class="color-field"
              ><input v-model="settings.color" type="color" /><span>{{
                settings.color.toUpperCase()
              }}</span></span
            ></label
          >
          <label class="setting-field"
            >背景颜色<span class="color-field"
              ><input v-model="settings.background" type="color" /><span>{{
                settings.background.toUpperCase()
              }}</span></span
            ></label
          >
        </div>
        <label class="range-field"
          ><span
            >背景透明度<output
              >{{ Math.round(settings.opacity * 100) }}%</output
            ></span
          ><input
            v-model.number="settings.opacity"
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            :style="{
              '--range-fill': `${((settings.opacity - 0.05) / 0.95) * 100}%`,
            }"
        /></label>
      </fieldset>
      <fieldset>
        <legend>文字排版</legend>
        <div class="settings-columns">
          <label class="setting-field"
            >字号<span class="number-field"
              ><input
                aria-label="字号"
                v-model.number="settings.fontSize"
                type="number"
                min="10"
                max="72"
                required
              /><span>px</span></span
            ></label
          >
          <label class="setting-field"
            >行高<span class="number-field"
              ><input
                v-model.number="settings.lineHeight"
                type="number"
                min="1"
                max="3"
                step="0.05"
                required /></span
          ></label>
        </div>
        <label class="range-field"
          ><span
            >内边距<output>{{ settings.padding }} px</output></span
          ><input
            v-model.number="settings.padding"
            type="range"
            min="0"
            max="80"
            :style="{ '--range-fill': `${(settings.padding / 80) * 100}%` }"
        /></label>
        <div class="setting-field">
          <span id="align-label">对齐方式</span>
          <div
            class="alignment-group"
            role="group"
            aria-labelledby="align-label"
          >
            <button
              v-for="alignment in alignments"
              :key="alignment.value"
              type="button"
              :aria-pressed="settings.textAlign === alignment.value"
              @click="settings.textAlign = alignment.value"
            >
              {{ alignment.label }}
            </button>
          </div>
        </div>
      </fieldset>
      <div class="settings-actions">
        <p role="status">
          {{ status === "已保存" ? "保存后应用到便签" : status }}
        </p>
        <button class="primary" type="submit" :disabled="saving">
          {{ saving ? "正在保存…" : "保存设置" }}
        </button>
      </div>
    </form>
    <p v-else role="status">{{ status }}</p>
    <p v-if="error" class="settings-error" role="alert">{{ error }}</p>
  </main>
</template>
