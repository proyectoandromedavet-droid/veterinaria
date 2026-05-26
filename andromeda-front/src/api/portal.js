import axios from 'axios'
import { http, ensureCsrfToken } from './client'
import { logError } from '../utils/errors'

const STORAGE_KEY = 'portal.owner.session'
const REFRESH_STORAGE_KEY = 'portal.owner.refresh'
const ORG_STORAGE_KEY = 'portal.owner.orgId'
const SAFE_METHODS = new Set(['get', 'head', 'options'])
const PORTAL_TIMEOUT_MS = 180000

function getBaseURL() {
  return http.defaults.baseURL || '/api/v1'
}

function readStoredSession() {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null, owner: null }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const refreshToken = window.sessionStorage.getItem(REFRESH_STORAGE_KEY) || null
    if (!raw) return { accessToken: null, refreshToken, owner: null }
    const parsed = JSON.parse(raw)
    return {
      accessToken: parsed.accessToken || null,
      refreshToken,
      owner: parsed.owner || null,
    }
  } catch (error) {
    logError('portal.readSession', error)
    return { accessToken: null, refreshToken: null, owner: null }
  }
}

function writeStoredSession(session) {
  if (typeof window === 'undefined') return
  const payload = {
    accessToken: session?.accessToken || null,
    owner: session?.owner || null,
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  if (session?.refreshToken) {
    window.sessionStorage.setItem(REFRESH_STORAGE_KEY, session.refreshToken)
  }
}

function clearStoredSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
  window.sessionStorage.removeItem(REFRESH_STORAGE_KEY)
}

function getPortalOrgId() {
  if (typeof window === 'undefined') return import.meta.env.VITE_PORTAL_ORG_ID || ''
  const queryOrgId = new URLSearchParams(window.location.search).get('orgId')
  if (queryOrgId) {
    const parsed = parseInt(queryOrgId, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      logError('portal.invalidOrgId', new Error('Invalid orgId from URL'), { orgId: queryOrgId })
    } else {
      window.localStorage.setItem(ORG_STORAGE_KEY, String(parsed))
      return String(parsed)
    }
  }
  return window.localStorage.getItem(ORG_STORAGE_KEY) || import.meta.env.VITE_PORTAL_ORG_ID || ''
}

let currentSession = readStoredSession()
let refreshingPromise = null

function getSession() {
  if (!currentSession.accessToken && !currentSession.refreshToken) {
    currentSession = readStoredSession()
  }
  return { ...currentSession }
}

function setSession(session) {
  currentSession = {
    accessToken: session?.accessToken || null,
    refreshToken: session?.refreshToken || null,
    owner: session?.owner || null,
  }
  writeStoredSession(currentSession)
  return getSession()
}

function clearSession() {
  currentSession = { accessToken: null, refreshToken: null, owner: null }
  clearStoredSession()
}

function unwrap(response) {
  return response?.data?.data ?? response?.data ?? response
}

const refreshClient = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
  timeout: PORTAL_TIMEOUT_MS,
})

const portalHttp = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
  timeout: PORTAL_TIMEOUT_MS,
})

async function attachCsrf(cfg) {
  cfg.headers = cfg.headers || {}
  const orgId = getPortalOrgId()
  if (orgId && !cfg.headers['X-Org-Id'] && !cfg.headers['x-org-id']) {
    cfg.headers['X-Org-Id'] = orgId
  }
  const method = (cfg.method || 'get').toLowerCase()
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = await ensureCsrfToken()
    cfg.headers['X-CSRF-Token'] = csrfToken
  }
  return cfg
}

refreshClient.interceptors.request.use(attachCsrf)

portalHttp.interceptors.request.use(async (cfg) => {
  cfg.headers = cfg.headers || {}
  const session = getSession()
  if (session.accessToken) {
    cfg.headers.Authorization = `Bearer ${session.accessToken}`
  }
  return attachCsrf(cfg)
})

async function refreshSession() {
  if (refreshingPromise) return refreshingPromise
  const session = getSession()
  if (!session.refreshToken) {
    throw new Error('No portal refresh token available')
  }

  refreshingPromise = refreshClient
    .post('/portal/auth/refresh', { refreshToken: session.refreshToken })
    .then((response) => {
      const payload = unwrap(response)
      const next = setSession({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken || session.refreshToken,
        owner: session.owner,
      })
      return next
    })
    .finally(() => {
      refreshingPromise = null
    })

  return refreshingPromise
}

portalHttp.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {}
    const url = String(original.url || '')
    const isAuthRoute = url.includes('/portal/auth/login')
      || url.includes('/portal/auth/register')
      || url.includes('/portal/auth/forgot-password')
      || url.includes('/portal/auth/refresh')

    if (error.response?.status === 401 && !original._portalRetry && !isAuthRoute) {
      original._portalRetry = true
      try {
        const nextSession = await refreshSession()
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${nextSession.accessToken}`
        return portalHttp(original)
      } catch (refreshError) {
        logError('portal.refresh', refreshError, { url, method: original.method })
        clearSession()
      }
    }

    return Promise.reject(error)
  }
)

export const portalApi = {
  login: (data) => portalHttp.post('/portal/auth/login', data).then(unwrap),
  register: (data) => portalHttp.post('/portal/auth/register', data).then(unwrap),
  forgotPassword: (data) => portalHttp.post('/portal/auth/forgot-password', data).then(unwrap),
  me: () => portalHttp.get('/portal/me').then(unwrap),
  updateMe: (data) => portalHttp.put('/portal/me', data).then(unwrap),
  changePassword: (data) => portalHttp.put('/portal/me/password', data).then(unwrap),
  pets: {
    list: () => portalHttp.get('/portal/pets').then(unwrap),
    get: (id) => portalHttp.get(`/portal/pets/${id}`).then(unwrap),
    medicalHistory: (id) => portalHttp.get(`/portal/pets/${id}/medical-history`).then(unwrap),
    vaccinations: (id) => portalHttp.get(`/portal/pets/${id}/vaccinations`).then(unwrap),
    prescriptions: (id) => portalHttp.get(`/portal/pets/${id}/prescriptions`).then(unwrap),
  },
  appointments: {
    list: (params) => portalHttp.get('/portal/appointments', { params }).then(unwrap),
    create: (data) => portalHttp.post('/portal/appointments', data).then(unwrap),
    cancel: (id, reason) => portalHttp.patch(`/portal/appointments/${id}/cancel`, { reason }).then(unwrap),
  },
  invoices: {
    list: (params) => portalHttp.get('/portal/invoices', { params }).then(unwrap),
    get: (id) => portalHttp.get(`/portal/invoices/${id}`).then(unwrap),
    pay: (id) => portalHttp.post(`/portal/invoices/${id}/pay`, {}).then(unwrap),
  },
  notifications: {
    list: (params) => portalHttp.get('/portal/notifications', { params }).then(unwrap),
    markRead: (id) => portalHttp.patch(`/portal/notifications/${id}/read`).then(unwrap),
  },
  telemedicine: {
    list: () => portalHttp.get('/portal/telemedicine').then(unwrap),
  },
  fcm: {
    register: (data) => portalHttp.post('/portal/fcm/register', data).then(unwrap),
  },
  refresh: () => refreshSession(),
  getSession,
  setSession,
  clearSession,
  hasSession: () => Boolean(getSession().accessToken),
  unwrap,
}

export default portalApi
