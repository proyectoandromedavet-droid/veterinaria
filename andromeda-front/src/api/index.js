import http from './client'

// Base URL is already http://localhost:4050/api/v1 — paths here are relative to that.
// Axios combineURLs strips leading slash, so '/foo' and 'foo' both resolve to /api/v1/foo.

export const appointmentsApi = {
  list:        (p)            => http.get('/appointments', { params: p }),
  get:         (id)           => http.get(`/appointments/${id}`),
  create:      (d)            => http.post('/appointments', d),
  update:      (id, d)        => http.put(`/appointments/${id}`, d),
  changeStatus:(id, status, notes) => http.patch(`/appointments/${id}/status`, { status, notes }),
  cancel:      (id, reason)   => http.patch(`/appointments/${id}/status`, { status: 'cancelled', notes: reason }),
  types:       ()             => http.get('/appointments/types'),
  today:       ()             => http.get('/appointments/today'),
  delete:      (id)           => http.delete(`/appointments/${id}`),
}

export const patientsApi = {
  list:     (p)          => http.get('/patients', { params: p }),
  get:      (id)         => http.get(`/patients/${id}`),
  create:   (d)          => http.post('/patients', d),
  update:   (id, d)      => http.put(`/patients/${id}`, d),
  delete:   (id)         => http.delete(`/patients/${id}`),
  owners:   (id)         => http.get(`/patients/${id}/owners`),
  timeline: (id)         => http.get(`/patients/${id}/timeline`),
  species:  ()           => http.get('/patients/species/all'),
  breeds:   (speciesId)  => http.get('/patients/breeds/all', { params: { speciesId } }),
}

export const clientsApi = {
  list:     (p)     => http.get('/clients', { params: p }),
  get:      (id)    => http.get(`/clients/${id}`),
  create:   (d)     => http.post('/clients', d),
  update:   (id, d) => http.put(`/clients/${id}`, d),
  patients: (id)    => http.get(`/clients/${id}/patients`),
}

export const medicalApi = {
  list:   (p)     => http.get('/medical-records', { params: p }),
  get:    (id)    => http.get(`/medical-records/${id}`),
  create: (d)     => http.post('/medical-records', d),
  update: (id, d) => http.put(`/medical-records/${id}`, d),
  triage: {
    list:   (p)     => http.get('/triage', { params: p }),
    create: (d)     => http.post('/triage', d),
    update: (id, d) => http.put(`/triage/${id}`, d),
  },
  prescriptions: {
    list:   (p)  => http.get('/prescriptions', { params: p }),
    create: (d)  => http.post('/prescriptions', d),
    get:    (id) => http.get(`/prescriptions/${id}`),
  },
  followUps: {
    list:   (p) => http.get('/follow-ups', { params: p }),
    create: (d) => http.post('/follow-ups', d),
  },
}

export const vaccinationsApi = {
  list:    (p)      => http.get('/vaccinations', { params: p }),
  create:  (d)      => http.post('/vaccinations', d),
  update:  (id, d)  => http.put(`/vaccinations/${id}`, d),
  delete:  (id)     => http.delete(`/vaccinations/${id}`),
  alerts:  ()       => http.get('/vaccinations/alerts'),
  deworming: {
    list:   (p) => http.get('/deworming', { params: p }),
    create: (d) => http.post('/deworming', d),
  },
}

export const labApi = {
  orders: {
    list:   (p)     => http.get('/lab/orders', { params: p }),
    get:    (id)    => http.get(`/lab/orders/${id}`),
    create: (d)     => http.post('/lab/orders', d),
    result: (id, d) => http.post(`/lab/orders/${id}/results`, d),
  },
  tests:  () => http.get('/lab/tests'),
  panels: () => http.get('/lab/panels'),
  imaging: {
    list:   (p)     => http.get('/imaging', { params: p }),
    create: (d)     => http.post('/imaging', d),
    get:    (id)    => http.get(`/imaging/${id}`),
  },
  surgeries: {
    list:   (p)     => http.get('/surgeries', { params: p }),
    create: (d)     => http.post('/surgeries', d),
    update: (id, d) => http.put(`/surgeries/${id}`, d),
  },
  hospitalizations: {
    list:   (p)     => http.get('/hospitalizations', { params: p }),
    create: (d)     => http.post('/hospitalizations', d),
    update: (id, d) => http.put(`/hospitalizations/${id}`, d),
  },
}

export const billingApi = {
  invoices: {
    list:    (p)             => http.get('/invoices', { params: p }),
    get:     (id)            => http.get(`/invoices/${id}`),
    create:  (d)             => http.post('/invoices', d),
    markPaid:(id, method)    => http.patch(`/invoices/${id}/pay`, { payment_method: method }),
    cancel:  (id, reason)    => http.patch(`/invoices/${id}/cancel`, { reason }),
  },
  payments: {
    list:   (p) => http.get('/payments', { params: p }),
    create: (d) => http.post('/payments', d),
  },
  priceLists: {
    list:  ()   => http.get('/price-lists'),
    items: (id) => http.get(`/price-lists/${id}/items`),
  },
  inventory: {
    list:     (p)     => http.get('/inventory', { params: p }),
    create:   (d)     => http.post('/inventory/items', d),
    update:   (id, d) => http.put(`/inventory/items/${id}`, d),
    movement: (d)     => http.post('/inventory/movements', d),
    alerts:   ()      => http.get('/inventory/alerts'),
    batches:  (p)     => http.get('/inventory/batches', { params: p }),
  },
}

export const groomingApi = {
  appointments: {
    list:        (p)     => http.get('/grooming/appointments', { params: p }),
    get:         (id)    => http.get(`/grooming/appointments/${id}`),
    create:      (d)     => http.post('/grooming/appointments', d),
    updateStatus:(id, s) => http.patch(`/grooming/appointments/${id}/status`, { status: s }),
    today:       ()      => http.get('/grooming/appointments/today'),
  },
  groomers: () => http.get('/grooming/groomers'),
  services: () => http.get('/grooming/services'),
}

export const teleApi = {
  sessions: {
    list:   (p)     => http.get('/tele/sessions', { params: p }),
    get:    (id)    => http.get(`/tele/sessions/${id}`),
    create: (d)     => http.post('/tele/sessions', d),
    update: (id, d) => http.put(`/tele/sessions/${id}`, d),
  },
}

export const reportsApi = {
  summary:   (p) => http.get('/reports/summary',   { params: p }),
  financial: (p) => http.get('/reports/financial', { params: p }),
  patients:  (p) => http.get('/reports/patients',  { params: p }),
  clinical:  (p) => http.get('/reports/clinical',  { params: p }),
  inventory: (p) => http.get('/reports/inventory', { params: p }),
  staff:     (p) => http.get('/reports/staff',     { params: p }),
}

export const adminApi = {
  users: {
    list:    (p)     => http.get('/auth/admin/users', { params: p }),
    get:     (id)    => http.get(`/auth/admin/users/${id}`),
    create:  (d)     => http.post('/auth/admin/users', d),
    update:  (id, d) => http.put(`/auth/admin/users/${id}`, d),
    toggle:  (id)    => http.patch(`/auth/admin/users/${id}/toggle-active`),
    resetPw: (id)    => http.post(`/auth/admin/users/${id}/reset-password`),
  },
  branches: {
    list:   ()       => http.get('/branches'),
    create: (d)      => http.post('/branches', d),
    update: (id, d)  => http.put(`/branches/${id}`, d),
  },
  roles: () => http.get('/auth/roles'),
}
