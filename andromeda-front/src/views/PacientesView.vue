<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">🐾</span>
        <div>
          <h2 class="page-title">Pacientes</h2>
          <p class="page-sub">Historial de mascotas y sus dueños</p>
        </div>
      </div>
      <button class="btn-primary" @click="openModal()">🐱 Nuevo paciente</button>
    </div>

    <!-- Búsqueda -->
    <div class="filters">
      <input v-model.trim="search" type="search" placeholder="🔍 Buscar por nombre, especie o dueño…" class="filter-input filter-input--grow" @input="debouncedLoad()" />
      <select v-model="speciesFilter" class="filter-select" @change="load()">
        <option value="">Todas las especies</option>
        <option v-for="sp in speciesList" :key="sp.id" :value="sp.common_name">
          {{ petEmoji(sp.slug) }} {{ sp.common_name }}
        </option>
      </select>
    </div>

    <!-- Carga -->
    <div v-if="loading" class="loading-state">
      <span class="spin spin--dark" /> Cargando pacientes…
    </div>
    <div v-else-if="error" class="alert alert--error">{{ error }}</div>

    <!-- Grid de pacientes -->
    <div v-else-if="items.length === 0" class="empty-state">
      <span class="empty-state__emoji">🐾</span>
      <p>No se encontraron pacientes</p>
      <button class="btn-ghost" @click="openModal()">Registrar primer paciente</button>
    </div>

    <div v-else class="patient-grid">
      <div v-for="p in items" :key="p.id" class="patient-card" :style="{ '--pet-color': speciesColor(p.species) }">
        <div class="patient-card__top">
          <span class="patient-card__emoji">{{ petEmoji(p.species) }}</span>
          <div class="patient-card__info">
            <strong class="patient-card__name">{{ p.name }}</strong>
            <span class="patient-card__species">{{ p.species }}</span>
          </div>
          <span class="badge badge--species" :style="{ background: speciesBg(p.species), color: speciesColor(p.species) }">
            {{ p.breed_name || p.breed || 'Sin raza' }}
          </span>
        </div>
        <div class="patient-card__body">
          <div class="patient-card__row">
            <span>👤</span>
            <span>{{ p.primary_owner || p.owner_name || '—' }}</span>
          </div>
          <div class="patient-card__row">
            <span>🎂</span>
            <span>{{ p.birthdate ? formatAge(p.birthdate) : '—' }}</span>
          </div>
          <div class="patient-card__row">
            <span>⚖️</span>
            <span>{{ p.weight_kg ? p.weight_kg + ' kg' : '—' }}</span>
          </div>
          <div v-if="p.coat_color" class="patient-card__row">
            <span>🎨</span>
            <span>{{ p.coat_color }}</span>
          </div>
        </div>
        <div class="patient-card__footer">
          <span class="badge" :class="p.is_active !== false ? 'badge--active' : 'badge--inactive'">
            {{ p.is_active !== false ? 'Activo' : 'Inactivo' }}
          </span>
          <div class="patient-card__actions">
            <button class="btn-card" title="Ver historial" @click="openDetail(p)">📋</button>
            <button class="btn-card" title="Editar" @click="openEdit(p)">✏️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Paginación -->
    <div v-if="pagination.totalPages > 1" class="pagination">
      <button :disabled="pagination.page <= 1" @click="loadPage(pagination.page - 1)">← Ant.</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button :disabled="pagination.page >= pagination.totalPages" @click="loadPage(pagination.page + 1)">Sig. →</button>
    </div>

    <!-- Modal detalle -->
    <Transition name="modal">
      <div v-if="showDetail" class="modal-backdrop" @click.self="showDetail = false">
        <div class="modal">
          <div class="modal__header">
            <h3>{{ petEmoji(detailPatient?.species) }} {{ detailPatient?.name }}</h3>
            <button type="button" class="modal__close" @click="showDetail = false">✕</button>
          </div>
          <div class="form-body" v-if="detailPatient">
            <div class="detail-row"><b>Especie:</b> {{ detailPatient.species }}</div>
            <div class="detail-row"><b>Raza:</b> {{ detailPatient.breed_name || detailPatient.breed || '—' }}</div>
            <div class="detail-row"><b>Sexo:</b> {{ sexLabel(detailPatient.sex) }}</div>
            <div class="detail-row"><b>Nacimiento:</b> {{ detailPatient.birthdate ? formatDate(detailPatient.birthdate) : '—' }}</div>
            <div class="detail-row"><b>Peso:</b> {{ detailPatient.weight_kg ? detailPatient.weight_kg + ' kg' : '—' }}</div>
            <div class="detail-row"><b>Chip:</b> {{ detailPatient.chip_number || '—' }}</div>
            <div class="detail-row"><b>Dueño:</b> {{ detailPatient.primary_owner || '—' }}</div>
            <div class="detail-row"><b>Tel. dueño:</b> {{ detailPatient.owner_phone || '—' }}</div>
          </div>
          <div class="modal__actions">
            <button class="btn-ghost" @click="showDetail = false">Cerrar</button>
            <button class="btn-primary" @click="openEdit(detailPatient); showDetail = false">✏️ Editar</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Modal nuevo/editar paciente -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal()">
        <div class="modal">
          <div class="modal__header">
            <h3>{{ editingId ? '✏️ Editar paciente' : '🐾 Nuevo paciente' }}</h3>
            <button type="button" class="modal__close" @click="closeModal()">✕</button>
          </div>
          <form @submit.prevent="handleSave" novalidate>
            <div class="form-body">
              <div class="form-section-title">Datos de la mascota</div>
              <div class="form-grid">
                <div class="field">
                  <label>Nombre <span class="req">*</span></label>
                  <input v-model.trim="form.name" type="text" placeholder="Max" :disabled="saving" required />
                  <span v-if="fe.name" class="field-error">{{ fe.name }}</span>
                </div>
                <div class="field">
                  <label>Especie <span class="req">*</span></label>
                  <select v-model="form.speciesId" :disabled="saving || !!editingId" required>
                    <option value="">Seleccioná…</option>
                    <option v-for="sp in speciesList" :key="sp.id" :value="sp.id">
                      {{ petEmoji(sp.slug) }} {{ sp.common_name }}
                    </option>
                  </select>
                  <span v-if="editingId" class="field-hint">La especie no se puede cambiar</span>
                  <span v-if="fe.speciesId" class="field-error">{{ fe.speciesId }}</span>
                </div>
                <div class="field">
                  <label>Sexo <span class="req">*</span></label>
                  <select v-model="form.sex" :disabled="saving" required>
                    <option value="unknown">Sin especificar</option>
                    <option value="male">Macho</option>
                    <option value="female">Hembra</option>
                  </select>
                  <span v-if="fe.sex" class="field-error">{{ fe.sex }}</span>
                </div>
                <div class="field">
                  <label>Fecha de nacimiento</label>
                  <input v-model="form.birthDate" type="date" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Peso (kg)</label>
                  <input v-model.number="form.weight" type="number" step="0.1" min="0" placeholder="3.5" :disabled="saving" />
                </div>
                <div class="field">
                  <label>Microchip</label>
                  <input v-model.trim="form.microchip" type="text" placeholder="123456789012345" :disabled="saving" />
                </div>
              </div>

              <!-- Datos del dueño: solo en creación -->
              <template v-if="!editingId">
                <div class="form-section-title" style="margin-top:16px">Datos del dueño</div>
                <div class="form-grid">
                  <div class="field">
                    <label>Nombre <span class="req">*</span></label>
                    <input v-model.trim="form.ownerFirstName" type="text" placeholder="María" :disabled="saving" required />
                    <span v-if="fe.ownerFirstName" class="field-error">{{ fe.ownerFirstName }}</span>
                  </div>
                  <div class="field">
                    <label>Apellido <span class="req">*</span></label>
                    <input v-model.trim="form.ownerLastName" type="text" placeholder="García" :disabled="saving" required />
                    <span v-if="fe.ownerLastName" class="field-error">{{ fe.ownerLastName }}</span>
                  </div>
                  <div class="field">
                    <label>Teléfono <span class="req">*</span></label>
                    <input v-model.trim="form.ownerPhone" type="tel" placeholder="+54 9 11 1234-5678" :disabled="saving" required />
                    <span v-if="fe.ownerPhone" class="field-error">{{ fe.ownerPhone }}</span>
                  </div>
                  <div class="field">
                    <label>Email</label>
                    <input v-model.trim="form.ownerEmail" type="email" placeholder="maria@email.com" :disabled="saving" />
                  </div>
                </div>
              </template>
            </div>

            <div v-if="saveError" class="alert alert--error mx">{{ saveError }}</div>
            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeModal()" :disabled="saving">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving" class="spin spin--sm" />
                <span v-else>{{ editingId ? 'Guardar cambios' : 'Registrar paciente' }}</span>
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

