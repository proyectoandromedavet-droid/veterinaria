<template>
  <div class="admin">

    <!-- Encabezado -->
    <div class="admin__header">
      <div>
        <h2 class="admin__title">Administración de usuarios</h2>
        <p class="admin__subtitle">Creá usuarios staff y gestioná sus accesos</p>
      </div>
      <button class="btn-primary" @click="openModal">
        + Nuevo usuario
      </button>
    </div>

    <!-- Alerta global -->
    <div v-if="globalError" class="alert alert--error">{{ globalError }}</div>

    <!-- Tabla -->
    <div class="card">
      <div v-if="loading" class="table-loading">
        <span class="spinner spinner--dark" />
        <span>Cargando usuarios…</span>
      </div>

      <table v-else class="table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Sucursal</th>
            <th>Estado</th>
            <th>Creado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="users.length === 0">
            <td colspan="7" class="table__empty">No hay usuarios registrados aún</td>
          </tr>
          <tr v-for="u in users" :key="u.id">
            <td class="table__name">
              <span class="avatar">{{ initials(u) }}</span>
              {{ u.first_name }} {{ u.last_name }}
            </td>
            <td class="table__email">{{ u.email }}</td>
            <td>
              <div class="role-cell">
                <span class="badge badge--role">{{ formatRole(u.roles) }}</span>
                <select
                  class="role-select"
                  :value="firstRole(u.roles)"
                  :disabled="changingRoleId === u.id"
                  @change="handleRoleChange(u, $event.target.value)"
                >
                  <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
              </div>
            </td>
            <td>{{ u.branch_name || '—' }}</td>
            <td>
              <span class="badge" :class="u.is_active ? 'badge--active' : 'badge--inactive'">
                {{ u.is_active ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
            <td class="table__date">{{ formatDate(u.created_at) }}</td>
            <td>
              <button
                v-if="u.is_active"
                class="btn-icon btn-icon--danger"
                title="Desactivar usuario"
                @click="confirmDeactivate(u)"
              >
                ✕
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Paginación -->
      <div v-if="meta.totalPages > 1" class="pagination">
        <button :disabled="meta.page <= 1" @click="loadPage(meta.page - 1)">← Anterior</button>
        <span>Página {{ meta.page }} de {{ meta.totalPages }}</span>
        <button :disabled="meta.page >= meta.totalPages" @click="loadPage(meta.page + 1)">Siguiente →</button>
      </div>
    </div>

    <div class="admin__header admin__header--section">
      <div>
        <h2 class="admin__title">Políticas de autenticación</h2>
        <p class="admin__subtitle">2FA sigue opcional y desactivado por defecto. Desde acá sólo habilitás la activación manual por usuario.</p>
      </div>
    </div>

    <div class="card card--section">
      <div class="policy-row">
        <div>
          <strong>Permitir 2FA opcional para la organización</strong>
          <p class="policy-help">No exige 2FA. Sólo habilita el setup voluntario cuando quieran usarlo.</p>
        </div>
        <label class="policy-switch">
          <input type="checkbox" :checked="authPolicy.twoFactorOptionalEnabled" :disabled="savingAuthPolicy" @change="toggleTwoFactorPolicy($event.target.checked)" />
          <span>{{ authPolicy.twoFactorOptionalEnabled ? 'Habilitado' : 'Deshabilitado' }}</span>
        </label>
      </div>
      <div v-if="authPolicyError" class="alert alert--error">{{ authPolicyError }}</div>
    </div>

    <div class="admin__header admin__header--section">
      <div>
        <h2 class="admin__title">Overrides de roles</h2>
        <p class="admin__subtitle">Permisos dinámicos por organización para rutas sensibles</p>
      </div>
    </div>

    <div class="card card--section">
      <div class="rbac-controls">
        <select v-model="overrideForm.role" class="role-select">
          <option value="">Seleccioná un rol…</option>
          <option v-for="r in roleCatalog" :key="r.name" :value="r.name">{{ formatRole(r.name) }}</option>
        </select>
        <input v-model.trim="overrideForm.grant" type="text" placeholder="Permisos grant, separados por coma" />
        <input v-model.trim="overrideForm.revoke" type="text" placeholder="Permisos revoke, separados por coma" />
        <button class="btn-primary" :disabled="savingOverride" @click="saveOverride">Guardar override</button>
      </div>
      <div v-if="overrideError" class="alert alert--error">{{ overrideError }}</div>
      <table class="table">
        <thead>
          <tr>
            <th>Rol</th>
            <th>Grant</th>
            <th>Revoke</th>
            <th>Actualizado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="overrides.length === 0">
            <td colspan="5" class="table__empty">No hay overrides cargados para esta organización</td>
          </tr>
          <tr v-for="item in overrides" :key="item.role">
            <td>{{ formatRole(item.role) }}</td>
            <td>{{ (item.grant || []).join(', ') || '—' }}</td>
            <td>{{ (item.revoke || []).join(', ') || '—' }}</td>
            <td class="table__date">{{ formatDateTime(item.updated) }}</td>
            <td><button class="btn-icon btn-icon--danger" @click="removeOverride(item.role)">✕</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Modal: nuevo usuario ───────────────────────────────────────── -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
        <div class="modal">
          <div class="modal__header">
            <h3>Nuevo usuario</h3>
            <button class="modal__close" @click="closeModal">✕</button>
          </div>

          <!-- Estado: éxito -->
          <div v-if="createSuccess" class="modal__success">
            <span class="success-icon">✅</span>
            <h4>Usuario creado correctamente</h4>
            <p>
              Se envió un email de bienvenida a <strong>{{ form.email }}</strong>
              con la contraseña temporal generada automáticamente.
            </p>
            <p class="hint">El usuario deberá cambiar su contraseña al ingresar por primera vez.</p>
            <button class="btn-primary" @click="closeModal">Cerrar</button>
          </div>

          <!-- Formulario -->
          <form v-else @submit.prevent="handleCreate" novalidate>
            <div class="form-row">
              <div class="field">
                <label>Nombre <span class="req">*</span></label>
                <input v-model.trim="form.firstName" type="text" placeholder="Juan" :disabled="creating" required />
                <span v-if="errors.firstName" class="field-error">{{ errors.firstName }}</span>
              </div>
              <div class="field">
                <label>Apellido <span class="req">*</span></label>
                <input v-model.trim="form.lastName" type="text" placeholder="Pérez" :disabled="creating" required />
                <span v-if="errors.lastName" class="field-error">{{ errors.lastName }}</span>
              </div>
            </div>

            <div class="field">
              <label>Email <span class="req">*</span></label>
              <input v-model.trim="form.email" type="email" placeholder="usuario@veterinaria.com" :disabled="creating" required />
              <span v-if="errors.email" class="field-error">{{ errors.email }}</span>
            </div>

            <div class="field">
              <label>Rol <span class="req">*</span></label>
              <select v-model="form.role" :disabled="creating" required>
                <option value="">Seleccioná un rol…</option>
                <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
              <span v-if="errors.role" class="field-error">{{ errors.role }}</span>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Teléfono</label>
                <input v-model.trim="form.phone" type="tel" placeholder="+54 9 11 1234-5678" :disabled="creating" />
              </div>
              <div class="field">
                <label>Matrícula</label>
                <input v-model.trim="form.licenseNumber" type="text" placeholder="VET-0001" :disabled="creating" />
              </div>
            </div>

            <div v-if="createError" class="alert alert--error">{{ createError }}</div>

            <div class="modal__actions">
              <button type="button" class="btn-ghost" @click="closeModal" :disabled="creating">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="creating">
                <span v-if="creating" class="spinner" />
                <span v-else>Crear usuario y enviar email</span>
              </button>
            </div>

            <p class="modal__hint">
              Se generará una contraseña temporal de forma automática y se enviará
              al email ingresado junto con las instrucciones de acceso.
            </p>
          </form>
        </div>
      </div>
    </Transition>

    <!-- ── Modal: confirmar desactivación ──────────────────────────────── -->
    <Transition name="modal">
      <div v-if="deactivateTarget" class="modal-backdrop" @click.self="deactivateTarget = null">
        <div class="modal modal--sm">
          <div class="modal__header">
            <h3>Desactivar usuario</h3>
            <button class="modal__close" @click="deactivateTarget = null">✕</button>
          </div>
          <p class="confirm-text">
            ¿Desactivar la cuenta de
            <strong>{{ deactivateTarget.first_name }} {{ deactivateTarget.last_name }}</strong>?
            Se revocarán todas sus sesiones activas.
          </p>
          <div v-if="deactivateError" class="alert alert--error">{{ deactivateError }}</div>
          <div class="modal__actions">
            <button class="btn-ghost" @click="deactivateTarget = null" :disabled="deactivating">Cancelar</button>
            <button class="btn-danger" @click="handleDeactivate" :disabled="deactivating">
              <span v-if="deactivating" class="spinner" />
              <span v-else>Desactivar</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { adminUsersApi } from '../api/adminUsers'
import { adminRbacApi } from '../api/adminRbac'

const auth = useAuthStore()

// ── Datos ────────────────────────────────────────────────────────────────────
const users       = ref([])
const meta        = ref({ page: 1, totalPages: 1 })
const loading     = ref(false)
const globalError = ref('')
const changingRoleId = ref(null)
const overrides = ref([])
const roleCatalog = ref([])
const savingOverride = ref(false)
const overrideError = ref('')
const overrideForm = reactive({
  role: '',
  grant: '',
  revoke: '',
})
const authPolicy = reactive({
  twoFactorOptionalEnabled: false,
})
const savingAuthPolicy = ref(false)
const authPolicyError = ref('')

const ROLES = [
  { value: 'org_admin',         label: 'Administrador de organización' },
  { value: 'branch_manager',    label: 'Gerente de sucursal' },
  { value: 'veterinarian',      label: 'Veterinario' },
  { value: 'vet_technician',    label: 'Técnico veterinario' },
  { value: 'surgeon',           label: 'Cirujano' },
  { value: 'tele_vet',          label: 'Veterinario (telemedicina)' },
  { value: 'receptionist',      label: 'Recepcionista' },
  { value: 'groomer',           label: 'Groomer' },
  { value: 'grooming_manager',  label: 'Jefe de grooming' },
  { value: 'pharmacist',        label: 'Farmacéutico' },
  { value: 'accountant',        label: 'Contador' },
  { value: 'lab_technician',    label: 'Técnico de laboratorio' },
  { value: 'imaging_tech',      label: 'Técnico de imágenes' },
  { value: 'read_only',         label: 'Solo lectura' },
]

// ── Modal: nuevo usuario ─────────────────────────────────────────────────────
const showModal    = ref(false)
const creating     = ref(false)
const createError  = ref('')
const createSuccess = ref(false)
const errors       = reactive({})

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  role: '',
  phone: '',
  licenseNumber: '',
})

