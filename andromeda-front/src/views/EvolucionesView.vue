<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">📋</span>
        <div>
          <h2 class="page-title">Evoluciones clínicas</h2>
          <p class="page-sub">Historial médico y notas de evolución</p>
        </div>
      </div>
      <button class="btn-primary" @click="openModal()">✏️ Nueva evolución</button>
    </div>

    <div class="filters">
      <input v-model.trim="search" type="search" placeholder="🔍 Buscar por paciente o diagnóstico…" class="filter-input filter-input--grow" @input="debouncedLoad()" />
      <input v-model="dateFrom" type="date" class="filter-input" @change="load()" />
      <input v-model="dateTo"   type="date" class="filter-input" @change="load()" />
    </div>

    <div v-if="loading" class="loading-state">
      <span class="spin spin--dark" /> Cargando evoluciones…
    </div>
    <div v-else-if="error" class="alert alert--error">{{ error }}</div>

    <div v-else-if="items.length === 0" class="empty-state">
      <span class="empty-state__emoji">🐱</span>
      <p>No hay evoluciones registradas</p>
    </div>

    <div v-else class="evol-list">
      <div v-for="ev in items" :key="ev.id" class="evol-card">
        <div class="evol-card__aside">
          <span class="evol-card__emoji">{{ petEmoji(ev.species) }}</span>
          <div class="evol-card__meta">
            <strong>{{ ev.patient_name || '—' }}</strong>
            <span>{{ formatDate(ev.visit_date || ev.opened_at) }}</span>
          </div>
        </div>
        <div class="evol-card__body">
          <div class="evol-card__section" v-if="ev.chief_complaint">
            <span class="evol-tag evol-tag--blue">Motivo</span>
            <p>{{ ev.chief_complaint }}</p>
          </div>
          <div class="evol-card__section" v-if="ev.weight_kg">
            <span class="evol-tag evol-tag--green">Peso</span>
            <p>{{ ev.weight_kg }} kg</p>
          </div>
        </div>
        <div class="evol-card__vet" v-if="ev.vet_name">
          <span>👨‍⚕️ {{ ev.vet_name }}</span>
          <span class="evol-status" :class="`status--${ev.status}`">{{ ev.status }}</span>
        </div>
      </div>
    </div>

    <div v-if="pagination.totalPages > 1" class="pagination">
      <button :disabled="pagination.page <= 1" @click="load(pagination.page - 1)">← Ant.</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button :disabled="pagination.page >= pagination.totalPages" @click="load(pagination.page + 1)">Sig. →</button>
    </div>

    <!-- Modal nueva evolución -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal()">
        <div class="modal">
          <div class="modal__header">
            <h3>📋 Nueva evolución clínica</h3>
            <button class="modal__close" @click="closeModal()">✕</button>
          </div>
          <form @submit.prevent="handleCreate" novalidate>
            <div class="form-body">
              <div class="form-grid">
                <div class="field field--full">
                  <label>Paciente <span class="req">*</span></label>
                  <input v-model.trim="patientSearch" type="search" placeholder="Buscar paciente por nombre…" :disabled="saving" @input="searchPatients" autocomplete="off" />
                  <div v-if="patientResults.length" class="autocomplete">
                    <div v-for="pt in patientResults" :key="pt.id" class="autocomplete__item" @click="selectPatient(pt)">
                      {{ petEmoji(pt.species) }} <b>{{ pt.name }}</b>
                      <span class="autocomplete__owner">— {{ pt.primary_owner || '' }}</span>
                    </div>
                  </div>
                  <div v-if="form.patientId" class="selected-patient">✅ {{ selectedPatientLabel }}</div>
                  <span v-if="fe.patientId" class="field-error">{{ fe.patientId }}</span>
                </div>
                <div class="field">
                  <label>Peso en consulta (kg)</label>
                  <input v-model.number="form.weight" type="number" step="0.1" min="0" placeholder="4.2" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Temperatura (°C)</label>
                  <input v-model.number="form.temperature" type="number" step="0.1" placeholder="38.5" :disabled="saving" />
                </div>
                <div class="field field--full">
                  <label>Motivo de consulta <span class="req">*</span></label>
                  <textarea v-model.trim="form.reason" rows="2" placeholder="Motivo de la visita…" :disabled="saving" required />
                  <span v-if="fe.reason" class="field-error">{{ fe.reason }}</span>
                </div>
                <div class="field field--full">
                  <label>Notas adicionales</label>
                  <textarea v-model.trim="form.notes" rows="2" placeholder="Observaciones…" :disabled="saving" />
                </div>
              </div>
            </div>
            <div v-if="saveError" class="alert alert--error mx">{{ saveError }}</div>
            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeModal()" :disabled="saving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving" class="spin spin--sm" /> <span v-else>Guardar evolución</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import http from '../api/client'

const items = ref([])
const loading = ref(false)
const error   = ref('')
const search  = ref('')
const dateFrom = ref('')
const dateTo   = ref('')
const pagination = ref({ page: 1, totalPages: 1 })

function petEmoji(s) {
  if (!s) return '🐾'
  const sl = s.toLowerCase()
  const m = { perro:'🐶', dog:'🐶', gato:'🐱', cat:'🐱', conejo:'🐰', rabbit:'🐰', loro:'🦜', bird:'🦜', pez:'🐟', fish:'🐟', tortuga:'🐢', reptile:'🦎', hamster:'🐹' }
  return m[sl] || '🐾'
}

