<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">💰</span>
        <div>
          <h2 class="page-title">Facturación</h2>
          <p class="page-sub">Comprobantes y pagos de servicios</p>
        </div>
      </div>
      <button class="btn-primary" @click="openModal()">+ Nueva factura</button>
    </div>

    <!-- KPIs financieros -->
    <div class="kpi-row">
      <div class="kpi-card" style="--bc:#D6F3EC;--tc:#1A9E7F">
        <span class="kpi-icon">💵</span>
        <div>
          <strong>${{ summary.paid }}</strong>
          <span>Cobrado hoy</span>
        </div>
      </div>
      <div class="kpi-card" style="--bc:#FFF3CC;--tc:#8A6200">
        <span class="kpi-icon">⏳</span>
        <div>
          <strong>{{ summary.pending }}</strong>
          <span>Pendientes</span>
        </div>
      </div>
      <div class="kpi-card" style="--bc:#FDEAEA;--tc:#c0392b">
        <span class="kpi-icon">❌</span>
        <div>
          <strong>{{ summary.overdue }}</strong>
          <span>Vencidas</span>
        </div>
      </div>
      <div class="kpi-card" style="--bc:#D6EEFF;--tc:#1A5FAA">
        <span class="kpi-icon">📋</span>
        <div>
          <strong>{{ summary.total }}</strong>
          <span>Emitidas hoy</span>
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div class="filters">
      <input v-model="dateFrom" type="date" class="filter-input" @change="load()" />
      <input v-model="dateTo"   type="date" class="filter-input" @change="load()" />
      <select v-model="statusFilter" class="filter-select" @change="load()">
        <option value="">Todos los estados</option>
        <option value="draft">Borrador</option>
        <option value="pending">Pendiente</option>
        <option value="paid">Pagada</option>
        <option value="overdue">Vencida</option>
        <option value="cancelled">Cancelada</option>
      </select>
      <input v-model.trim="search" type="search" placeholder="🔍 Buscar por cliente o Nº…" class="filter-input filter-input--grow" @input="debouncedLoad()" />
    </div>

    <div v-if="loading" class="loading-state"><span class="spin spin--dark" /> Cargando facturas…</div>
    <div v-else-if="error" class="alert alert--error">{{ error }}</div>
    <div v-else-if="items.length === 0" class="empty-state">
      <span class="empty-state__emoji">💰</span>
      <p>No hay facturas para el período seleccionado</p>
    </div>

    <div v-else class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Nº Factura</th>
            <th>Cliente / Mascota</th>
            <th>Fecha</th>
            <th>Vencimiento</th>
            <th>Total</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in items" :key="inv.id">
            <td><strong class="inv-num">{{ inv.invoice_number || inv.number || `#${inv.id}` }}</strong></td>
            <td>
              <div>
                <strong>{{ inv.client_name || inv.owner_name || '—' }}</strong>
                <span class="sub">{{ inv.patient_name || '' }}</span>
              </div>
            </td>
            <td class="sub">{{ formatDate(inv.issued_date) }}</td>
            <td :class="dueDateClass(inv.due_date)">{{ formatDate(inv.due_date) }}</td>
            <td><strong>${{ formatMoney(inv.total_amount) }}</strong></td>
            <td><span class="badge" :class="`inv-${inv.status}`">{{ INV_STATUS[inv.status] || inv.status }}</span></td>
            <td>
              <div class="row-actions">
                <button v-if="inv.status === 'pending' || inv.status === 'draft'" class="btn-xs btn-xs--green" @click="markPaid(inv)">Marcar pago</button>
                <button class="btn-xs btn-xs--blue" @click="viewInvoice(inv)" title="Ver detalle">👁</button>
              </div>
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

    <!-- Modal nueva factura -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal()">
        <div class="modal">
          <div class="modal__header">
            <h3>💰 Nueva factura</h3>
            <button class="modal__close" @click="closeModal()">✕</button>
          </div>
          <form @submit.prevent="handleCreate" novalidate>
            <div class="form-body">
              <div class="form-grid">
                <div class="field">
                  <label>ID Cliente <span class="req">*</span></label>
                  <input v-model.trim="form.clientId" type="text" placeholder="ID del cliente" :disabled="saving" required />
                  <span v-if="fe.clientId" class="field-error">{{ fe.clientId }}</span>
                </div>
                <div class="field">
                  <label>ID Paciente</label>
                  <input v-model.trim="form.patientId" type="text" placeholder="ID del paciente" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Vencimiento</label>
                  <input v-model="form.dueDate" type="date" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Método de pago</label>
                  <select v-model="form.paymentMethod" :disabled="saving">
                    <option value="">Sin especificar</option>
                    <option value="cash">Efectivo</option>
                    <option value="credit_card">Tarjeta crédito</option>
                    <option value="debit_card">Tarjeta débito</option>
                    <option value="bank_transfer">Transferencia</option>
                    <option value="other">Mercado Pago / Otro</option>
                  </select>
                </div>
              </div>

              <!-- Ítems -->
              <div class="items-section">
                <div class="items-header">
                  <span class="section-label">Ítems</span>
                  <button type="button" class="btn-add-item" @click="addItem()">+ Agregar ítem</button>
                </div>
                <div class="items-list">
                  <div v-for="(item, idx) in form.items" :key="idx" class="item-row">
                    <input v-model.trim="item.description" type="text" placeholder="Descripción" class="item-desc" :disabled="saving" />
                    <input v-model.number="item.quantity"  type="number" min="1" placeholder="Cant." class="item-qty" :disabled="saving" />
                    <input v-model.number="item.unit_price" type="number" min="0" step="0.01" placeholder="Precio unit." class="item-price" :disabled="saving" />
                    <span class="item-total">${{ ((item.quantity || 0) * (item.unit_price || 0)).toFixed(2) }}</span>
                    <button type="button" class="btn-del-item" @click="removeItem(idx)" :disabled="form.items.length <= 1">✕</button>
                  </div>
                </div>
                <div class="items-total">
                  <span>Total:</span>
                  <strong>${{ invoiceTotal.toFixed(2) }}</strong>
                </div>
              </div>

              <div class="field">
                <label>Notas</label>
                <textarea v-model.trim="form.notes" rows="2" placeholder="Observaciones…" :disabled="saving" />
              </div>
            </div>
            <div v-if="saveError" class="alert alert--error mx">{{ saveError }}</div>
            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeModal()" :disabled="saving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving" class="spin spin--sm" /> <span v-else>Emitir factura</span>
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
const dateFrom = ref(new Date().toISOString().split('T')[0])
const dateTo   = ref('')
const statusFilter = ref('')
const pagination = ref({ page: 1, totalPages: 1 })

