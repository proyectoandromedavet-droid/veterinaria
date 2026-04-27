<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">🧪</span>
        <div>
          <h2 class="page-title">Laboratorio</h2>
          <p class="page-sub">Órdenes y resultados de análisis clínicos</p>
        </div>
      </div>
      <button class="btn-primary" @click="openNewOrder()">+ Nueva orden</button>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card" style="--c:#FFF3CC;--ct:#8A6200">
        <span class="stat-card__icon">⏳</span>
        <div>
          <strong>{{ stats.pending }}</strong>
          <span>Pendientes</span>
        </div>
      </div>
      <div class="stat-card" style="--c:#D6EEFF;--ct:#1A5FAA">
        <span class="stat-card__icon">🔬</span>
        <div>
          <strong>{{ stats.inProgress }}</strong>
          <span>En proceso</span>
        </div>
      </div>
      <div class="stat-card" style="--c:#D6F3EC;--ct:#1A9E7F">
        <span class="stat-card__icon">✅</span>
        <div>
          <strong>{{ stats.completedToday }}</strong>
          <span>Completadas hoy</span>
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div class="filters">
      <input
        v-model.trim="search"
        type="search"
        placeholder="🔍 Buscar por paciente…"
        class="filter-input filter-input--grow"
        @input="debouncedLoad()"
      />
      <select v-model="statusFilter" class="filter-select" @change="load()">
        <option value="">Todos los estados</option>
        <option value="pending">Pendiente</option>
        <option value="in_progress">En proceso</option>
        <option value="completed">Completada</option>
        <option value="cancelled">Cancelada</option>
      </select>
    </div>

    <div v-if="loading" class="loading-state">
      <span class="spin spin--dark" /> Cargando órdenes…
    </div>
    <div v-else-if="error" class="alert alert--error">{{ error }}</div>
    <div v-else-if="items.length === 0" class="empty-state">
      <span class="empty-state__emoji">🧪</span>
      <p>No hay órdenes de laboratorio</p>
    </div>

    <div v-else class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Pruebas</th>
            <th>Prioridad</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in items" :key="order.id">
            <td>
              <div class="pet-cell">
                <span>{{ petEmoji(order.species) }}</span>
                <div>
                  <strong>{{ order.patient_name || '—' }}</strong>
                  <span class="sub">{{ order.vet_name || '' }}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="test-count">{{ order.test_count || 0 }} prueba(s)</span>
            </td>
            <td>
              <span class="badge" :class="priorityClass(order.priority)">{{ priorityLabel(order.priority) }}</span>
            </td>
            <td>
              <span class="badge" :class="statusClass(order.status)">{{ statusLabel(order.status) }}</span>
            </td>
            <td class="sub">{{ formatDate(order.requested_at) }}</td>
            <td>
              <div class="action-btns">
                <button
                  v-if="order.status === 'pending' || order.status === 'in_progress'"
                  class="btn-action btn-action--primary"
                  @click="openResults(order)"
                  title="Ingresar resultados"
                >
                  Resultados
                </button>
                <button
                  class="btn-action"
                  @click="viewDetail(order)"
                  title="Ver detalle"
                >
                  Ver
                </button>
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

    <!-- Modal nueva orden -->
    <Transition name="modal">
      <div v-if="showNewOrder" class="modal-backdrop" @click.self="showNewOrder = false">
        <div class="modal">
          <div class="modal__header">
            <h3>🧪 Nueva orden de laboratorio</h3>
            <button class="modal__close" @click="showNewOrder = false">✕</button>
          </div>

          <form @submit.prevent="handleCreateOrder" novalidate>
            <div class="form-body">

              <!-- Paciente autocomplete -->
              <div class="field field--full" style="position:relative">
                <label>Paciente <span class="req">*</span></label>
                <input
                  v-model.trim="patientSearch"
                  type="search"
                  placeholder="Buscar por nombre…"
                  :disabled="saving"
                  @input="searchPatients"
                  autocomplete="off"
                />
                <div v-if="patientResults.length" class="autocomplete">
                  <div
                    v-for="pt in patientResults"
                    :key="pt.id"
                    class="autocomplete__item"
                    @click="selectPatient(pt)"
                  >
                    {{ petEmoji(pt.species) }} <b>{{ pt.name }}</b>
                    <span class="autocomplete__owner">— {{ pt.primary_owner || '' }}</span>
                  </div>
                </div>
                <div v-if="orderForm.patientId" class="selected-patient">✅ {{ selectedPatientLabel }}</div>
                <span v-if="fe.patientId" class="field-error">{{ fe.patientId }}</span>
              </div>

              <div class="form-grid">
                <div class="field">
                  <label>Prioridad</label>
                  <select v-model="orderForm.priority" :disabled="saving">
                    <option value="routine">Rutina</option>
                    <option value="urgent">Urgente</option>
                    <option value="emergency">Emergencia</option>
                  </select>
                </div>
                <div class="field field--full">
                  <label>Notas clínicas</label>
                  <textarea
                    v-model.trim="orderForm.clinicalNotes"
                    rows="3"
                    placeholder="Motivo de la solicitud, sospecha diagnóstica…"
                    :disabled="saving"
                  />
                </div>
              </div>

              <!-- Catálogo de pruebas -->
              <div class="section-title" style="margin-top:16px">Pruebas solicitadas <span class="req">*</span></div>
              <div v-if="testsLoading" class="loading-state-sm">
                <span class="spin spin--dark spin--sm" /> Cargando catálogo…
              </div>
              <div v-else-if="Object.keys(groupedTests).length === 0" class="sub" style="padding:8px">
                No se pudo cargar el catálogo de pruebas.
              </div>
              <div v-else class="tests-catalog">
                <div
                  v-for="(tests, category) in groupedTests"
                  :key="category"
                  class="test-category"
                >
                  <div class="test-category__title">{{ category }}</div>
                  <div class="test-category__items">
                    <label
                      v-for="test in tests"
                      :key="test.id"
                      class="test-checkbox-label"
                    >
                      <input
                        type="checkbox"
                        :value="test.id"
                        v-model="selectedTestIds"
                        :disabled="saving"
                      />
                      <div class="test-info">
                        <span class="test-name">{{ test.name }}</span>
                        <span class="test-meta sub">{{ test.units || '' }}{{ test.normal_range ? ' · ' + test.normal_range : '' }}{{ test.turnaround_hours ? ' · ' + test.turnaround_hours + 'h' : '' }}</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              <span v-if="fe.tests" class="field-error">{{ fe.tests }}</span>

            </div>

            <div v-if="saveError" class="alert alert--error mx">{{ saveError }}</div>

            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="showNewOrder = false" :disabled="saving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving" class="spin spin--sm" />
                <span v-else>💾 Crear orden</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- Modal ingresar resultados -->
    <Transition name="modal">
      <div v-if="showResults" class="modal-backdrop" @click.self="showResults = false">
        <div class="modal modal--wide">
          <div class="modal__header">
            <h3>🔬 Ingresar resultados — {{ selectedOrder?.patient_name }}</h3>
            <button class="modal__close" @click="showResults = false">✕</button>
          </div>

          <div v-if="detailLoading" class="loading-state" style="min-height:200px">
            <span class="spin spin--dark" /> Cargando orden…
          </div>
          <form v-else @submit.prevent="handleSubmitResults" novalidate>
            <div class="form-body">
              <div v-if="orderDetail && orderDetail.items && orderDetail.items.length > 0">
                <div
                  v-for="item in orderDetail.items"
                  :key="item.id"
                  class="result-item"
                >
                  <div class="result-item__header">
                    <strong>{{ item.test_name || item.name }}</strong>
                    <span class="sub">{{ item.normal_range ? 'Rango normal: ' + item.normal_range : '' }}{{ item.units ? ' (' + item.units + ')' : '' }}</span>
                  </div>
                  <div class="form-grid">
                    <div class="field">
                      <label>Valor</label>
                      <input
                        v-model.trim="resultInputs[item.id].value"
                        type="text"
                        :placeholder="item.units || 'Resultado'"
                        :disabled="savingResults"
                      />
                    </div>
                    <div class="field">
                      <label>Interpretación</label>
                      <select v-model="resultInputs[item.id].interpretation" :disabled="savingResults">
                        <option value="">Sin interpretación</option>
                        <option value="normal">Normal</option>
                        <option value="low">Bajo</option>
                        <option value="high">Alto</option>
                        <option value="critical_low">Crítico bajo</option>
                        <option value="critical_high">Crítico alto</option>
                      </select>
                    </div>
                    <div class="field field--full">
                      <label>Notas</label>
                      <input
                        v-model.trim="resultInputs[item.id].notes"
                        type="text"
                        placeholder="Observaciones opcionales…"
                        :disabled="savingResults"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="empty-state" style="padding:30px">
                <p>No hay items de prueba en esta orden.</p>
              </div>
            </div>

            <div v-if="resultsError" class="alert alert--error mx">{{ resultsError }}</div>

            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="showResults = false" :disabled="savingResults">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="savingResults">
                <span v-if="savingResults" class="spin spin--sm" />
                <span v-else>💾 Guardar resultados</span>
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