const items        = ref([])
const loading      = ref(false)
const error        = ref('')
const search       = ref('')
const speciesFilter = ref('')
const pagination   = ref({ page: 1, totalPages: 1 })
const speciesList  = ref([])   // [{ id, common_name, slug }]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizePatient(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    species: row.species || row.species_name || row.speciesName || '',
    breed_name: row.breed_name || row.breedName || row.breed || '',
    breed: row.breed || row.breed_name || row.breedName || '',
    primary_owner: row.primary_owner || row.owner_name || row.ownerName || '',
    owner_name: row.owner_name || row.primary_owner || row.ownerName || '',
    owner_phone: row.owner_phone || row.ownerPhone || '',
    weight_kg: row.weight_kg ?? row.weightKg ?? null,
    chip_number: row.chip_number || row.microchip_number || row.microchipNumber || '',
    is_active: row.is_active ?? row.active ?? true,
  }
}

// ── Species display helpers ──────────────────────────────────────────────────

const SPECIES_COLORS = {
  perro:   { text: '#8B5E3C', bg: '#FFF0E0' },
  gato:    { text: '#7A3DAA', bg: '#F0E8FF' },
  conejo:  { text: '#2E8B57', bg: '#E0FFE8' },
  ave:     { text: '#1A7A9A', bg: '#E0F5FF' },
  pez:     { text: '#1A5FAA', bg: '#E0EEFF' },
  reptil:  { text: '#5A8A2E', bg: '#EEFFD0' },
  hámster: { text: '#A05028', bg: '#FFE8D0' },
}

