import http from './client'

export const adminUsersApi = {
  list:       (params) => http.get('/auth/admin/users', { params }),
  create:     (data)   => http.post('/auth/admin/users', data),
  deactivate: (id)     => http.patch(`/auth/admin/users/${id}/deactivate`),
}
