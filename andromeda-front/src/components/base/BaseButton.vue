<template>
  <button
    :type="type"
    class="base-button"
    :class="[`base-button--${variant}`, { 'base-button--block': block }]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  type: { type: String, default: 'button' },
  variant: { type: String, default: 'primary' },
  block: { type: Boolean, default: false },
})
</script>

<style scoped>
.base-button {
  padding: 12px 18px;
  border-radius: var(--radius);
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.base-button--primary {
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%);
  color: var(--white);
}

.base-button--secondary {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}

.base-button--danger {
  background: var(--danger);
  color: var(--white);
}

.base-button--block {
  width: 100%;
}
</style>
