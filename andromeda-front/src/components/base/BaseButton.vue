<template>
  <button
    :type="type"
    class="base-button"
    :class="[`base-button--${variant}`, `base-button--${size}`, { 'base-button--block': block }]"
    :disabled="disabled"
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
  size: { type: String, default: 'md' },
  disabled: { type: Boolean, default: false },
})
</script>

<style scoped>
.base-button {
  padding: 12px 18px;
  border-radius: var(--radius);
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition: opacity var(--transition), transform var(--transition), background var(--transition);
}

.base-button--primary {
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%);
  color: var(--white);
}

.base-button--secondary,
.base-button--ghost {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}

.base-button--danger {
  background: var(--danger);
  color: var(--white);
}

.base-button--sm {
  padding: 8px 14px;
  font-size: 0.85rem;
}

.base-button--md {
  padding: 12px 18px;
  font-size: 0.9rem;
}

.base-button--lg {
  padding: 14px 22px;
  font-size: 1rem;
}

.base-button--block {
  width: 100%;
}

.base-button:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.base-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