function openModal() {
  resetForm()
  showModal.value = true
}

function closeModal() {
  showModal.value  = false
  createSuccess.value = false
  resetForm()
}

function resetForm() {
  form.firstName    = ''
  form.lastName     = ''
  form.email        = ''
  form.role         = ''
  form.phone        = ''
  form.licenseNumber = ''
  createError.value  = ''
  Object.keys(errors).forEach(k => delete errors[k])
}

function validateForm() {
  Object.keys(errors).forEach(k => delete errors[k])
  if (!form.firstName)  errors.firstName = 'El nombre es requerido'
  if (!form.lastName)   errors.lastName  = 'El apellido es requerido'
  if (!form.email)      errors.email     = 'El email es requerido'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                        errors.email     = 'Email inválido'
  if (!form.role)       errors.role      = 'Seleccioná un rol'
  return Object.keys(errors).length === 0
}

async function handleCreate() {
  if (!validateForm()) return
  createError.value = ''
  creating.value = true
  try {
    const payload = {
      firstName:     form.firstName,
      lastName:      form.lastName,
      email:         form.email,
      role:          form.role,
      branchId:      auth.user?.branchId || auth.user?.branch_id || 1,
    }
    if (form.phone)         payload.phone         = form.phone
    if (form.licenseNumber) payload.licenseNumber = form.licenseNumber

    await adminUsersApi.create(payload)
    createSuccess.value = true
    await loadPage(1)
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error
    if (e.response?.status === 409) createError.value = 'Ya existe un usuario con ese email'
    else if (e.response?.status === 400) createError.value = msg || 'Datos inválidos. Revisá los campos.'
    else createError.value = msg || 'No se pudo crear el usuario. Intentá nuevamente.'
  } finally {
    creating.value = false
  }
}