function speciesKey(s) {
  if (!s) return ''
  const lower = s.toLowerCase()
  if (lower.includes('perro') || lower.includes('dog'))    return 'perro'
  if (lower.includes('gato') || lower.includes('cat'))     return 'gato'
  if (lower.includes('conejo') || lower.includes('rabbit')) return 'conejo'
  if (lower.includes('ave') || lower.includes('bird'))     return 'ave'
  if (lower.includes('pez') || lower.includes('fish'))     return 'pez'
  if (lower.includes('reptil'))                            return 'reptil'
  if (lower.includes('hámster') || lower.includes('hamster')) return 'hámster'
  return lower
}

function speciesColor(s) { return SPECIES_COLORS[speciesKey(s)]?.text || 'var(--text-2)' }
function speciesBg(s)    { return SPECIES_COLORS[speciesKey(s)]?.bg   || 'var(--surface-2)' }

function petEmoji(s) {
  const k = speciesKey(s || '')
  const map = { perro:'🐶', gato:'🐱', conejo:'🐰', ave:'🐦', pez:'🐟', reptil:'🦎', hámster:'🐹' }
  return map[k] || '🐾'
}

function sexLabel(sex) {
  return sex === 'male' ? 'Macho' : sex === 'female' ? 'Hembra' : '—'
}

function formatAge(bd) {
  const diff = Date.now() - new Date(bd).getTime()
  const years  = Math.floor(diff / (1000 * 60 * 60 * 24 * 365))
  const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30))
  if (years >= 1) return `${years} año${years !== 1 ? 's' : ''}`
  return `${months} mes${months !== 1 ? 'es' : ''}`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Load species list ────────────────────────────────────────────────────────

async function loadSpecies() {
  try {
    const { data } = await http.get('/patients/species/all')
    speciesList.value = asArray(data?.data || data)
  } catch {
    // Si falla, no bloqueamos la vista; el select quedará vacío
  }
}

// ── Load patients ────────────────────────────────────────────────────────────

async function load(page = 1) {
  loading.value = true; error.value = ''
  try {
    const params = { page, limit: 12 }
    if (search.value)        params.search  = search.value
    if (speciesFilter.value) params.species = speciesFilter.value
    const { data } = await http.get('/patients', { params })
    items.value = asArray(data?.data || data?.patients || data).map(normalizePatient).filter(Boolean)
    const m = data.meta || data.pagination || {}
    pagination.value = { page: m.page || page, totalPages: m.totalPages || m.total_pages || 1 }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'No se pudieron cargar los pacientes'
  } finally {
    loading.value = false
  }
}

function loadPage(p) { load(p) }

let timer = null
function debouncedLoad() {
  clearTimeout(timer)
  timer = setTimeout(() => load(), 350)
}

// ── Detail modal ─────────────────────────────────────────────────────────────

const showDetail    = ref(false)
const detailPatient = ref(null)
function openDetail(p) { detailPatient.value = p; showDetail.value = true }

