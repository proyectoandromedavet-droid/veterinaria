import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api/auth'

const ACCESS_TOKEN_KEY = 'accessToken'
const LEGACY_ACCESS_TOKEN_KEY = 'andro_at'
const USER_KEY = 'andro_user'

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(
    localStorage.getItem(ACCESS_TOKEN_KEY) ||
    localStorage.getItem(LEGACY_ACCESS_TOKEN_KEY) ||
    null
  )
  const user        = ref(JSON.parse(localStorage.getItem(USER_KEY) || 'null'))

  const isAuthenticated = computed(() => !!accessToken.value)
  const roles           = computed(() => user.value?.roles || [])
  const orgId           = computed(() => user.value?.org_id || null)

  function hasRole(...check) {
    return check.some(r => roles.value.includes(r))
  }

  function can(permission) {
    // superadmin puede todo
    if (roles.value.includes('superadmin')) return true
    const perms = user.value?.permissions || []
    return perms.includes(permission) || perms.includes('*')
  }

  function setTokens(at) {
    accessToken.value = at
    localStorage.setItem(ACCESS_TOKEN_KEY, at)
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY)
    const payload = parseJwt(at)
    if (payload) {
      user.value = payload
      localStorage.setItem(USER_KEY, JSON.stringify(payload))
    }
  }

  async function login(credentials) {
    const res = await authApi.login(credentials)
    // Backend devuelve { success: true, data: { accessToken, user, ... } }
    const payload = res.data?.data || res.data
    if (payload.requiresTwoFactor) {
      return { requiresTwoFactor: true, pendingToken: payload.pendingToken }
    }
    setTokens(payload.accessToken)
    // Merge user info from response
    if (payload.user) {
      user.value = { ...user.value, ...payload.user, roles: payload.user.roles }
      localStorage.setItem(USER_KEY, JSON.stringify(user.value))
    }
    return { requiresTwoFactor: false }
  }

  async function twoFaChallenge(pendingToken, code) {
    const res = await authApi.twoFaChallenge({ pendingToken, code })
    const payload = res.data?.data || res.data
    setTokens(payload.accessToken)
  }

  async function refresh() {
    const res = await authApi.refresh()
    const payload = res.data?.data || res.data
    setTokens(payload.accessToken)
  }

  async function fetchMe() {
    const res = await authApi.me()
    const payload = res.data?.data || res.data
    user.value = { ...user.value, ...payload }
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  function logout() {
    authApi.logout().catch(() => {})
    accessToken.value = null
    user.value = null
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  // Menú permitido según rol
  const allowedMenu = computed(() => {
    const r = roles.value
    const all = r.includes('superadmin') || r.includes('org_admin')

    const items = []

    if (all || r.some(x => ['branch_manager','veterinarian','vet_technician','receptionist','tele_vet','read_only'].includes(x)))
      items.push({ key: 'dashboard',      label: 'Inicio',       icon: '🏠', to: '/' })

    if (all || r.some(x => ['veterinarian','vet_technician','receptionist','branch_manager','tele_vet','read_only'].includes(x)))
      items.push({ key: 'appointments',   label: 'Turnos',       icon: '📅', to: '/turnos' })

    if (all || r.some(x => ['veterinarian','vet_technician','branch_manager','read_only'].includes(x)))
      items.push({ key: 'patients',       label: 'Pacientes',    icon: '🐾', to: '/pacientes' })

    if (all || r.some(x => ['veterinarian','vet_technician','surgeon','tele_vet'].includes(x)))
      items.push({ key: 'medical',        label: 'Evoluciones',  icon: '📋', to: '/evoluciones' })

    if (all || r.some(x => ['veterinarian','vet_technician','surgeon','lab_technician'].includes(x)))
      items.push({ key: 'vaccinations',   label: 'Vacunas',      icon: '💉', to: '/vacunas' })

    if (all || r.some(x => ['veterinarian','vet_technician','lab_technician'].includes(x)))
      items.push({ key: 'laboratorio',    label: 'Laboratorio',  icon: '🧪', to: '/laboratorio' })

    if (all || r.some(x => ['veterinarian','vet_technician','lab_technician'].includes(x)))
      items.push({ key: 'imagenes',       label: 'Imágenes',     icon: '🩻', to: '/imagenes' })

    if (all || r.some(x => ['veterinarian','vet_technician','lab_technician'].includes(x)))
      items.push({ key: 'patologia',      label: 'Patología',    icon: '🔬', to: '/patologia' })

    if (all || r.some(x => ['veterinarian','surgeon'].includes(x)))
      items.push({ key: 'cirugias',       label: 'Cirugías',     icon: '🔪', to: '/cirugias' })

    if (all || r.some(x => ['veterinarian','vet_technician','branch_manager'].includes(x)))
      items.push({ key: 'hospitalizaciones', label: 'Internados', icon: '🏥', to: '/hospitalizaciones' })

    if (all || r.some(x => ['pharmacist','accountant','branch_manager','org_admin'].includes(x)))
      items.push({ key: 'inventory',      label: 'Inventario',   icon: '📦', to: '/inventario' })

    if (all || r.some(x => ['groomer','grooming_manager'].includes(x)))
      items.push({ key: 'grooming',       label: 'Grooming',     icon: '✂️',  to: '/grooming' })

    if (all || r.some(x => ['tele_vet','veterinarian'].includes(x)))
      items.push({ key: 'telemedicine',   label: 'Telemedicina', icon: '💻', to: '/telemedicina' })

    if (all || r.some(x => ['accountant','branch_manager','org_admin'].includes(x)))
      items.push({ key: 'billing',        label: 'Facturación',  icon: '💰', to: '/facturacion' })

    if (all || r.some(x => ['branch_manager','org_admin','accountant'].includes(x)))
      items.push({ key: 'reports',        label: 'Reportes',     icon: '📊', to: '/reportes' })

    if (all)
      items.push({ key: 'admin',          label: 'Administrar',  icon: '⚙️',  to: '/admin' })

    return items
  })

  return {
    accessToken, user,
    isAuthenticated, roles, orgId,
    hasRole, can,
    login, twoFaChallenge, refresh, fetchMe, logout,
    allowedMenu,
  }
})