// ── Desactivar usuario ────────────────────────────────────────────────────────
const deactivateTarget = ref(null)
const deactivating     = ref(false)
const deactivateError  = ref('')

function confirmDeactivate(u) {
  deactivateTarget.value = u
  deactivateError.value  = ''
}

async function handleDeactivate() {
  if (!deactivateTarget.value) return
  deactivateError.value = ''
  deactivating.value = true
  try {
    await adminUsersApi.deactivate(deactivateTarget.value.id)
    deactivateTarget.value = null
    await loadPage(meta.value.page)
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error
    deactivateError.value = msg || 'No se pudo desactivar el usuario.'
  } finally {
    deactivating.value = false
  }
}

async function handleRoleChange(user, role) {
  const current = firstRole(user.roles)
  if (!role || role === current) return
  changingRoleId.value = user.id
  globalError.value = ''
  try {
    await adminUsersApi.updateRole(user.id, role)
    await loadPage(meta.value.page)
  } catch (e) {
    globalError.value = e.response?.data?.error?.message || 'No se pudo actualizar el rol.'
  } finally {
    changingRoleId.value = null
  }
}

function parsePermissions(text) {
  return text.split(',').map(v => v.trim()).filter(Boolean)
}

async function loadOverrides() {
  if (!auth.orgId) return
  try {
    const [rolesRes, overridesRes] = await Promise.all([
      adminRbacApi.listRoles(),
      adminRbacApi.listOverrides(auth.orgId),
    ])
    roleCatalog.value = rolesRes.data?.data || []
    overrides.value = overridesRes.data?.data || []
  } catch (e) {
    overrideError.value = e.response?.data?.error?.message || 'No se pudieron cargar los overrides.'
  }
}