// ── Lista de órdenes ────────────────────────────────────────────────────────
const items       = ref([])
const loading     = ref(false)
const error       = ref('')
const search      = ref('')
const statusFilter = ref('')
const pagination  = ref({ page: 1, totalPages: 1 })

const stats = reactive({ pending: 0, inProgress: 0, completedToday: 0 })

async function load(page = 1) {
  loading.value = true; error.value = ''
  try {
    const params = { page, limit: 15 }
    if (search.value)       params.search = search.value
    if (statusFilter.value) params.status = statusFilter.value
    const { data } = await http.get('/lab/orders', { params })
    items.value = data.data || data.orders || data || []
    const m = data.meta || {}
    pagination.value = { page: m.page || page, totalPages: m.totalPages || 1 }
    await loadStats()
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudieron cargar las órdenes'
  } finally { loading.value = false }
}

async function loadStats() {
  try {
    const { data } = await http.get('/lab/orders/pending')
    const pending = data.data || data || []
    stats.pending = Array.isArray(pending) ? pending.length : (pending.count || 0)
  } catch { /* silencioso */ }

  // Calcular stats desde la lista completa si no hay endpoint dedicado
  const today = new Date().toISOString().split('T')[0]
  let inProgress = 0, completedToday = 0
  items.value.forEach(o => {
    if (o.status === 'in_progress') inProgress++
    if (o.status === 'completed' && (o.requested_at || '').startsWith(today)) completedToday++
  })
  stats.inProgress     = inProgress
  stats.completedToday = completedToday
}

