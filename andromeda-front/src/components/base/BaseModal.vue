<template>
  <div v-if="modelValue" class="base-modal__backdrop" @click.self="close">
    <div
      ref="dialog"
      class="base-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      :aria-labelledby="labelledby || undefined"
      tabindex="-1"
      @keydown.esc.prevent="close"
    >
      <slot />
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: 'Modal' },
  labelledby: { type: String, default: '' },
  width: { type: String, default: '560px' },
})

const emit = defineEmits(['update:modelValue'])

const dialog = ref(null)

function close() {
  emit('update:modelValue', false)
}

watch(() => props.modelValue, async (value) => {
  if (!value) return
  await nextTick()
  dialog.value?.focus()
})
</script>

<style scoped>
.base-modal__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.base-modal {
  width: min(100%, v-bind(width));
  max-height: min(90vh, 960px);
  overflow-y: auto;
  background: var(--white);
  border-radius: var(--radius-xl);
  padding: 24px;
  outline: none;
}
</style>