async function loadAuthPolicy() {
  authPolicyError.value = ''
  try {
    const { data } = await adminUsersApi.getAuthPolicy()
    const payload = data?.data || data
    authPolicy.twoFactorOptionalEnabled = Boolean(payload?.two_factor_optional_enabled ?? payload?.twoFactorOptionalEnabled)
  } catch (e) {
    authPolicyError.value = e.response?.data?.error?.message || 'No se pudo cargar la política de autenticación.'
  }
}

async function toggleTwoFactorPolicy(enabled) {
  savingAuthPolicy.value = true
  authPolicyError.value = ''
  try {
    await adminUsersApi.updateAuthPolicy({ twoFactorOptionalEnabled: enabled })
    authPolicy.twoFactorOptionalEnabled = enabled
  } catch (e) {
    authPolicyError.value = e.response?.data?.error?.message || 'No se pudo actualizar la política de 2FA.'
  } finally {
    savingAuthPolicy.value = false
  }
}

async function saveOverride() {
  if (!overrideForm.role) {
    overrideError.value = 'Seleccioná un rol.'
    return
  }
  savingOverride.value = true
  overrideError.value = ''
  try {
    await adminRbacApi.updateOverride(auth.orgId, overrideForm.role, {
      grant: parsePermissions(overrideForm.grant),
      revoke: parsePermissions(overrideForm.revoke),
    })
    overrideForm.role = ''
    overrideForm.grant = ''
    overrideForm.revoke = ''
    await loadOverrides()
  } catch (e) {
    overrideError.value = e.response?.data?.error?.message || 'No se pudo guardar el override.'
  } finally {
    savingOverride.value = false
  }
}

