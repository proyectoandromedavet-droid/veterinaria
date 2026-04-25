<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">💻</span>
        <div>
          <h2 class="page-title">Telemedicina</h2>
          <p class="page-sub">Consultas veterinarias a distancia</p>
        </div>
      </div>
      <button class="btn-primary" @click="openModal()">🐾 Nueva teleconsulta</button>
    </div>

    <!-- Info banner -->
    <div class="info-banner">
      <span>🎥</span>
      <div>
        <strong>Consultas virtuales disponibles</strong>
        <span>Los dueños reciben un enlace por email para unirse a la videollamada en el horario pactado.</span>
      </div>
    </div>

    <!-- Filtros -->
    <div class="filters">
      <input v-model="dateFilter" type="date" class="filter-input" @change="load()" />
      <select v-model="statusFilter" class="filter-select" @change="load()">
        <option value="">Todos los estados</option>
        <option value="scheduled">Programada</option>
        <option value="in_progress">En curso</option>
        <option value="completed">Completada</option>
        <option value="cancelled">Cancelada</option>
        <option value="no_show">Ausente</option>
      </select>
      <input v-model.trim="search" type="search" placeholder="🔍 Buscar paciente…" class="filter-input filter-input--grow" @input="debouncedLoad()" />
    </div>

    <div v-if="loading" class="loading-state"><span class="spin spin--dark" /> Cargando consultas…</div>
    <div v-else-if="error" class="alert alert--error">{{ error }}</div>
    <div v-else-if="items.length === 0" class="empty-state">
      <span class="empty-state__emoji">🐱</span>
      <p>No hay teleconsultas para esta fecha</p>
      <button class="btn-ghost" @click="openModal()">Programar consulta</button>
    </div>

    <div v-else class="tele-list">
      <div v-for="t in items" :key="t.id" class="tele-card">
        <div class="tele-card__left">
          <div class="tele-time">{{ formatTime(t.scheduled_date || t.start_time) }}</div>
          <span class="badge" :class="`status--${t.status}`">{{ STATUS[t.status] || t.status }}</span>
        </div>
        <div class="tele-card__mid">
          <div class="tele-pet">
            <span>{{ petEmoji(t.patient?.species) }}</span>
            <div>
              <strong>{{ t.patient?.name || t.patient_name || '—' }}</strong>
              <span class="sub">{{ t.patient?.owner?.full_name || t.owner_name || '' }}</span>
            </div>
          </div>
          <p class="tele-reason">{{ t.reason || t.chief_complaint || 'Consulta general' }}</p>
          <p class="tele-vet" v-if="t.vet_name">👨‍⚕️ {{ t.vet_name }}</p>
        </div>
        <div class="tele-card__right">
          <button
            v-if="t.status === 'scheduled'"
            class="btn-join"
            @click="joinCall(t)"
          >
            🎥 Unirse
          </button>
          <button
            v-if="t.status === 'in_progress'"
            class="btn-xs btn-xs--green"
            @click="changeStatus(t, 'completed')"
          >Finalizar</button>
          <button
            v-if="t.status !== 'completed' && t.status !== 'cancelled'"
            class="btn-xs btn-xs--red"
            @click="changeStatus(t, 'cancelled')"
          >Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal()">
        <div class="modal">
          <div class="modal__header">
            <h3>💻 Nueva teleconsulta</h3>
            <button class="modal__close" @click="closeModal()">✕</button>
          </div>
          <form @submit.prevent="handleCreate" novalidate>
            <div class="form-body">
              <div class="form-grid">
                <div class="field">
                  <label>Fecha y hora <span class="req">*</span></label>
                  <input v-model="form.scheduledDate" type="datetime-local" :disabled="saving" required />
                  <span v-if="fe.scheduledDate" class="field-error">{{ fe.scheduledDate }}</span>
                </div>
                <div class="field">
                  <label>Duración estimada</label>
                  <select v-model="form.duration" :disabled="saving">
                    <option value="15">15 minutos</option>
                    <option value="30">30 minutos</option>
                    <option value="45">45 minutos</option>
                    <option value="60">1 hora</option>
                  </select>
                </div>
                <div class="field field--full">
                  <label>Paciente <span class="req">*</span></label>
                  <input v-model.trim="patientSearch" type="search" placeholder="Buscar paciente por nombre…" :disabled="saving" @input="searchPatients" autocomplete="off" />
                  <div v-if="patientResults.length" class="autocomplete">
                    <div v-for="pt in patientResults" :key="pt.id" class="autocomplete__item" @click="selectPatient(pt)">
                      🐾 <b>{{ pt.name }}</b>
                      <span class="autocomplete__owner">— {{ pt.primary_owner || '' }}</span>
                    </div>
                  </div>
                  <div v-if="form.patientId" class="selected-patient">✅ {{ selectedPatientLabel }}</div>
                  <span v-if="fe.patientId" class="field-error">{{ fe.patientId }}</span>
                </div>
                <div class="field field--full">
                  <label>Veterinario <span class="req">*</span></label>
                  <select v-model="form.vetId" :disabled="saving" required>
                    <option value="">Seleccioná un veterinario…</option>
                    <option v-for="v in vetList" :key="v.id" :value="v.id">{{ v.first_name }} {{ v.last_name }}</option>
                  </select>
                  <span v-if="fe.vetId" class="field-error">{{ fe.vetId }}</span>
                </div>
                <div class="field field--full">
                  <label>Motivo de la consulta <span class="req">*</span></label>
                  <textarea v-model.trim="form.reason" rows="2" placeholder="Describa brevemente el problema…" :disabled="saving" required />
                  <span v-if="fe.reason" class="field-error">{{ fe.reason }}</span>
                </div>
                <div class="field">
                  <label>Tipo de sesión <span class="req">*</span></label>
                  <select v-model="form.sessionType" :disabled="saving" required>
                    <option value="consultation">Consulta</option>
                    <option value="follow_up">Seguimiento</option>
                    <option value="second_opinion">Segunda opinión</option>
                    <option value="emergency">Urgencia</option>
                    <option value="prescription_renewal">Renovación receta</option>
                  </select>
                </div>
                <div class="field">
                  <label>Plataforma</label>
                  <select v-model="form.platformId" :disabled="saving">
                    <option value="">Sin plataforma</option>
                    <option v-for="p in platformList" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                </div>
              </div>
            </div>
            <div v-if="saveError" class="alert alert--error mx">{{ saveError }}</div>
            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeModal()" :disabled="saving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving" class="spin spin--sm" /> <span v-else>Programar teleconsulta</span>
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
const dateFilter   = ref(new Date().toISOString().split('T')[0])
const statusFilter = ref('')

