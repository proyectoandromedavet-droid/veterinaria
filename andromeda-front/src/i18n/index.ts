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
      create: 'Crear',
      update: 'Actualizar',
      newItem: 'Nuevo',
      search: 'Buscar',
      previous: 'Anterior',
      next: 'Siguiente',
      active: 'Activo',
      inactive: 'Inactivo',
      none: 'Sin datos',
    },
    dashboard: {
      greeting: 'Buenos dias',
      todayAppointments: 'Turnos de hoy',
      quickAccess: 'Acceso rapido',
      noAppointments: 'No hay turnos agendados para hoy',
      loadingAppointments: 'Cargando turnos',
      kpiAppointments: 'Turnos hoy',
      kpiPatients: 'Pacientes',
      kpiPending: 'Pendientes',
      kpiCompleted: 'Completados hoy',
    },
    admin: {
      title: 'Administracion de usuarios',
      subtitle: 'Crea usuarios staff y gestiona sus accesos',
      newUser: 'Nuevo usuario',
      noUsers: 'No hay usuarios registrados aun',
      authPolicies: 'Politicas de autenticacion',
      roleOverrides: 'Overrides de roles',
      name: 'Nombre',
      email: 'Email',
      role: 'Rol',
      branch: 'Sucursal',
      status: 'Estado',
      created: 'Creado',
      actions: 'Acciones',
      pagination: 'Pagina {page} de {total}',
      authPoliciesHelp: '2FA sigue opcional y desactivado por defecto. Desde aca solo habilitas la activacion manual por usuario.',
      optionalTwoFactorLabel: 'Permitir 2FA opcional para la organizacion',
      optionalTwoFactorHelp: 'No exige 2FA. Solo habilita el setup voluntario cuando quieran usarlo.',
      enabled: 'Habilitado',
      disabled: 'Deshabilitado',
      roleOverridesHelp: 'Permisos dinamicos por organizacion para rutas sensibles',
      selectRole: 'Selecciona un rol...',
      grantPlaceholder: 'Permisos grant, separados por coma',
      revokePlaceholder: 'Permisos revoke, separados por coma',
      saveOverride: 'Guardar override',
      updated: 'Actualizado',
      noOverrides: 'No hay overrides cargados para esta organizacion',
      deactivateUser: 'Desactivar usuario',
      createUserSuccess: 'Usuario creado correctamente',
      welcomeEmailHint: 'Se envio un email de bienvenida a',
      tempPasswordHint: 'El usuario debera cambiar su contrasena al ingresar por primera vez.',
      roleRequired: 'Selecciona un rol.',
      deactivatePrompt: 'Se revocaran todas sus sesiones activas.',
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
      create: 'Create',
      update: 'Update',
      newItem: 'New',
      search: 'Search',
      previous: 'Previous',
      next: 'Next',
      active: 'Active',
      inactive: 'Inactive',
      none: 'No data',
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
    admin: {
      title: 'User administration',
      subtitle: 'Create staff users and manage their access',
      newUser: 'New user',
      noUsers: 'No users registered yet',
      authPolicies: 'Authentication policies',
      roleOverrides: 'Role overrides',
      name: 'Name',
      email: 'Email',
      role: 'Role',
      branch: 'Branch',
      status: 'Status',
      created: 'Created',
      actions: 'Actions',
      pagination: 'Page {page} of {total}',
      authPoliciesHelp: '2FA stays optional and disabled by default. This only enables manual opt-in per user.',
      optionalTwoFactorLabel: 'Allow optional 2FA for the organization',
      optionalTwoFactorHelp: 'It does not enforce 2FA. It only enables voluntary setup.',
      enabled: 'Enabled',
      disabled: 'Disabled',
      roleOverridesHelp: 'Dynamic organization-level permissions for sensitive routes',
      selectRole: 'Select a role...',
      grantPlaceholder: 'Grant permissions, comma separated',
      revokePlaceholder: 'Revoke permissions, comma separated',
      saveOverride: 'Save override',
      updated: 'Updated',
      noOverrides: 'No overrides configured for this organization',
      deactivateUser: 'Deactivate user',
      createUserSuccess: 'User created successfully',
      welcomeEmailHint: 'A welcome email was sent to',
      tempPasswordHint: 'The user must change their password on first login.',
      roleRequired: 'Select a role.',
      deactivatePrompt: 'All active sessions will be revoked.',
    },
  },
} as const

let currentLocale: Locale = 'es-AR'

export function setLocale(locale: Locale) {
  currentLocale = locale
}

export function t(path: string, params?: Record<string, string | number>): string {
  const parts = path.split('.')
  let value: unknown = messages[currentLocale]
  for (const part of parts) {
    if (!value || typeof value !== 'object' || !(part in value)) return path
    value = (value as Record<string, unknown>)[part]
  }
  if (typeof value !== 'string') return path
  if (!params) return value
  return value.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}