async function removeOverride(role) {
  overrideError.value = ''
  try {
    await adminRbacApi.deleteOverride(auth.orgId, role)
    await loadOverrides()
  } catch (e) {
    overrideError.value = e.response?.data?.error?.message || 'No se pudo eliminar el override.'
  }
}

// ── Cargar usuarios ───────────────────────────────────────────────────────────
async function loadPage(page = 1) {
  loading.value = true
  globalError.value = ''
  try {
    const { data } = await adminUsersApi.list({ page, limit: 20 })
    users.value = data.data || []
    meta.value  = data.meta || { page, totalPages: 1 }
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error
    globalError.value = msg || 'No se pudo cargar la lista de usuarios.'
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(u) {
  return [u.first_name?.[0], u.last_name?.[0]].filter(Boolean).join('').toUpperCase()
}

function formatRole(roles) {
  if (!roles) return '—'
  const first = firstRole(roles)
  const found = ROLES.find(r => r.value === first)
  return found ? found.label : first
}

function firstRole(roles) {
  if (!roles) return ''
  return String(roles).split(',')[0]?.trim()
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR')
}

onMounted(async () => {
  await loadPage()
  await loadAuthPolicy()
  await loadOverrides()
})
</script>

<style scoped>
/* ── Contenedor ─────────────────────────────────────────────────────────── */
.admin {
  padding: 0 4px;
}

.admin__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.admin__title {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 4px;
}
.admin__subtitle {
  font-size: 0.85rem;
  color: var(--text-2);
  margin: 0;
}

/* ── Card / tabla ────────────────────────────────────────────────────────── */
.card {
  background: var(--white);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.card--section {
  margin-top: 18px;
}

.policy-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px 16px;
}

.policy-help {
  margin: 6px 0 0;
  color: var(--text-3);
  font-size: 0.84rem;
}

.policy-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}

.admin__header--section {
  margin-top: 30px;
  margin-bottom: 14px;
}

.rbac-controls {
  display: grid;
  grid-template-columns: 180px 1fr 1fr auto;
  gap: 12px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.role-cell {
  display: grid;
  gap: 8px;
}

.role-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--white);
}

.table-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--text-2);
  font-size: 0.9rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.table th {
  text-align: left;
  padding: 13px 16px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.table td {
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-light, #f0f0f0);
  color: var(--text);
  vertical-align: middle;
}

.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: var(--surface); }

.table__empty {
  text-align: center;
  color: var(--text-3);
  padding: 48px !important;
}

.table__name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.table__email  { color: var(--text-2); }
.table__date   { color: var(--text-3); font-size: 0.82rem; }

/* ── Avatar ─────────────────────────────────────────────────────────────── */
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%);
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ── Badges ─────────────────────────────────────────────────────────────── */
.badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 0.76rem;
  font-weight: 600;
}