let loadTimer = null
function debouncedLoad() { clearTimeout(loadTimer); loadTimer = setTimeout(load, 350) }

// ── Helpers ─────────────────────────────────────────────────────────────────
function petEmoji(s) {
  if (!s) return '🐾'
  const m = { perro:'🐶', dog:'🐶', gato:'🐱', cat:'🐱', conejo:'🐰', rabbit:'🐰', loro:'🦜', bird:'🦜', pez:'🐟', fish:'🐟', tortuga:'🐢', reptile:'🦎', hamster:'🐹' }
  return m[s.toLowerCase()] || '🐾'
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function priorityClass(p) {
  return { routine: 'badge--blue', urgent: 'badge--yellow', emergency: 'badge--red' }[p] || 'badge--gray'
}

function priorityLabel(p) {
  return { routine: 'Rutina', urgent: 'Urgente', emergency: 'Emergencia' }[p] || p || '—'
}

function statusClass(s) {
  return { pending: 'badge--gray', in_progress: 'badge--yellow', completed: 'badge--green', cancelled: 'badge--red' }[s] || 'badge--gray'
}

function statusLabel(s) {
  return { pending: 'Pendiente', in_progress: 'En proceso', completed: 'Completada', cancelled: 'Cancelada' }[s] || s || '—'
}

// ── Detalle (solo para ver) ──────────────────────────────────────────────────
function viewDetail(order) {
  // Abrir modal de resultados en modo lectura o simplemente abrir
  // Por simplicidad, redirigimos a ingresar resultados si está pendiente
  if (order.status === 'pending' || order.status === 'in_progress') {
    openResults(order)
  }
}

// ── Modal nueva orden ────────────────────────────────────────────────────────
const showNewOrder = ref(false)
const saving       = ref(false)
const saveError    = ref('')
const fe           = reactive({})

const orderForm = reactive({ patientId: '', priority: 'routine', clinicalNotes: '' })
const selectedTestIds = ref([])

// Autocomplete paciente
const patientSearch        = ref('')
const patientResults       = ref([])
const selectedPatientLabel = ref('')
let patientTimer = null

async function searchPatients() {
  clearTimeout(patientTimer)
  orderForm.patientId = ''
  selectedPatientLabel.value = ''
  if (patientSearch.value.length < 2) { patientResults.value = []; return }
  patientTimer = setTimeout(async () => {
    try {
      const { data } = await http.get('/patients', { params: { search: patientSearch.value, limit: 8 } })
      patientResults.value = data.data || []
    } catch { patientResults.value = [] }
  }, 300)
}

function selectPatient(pt) {
  orderForm.patientId = pt.id
  selectedPatientLabel.value = `${pt.name}${pt.primary_owner ? ' — ' + pt.primary_owner : ''}`
  patientSearch.value = pt.name
  patientResults.value = []
}

// Catálogo de pruebas
const allTests     = ref([])
const testsLoading = ref(false)

const groupedTests = computed(() => {
  const groups = {}
  allTests.value.forEach(t => {
    const cat = t.category || 'General'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(t)
  })
  return groups
})

async function loadTests() {
  testsLoading.value = true
  try {
    const { data } = await http.get('/lab/tests')
    allTests.value = data.data || data || []
  } catch { allTests.value = [] }
  finally { testsLoading.value = false }
}

function openNewOrder() {
  Object.assign(orderForm, { patientId: '', priority: 'routine', clinicalNotes: '' })
  patientSearch.value = ''
  patientResults.value = []
  selectedPatientLabel.value = ''
  selectedTestIds.value = []
  saveError.value = ''
  Object.keys(fe).forEach(k => delete fe[k])
  showNewOrder.value = true
  if (allTests.value.length === 0) loadTests()
}

function validateOrder() {
  Object.keys(fe).forEach(k => delete fe[k])
  if (!orderForm.patientId)         fe.patientId = 'Seleccioná un paciente'
  if (selectedTestIds.value.length === 0) fe.tests = 'Seleccioná al menos una prueba'
  return Object.keys(fe).length === 0
}

async function handleCreateOrder() {
  if (!validateOrder()) return
  saving.value = true; saveError.value = ''
  try {
    const payload = {
      patientId: parseInt(orderForm.patientId),
      priority:  orderForm.priority,
      tests:     selectedTestIds.value.map(id => ({ testId: id })),
    }
    if (orderForm.clinicalNotes) payload.clinicalNotes = orderForm.clinicalNotes
    await http.post('/lab/orders', payload)
    showNewOrder.value = false
    await load()
  } catch (e) {
    saveError.value = e.response?.data?.message || e.response?.data?.error?.message || 'No se pudo crear la orden'
  } finally { saving.value = false }
}

// ── Modal ingresar resultados ────────────────────────────────────────────────
const showResults    = ref(false)
const selectedOrder  = ref(null)
const orderDetail    = ref(null)
const detailLoading  = ref(false)
const resultInputs   = reactive({})
const savingResults  = ref(false)
const resultsError   = ref('')

async function openResults(order) {
  selectedOrder.value = order
  detailLoading.value = true
  showResults.value   = true
  resultsError.value  = ''
  orderDetail.value   = null
  Object.keys(resultInputs).forEach(k => delete resultInputs[k])
  try {
    const { data } = await http.get(`/lab/orders/${order.id}`)
    const detail = data.data || data
    orderDetail.value = detail
    const items = detail.items || []
    items.forEach(item => {
      resultInputs[item.id] = { value: '', interpretation: '', notes: '' }
    })
  } catch (e) {
    resultsError.value = e.response?.data?.message || 'No se pudo cargar el detalle'
  } finally { detailLoading.value = false }
}

async function handleSubmitResults() {
  savingResults.value = true; resultsError.value = ''
  try {
    const results = Object.entries(resultInputs)
      .filter(([, r]) => r.value !== '')
      .map(([itemId, r]) => {
        const entry = { itemId: parseInt(itemId), value: r.value }
        if (r.interpretation) entry.interpretation = r.interpretation
        if (r.notes)          entry.notes          = r.notes
        return entry
      })
    if (results.length === 0) {
      resultsError.value = 'Ingresá al menos un resultado'
      return
    }
    await http.post(`/lab/orders/${selectedOrder.value.id}/results`, { results })
    showResults.value = false
    await load()
  } catch (e) {
    resultsError.value = e.response?.data?.message || e.response?.data?.error?.message || 'No se pudieron guardar los resultados'
  } finally { savingResults.value = false }
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

/* Stats */
.stats-row { display: flex; gap: 14px; flex-wrap: wrap; }
.stat-card { display: flex; align-items: center; gap: 14px; background: var(--c, var(--surface)); border-radius: var(--radius-lg); padding: 16px 20px; flex: 1; min-width: 160px; }
.stat-card__icon { font-size: 1.6rem; }
.stat-card strong { display: block; font-size: 1.5rem; font-weight: 800; color: var(--ct, var(--text)); line-height: 1; }
.stat-card span { font-size: 0.78rem; color: var(--ct, var(--text-2)); opacity: 0.85; }

/* Filtros */
.filters { display: flex; gap: 10px; flex-wrap: wrap; }
.filter-input { padding: 9px 13px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.87rem; background: var(--white); color: var(--text); outline: none; }
.filter-input:focus { border-color: var(--primary); }
.filter-input--grow { flex: 1; min-width: 200px; }
.filter-select { padding: 9px 13px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.87rem; background: var(--white); color: var(--text); outline: none; cursor: pointer; }
.filter-select:focus { border-color: var(--primary); }

/* Card / Table */
.card { background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
.table thead th { background: var(--surface); padding: 11px 14px; text-align: left; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-3); border-bottom: 1.5px solid var(--border); white-space: nowrap; }
.table tbody tr { border-bottom: 1px solid var(--border); transition: background 0.12s; }
.table tbody tr:last-child { border-bottom: none; }
.table tbody tr:hover { background: var(--surface); }
.table tbody td { padding: 11px 14px; color: var(--text); vertical-align: middle; }

.pet-cell { display: flex; align-items: center; gap: 10px; }
.pet-cell div { display: flex; flex-direction: column; gap: 1px; }
.pet-cell strong { font-size: 0.88rem; color: var(--text); }
.sub { font-size: 0.75rem; color: var(--text-3); }
.test-count { font-size: 0.82rem; color: var(--text-2); }

/* Badges */
.badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.73rem; font-weight: 700; white-space: nowrap; }
.badge--gray   { background: #EAEAEA; color: #555; }
.badge--yellow { background: #FFF3CC; color: #8A6200; }
.badge--blue   { background: #D6EEFF; color: #1A5FAA; }
.badge--green  { background: #D6F3EC; color: #1A9E7F; }
.badge--red    { background: #FDEAEA; color: #c0392b; }

/* Acciones */
.action-btns { display: flex; gap: 6px; }
.btn-action { padding: 5px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: none; font-size: 0.78rem; font-weight: 500; color: var(--text-2); cursor: pointer; transition: background 0.12s; }
.btn-action:hover { background: var(--surface); }
.btn-action--primary { background: var(--primary); color: white; border-color: var(--primary); }
.btn-action--primary:hover { opacity: 0.88; }

/* Paginación */
.pagination { display: flex; align-items: center; justify-content: center; gap: 16px; font-size: 0.85rem; color: var(--text-2); }
.pagination button { padding: 6px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; font-size: 0.82rem; color: var(--text-2); }
.pagination button:hover:not(:disabled) { background: var(--surface-2); }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

/* Botones */
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%); color: white; border: none; border-radius: var(--radius); font-size: 0.9rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: opacity var(--transition), transform var(--transition); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost { padding: 10px 20px; background: none; border: 1.5px solid var(--border); border-radius: var(--radius); color: var(--text-2); font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: background var(--transition); }
.btn-ghost:hover:not(:disabled) { background: var(--surface-2); }

/* Modal */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); width: 100%; max-width: 700px; max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; }
.modal--wide { max-width: 860px; }
.modal__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 14px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--white); z-index: 2; }
.modal__header h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.modal__close { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text-3); padding: 4px 8px; border-radius: var(--radius-sm); }
.modal__close:hover { background: var(--surface-2); }
.modal__actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 24px 20px; border-top: 1px solid var(--border); position: sticky; bottom: 0; background: var(--white); z-index: 1; }

