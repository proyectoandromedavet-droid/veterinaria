import http from './client'

export const authApi = {
  login:        (data)          => http.post('/auth/login', data),
  twoFaChallenge: (data)        => http.post('/auth/2fa/challenge', data),
  ssoRedirect:  (provider, query = {}) => {
    const params = new URLSearchParams(query).toString()
    const suffix = params ? `?${params}` : ''
    window.location.href = `${http.defaults.baseURL}/auth/sso/${provider}/connect${suffix}`
  },
  refresh:      ()              => http.post('/auth/refresh', {}),
  logout:       ()              => http.post('/auth/logout', {}),
  me:           ()              => http.get('/auth/me'),
  changePassword: (data)        => http.post('/auth/change-password', data),
  resetRequest: (email)         => http.post('/auth/password-reset/request', { email }),
  resetConfirm: (data)          => http.post('/auth/password-reset/confirm', data),
}