const STATUS = { scheduled:'Programada', in_progress:'En curso', completed:'Completada', cancelled:'Cancelada', no_show:'Ausente' }

function petEmoji(s) {
  const m = { dog:'🐶', cat:'🐱', rabbit:'🐰', bird:'🐦', fish:'🐟', reptile:'🦎' }
  return m[s] || '🐾'
}

function formatTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })
}

async function load() {
  loading.value = true; error.value = ''
  try {
    const params = {}
    if (dateFilter.value)   params.date   = dateFilter.value
    if (statusFilter.value) params.status = statusFilter.value
    if (search.value)       params.search = search.value
    const { data } = await http.get('/tele/sessions', { params })
    items.value = data.data || data.consultations || data || []
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudieron cargar las teleconsultas'
  } finally { loading.value = false }
}

let timer = null
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 350) }

function joinCall(t) {
  if (t.meeting_url) {
    window.open(t.meeting_url, '_blank')
  } else {
    alert('El enlace de videollamada no está disponible aún.')
  }
}

async function changeStatus(t, status) {
  try {
    await http.patch(`/tele/sessions/${t.id}/status`, { status })
    t.status = status
  } catch (e) {
    alert(e.response?.data?.message || 'No se pudo actualizar')
  }
}

// Vet list
const vetList = ref([])
async function loadVets() {
  try {
    const { data } = await http.get('/auth/admin/users', { params: { limit: 100 } })
    const VET_ROLES = ['veterinarian','surgeon','vet_technician','tele_vet']
    vetList.value = (data.data || []).filter(u => u.roles && VET_ROLES.some(r => u.roles.includes(r)))
  } catch { vetList.value = [] }
}

// Platform list
const platformList = ref([])
async function loadPlatforms() {
  try {
    const { data } = await http.get('/tele/platforms')
    platformList.value = data.data || []
  } catch { platformList.value = [] }
}

// Patient autocomplete
const patientSearch = ref('')
const patientResults = ref([])
const selectedPatientLabel = ref('')
let patientTimer = null
async function searchPatients() {
  clearTimeout(patientTimer)
  form.patientId = ''; form.clientId = ''
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
  form.clientId  = pt.owner_id || ''
  selectedPatientLabel.value = `${pt.name} (${pt.primary_owner || ''})`
  patientSearch.value = pt.name
  patientResults.value = []
}

const showModal = ref(false)
const saving    = ref(false)
const saveError = ref('')
const fe        = reactive({})
const form = reactive({ scheduledAt:'', duration:'30', patientId:'', clientId:'', vetId:'', reason:'', sessionType:'consultation', platformId:'' })

function openModal()  {
  resetForm()
  patientSearch.value = ''; patientResults.value = []; selectedPatientLabel.value = ''
  showModal.value = true
}
function closeModal() { showModal.value = false; resetForm() }
function resetForm() {
  form.scheduledAt = ''; form.duration = '30'; form.patientId = ''; form.clientId = ''
  form.vetId = ''; form.reason = ''; form.sessionType = 'consultation'; form.platformId = ''
  saveError.value = ''; Object.keys(fe).forEach(k => delete fe[k])
}

