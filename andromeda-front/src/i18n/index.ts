export type Locale = 'es-AR' | 'en-US'

const messages = {
  'es-AR': {
    common: {
      save: 'Guardar',
      cancel: 'Cancelar',
      close: 'Cerrar',
      loading: 'Cargando...',
      empty: 'Sin resultados',
      viewAll: 'Ver todos',
    },
    dashboard: {
      greeting: 'Buenos días',
      todayAppointments: 'Turnos de hoy',
      quickAccess: 'Acceso rápido',
      noAppointments: 'No hay turnos agendados para hoy',
      loadingAppointments: 'Cargando turnos',
      kpiAppointments: 'Turnos hoy',
      kpiPatients: 'Pacientes',
      kpiPending: 'Pendientes',
      kpiCompleted: 'Completados hoy',
    },
  },
  'en-US': {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      loading: 'Loading...',
      empty: 'No results',
      viewAll: 'View all',
    },
    dashboard: {
      greeting: 'Good morning',
      todayAppointments: 'Today appointments',
      quickAccess: 'Quick access',
      noAppointments: 'No appointments scheduled for today',
      loadingAppointments: 'Loading appointments',
      kpiAppointments: 'Appointments today',
      kpiPatients: 'Patients',
      kpiPending: 'Pending',
      kpiCompleted: 'Completed today',
    },
  },
} as const

let currentLocale: Locale = 'es-AR'

export function setLocale(locale: Locale) {
  currentLocale = locale
}

export function t(path: string): string {
  const parts = path.split('.')
  let value: unknown = messages[currentLocale]
  for (const part of parts) {
    if (!value || typeof value !== 'object' || !(part in value)) return path
    value = (value as Record<string, unknown>)[part]
  }
  return typeof value === 'string' ? value : path
}