const summary = ref({ paid: '0', pending: 0, overdue: 0, total: 0 })

const INV_STATUS = {
  draft:     'Borrador',
  pending:   'Pendiente',
  paid:      'Pagada',
  overdue:   'Vencida',
  cancelled: 'Cancelada',
}

function formatMoney(n) {
  return parseFloat(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
}

function dueDateClass(dt) {
  if (!dt) return ''
  const days = (new Date(dt) - Date.now()) / (1000 * 60 * 60 * 24)
  if (days < 0)  return 'overdue'
  if (days < 7)  return 'due-soon'
  return ''
}

async function load(page = 1) {
  loading.value = true; error.value = ''
  try {
    const params = { page, limit: 20 }
    if (search.value)       params.search = search.value
    if (statusFilter.value) params.status = statusFilter.value
    if (dateFrom.value)     params.from   = dateFrom.value
    if (dateTo.value)       params.to     = dateTo.value
    const { data } = await http.get('/invoices', { params })
    items.value = data.data || data.invoices || data || []
    const m = data.meta || {}
    pagination.value = { page: m.page || page, totalPages: m.totalPages || 1 }
    computeSummary()
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudieron cargar las facturas'
  } finally { loading.value = false }
}

function computeSummary() {
  const all = items.value
  summary.value.total   = all.length
  summary.value.pending = all.filter(i => i.status === 'pending').length
  summary.value.overdue = all.filter(i => i.status === 'overdue').length
  const paid = all.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.total_amount || 0), 0)
  summary.value.paid = paid.toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 350) }

async function markPaid(inv) {
  try {
    await http.patch(`/invoices/${inv.id}/pay`, { payment_method: 'cash' })
    inv.status = 'paid'
    computeSummary()
  } catch (e) {
    alert(e.response?.data?.message || 'No se pudo actualizar la factura')
  }
}

function viewInvoice(inv) {
  alert(`Factura ${inv.invoice_number || '#' + inv.id}\nTotal: $${formatMoney(inv.total)}\nEstado: ${INV_STATUS[inv.status]}`)
}

// Modal
const showModal = ref(false)
const saving    = ref(false)
const saveError = ref('')
const fe        = reactive({})

const form = reactive({
  clientId: '', patientId: '', dueDate: '', paymentMethod: '',
  items: [{ description: '', quantity: 1, unit_price: '' }],
  notes: '',
})

const invoiceTotal = computed(() =>
  form.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0)
)

function addItem() { form.items.push({ description: '', quantity: 1, unit_price: '' }) }
function removeItem(idx) { form.items.splice(idx, 1) }

function openModal()  { resetForm(); showModal.value = true }
function closeModal() { showModal.value = false; resetForm() }
function resetForm() {
  form.clientId = ''; form.patientId = ''; form.dueDate = ''; form.paymentMethod = ''
  form.items = [{ description: '', quantity: 1, unit_price: '' }]; form.notes = ''
  saveError.value = ''; Object.keys(fe).forEach(k => delete fe[k])
}

function validate() {
  Object.keys(fe).forEach(k => delete fe[k])
  if (!form.clientId) fe.clientId = 'Requerido'
  return Object.keys(fe).length === 0
}

