import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4050'
const CSRF_TOKEN_KEY = 'csrfToken'

const SAFE_METHODS = new Set(['get', 'head', 'options'])

let csrfTokenPromise = null

async function fetchCsrfToken() {
  const res = await axios.get(`${API_URL}/csrf-token`, { withCredentials: true })
  const token = res.data?.data?.csrfToken
  if (token) {
    localStorage.setItem(CSRF_TOKEN_KEY, token)
    return token
  }
  throw new Error('CSRF token missing from gateway response')
}

async function ensureCsrfToken() {
  const cached = localStorage.getItem(CSRF_TOKEN_KEY)
  if (cached) return cached

  if (!csrfTokenPromise) {
    csrfTokenPromise = fetchCsrfToken().finally(() => {
      csrfTokenPromise = null
    })
  }

  return csrfTokenPromise
}

export const http = axios.create({
  baseURL: API_URL,
  withCredentials: true,   // envía cookies (refresh token httpOnly)
  timeout: 15000,
})

// Inyecta el access token en cada request
http.interceptors.request.use(cfg => {
  cfg.headers = cfg.headers || {}
  const auth = useAuthStore()
  const token = auth.accessToken
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  const method = (cfg.method || 'get').toLowerCase()
  if (!SAFE_METHODS.has(method) && !cfg.headers['X-Api-Key'] && !cfg.headers['x-api-key']) {
    return ensureCsrfToken().then(csrfToken => {
      cfg.headers['X-CSRF-Token'] = csrfToken
      return cfg
    })
  }
  return cfg
})

// Si el server devuelve 401, intenta refrescar el token una vez
let refreshing = false
let queue = []

http.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    const csrfCode = err.response?.data?.error?.code
    if (['CSRF_MISSING', 'CSRF_INVALID'].includes(csrfCode) && !original?._retryCsrf) {
      original._retryCsrf = true
      try {
        const csrfToken = await fetchCsrfToken()
        original.headers = original.headers || {}
        original.headers['X-CSRF-Token'] = csrfToken
        return http(original)
      } catch {
        return Promise.reject(err)
      }
    }
    if (err.response?.status === 401 && !original._retry) {
      if (refreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject, config: original })
        })
      }
      original._retry = true
      refreshing = true
      try {
        const auth = useAuthStore()
        await auth.refresh()
        queue.forEach(({ resolve, config }) => {
          config.headers.Authorization = `Bearer ${auth.accessToken}`
          resolve(http(config))
        })
        queue = []
        original.headers.Authorization = `Bearer ${auth.accessToken}`
        return http(original)
      } catch {
        queue.forEach(({ reject }) => reject(err))
        queue = []
        const auth = useAuthStore()
        auth.logout()
      } finally {
        refreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export function clearCsrfToken() {
  localStorage.removeItem(CSRF_TOKEN_KEY)
}

export { ensureCsrfToken, CSRF_TOKEN_KEY }

export default http