/* Formulario */
.form-body { padding: 20px 24px 4px; flex: 1; display: flex; flex-direction: column; gap: 14px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 0.8rem; font-weight: 600; color: var(--text-2); }
.field input, .field select, .field textarea { padding: 8px 11px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.88rem; color: var(--text); background: var(--surface); outline: none; transition: border-color var(--transition); }
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--primary); background: var(--white); }
.field textarea { resize: vertical; }
.field--full { grid-column: 1 / -1; }
.field-error { font-size: 0.73rem; color: var(--danger); }
.req { color: var(--danger); }

.section-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }

/* Autocomplete */
.autocomplete { position: absolute; z-index: 100; background: var(--white); border: 1.5px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; max-height: 200px; overflow-y: auto; top: calc(100% + 2px); left: 0; }
.autocomplete__item { padding: 9px 13px; cursor: pointer; font-size: 0.88rem; }
.autocomplete__item:hover { background: var(--surface-2); }
.autocomplete__owner { font-size: 0.78rem; color: var(--text-3); }
.selected-patient { margin-top: 5px; font-size: 0.82rem; color: var(--primary); font-weight: 500; }

/* Catálogo pruebas */
.tests-catalog { display: flex; flex-direction: column; gap: 16px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
.test-category__title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--primary); margin-bottom: 8px; }
.test-category__items { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.test-checkbox-label { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1.5px solid var(--border); border-radius: var(--radius); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
.test-checkbox-label:hover { background: var(--surface-2); }
.test-checkbox-label input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; flex-shrink: 0; margin-top: 2px; }
.test-info { display: flex; flex-direction: column; gap: 2px; }
.test-name { font-size: 0.85rem; color: var(--text); font-weight: 500; }
.test-meta { font-size: 0.72rem; }

/* Resultados */
.result-item { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; margin-bottom: 12px; }
.result-item__header { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; }
.result-item__header strong { font-size: 0.93rem; color: var(--text); }

/* Alertas */
.alert { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 0.875rem; }
.alert--error { background: #FDEAEA; color: #c0392b; border-left: 3px solid var(--danger); }
.mx { margin: 0 24px 8px; }

/* Estados */
.loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-3); font-size: 0.9rem; background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); }
.loading-state-sm { display: flex; align-items: center; gap: 8px; padding: 12px; color: var(--text-3); font-size: 0.85rem; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-3); font-size: 0.9rem; background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); }
.empty-state__emoji { font-size: 3rem; }

/* Spinner */
.spin { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
.spin--sm { width: 14px; height: 14px; }
.spin--dark { border-color: rgba(0,0,0,0.1); border-top-color: var(--primary); }
@keyframes spin { to { transform: rotate(360deg); } }

/* Transición modal */
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

@media (max-width: 700px) {
  .stats-row { gap: 10px; }
  .stat-card { min-width: 130px; }
  .form-grid { grid-template-columns: 1fr; }
  .test-category__items { grid-template-columns: 1fr; }
  .modal { max-width: 100%; max-height: 100vh; border-radius: 0; }
  .table thead th:nth-child(2), .table tbody td:nth-child(2) { display: none; }
}
</style>