.badge--active   { background: #eafaf3; color: #1e8449; }
.badge--inactive { background: #fdf3f3; color: #c0392b; }
.badge--role     { background: var(--surface-2, #f4f6f8); color: var(--text-2); }

/* ── Botones ─────────────────────────────────────────────────────────────── */
.btn-primary {
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%);
  color: var(--white);
  border: none;
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity var(--transition), transform var(--transition);
  white-space: nowrap;
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-ghost {
  padding: 10px 20px;
  background: none;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-ghost:hover:not(:disabled) { background: var(--surface-2); }
.btn-ghost:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-danger {
  padding: 10px 20px;
  background: var(--danger, #e74c3c);
  color: white;
  border: none;
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity var(--transition);
}
.btn-danger:hover:not(:disabled) { opacity: 0.85; }
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-icon {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition);
  background: transparent;
}
.btn-icon--danger { color: var(--danger, #e74c3c); }
.btn-icon--danger:hover { background: #fdf3f3; }

/* ── Paginación ──────────────────────────────────────────────────────────── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  font-size: 0.85rem;
  color: var(--text-2);
}
.pagination button {
  padding: 6px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text-2);
  transition: background var(--transition);
}
.pagination button:hover:not(:disabled) { background: var(--surface); }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Modal ───────────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal {
  background: var(--white);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal--sm { max-width: 400px; }

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
}
.modal__header h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.modal__close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-3);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}
.modal__close:hover { background: var(--surface-2); }

/* ── Formulario dentro del modal ─────────────────────────────────────────── */
form {
  padding: 20px 24px 24px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.field {
  margin-bottom: 16px;
}
.field label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 6px;
  letter-spacing: 0.02em;
}
.field input,
.field select,
.rbac-controls input {
  width: 100%;
  padding: 10px 13px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.93rem;
  color: var(--text);
  background: var(--surface);
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
  box-sizing: border-box;
}
.field input:focus,
.field select:focus,
.rbac-controls input:focus,
.role-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-xlight);
}
.field input:disabled,
.field select:disabled { opacity: 0.6; cursor: not-allowed; }

.field-error {
  display: block;
  margin-top: 4px;
  font-size: 0.78rem;
  color: var(--danger, #e74c3c);
}

.req { color: var(--danger, #e74c3c); }

/* ── Acciones del modal ──────────────────────────────────────────────────── */
.modal__actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
}

.modal__hint {
  margin-top: 14px;
  font-size: 0.78rem;
  color: var(--text-3);
  text-align: center;
  line-height: 1.5;
}

/* ── Confirmar desactivar ────────────────────────────────────────────────── */
.confirm-text {
  padding: 16px 24px;
  font-size: 0.92rem;
  color: var(--text);
  line-height: 1.55;
}

/* ── Éxito ──────────────────────────────────────────────────────────────── */
.modal__success {
  padding: 32px 24px;
  text-align: center;
}
.success-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 12px;
}
.modal__success h4 {
  font-size: 1.1rem;
  color: var(--text);
  margin: 0 0 10px;
}
.modal__success p {
  font-size: 0.9rem;
  color: var(--text-2);
  margin: 0 0 8px;
  line-height: 1.5;
}
.hint {
  font-size: 0.8rem !important;
  color: var(--text-3) !important;
  margin-bottom: 20px !important;
}
.modal__success .btn-primary { margin: 0 auto; }

/* ── Alertas ─────────────────────────────────────────────────────────────── */
.alert {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  margin-bottom: 14px;
}
.alert--error { background: #fdf3f3; color: #c0392b; border-left: 3px solid var(--danger); }

/* ── Spinner ──────────────────────────────────────────────────────────────── */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
.spinner--dark {
  border-color: rgba(0,0,0,0.15);
  border-top-color: var(--primary);
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Transición modal ─────────────────────────────────────────────────────── */
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal, .modal-leave-active .modal {
  transition: transform 0.2s ease;
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal, .modal-leave-to .modal { transform: translateY(12px); }

/* ── Responsive ───────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .form-row { grid-template-columns: 1fr; }
  .admin__header { flex-direction: column; }
  .admin__header .btn-primary { align-self: flex-start; }
  .rbac-controls { grid-template-columns: 1fr; }
  .table th:nth-child(4),
  .table td:nth-child(4),
  .table th:nth-child(6),
  .table td:nth-child(6) { display: none; }
}
</style>