// ── Create / Edit modal ──────────────────────────────────────────────────────

const showModal = ref(false)
const saving    = ref(false)
const saveError = ref('')
const editingId = ref(null)
const fe        = reactive({})

const form = reactive({
  name: '', speciesId: '', sex: 'unknown', birthDate: '', weight: '', microchip: '',
  ownerFirstName: '', ownerLastName: '', ownerPhone: '', ownerEmail: '',
})

function openModal() { editingId.value = null; resetForm(); showModal.value = true }
function closeModal() { showModal.value = false; resetForm() }

function resetForm() {
  form.name = ''; form.speciesId = ''; form.sex = 'unknown'
  form.birthDate = ''; form.weight = ''; form.microchip = ''
  form.ownerFirstName = ''; form.ownerLastName = ''
  form.ownerPhone = ''; form.ownerEmail = ''
  editingId.value = null
  saveError.value = ''
  Object.keys(fe).forEach(k => delete fe[k])
}

function openEdit(p) {
  editingId.value = p.id
  form.name      = p.name || ''
  // Preserve speciesId as display info when editing (can't change)
  form.speciesId = p.species_id || ''
  form.sex       = p.sex || 'unknown'
  form.birthDate = p.birthdate ? p.birthdate.split('T')[0] : ''
  form.weight    = p.weight_kg || ''
  form.microchip = p.chip_number || ''
  saveError.value = ''
  Object.keys(fe).forEach(k => delete fe[k])
  showModal.value = true
}

function validate() {
  Object.keys(fe).forEach(k => delete fe[k])
  if (!form.name) fe.name = 'El nombre es requerido'
  if (!editingId.value) {
    if (!form.speciesId)       fe.speciesId    = 'Seleccioná una especie'
    if (!form.ownerFirstName)  fe.ownerFirstName = 'El nombre es requerido'
    if (!form.ownerLastName)   fe.ownerLastName  = 'El apellido es requerido'
    if (!form.ownerPhone)      fe.ownerPhone     = 'El teléfono es requerido'
  }
  return Object.keys(fe).length === 0
}

async function handleSave() {
  if (!validate()) return
  saving.value = true; saveError.value = ''
  try {
    if (editingId.value) {
      // ── EDITAR paciente ──────────────────────────────────────────────────
      const payload = { name: form.name, sex: form.sex }
      if (form.birthDate) payload.birthDate        = form.birthDate
      if (form.weight)    payload.weightKg          = parseFloat(form.weight)
      if (form.microchip) payload.microchipNumber   = form.microchip
      await http.put(`/patients/${editingId.value}`, payload)
    } else {
      // ── CREAR: primero el cliente (dueño), luego el paciente ─────────────
      const clientRes = await http.post('/clients', {
        firstName: form.ownerFirstName,
        lastName:  form.ownerLastName,
        phone:     form.ownerPhone,
        email:     form.ownerEmail || undefined,
      })
      const clientId = clientRes.data?.data?.id || clientRes.data?.id

      const patientPayload = {
        name:           form.name,
        speciesId:      parseInt(form.speciesId),
        primaryOwnerId: clientId,
        sex:            form.sex || 'unknown',
      }
      if (form.birthDate) patientPayload.birthDate        = form.birthDate
      if (form.weight)    patientPayload.weightKg          = parseFloat(form.weight)
      if (form.microchip) patientPayload.microchipNumber   = form.microchip

      await http.post('/patients', patientPayload)
    }
    closeModal()
    await load()
  } catch (e) {
    const detail = e.response?.data?.error?.details
    if (detail?.length) {
      saveError.value = detail.map(d => `${d.path}: ${d.msg}`).join(', ')
    } else {
      saveError.value = e.response?.data?.error?.message || 'No se pudo guardar el paciente'
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSpecies()
  load()
})
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }

.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.page-header__left { display: flex; align-items: center; gap: 14px; }
.page-emoji { font-size: 2rem; }
.page-title { font-size: 1.35rem; font-weight: 700; color: var(--text); }
.page-sub   { font-size: 0.82rem; color: var(--text-2); margin-top: 2px; }

.filters { display: flex; gap: 10px; flex-wrap: wrap; }
.filter-input, .filter-select {
  padding: 9px 13px; border: 1.5px solid var(--border); border-radius: var(--radius);
  font-size: 0.87rem; background: var(--white); color: var(--text); outline: none;
  transition: border-color var(--transition);
}
.filter-input:focus, .filter-select:focus { border-color: var(--primary); }
.filter-input--grow { flex: 1; min-width: 200px; }

