import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api/auth'
import { clearCsrfToken, ensureCsrfToken } from '../api/client'

function decodeBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(value || '').length / 4) * 4, '=')
  return atob(normalized)
}

function parseJwt(token) {
  try {
    return JSON.parse(decodeBase64Url(token.split('.')[1]))
  } catch {
    return null
  }
}

function normalizeRoles(input) {
  if (!input) return []
  if (Array.isArray(input)) {
    return input
      .map((role) => {
        if (!role) return null
        if (typeof role === 'string') return role.trim()
        if (typeof role === 'object') return String(role.name || role.role || role.value || '').trim()
        return null
      })
      .filter(Boolean)
  }
  if (typeof input === 'string') {
    return input.split(',').map((role) => role.trim()).filter(Boolean)
  }
  return []
}

function normalizePermissions(input) {
  if (!input) return []
  if (Array.isArray(input)) return input.map((permission) => String(permission).trim()).filter(Boolean)
  if (typeof input === 'string') return input.split(',').map((permission) => permission.trim()).filter(Boolean)
  return []
}

function normalizeUser(payload = {}) {
  if (!payload || typeof payload !== 'object') return null
  const normalized = { ...payload }
  normalized.roles = normalizeRoles(payload.roles)
  normalized.permissions = normalizePermissions(payload.permissions)
  return normalized
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(null)
  const user = ref(null)
  const hydrated = ref(false)
  const hydrating = ref(false)
  let hydratePromise = null

  const isAuthenticated = computed(() => !!accessToken.value)
  const roles = computed(() => normalizeRoles(user.value?.roles))
  const orgId = computed(() => user.value?.org_id || null)

  function hasRole(...check) {
    return check.some((r) => roles.value.includes(r))
  }

  function can(permission) {
    if (roles.value.includes('superadmin')) return true
    const perms = user.value?.permissions || []
    if (perms.includes(permission) || perms.includes('*')) return true
    const [resource] = String(permission || '').split(':')
    return resource ? perms.includes(`${resource}:*`) : false
  }

  function setTokens(at) {
    accessToken.value = at
    const payload = parseJwt(at)
    if (payload) user.value = normalizeUser(payload)
  }

  async function bootstrap() {
    if (hydratePromise) return hydratePromise
    hydrating.value = true
    hydratePromise = (async () => {
      if (!accessToken.value) {
        try {
          await refresh()
        } catch {
          // no session cookie or refresh denied
        }
      }

      hydrated.value = true
      hydrating.value = false
      hydratePromise = null
    })()

    return hydratePromise
  }

  async function login(credentials) {
    const res = await authApi.login(credentials)
    const payload = res.data?.data || res.data
    if (payload.requiresTwoFactor) {
      return { requiresTwoFactor: true, pendingToken: payload.pendingToken }
    }
    setTokens(payload.accessToken)
    await ensureCsrfToken().catch(() => {})
    user.value = payload.user ? normalizeUser({ ...user.value, ...payload.user }) : user.value
    await fetchMe().catch(() => {})
    return { requiresTwoFactor: false }
  }

  async function twoFaChallenge(pendingToken, code) {
    const res = await authApi.twoFaChallenge({ pendingToken, code })
    const payload = res.data?.data || res.data
    setTokens(payload.accessToken)
    await fetchMe().catch(() => {})
  }

  async function refresh() {
    const res = await authApi.refresh()
    const payload = res.data?.data || res.data
    setTokens(payload.accessToken)
    await ensureCsrfToken().catch(() => {})
    await fetchMe().catch(() => {})
  }

  async function fetchMe() {
    const res = await authApi.me()
    const payload = res.data?.data || res.data
    user.value = normalizeUser({ ...user.value, ...payload })
  }

  function logout() {
    authApi.logout().catch(() => {})
    accessToken.value = null
    user.value = null
    hydrated.value = false
    hydrating.value = false
    hydratePromise = null
    clearCsrfToken()
  }

  const allowedMenu = computed(() => {
    const r = roles.value
    const all = r.includes('superadmin') || r.includes('org_admin')

    const items = []

    if (all || r.some((x) => ['branch_manager', 'veterinarian', 'vet_technician', 'receptionist', 'tele_vet', 'read_only'].includes(x))) {
      items.push({ key: 'dashboard', label: 'Inicio', icon: '🏠', to: '/' })
    }

    if (all || r.some((x) => ['veterinarian', 'vet_technician', 'receptionist', 'branch_manager', 'tele_vet', 'read_only'].includes(x))) {
      items.push({ key: 'appointments', label: 'Turnos', icon: '📅', to: '/turnos' })
    }

    if (all || r.some((x) => ['veterinarian', 'vet_technician', 'branch_manager', 'read_only'].includes(x))) {
      items.push({ key: 'patients', label: 'Pacientes', icon: '🐾', to: '/pacientes' })
    }

    if (all || r.some((x) => ['veterinarian', 'vet_technician', 'surgeon', 'tele_vet'].includes(x))) {
      items.push({ key: 'medical', label: 'Evoluciones', icon: '📋', to: '/evoluciones' })
    }

    if (all || r.some((x) => ['veterinarian', 'vet_technician', 'surgeon', 'lab_technician'].includes(x))) {
      items.push({ key: 'vaccinations', label: 'Vacunas', icon: '💉', to: '/vacunas' })
    }

    if (all || r.some((x) => ['veterinarian', 'vet_technician', 'lab_technician'].includes(x))) {
      items.push({ key: 'laboratorio', label: 'Laboratorio', icon: '🧪', to: '/laboratorio' })
    }

    if (all || r.some((x) => ['veterinarian', 'vet_technician', 'lab_technician'].includes(x))) {
      items.push({ key: 'imagenes', label: 'Imágenes', icon: '🩻', to: '/imagenes' })
    }

    if (all || r.some((x) => ['veterinarian', 'vet_technician', 'lab_technician'].includes(x))) {
      items.push({ key: 'patologia', label: 'Patología', icon: '🔬', to: '/patologia' })
    }

    if (all || r.some((x) => ['veterinarian', 'surgeon'].includes(x))) {
      items.push({ key: 'cirugias', label: 'Cirugías', icon: '🔪', to: '/cirugias' })
    }

    if (all || r.some((x) => ['veterinarian', 'vet_technician', 'branch_manager'].includes(x))) {
      items.push({ key: 'hospitalizaciones', label: 'Internados', icon: '🏥', to: '/hospitalizaciones' })
    }

    if (all || r.some((x) => ['pharmacist', 'accountant', 'branch_manager', 'org_admin'].includes(x))) {
      items.push({ key: 'inventory', label: 'Inventario', icon: '📦', to: '/inventario' })
    }

    if (all || r.some((x) => ['groomer', 'grooming_manager'].includes(x))) {
      items.push({ key: 'grooming', label: 'Grooming', icon: '✂️', to: '/grooming' })
    }

    if (all || r.some((x) => ['tele_vet', 'veterinarian'].includes(x))) {
      items.push({ key: 'telemedicine', label: 'Telemedicina', icon: '💻', to: '/telemedicina' })
    }

    if (all || r.some((x) => ['accountant', 'branch_manager', 'org_admin'].includes(x))) {
      items.push({ key: 'billing', label: 'Facturación', icon: '💰', to: '/facturacion' })
    }

    if (all || r.some((x) => ['branch_manager', 'org_admin', 'accountant'].includes(x))) {
      items.push({ key: 'reports', label: 'Reportes', icon: '📊', to: '/reportes' })
    }

    if (all) {
      items.push({ key: 'admin', label: 'Administrar', icon: '⚙️', to: '/admin' })
    }

    if (all || r.length) {
      items.push({ key: 'notifications', label: 'Notificaciones', icon: '🔔', to: '/notificaciones' })
    }

    if (all || r.some((x) => ['branch_manager', 'veterinarian', 'vet_technician', 'surgeon', 'lab_technician', 'read_only'].includes(x))) {
      items.push({ key: 'documents', label: 'Documentos', icon: '📨', to: '/documentos' })
    }

    if (all || r.some((x) => ['branch_manager', 'org_admin', 'receptionist', 'read_only'].includes(x))) {
      items.push({ key: 'portal', label: 'Portal', icon: '👥', to: '/portal' })
    }

    if (can('ai:use')) {
      items.push({ key: 'ai', label: 'IA', icon: '🧠', to: '/ai' })
    }

    return items
  })

  return {
    accessToken,
    user,
    hydrated,
    hydrating,
    isAuthenticated,
    roles,
    orgId,
    hasRole,
    can,
    login,
    twoFaChallenge,
    refresh,
    fetchMe,
    bootstrap,
    logout,
    allowedMenu,
  }
})
