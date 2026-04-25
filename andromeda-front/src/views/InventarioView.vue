<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">📦</span>
        <div>
          <h2 class="page-title">Inventario</h2>
          <p class="page-sub">Stock de medicamentos e insumos</p>
        </div>
      </div>
      <button class="btn-primary" @click="openModal()">+ Agregar producto</button>
    </div>

    <!-- Alertas de stock bajo -->
    <div v-if="lowStock.length > 0" class="stock-alert">
      <span>⚠️</span>
      <span><strong>{{ lowStock.length }} producto{{ lowStock.length > 1 ? 's' : '' }}</strong> con stock bajo: {{ lowStock.slice(0,3).map(p => p.name).join(', ') }}{{ lowStock.length > 3 ? '…' : '' }}</span>
    </div>

    <!-- Filtros -->
    <div class="filters">
      <input v-model.trim="search" type="search" placeholder="🔍 Buscar producto…" class="filter-input filter-input--grow" @input="debouncedLoad()" />
      <select v-model="categoryFilter" class="filter-select" @change="load()">
        <option value="">Todas las categorías</option>
        <option value="medication">💊 Medicamentos</option>
        <option value="vaccine">💉 Vacunas</option>
        <option value="supply">📦 Insumos</option>
        <option value="food">🦴 Alimentos</option>
        <option value="equipment">🔧 Equipamiento</option>
        <option value="other">📦 Otros</option>
      </select>
      <select v-model="stockFilter" class="filter-select" @change="load()">
        <option value="">Todo el stock</option>
        <option value="low">⚠️ Stock bajo</option>
        <option value="zero">🔴 Sin stock</option>
      </select>
    </div>

    <div v-if="loading" class="loading-state"><span class="spin spin--dark" /> Cargando inventario…</div>
    <div v-else-if="error" class="alert alert--error">{{ error }}</div>
    <div v-else-if="items.length === 0" class="empty-state">
      <span class="empty-state__emoji">📦</span>
      <p>No hay productos en el inventario</p>
    </div>

    <div v-else class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Stock actual</th>
            <th>Stock mín.</th>
            <th>Precio venta</th>
            <th>Vencimiento</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in items" :key="p.id" :class="{ 'row--low': isLow(p), 'row--out': isOut(p) }">
            <td>
              <div>
                <strong>{{ p.name }}</strong>
                <span class="sub">{{ p.sku || p.code || '' }}</span>
              </div>
            </td>
            <td><span class="cat-badge" :style="catStyle(p.item_type)">{{ catLabel(p.item_type) }}</span></td>
            <td>
              <strong :class="isLow(p) ? 'text-warn' : isOut(p) ? 'text-danger' : ''">
                {{ p.quantity_available ?? '—' }}
              </strong>
            </td>
            <td class="sub">{{ p.minimum_stock ?? '—' }}</td>
            <td class="sub">{{ p.sale_price != null ? '$' + p.sale_price : '—' }}</td>
            <td :class="expClass(p.expiry_date)">{{ formatDate(p.expiry_date) }}</td>
            <td>
              <span class="badge" :class="stockBadge(p)">{{ stockLabel(p) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pagination.totalPages > 1" class="pagination">
      <button :disabled="pagination.page <= 1" @click="load(pagination.page - 1)">← Ant.</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button :disabled="pagination.page >= pagination.totalPages" @click="load(pagination.page + 1)">Sig. →</button>
    </div>

    <!-- Modal -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal()">
        <div class="modal">
          <div class="modal__header">
            <h3>📦 Nuevo producto</h3>
            <button class="modal__close" @click="closeModal()">✕</button>
          </div>
          <form @submit.prevent="handleCreate" novalidate>
            <div class="form-body">
              <div class="form-grid">
                <div class="field field--full">
                  <label>Nombre del producto <span class="req">*</span></label>
                  <input v-model.trim="form.name" type="text" placeholder="Amoxicilina 500mg" :disabled="saving" required />
                  <span v-if="fe.name" class="field-error">{{ fe.name }}</span>
                </div>
                <div class="field">
                  <label>Tipo <span class="req">*</span></label>
                  <select v-model="form.category" :disabled="saving" required>
                    <option value="">Seleccioná…</option>
                    <option value="medication">💊 Medicamento</option>
                    <option value="vaccine">💉 Vacuna</option>
                    <option value="supply">📦 Insumo</option>
                    <option value="food">🦴 Alimento</option>
                    <option value="equipment">🔧 Equipamiento</option>
                    <option value="other">📦 Otro</option>
                  </select>
                  <span v-if="fe.category" class="field-error">{{ fe.category }}</span>
                </div>
                <div class="field">
                  <label>Código / SKU</label>
                  <input v-model.trim="form.sku" type="text" placeholder="MED-001" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Precio venta <span class="req">*</span></label>
                  <input v-model.number="form.salePrice" type="number" min="0" step="0.01" placeholder="0.00" :disabled="saving" required />
                  <span v-if="fe.salePrice" class="field-error">{{ fe.salePrice }}</span>
                </div>
                <div class="field">
                  <label>Costo unitario</label>
                  <input v-model.number="form.unitCost" type="number" min="0" step="0.01" placeholder="0.00" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Stock inicial <span class="req">*</span></label>
                  <input v-model.number="form.stock" type="number" min="0" placeholder="0" :disabled="saving" required />
                  <span v-if="fe.stock" class="field-error">{{ fe.stock }}</span>
                </div>
                <div class="field">
                  <label>Stock mínimo</label>
                  <input v-model.number="form.minStock" type="number" min="0" placeholder="5" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Vencimiento (lote inicial)</label>
                  <input v-model="form.expirationDate" type="date" :disabled="saving" />
                </div>
                <div class="field field--full">
                  <label>Descripción</label>
                  <textarea v-model.trim="form.description" rows="2" placeholder="Descripción o indicaciones…" :disabled="saving" />
                </div>
              </div>
            </div>
            <div v-if="saveError" class="alert alert--error mx">{{ saveError }}</div>
            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeModal()" :disabled="saving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving" class="spin spin--sm" /> <span v-else>Agregar al inventario</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import http from '../api/client'

const items = ref([])
const loading = ref(false)
const error   = ref('')
const search  = ref('')
const categoryFilter = ref('')
const stockFilter    = ref('')
const pagination = ref({ page: 1, totalPages: 1 })

const lowStock = computed(() => items.value.filter(p => isLow(p)))

function isOut(p) { return (p.quantity_available ?? 0) <= 0 }
function isLow(p) {
  const cur = p.quantity_available ?? 0
  const min = p.minimum_stock ?? 0
  return !isOut(p) && min > 0 && cur <= min
}

function catLabel(c) {
  const m = { medication:'💊 Medicamento', vaccine:'💉 Vacuna', supply:'📦 Insumo', food:'🦴 Alimento', equipment:'🔧 Equipamiento', other:'📦 Otro' }
  return m[c] || c || '—'
}

function catStyle(c) {
  const m = {
    medication: 'background:#EEE0FF;color:#7A3DAA',
    vaccine:    'background:#FDEAEA;color:#c0392b',
    supply:     'background:#FFF3CC;color:#8A6200',
    food:       'background:#FFE8D0;color:#A05028',
    equipment:  'background:#D6EEFF;color:#1A5FAA',
    other:      'background:var(--surface-2);color:var(--text-2)',
  }
  return m[c] || m.other
}

function stockBadge(p) {
  if (isOut(p)) return 'badge--red'
  if (isLow(p)) return 'badge--yellow'
  return 'badge--green'
}

function stockLabel(p) {
  if (isOut(p)) return 'Sin stock'
  if (isLow(p)) return 'Stock bajo'
  return 'Disponible'
}

function expClass(dt) {
  if (!dt) return ''
  const days = (new Date(dt) - Date.now()) / (1000 * 60 * 60 * 24)
  if (days < 0)  return 'overdue'
  if (days < 60) return 'due-soon'
  return ''
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
}

async function load(page = 1) {
  loading.value = true; error.value = ''
  try {
    const params = { page, limit: 25 }
    if (search.value)         params.search      = search.value
    if (categoryFilter.value) params.itemType    = categoryFilter.value
    if (stockFilter.value)    params.stockStatus = stockFilter.value
    const { data } = await http.get('/inventory', { params })
    items.value = data.data || data.items || data || []
    const m = data.meta || {}
    pagination.value = { page: m.page || page, totalPages: m.totalPages || 1 }
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudo cargar el inventario'
  } finally { loading.value = false }
}

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 350) }