/* Patient Grid */
.patient-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.patient-card {
  background: var(--white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  border-top: 4px solid var(--pet-color, var(--primary));
  transition: box-shadow var(--transition), transform var(--transition);
}
.patient-card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }

.patient-card__top {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 14px 10px;
}
.patient-card__emoji { font-size: 2rem; }
.patient-card__name  { display: block; font-size: 1rem; font-weight: 700; color: var(--text); }
.patient-card__species { display: block; font-size: 0.75rem; color: var(--text-3); }
.patient-card__info  { flex: 1; min-width: 0; }

.patient-card__body { padding: 8px 14px; border-top: 1px solid var(--border); }
.patient-card__row  {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.82rem; color: var(--text-2);
  padding: 4px 0;
}

.patient-card__footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-top: 1px solid var(--border); background: var(--surface);
}
.patient-card__actions { display: flex; gap: 4px; }
.btn-card {
  background: none; border: 1px solid var(--border); border-radius: 6px;
  padding: 3px 7px; font-size: 0.85rem; cursor: pointer; transition: background var(--transition);
}
.btn-card:hover { background: var(--surface-2); }
.detail-row { padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--text-2); }
.detail-row b { color: var(--text); margin-right: 6px; }

/* Badges */
.badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; }
.badge--active   { background: #D6F3EC; color: #1A9E7F; }
.badge--inactive { background: #FDEAEA; color: #c0392b; }
.badge--species  { font-size: 0.72rem; }

/* Paginación */
.pagination {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  font-size: 0.85rem; color: var(--text-2);
}
.pagination button {
  padding: 6px 14px; border: 1.5px solid var(--border);
  border-radius: var(--radius-sm); background: none; cursor: pointer;
  font-size: 0.82rem; color: var(--text-2); transition: background var(--transition);
}
.pagination button:hover:not(:disabled) { background: var(--surface-2); }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

/* Buttons */
.btn-primary {
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%);
  color: white; border: none; border-radius: var(--radius);
  font-size: 0.9rem; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  transition: opacity var(--transition), transform var(--transition);
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-ghost {
  padding: 10px 20px; background: none; border: 1.5px solid var(--border);
  border-radius: var(--radius); color: var(--text-2); font-size: 0.9rem;
  font-weight: 500; cursor: pointer; transition: background var(--transition);
}
.btn-ghost:hover:not(:disabled) { background: var(--surface-2); }

/* Modal */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px;
}
.modal {
  background: var(--white); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg); width: 100%; max-width: 620px; max-height: 92vh; overflow-y: auto;
}
.modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 16px; border-bottom: 1px solid var(--border); position: sticky; top: 0;
  background: var(--white); z-index: 1;
}
.modal__header h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.modal__close { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text-3); padding: 4px 8px; border-radius: var(--radius-sm); }
.modal__close:hover { background: var(--surface-2); }

.form-body { padding: 20px 24px 0; }
.form-section-title { font-size: 0.78rem; font-weight: 700; color: var(--primary); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 12px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.field { display: flex; flex-direction: column; gap: 5px; }
.field label { font-size: 0.82rem; font-weight: 600; color: var(--text-2); }
.field input, .field select {
  padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius);
  font-size: 0.9rem; color: var(--text); background: var(--surface); outline: none;
  transition: border-color var(--transition);
}
.field input:focus, .field select:focus { border-color: var(--primary); }
.field-error { font-size: 0.75rem; color: var(--danger); }
.field-hint  { font-size: 0.73rem; color: var(--text-3); font-style: italic; }
.req { color: var(--danger); }

.modal__actions {
  display: flex; gap: 12px; justify-content: flex-end;
  padding: 16px 24px 24px;
}

.alert { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 0.875rem; }
.alert--error { background: #FDEAEA; color: #c0392b; border-left: 3px solid var(--danger); }
.mx { margin: 0 24px 8px; }

.loading-state, .empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px; padding: 60px 20px;
  color: var(--text-3); font-size: 0.9rem;
  background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);
}
.empty-state__emoji { font-size: 3rem; }

.spin { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
.spin--sm { width: 14px; height: 14px; }
.spin--dark { border-color: rgba(0,0,0,0.1); border-top-color: var(--primary); }
@keyframes spin { to { transform: rotate(360deg); } }

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

@media (max-width: 500px) { .form-grid { grid-template-columns: 1fr; } }
</style>
