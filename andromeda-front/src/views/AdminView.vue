<template>
  <div class="admin" aria-live="polite">
    <section class="hero">
      <div>
        <h2 class="hero__title">{{ t('admin.title') }}</h2>
        <p class="hero__subtitle">{{ t('admin.subtitle') }}</p>
      </div>
      <div class="hero__actions">
        <BaseButton :aria-label="t('admin.newUser')" @click="openModal">
          + {{ t('admin.newUser') }}
        </BaseButton>
        <button class="btn-logout" type="button" @click="handleLogout" title="Cerrar sesión">
          ⏻ Cerrar sesión
        </button>
      </div>
    </section>

    <div v-if="globalError" class="alert alert--error" role="alert">{{ globalError }}</div>

    <section class="panel">
      <BaseTable :label="t('admin.title')" :caption="t('admin.subtitle')">
        <div v-if="loading" class="table-loading" role="status">
          <span class="spinner spinner--dark" />
          <span>{{ t('common.loading') }}</span>
        </div>

        <table v-else class="table">
          <thead>
            <tr>
              <th>{{ t('admin.name') }}</th>
              <th>{{ t('admin.email') }}</th>
              <th>{{ t('admin.role') }}</th>
              <th>{{ t('admin.branch') }}</th>
              <th>{{ t('admin.status') }}</th>
              <th>{{ t('admin.created') }}</th>
              <th>{{ t('admin.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="users.length === 0">
              <td colspan="7" class="table__empty">{{ t('admin.noUsers') }}</td>
            </tr>
            <tr v-for="user in users" :key="user.id">
              <td class="table__name">
                <span class="avatar">{{ initials(user) }}</span>
                <span>{{ user.first_name }} {{ user.last_name }}</span>
              </td>
              <td class="table__email">{{ user.email }}</td>
              <td>
                <div class="role-cell">
                  <span class="badge badge--role">{{ formatRole(user.roles) }}</span>
                  <select
                    class="role-select"
                    :value="firstRole(user.roles)"
                    :disabled="changingRoleId === user.id"
                    @change="handleRoleChange(user, $event.target.value)"
                  >
                    <option v-for="role in ROLES" :key="role.value" :value="role.value">
                      {{ role.label }}
                    </option>
                  </select>
                </div>
              </td>
              <td>{{ user.branch_name || t('common.none') }}</td>
              <td>
                <span class="badge" :class="user.is_active ? 'badge--active' : 'badge--inactive'">
                  {{ user.is_active ? t('common.active') : t('common.inactive') }}
                </span>
              </td>
              <td class="table__date">{{ formatDate(user.created_at) }}</td>
              <td>
                <button
                  v-if="user.is_active"
                  class="btn-icon btn-icon--danger"
                  type="button"
                  :title="t('admin.deactivateUser')"
                  :aria-label="t('admin.deactivateUser')"
                  @click="confirmDeactivate(user)"
                >
                  {{ t('common.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="meta.totalPages > 1" class="pagination">
          <button type="button" :disabled="meta.page <= 1" @click="loadPage(meta.page - 1)">
            {{ t('common.previous') }}
          </button>
          <span>{{ t('admin.pagination', { page: meta.page, total: meta.totalPages }) }}</span>
          <button type="button" :disabled="meta.page >= meta.totalPages" @click="loadPage(meta.page + 1)">
            {{ t('common.next') }}
          </button>
        </div>
      </BaseTable>
    </section>

    <section class="panel panel--stacked">
      <header class="section-head">
        <div>
          <h3>{{ t('admin.authPolicies') }}</h3>
          <p>{{ t('admin.authPoliciesHelp') }}</p>
        </div>
      </header>

      <div class="policy-row">
        <div>
          <strong>{{ t('admin.optionalTwoFactorLabel') }}</strong>
          <p class="policy-help">{{ t('admin.optionalTwoFactorHelp') }}</p>
        </div>
        <label class="policy-switch">
          <input
            type="checkbox"
            :checked="authPolicy.twoFactorOptionalEnabled"
            :disabled="savingAuthPolicy"
            @change="toggleTwoFactorPolicy($event.target.checked)"
          />
          <span>{{ authPolicy.twoFactorOptionalEnabled ? t('admin.enabled') : t('admin.disabled') }}</span>
        </label>
      </div>
      <div v-if="authPolicyError" class="alert alert--error" role="alert">{{ authPolicyError }}</div>
    </section>

    <section class="panel panel--stacked">
      <header class="section-head">
        <div>
          <h3>{{ t('admin.roleOverrides') }}</h3>
          <p>{{ t('admin.roleOverridesHelp') }}</p>
        </div>
      </header>

      <div class="rbac-controls">
        <select v-model="overrideForm.role" class="role-select">
          <option value="">{{ t('admin.selectRole') }}</option>
          <option v-for="role in roleCatalog" :key="role.name" :value="role.name">
            {{ formatRole(role.name) }}
          </option>
        </select>
        <input v-model.trim="overrideForm.grant" type="text" :placeholder="t('admin.grantPlaceholder')" />
        <input v-model.trim="overrideForm.revoke" type="text" :placeholder="t('admin.revokePlaceholder')" />
        <BaseButton :disabled="savingOverride" @click="saveOverride">{{ t('admin.saveOverride') }}</BaseButton>
      </div>
      <div v-if="overrideError" class="alert alert--error" role="alert">{{ overrideError }}</div>

      <table class="table">
        <thead>
          <tr>
            <th>{{ t('admin.role') }}</th>
            <th>{{ t('admin.grant') }}</th>
            <th>{{ t('admin.revoke') }}</th>
            <th>{{ t('admin.updated') }}</th>
            <th>{{ t('admin.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="overrides.length === 0">
            <td colspan="5" class="table__empty">{{ t('admin.noOverrides') }}</td>
          </tr>
          <tr v-for="item in overrides" :key="item.role">
            <td>{{ formatRole(item.role) }}</td>
            <td>{{ (item.grant || []).join(', ') || t('common.none') }}</td>
            <td>{{ (item.revoke || []).join(', ') || t('common.none') }}</td>
            <td class="table__date">{{ formatDateTime(item.updated) }}</td>
            <td>
              <button
                class="btn-icon btn-icon--danger"
                type="button"
                :aria-label="`${t('admin.saveOverride')}: ${item.role}`"
                @click="removeOverride(item.role)"
              >
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── Logs del sistema ─────────────────────────────────────────────── -->
    <section class="panel panel--stacked">
      <header class="section-head">
        <div>
          <h3>Logs del sistema</h3>
          <p>Últimas acciones registradas en la organización</p>
        </div>
        <BaseButton variant="ghost" @click="loadLogs" :disabled="loadingLogs">
          {{ loadingLogs ? 'Cargando…' : 'Actualizar' }}
        </BaseButton>
      </header>

      <div v-if="logsError" class="alert alert--error" role="alert">{{ logsError }}</div>

      <div v-if="loadingLogs" class="table-loading" role="status">
        <span class="spinner spinner--dark" /><span>Cargando logs…</span>
      </div>

      <table v-else class="table table--logs">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Acción</th>
            <th>Recurso</th>
            <th>Usuario</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="logs.length === 0">
            <td colspan="5" class="table__empty">Sin registros</td>
          </tr>
          <tr v-for="log in logs" :key="log.id" :class="log.action === 'DELETE' ? 'log-row--danger' : ''">
            <td class="table__date">{{ formatDateTime(log.created_at) }}</td>
            <td><span class="badge" :class="logBadgeClass(log.action)">{{ log.action }}</span></td>
            <td class="log-resource">{{ log.resource }}{{ log.resource_id ? ` #${log.resource_id}` : '' }}</td>
            <td class="table__email">{{ log.user_email || log.user_id || '—' }}</td>
            <td class="log-ip">{{ log.ip_address || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <BaseModal v-model="showModal" :label="t('admin.newUser')" labelledby="admin-new-user-title">
      <div class="modal__header">
        <h3 id="admin-new-user-title">{{ t('admin.newUser') }}</h3>
        <button class="modal__close" type="button" :aria-label="t('common.close')" @click="closeModal">{{ t('common.close') }}</button>
      </div>

      <div v-if="createSuccess" class="modal__success" role="status">
        <span class="success-icon">{{ t('admin.successBadge') }}</span>
        <h4>{{ t('admin.createUserSuccess') }}</h4>
        <p>
          {{ t('admin.welcomeEmailHint') }}
          <strong>{{ form.email }}</strong>
          {{ t('admin.tempPasswordSentence') }}
        </p>
        <p class="hint">{{ t('admin.tempPasswordHint') }}</p>
        <BaseButton @click="closeModal">{{ t('common.close') }}</BaseButton>
      </div>

      <form v-else @submit.prevent="handleCreate" novalidate>
        <div class="form-row">
          <div class="field">
            <label>{{ t('admin.firstName') }} <span class="req">*</span></label>
            <input v-model.trim="form.firstName" type="text" placeholder="Juan" :disabled="creating" required />
            <span v-if="errors.firstName" class="field-error">{{ errors.firstName }}</span>
          </div>
          <div class="field">
            <label>{{ t('admin.lastName') }} <span class="req">*</span></label>
            <input v-model.trim="form.lastName" type="text" placeholder="Perez" :disabled="creating" required />
            <span v-if="errors.lastName" class="field-error">{{ errors.lastName }}</span>
          </div>
        </div>

        <div class="field">
          <label>{{ t('admin.email') }} <span class="req">*</span></label>
          <input v-model.trim="form.email" type="email" placeholder="usuario@veterinaria.com" :disabled="creating" required />
          <span v-if="errors.email" class="field-error">{{ errors.email }}</span>
        </div>

        <div class="field">
          <label>{{ t('admin.role') }} <span class="req">*</span></label>
          <select v-model="form.role" :disabled="creating" required>
            <option value="">{{ t('admin.selectRole') }}</option>
            <option v-for="role in ROLES" :key="role.value" :value="role.value">{{ role.label }}</option>
          </select>
          <span v-if="errors.role" class="field-error">{{ errors.role }}</span>
        </div>

        <div class="form-row">
          <div class="field">
            <label>{{ t('admin.phone') }}</label>
            <input v-model.trim="form.phone" type="tel" placeholder="+54 9 11 1234-5678" :disabled="creating" />
          </div>
          <div class="field">
            <label>{{ t('admin.licenseNumber') }}</label>
            <input v-model.trim="form.licenseNumber" type="text" placeholder="VET-0001" :disabled="creating" />
          </div>
        </div>

        <div v-if="createError" class="alert alert--error" role="alert">{{ createError }}</div>

        <div class="modal__actions">
          <BaseButton type="button" variant="ghost" :disabled="creating" @click="closeModal">
            {{ t('common.cancel') }}
          </BaseButton>
          <BaseButton type="submit" :disabled="creating">
            <span v-if="creating" class="spinner" />
            <span v-else>{{ t('admin.createAndEmail') }}</span>
          </BaseButton>
        </div>

        <p class="modal__hint">
          {{ t('admin.createUserHint') }}
        </p>
      </form>
    </BaseModal>

    <BaseModal
      :model-value="Boolean(deactivateTarget)"
      :label="t('admin.deactivateUser')"
      labelledby="admin-deactivate-title"
      width="420px"
      @update:modelValue="deactivateTarget = null"
    >
      <div class="modal__header">
        <h3 id="admin-deactivate-title">{{ t('admin.deactivateUser') }}</h3>
        <button class="modal__close" type="button" :aria-label="t('common.close')" @click="deactivateTarget = null">{{ t('common.close') }}</button>
      </div>
      <p class="confirm-text">
        {{ t('admin.deactivatePromptPrefix') }}
        <strong>{{ deactivateTarget?.first_name }} {{ deactivateTarget?.last_name }}</strong>
        {{ t('admin.deactivatePrompt') }}
      </p>
      <div v-if="deactivateError" class="alert alert--error" role="alert">{{ deactivateError }}</div>
      <div class="modal__actions">
        <BaseButton variant="ghost" :disabled="deactivating" @click="deactivateTarget = null">
          {{ t('common.cancel') }}
        </BaseButton>
        <BaseButton variant="danger" :disabled="deactivating" @click="handleDeactivate">
          <span v-if="deactivating" class="spinner" />
          <span v-else>{{ t('admin.deactivateUser') }}</span>
        </BaseButton>
      </div>
    </BaseModal>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminRbacApi } from '../api/adminRbac'
import { adminUsersApi } from '../api/adminUsers'
import BaseButton from '../components/base/BaseButton.vue'
import BaseModal from '../components/base/BaseModal.vue'
import BaseTable from '../components/base/BaseTable.vue'
import { t } from '../i18n'
import { useAuthStore } from '../stores/auth'

const auth   = useAuthStore()
const router = useRouter()

const users = ref([])
const meta = ref({ page: 1, totalPages: 1 })
const loading = ref(false)
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
  { value: 'org_admin', label: 'Administrador de organizacion' },
  { value: 'branch_manager', label: 'Gerente de sucursal' },
  { value: 'veterinarian', label: 'Veterinario' },
  { value: 'vet_technician', label: 'Tecnico veterinario' },
  { value: 'surgeon', label: 'Cirujano' },
  { value: 'tele_vet', label: 'Veterinario (telemedicina)' },
  { value: 'receptionist', label: 'Recepcionista' },
  { value: 'groomer', label: 'Groomer' },
  { value: 'grooming_manager', label: 'Jefe de grooming' },
  { value: 'pharmacist', label: 'Farmaceutico' },
  { value: 'accountant', label: 'Contador' },
  { value: 'lab_technician', label: 'Tecnico de laboratorio' },
  { value: 'imaging_tech', label: 'Tecnico de imagenes' },
  { value: 'read_only', label: 'Solo lectura' },
]

const showModal = ref(false)
const creating = ref(false)
const createError = ref('')
const createSuccess = ref(false)
const errors = reactive({})

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  role: '',
  phone: '',
  licenseNumber: '',
})

const deactivateTarget = ref(null)
const deactivating = ref(false)
const deactivateError = ref('')

const logs = ref([])
const loadingLogs = ref(false)
const logsError = ref('')

function openModal() {
  resetForm()
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  createSuccess.value = false
  resetForm()
}

function resetForm() {
  form.firstName = ''
  form.lastName = ''
  form.email = ''
  form.role = ''
  form.phone = ''
  form.licenseNumber = ''
  createError.value = ''
  Object.keys(errors).forEach((key) => delete errors[key])
}

function validateForm() {
  Object.keys(errors).forEach((key) => delete errors[key])
  if (!form.firstName) errors.firstName = 'El nombre es requerido'
  if (!form.lastName) errors.lastName = 'El apellido es requerido'
  if (!form.email) errors.email = 'El email es requerido'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Email invalido'
  if (!form.role) errors.role = t('admin.roleRequired')
  return Object.keys(errors).length === 0
}

async function handleCreate() {
  if (!validateForm()) return
  createError.value = ''
  creating.value = true
  try {
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      role: form.role,
      branchId: auth.user?.branchId || auth.user?.branch_id || 1,
    }
    if (form.phone) payload.phone = form.phone
    if (form.licenseNumber) payload.licenseNumber = form.licenseNumber

    await adminUsersApi.create(payload)
    createSuccess.value = true
    await loadPage(1)
  } catch (error) {
    const message = error.response?.data?.message || error.response?.data?.error
    if (error.response?.status === 409) createError.value = 'Ya existe un usuario con ese email'
    else if (error.response?.status === 400) createError.value = message || 'Datos invalidos. Revisa los campos.'
    else createError.value = message || 'No se pudo crear el usuario. Intenta nuevamente.'
  } finally {
    creating.value = false
  }
}

function confirmDeactivate(user) {
  deactivateTarget.value = user
  deactivateError.value = ''
}

async function handleDeactivate() {
  if (!deactivateTarget.value) return
  deactivateError.value = ''
  deactivating.value = true
  try {
    await adminUsersApi.deactivate(deactivateTarget.value.id)
    deactivateTarget.value = null
    await loadPage(meta.value.page)
  } catch (error) {
    const message = error.response?.data?.message || error.response?.data?.error
    deactivateError.value = message || 'No se pudo desactivar el usuario.'
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
  } catch (error) {
    globalError.value = error.response?.data?.error?.message || 'No se pudo actualizar el rol.'
  } finally {
    changingRoleId.value = null
  }
}

function parsePermissions(text) {
  return text.split(',').map((value) => value.trim()).filter(Boolean)
}

async function loadOverrides() {
  if (!auth.orgId) return
  overrideError.value = ''
  try {
    const [rolesRes, overridesRes] = await Promise.all([
      adminRbacApi.listRoles(),
      adminRbacApi.listOverrides(auth.orgId),
    ])
    roleCatalog.value = rolesRes.data?.data || []
    overrides.value = overridesRes.data?.data || []
  } catch (error) {
    overrideError.value = error.response?.data?.error?.message || 'No se pudieron cargar los overrides.'
  }
}

async function loadAuthPolicy() {
  authPolicyError.value = ''
  try {
    const { data } = await adminUsersApi.getAuthPolicy()
    const payload = data?.data || data
    authPolicy.twoFactorOptionalEnabled = Boolean(
      payload?.two_factor_optional_enabled ?? payload?.twoFactorOptionalEnabled,
    )
  } catch (error) {
    authPolicyError.value = error.response?.data?.error?.message || 'No se pudo cargar la politica de autenticacion.'
  }
}

async function toggleTwoFactorPolicy(enabled) {
  savingAuthPolicy.value = true
  authPolicyError.value = ''
  try {
    await adminUsersApi.updateAuthPolicy({ twoFactorOptionalEnabled: enabled })
    authPolicy.twoFactorOptionalEnabled = enabled
  } catch (error) {
    authPolicyError.value = error.response?.data?.error?.message || 'No se pudo actualizar la politica de 2FA.'
  } finally {
    savingAuthPolicy.value = false
  }
}

async function saveOverride() {
  if (!overrideForm.role) {
    overrideError.value = t('admin.roleRequired')
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
  } catch (error) {
    overrideError.value = error.response?.data?.error?.message || 'No se pudo guardar el override.'
  } finally {
    savingOverride.value = false
  }
}

async function removeOverride(role) {
  overrideError.value = ''
  try {
    await adminRbacApi.deleteOverride(auth.orgId, role)
    await loadOverrides()
  } catch (error) {
    overrideError.value = error.response?.data?.error?.message || 'No se pudo eliminar el override.'
  }
}

async function loadPage(page = 1) {
  loading.value = true
  globalError.value = ''
  try {
    const { data } = await adminUsersApi.list({ page, limit: 20 })
    users.value = data.data || []
    meta.value = data.meta || { page, totalPages: 1 }
  } catch (error) {
    const message = error.response?.data?.message || error.response?.data?.error
    globalError.value = message || 'No se pudo cargar la lista de usuarios.'
  } finally {
    loading.value = false
  }
}

function initials(user) {
  return [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('').toUpperCase()
}

function formatRole(roles) {
  if (!roles) return t('common.none')
  const first = firstRole(roles)
  const found = ROLES.find((role) => role.value === first)
  return found ? found.label : first
}

function firstRole(roles) {
  if (!roles) return ''
  return String(roles).split(',')[0]?.trim()
}

function formatDate(iso) {
  if (!iso) return t('common.none')
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return t('common.none')
  return new Date(iso).toLocaleString('es-AR')
}

function handleLogout() {
  auth.logout()
  router.push('/login')
}

async function loadLogs() {
  loadingLogs.value = true
  logsError.value = ''
  try {
    const { data } = await adminUsersApi.getLogs({ limit: 50 })
    logs.value = data?.data?.rows || data?.rows || []
  } catch (e) {
    logsError.value = e.response?.data?.error?.message || 'No se pudieron cargar los logs.'
  } finally {
    loadingLogs.value = false
  }
}

function logBadgeClass(action) {
  if (!action) return ''
  if (action === 'DELETE') return 'badge--inactive'
  if (action === 'CREATE') return 'badge--active'
  if (action === 'UPDATE') return 'badge--role'
  return ''
}

onMounted(async () => {
  await loadPage()
  await loadAuthPolicy()
  await loadOverrides()
  await loadLogs()
})
</script>

<style scoped>
.admin {
  display: grid;
  gap: 24px;
}

.hero,
.section-head,
.policy-row,
.rbac-controls,
.modal__header,
.modal__actions,
.table-loading,
.pagination {
  display: flex;
  align-items: center;
}

.hero,
.section-head,
.policy-row {
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.hero__title {
  margin: 0 0 6px;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text);
}

.hero__subtitle,
.section-head p,
.policy-help,
.table__date,
.table__email,
.modal__hint,
.hint {
  margin: 0;
  color: var(--text-3);
  font-size: 0.86rem;
}

.panel {
  background: var(--white);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  padding: 20px;
}

.panel--stacked {
  display: grid;
  gap: 16px;
}

.table-loading {
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.table th,
.table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-light, #eef2f4);
}

.table th {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
  background: var(--surface);
}

.table__empty {
  padding: 40px 16px !important;
  text-align: center;
  color: var(--text-3);
}

.table__name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%);
  color: var(--white);
  font-size: 0.72rem;
  font-weight: 700;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.76rem;
  font-weight: 600;
}

.badge--active {
  background: #eafaf3;
  color: #1e8449;
}

.badge--inactive {
  background: #fdf3f3;
  color: #c0392b;
}

.badge--role {
  background: var(--surface-2, #f4f6f8);
  color: var(--text-2);
}

.role-cell {
  display: grid;
  gap: 8px;
}

.role-select,
.rbac-controls input,
.field input,
.field select {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--white);
  color: var(--text);
}

.rbac-controls {
  gap: 12px;
  flex-wrap: wrap;
}

.rbac-controls > * {
  flex: 1 1 220px;
}

.policy-switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}

.btn-icon {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--danger, #e74c3c);
  cursor: pointer;
}

.btn-icon:hover {
  background: #fdf3f3;
}

.pagination {
  justify-content: center;
  gap: 16px;
  padding: 18px 8px 0;
  color: var(--text-2);
}

.pagination button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--white);
  color: var(--text-2);
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal__header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.modal__header h3 {
  margin: 0;
  font-size: 1.05rem;
}

.modal__close {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.modal__close:hover {
  background: var(--surface);
}

.modal__success {
  display: grid;
  gap: 14px;
}

.success-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: #eafaf3;
  color: #1e8449;
  font-weight: 700;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}

.field label {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
}

.field-error {
  color: var(--danger, #e74c3c);
  font-size: 0.8rem;
}

.req {
  color: var(--danger, #e74c3c);
}

.modal__actions {
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}

.confirm-text {
  margin: 0 0 16px;
  color: var(--text);
  line-height: 1.5;
}

.hero__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-logout {
  min-height: 38px;
  padding: 0 16px;
  border: 1.5px solid var(--danger, #e74c3c);
  border-radius: var(--radius);
  background: transparent;
  color: var(--danger, #e74c3c);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}
.btn-logout:hover {
  background: var(--danger-light, #fdf3f3);
}

.table--logs {
  font-size: 0.82rem;
}

.log-resource {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-ip {
  color: var(--text-3);
  font-size: 0.78rem;
  font-family: monospace;
}

.log-row--danger td {
  background: #fff8f8;
}

@media (max-width: 900px) {
  .table {
    min-width: 760px;
  }
}

@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .panel {
    padding: 16px;
  }

  .modal__actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