function validate() {
  Object.keys(fe).forEach(k => delete fe[k])
  if (!form.scheduledAt) fe.scheduledAt = 'Requerido'
  if (!form.patientId)   fe.patientId   = 'Requerido'
  if (!form.vetId)       fe.vetId       = 'Requerido'
  if (!form.reason)      fe.reason      = 'Requerido'
  return Object.keys(fe).length === 0
}

async function handleCreate() {
  if (!validate()) return
  saving.value = true; saveError.value = ''
  try {
    const payload = {
      scheduledAt:     form.scheduledAt,
      patientId:       parseInt(form.patientId),
      clientId:        parseInt(form.clientId),
      vetId:           parseInt(form.vetId),
      chiefComplaint:  form.reason,
      durationMinutes: parseInt(form.duration),
      sessionType:     form.sessionType,
    }
    if (form.platformId) payload.platformId = parseInt(form.platformId)
    await http.post('/tele/sessions', payload)
    closeModal(); await load()
  } catch (e) {
    saveError.value = e.response?.data?.message || 'No se pudo programar la teleconsulta'
  } finally { saving.value = false }
}

onMounted(() => { load(); loadVets(); loadPlatforms() })
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.page-header__left { display: flex; align-items: center; gap: 14px; }
.page-emoji { font-size: 2rem; }
.page-title { font-size: 1.35rem; font-weight: 700; color: var(--text); }
.page-sub   { font-size: 0.82rem; color: var(--text-2); margin-top: 2px; }

.info-banner { display: flex; align-items: flex-start; gap: 12px; padding: 14px 18px; background: #EEF6FF; border-radius: var(--radius-lg); border-left: 3px solid #90D5F0; font-size: 0.85rem; }
.info-banner span:first-child { font-size: 1.4rem; flex-shrink: 0; }
.info-banner strong { display: block; color: var(--text); margin-bottom: 2px; }
.info-banner span:last-child { color: var(--text-2); }

.filters { display: flex; gap: 10px; flex-wrap: wrap; }
.filter-input, .filter-select { padding: 9px 13px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 0.87rem; background: var(--white); color: var(--text); outline: none; }
.filter-input:focus, .filter-select:focus { border-color: var(--primary); }
.filter-input--grow { flex: 1; min-width: 180px; }

/* Tele list */
.tele-list { display: flex; flex-direction: column; gap: 10px; }
.tele-card { background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); display: flex; align-items: center; gap: 16px; padding: 16px; transition: box-shadow var(--transition); }
.tele-card:hover { box-shadow: var(--shadow); }

.tele-card__left { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 80px; }
.tele-time { font-size: 1.1rem; font-weight: 700; color: var(--primary); }

.tele-card__mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.tele-pet { display: flex; align-items: center; gap: 8px; font-size: 1.3rem; }
.tele-pet strong { display: block; font-size: 0.95rem; color: var(--text); }
.sub { font-size: 0.75rem; color: var(--text-3); }
.tele-reason { font-size: 0.83rem; color: var(--text-2); margin-top: 2px; }
.tele-vet    { font-size: 0.78rem; color: var(--text-3); }

.tele-card__right { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }

/* Badges */
.badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; }
.status--scheduled   { background: #D6EEFF; color: #1A5FAA; }
.status--in_progress { background: #FFF3CC; color: #8A6200; }
.status--completed   { background: #D6F3EC; color: #1A9E7F; }
.status--cancelled   { background: #FDEAEA; color: #c0392b; }
.status--no_show     { background: var(--surface-2); color: var(--text-3); }

.btn-join { padding: 8px 14px; background: linear-gradient(135deg, #4A90D9 0%, #2C6FAC 100%); color: white; border: none; border-radius: var(--radius); font-size: 0.85rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: opacity var(--transition); }
.btn-join:hover { opacity: 0.9; }

.btn-xs { padding: 4px 10px; border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
.btn-xs:hover { opacity: 0.8; }
.btn-xs--green { background: #D6F3EC; color: #1A9E7F; }
.btn-xs--red   { background: #FDEAEA; color: #c0392b; }

.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%); color: white; border: none; border-radius: var(--radius); font-size: 0.9rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: opacity var(--transition), transform var(--transition); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost { padding: 10px 20px; background: none; border: 1.5px solid var(--border); border-radius: var(--radius); color: var(--text-2); font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: background var(--transition); }
.btn-ghost:hover:not(:disabled) { background: var(--surface-2); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); width: 100%; max-width: 520px; max-height: 92vh; overflow-y: auto; }
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
@media (max-width: 600px) {
  .tele-card { flex-wrap: wrap; }
  .form-grid { grid-template-columns: 1fr; }
}
.autocomplete { position: absolute; z-index: 100; background: var(--white); border: 1.5px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; max-height: 200px; overflow-y: auto; }
.autocomplete__item { padding: 9px 13px; cursor: pointer; font-size: 0.88rem; }
.autocomplete__item:hover { background: var(--surface-2); }
.autocomplete__owner { font-size: 0.78rem; color: var(--text-3); }
.selected-patient { margin-top: 6px; font-size: 0.82rem; color: var(--primary); font-weight: 500; }
.field { position: relative; }
</style>