const showModal = ref(false)
const saving    = ref(false)
const saveError = ref('')
const fe        = reactive({})
const form = reactive({ name:'', category:'', sku:'', salePrice:'', unitCost:'', stock:'', minStock:'', expirationDate:'', description:'' })

function openModal()  { resetForm(); showModal.value = true }
function closeModal() { showModal.value = false; resetForm() }
function resetForm() {
  Object.keys(form).forEach(k => form[k] = '')
  saveError.value = ''; Object.keys(fe).forEach(k => delete fe[k])
}

function validate() {
  Object.keys(fe).forEach(k => delete fe[k])
  if (!form.name)                              fe.name      = 'Requerido'
  if (!form.category)                          fe.category  = 'Requerido'
  if (form.salePrice === '' || form.salePrice === null) fe.salePrice = 'Requerido'
  if (form.stock === '' || form.stock === null) fe.stock     = 'Requerido'
  return Object.keys(fe).length === 0
}

async function handleCreate() {
  if (!validate()) return
  saving.value = true; saveError.value = ''
  try {
    const payload = {
      name:      form.name,
      itemType:  form.category,
      salePrice: parseFloat(form.salePrice),
    }
    if (form.sku)             payload.sku           = form.sku
    if (form.unitCost !== '')  payload.unitCost      = parseFloat(form.unitCost)
    if (form.minStock !== '')  payload.minimumStock  = parseInt(form.minStock)
    if (form.description)     payload.description   = form.description
    const { data: created } = await http.post('/inventory/items', payload)
    if (parseInt(form.stock) > 0 && created?.id) {
      await http.post('/inventory/batches', {
        itemId:           created.id,
        lotNumber:        'INICIAL',
        quantityReceived: parseInt(form.stock),
        expiryDate:       form.expirationDate || undefined,
      })
    }
    closeModal(); await load()
  } catch (e) {
    saveError.value = e.response?.data?.message || 'No se pudo agregar el producto'
  } finally { saving.value = false }
}

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.page-header__left { display: flex; align-items: center; gap: 14px; }
.page-emoji { font-size: 2rem; }
.page-title { font-size: 1.35rem; font-weight: 700; color: var(--text); }
.page-sub   { font-size: 0.82rem; color: var(--text-2); margin-top: 2px; }