// Patient autocomplete
const patientSearch = ref('')
const patientResults = ref([])
const selectedPatientLabel = ref('')
let patientTimer = null
async function searchPatients() {
  clearTimeout(patientTimer)
  form.patientId = ''
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
  form.patientId = pt.id
  selectedPatientLabel.value = `${pt.name} (${pt.primary_owner || ''})`
  patientSearch.value = pt.name
  patientResults.value = []
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

async function load(page = 1) {
  loading.value = true; error.value = ''
  try {
    const params = { page, limit: 15 }
    if (search.value)   params.search    = search.value
    if (dateFrom.value) params.date_from = dateFrom.value
    if (dateTo.value)   params.date_to   = dateTo.value
    const { data } = await http.get('/medical-records', { params })
    items.value = data.data || data.records || data || []
    const m = data.meta || {}
    pagination.value = { page: m.page || page, totalPages: m.totalPages || 1 }
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudieron cargar las evoluciones'
  } finally { loading.value = false }
}

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 350) }

const showModal = ref(false)
const saving    = ref(false)
const saveError = ref('')
const fe        = reactive({})
const form = reactive({ patientId:'', weight:'', temperature:'', reason:'', notes:'' })

function openModal()  {
  resetForm()
  patientSearch.value = ''
  patientResults.value = []
  selectedPatientLabel.value = ''
  showModal.value = true
}
function closeModal() { showModal.value = false; resetForm() }
function resetForm() {
  Object.keys(form).forEach(k => form[k] = '')
  saveError.value = ''; Object.keys(fe).forEach(k => delete fe[k])
}

function validate() {
  Object.keys(fe).forEach(k => delete fe[k])
  if (!form.patientId) fe.patientId = 'Requerido'
  if (!form.reason)    fe.reason    = 'Requerido'
  return Object.keys(fe).length === 0
}

async function handleCreate() {
  if (!validate()) return
  saving.value = true; saveError.value = ''
  try {
    const payload = {
      patientId:      parseInt(form.patientId),
      chiefComplaint: form.reason,
    }
    if (form.weight)      payload.weightKg     = parseFloat(form.weight)
    if (form.temperature) payload.temperatureC = parseFloat(form.temperature)
    if (form.notes)       payload.notes        = form.notes
    await http.post('/medical-records', payload)
    closeModal(); await load()
  } catch (e) {
    saveError.value = e.response?.data?.message || 'No se pudo guardar la evolución'
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

.filters { display: flex; gap: 10px; flex-wrap: wrap; }
.filter-input { padding: 9px 13px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.87rem; background: var(--white); color: var(--text); outline: none; }
.filter-input:focus { border-color: var(--primary); }
.filter-input--grow { flex: 1; min-width: 200px; }

.evol-list { display: flex; flex-direction: column; gap: 12px; }
.evol-card { background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; display: grid; grid-template-columns: 130px 1fr; grid-template-rows: auto auto; transition: box-shadow var(--transition); }
.evol-card:hover { box-shadow: var(--shadow); }
.evol-card__aside { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px 12px; background: var(--surface-2); gap: 8px; border-right: 1px solid var(--border); grid-row: 1 / 3; }
.evol-card__emoji { font-size: 2.2rem; }
.evol-card__meta { text-align: center; }
.evol-card__meta strong { display: block; font-size: 0.9rem; color: var(--text); }
.evol-card__meta span   { font-size: 0.75rem; color: var(--text-3); }
.evol-card__body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.evol-card__section { display: flex; align-items: flex-start; gap: 8px; }
.evol-card__section p { font-size: 0.87rem; color: var(--text-2); line-height: 1.5; flex: 1; }
.evol-card__vet { padding: 8px 16px; border-top: 1px solid var(--border); font-size: 0.78rem; color: var(--text-3); background: var(--surface); grid-column: 2; }

.evol-tag { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
.evol-tag--blue   { background: #D6EEFF; color: #1A5FAA; }
.evol-tag--purple { background: #F0E8FF; color: #7A3DAA; }
.evol-tag--green  { background: #D6F3EC; color: #1A9E7F; }
.evol-tag--yellow { background: #FFF3CC; color: #8A6200; }

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
.modal { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); width: 100%; max-width: 580px; max-height: 92vh; overflow-y: auto; }
.modal__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--white); z-index: 1; }
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
@media (max-width: 600px) {
  .evol-card { grid-template-columns: 1fr; }
  .evol-card__aside { grid-row: auto; flex-direction: row; border-right: none; border-bottom: 1px solid var(--border); }
  .evol-card__vet { grid-column: 1; }
  .form-grid { grid-template-columns: 1fr; }
}
.autocomplete { position: absolute; z-index: 100; background: var(--white); border: 1.5px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; max-height: 200px; overflow-y: auto; }
.autocomplete__item { padding: 9px 13px; cursor: pointer; font-size: 0.88rem; }
.autocomplete__item:hover { background: var(--surface-2); }
.autocomplete__owner { font-size: 0.78rem; color: var(--text-3); }
.selected-patient { margin-top: 6px; font-size: 0.82rem; color: var(--primary); font-weight: 500; }
.evol-status { margin-left: 8px; font-size: 0.75rem; text-transform: capitalize; opacity: 0.7; }
</style>