async function handleCreate() {
  if (!validate()) return
  saving.value = true; saveError.value = ''
  try {
    const payload = {
      clientId:   parseInt(form.clientId),
      currencyId: 1,
      items: form.items.filter(i => i.description).map(i => ({
        description: i.description,
        quantity:    i.quantity || 1,
        unitPrice:   parseFloat(i.unit_price) || 0,
      })),
    }
    if (form.patientId) payload.patientId = parseInt(form.patientId)
    if (form.dueDate)   payload.dueDate   = form.dueDate
    if (form.notes)     payload.notes     = form.notes
    const { data: created } = await http.post('/invoices', payload)
    if (form.paymentMethod && created?.id) {
      await http.patch(`/invoices/${created.id}/pay`, { payment_method: form.paymentMethod })
    }
    closeModal(); await load()
  } catch (e) {
    saveError.value = e.response?.data?.message || 'No se pudo emitir la factura'
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

.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.kpi-card { background: var(--bc); border-radius: var(--radius-lg); padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { font-size: 1.6rem; }
.kpi-card strong { display: block; font-size: 1.2rem; font-weight: 700; color: var(--tc); }
.kpi-card span   { font-size: 0.72rem; color: var(--tc); opacity: 0.8; }

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

.inv-num { font-family: monospace; font-size: 0.9rem; color: var(--primary); }
.sub { display: block; font-size: 0.75rem; color: var(--text-3); }
.overdue  { color: #c0392b; font-weight: 600; }
.due-soon { color: #d68910; }

.badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; }
.inv-draft     { background: var(--surface-2); color: var(--text-3); }
.inv-pending   { background: #FFF3CC; color: #8A6200; }
.inv-paid      { background: #D6F3EC; color: #1A9E7F; }
.inv-overdue   { background: #FDEAEA; color: #c0392b; }
.inv-cancelled { background: var(--surface-2); color: var(--text-3); }

.row-actions { display: flex; gap: 6px; }
.btn-xs { padding: 4px 10px; border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
.btn-xs:hover { opacity: 0.8; }
.btn-xs--green { background: #D6F3EC; color: #1A9E7F; }
.btn-xs--blue  { background: #D6EEFF; color: #1A5FAA; }

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
.modal { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); width: 100%; max-width: 600px; max-height: 92vh; overflow-y: auto; }
.modal__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--white); z-index: 1; }
.modal__header h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.modal__close { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text-3); padding: 4px 8px; border-radius: var(--radius-sm); }
.modal__close:hover { background: var(--surface-2); }
.form-body { padding: 20px 24px 0; display: flex; flex-direction: column; gap: 14px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field label { font-size: 0.82rem; font-weight: 600; color: var(--text-2); }
.field input, .field select, .field textarea { padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.9rem; color: var(--text); background: var(--surface); outline: none; transition: border-color var(--transition); }
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--primary); }
.field textarea { resize: vertical; }
.field-error { font-size: 0.75rem; color: var(--danger); }
.req { color: var(--danger); }

.items-section { border: 1.5px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.items-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--surface); border-bottom: 1px solid var(--border); }
.section-label { font-size: 0.82rem; font-weight: 700; color: var(--text-2); }
.btn-add-item { background: none; border: 1.5px solid var(--primary); color: var(--primary); border-radius: var(--radius-sm); padding: 4px 10px; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.btn-add-item:hover { background: var(--primary-xlight); }
.items-list { display: flex; flex-direction: column; gap: 0; }
.item-row { display: grid; grid-template-columns: 1fr 60px 90px 80px 30px; align-items: center; gap: 6px; padding: 8px 14px; border-bottom: 1px solid var(--border); }
.item-row:last-child { border-bottom: none; }
.item-desc, .item-qty, .item-price { padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; color: var(--text); background: var(--surface); outline: none; }
.item-desc:focus, .item-qty:focus, .item-price:focus { border-color: var(--primary); }
.item-total { font-size: 0.85rem; font-weight: 600; color: var(--text); text-align: right; }
.btn-del-item { background: none; border: none; color: var(--text-3); cursor: pointer; font-size: 0.8rem; padding: 4px; }
.btn-del-item:hover:not(:disabled) { color: var(--danger); }
.btn-del-item:disabled { opacity: 0.3; cursor: not-allowed; }
.items-total { display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding: 10px 14px; background: var(--surface); border-top: 1px solid var(--border); font-size: 0.9rem; color: var(--text-2); }
.items-total strong { font-size: 1.1rem; color: var(--text); }

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
@media (max-width: 600px) {
  .form-grid { grid-template-columns: 1fr; }
  .item-row { grid-template-columns: 1fr 50px 80px 70px 28px; }
  .table th:nth-child(3), .table td:nth-child(3), .table th:nth-child(4), .table td:nth-child(4) { display: none; }
}
</style>