.stock-alert { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #FFF3CC; border-radius: var(--radius); border-left: 3px solid var(--warning); font-size: 0.88rem; color: #8A6200; }

.filters { display: flex; gap: 10px; flex-wrap: wrap; }
.filter-input, .filter-select { padding: 9px 13px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.87rem; background: var(--white); color: var(--text); outline: none; }
.filter-input:focus, .filter-select:focus { border-color: var(--primary); }
.filter-input--grow { flex: 1; min-width: 180px; }

.card { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow); overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.table th { text-align: left; padding: 12px 14px; font-size: 0.78rem; font-weight: 600; color: var(--text-3); letter-spacing: 0.05em; text-transform: uppercase; background: var(--surface); border-bottom: 1px solid var(--border); }
.table td { padding: 12px 14px; border-bottom: 1px solid #f0f0f0; color: var(--text); vertical-align: middle; }
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: var(--surface); }
.row--low td { background: #FFFDE7; }
.row--out td { background: #FFF5F5; }

.sub { display: block; font-size: 0.75rem; color: var(--text-3); }
.cat-badge { display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 0.72rem; font-weight: 600; }
.text-warn   { color: #d68910; }
.text-danger { color: #c0392b; }
.overdue  { color: #c0392b; font-weight: 600; }
.due-soon { color: #d68910; font-weight: 600; }

.badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; }
.badge--green  { background: #D6F3EC; color: #1A9E7F; }
.badge--yellow { background: #FFF3CC; color: #8A6200; }
.badge--red    { background: #FDEAEA; color: #c0392b; }

.pagination { display: flex; align-items: center; justify-content: center; gap: 16px; font-size: 0.85rem; color: var(--text-2); }
.pagination button { padding: 6px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; font-size: 0.82rem; color: var(--text-2); }
.pagination button:hover:not(:disabled) { background: var(--surface-2); }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%); color: white; border: none; border-radius: var(--radius); font-size: 0.9rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: opacity var(--transition), transform var(--transition); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost { padding: 10px 20px; background: none; border: 1.5px solid var(--border); border-radius: var(--radius); color: var(--text-2); font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: background var(--transition); }
.btn-ghost:hover:not(:disabled) { background: var(--surface-2); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; }
.modal__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--border); }
.modal__header h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.modal__close { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text-3); padding: 4px 8px; border-radius: var(--radius-sm); }
.modal__close:hover { background: var(--surface-2); }
.form-body { padding: 20px 24px 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field label { font-size: 0.82rem; font-weight: 600; color: var(--text-2); }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.9rem; color: var(--text); background: var(--surface); outline: none; transition: border-color var(--transition); }
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--primary); }
.field textarea { resize: vertical; }
.field--full { grid-column: 1 / -1; }
.field-error { font-size: 0.75rem; color: var(--danger); }
.req { color: var(--danger); }
.modal__actions { display: flex; gap: 12px; justify-content: flex-end; padding: 16px 24px 24px; }
.alert { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 0.875rem; }
.alert--error { background: #FDEAEA; color: #c0392b; border-left: 3px solid var(--danger); }
.mx { margin: 0 24px 8px; }
.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-3); font-size: 0.9rem; background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); }
.empty-state__emoji { font-size: 3rem; }
.spin { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
.spin--sm { width: 14px; height: 14px; }
.spin--dark { border-color: rgba(0,0,0,0.1); border-top-color: var(--primary); }
@keyframes spin { to { transform: rotate(360deg); } }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
@media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } .table th:nth-child(5), .table td:nth-child(5) { display: none; } }
</style>
