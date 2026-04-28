import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4050'
const ACCESS_TOKEN_KEY = 'accessToken'

export const http = axios.create({
  baseURL: API_URL,
  withCredentials: true,   // envía cookies (refresh token httpOnly)
  timeout: 15000,
})

// Inyecta el access token en cada request
http.interceptors.request.use(cfg => {
  const auth = useAuthStore()
  const token = auth.accessToken || localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
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

export default http
