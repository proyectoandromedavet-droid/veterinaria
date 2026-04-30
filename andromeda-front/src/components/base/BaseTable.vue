<template>
  <div class="base-table" role="region" :aria-label="label">
    <table>
      <slot />
    </table>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: 'Tabla de datos' },
})
</script>

<style scoped>
.base-table {
  overflow-x: auto;
  border-radius: var(--radius-xl);
  background: var(--white);
}

table {
  width: 100%;
  border-collapse: collapse;
}
</style>
