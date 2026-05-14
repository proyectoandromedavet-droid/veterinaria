import { portalApi } from '../../api/portal'
import { extractErrorMessage, logError } from '../../utils/errors'

export const authTabs = [
  { key: 'login', label: 'Ingresar' },
  { key: 'register', label: 'Crear cuenta' },
  { key: 'forgot', label: 'Recuperar' },
]

export function unwrapPortalResult(result) {
  return result?.data?.data ?? result?.data ?? result
}

export function ownerLabelFrom(profile, owner, sessionOwner) {
  const current = profile || owner || sessionOwner || {}
  const fullName = [current.first_name || current.firstName, current.last_name || current.lastName].filter(Boolean).join(' ').trim()
  return fullName || current.name || current.email || 'Dueño'
}

export function sessionSummaryFrom(profile, owner, sessionOwner) {
  const current = profile || owner || sessionOwner || {}
  return [current.email, current.organization_id ? `Org ${current.organization_id}` : null].filter(Boolean).join(' · ')
}

export function profileSummaryFrom(profile) {
  if (!profile) return 'Mantiene contacto, turnos, facturas y notificaciones sincronizadas.'
  const pieces = []
  if (profile.phone) pieces.push(profile.phone)
  if (profile.address) pieces.push(profile.address)
  if (profile.city) pieces.push(profile.city)
  return pieces.length ? pieces.join(' · ') : 'Mantiene contacto, turnos, facturas y notificaciones sincronizadas.'
}

export function extractPortalError(error, fallback) {
  return extractErrorMessage(error, fallback, { includeRequestId: true })
}

export function logPortalViewError(scope, error, meta) {
  logError(`portal.${scope}`, error, meta)
}

export function formatPortalDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date)
}

export function formatPortalDateTime(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function formatPortalMoney(amount, currency = 'ARS') {
  const numeric = Number(amount || 0)
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency || 'ARS',
      maximumFractionDigits: 2,
    }).format(numeric)
  } catch {
    return `${currency || 'ARS'} ${numeric.toFixed(2)}`
  }
}

export function portalStatusClass(status) {
  const value = String(status || '').toLowerCase()
  if (['confirmed', 'paid', 'completed', 'sent', 'read'].includes(value)) return 'status-pill--ok'
  if (['requested', 'pending', 'scheduled'].includes(value)) return 'status-pill--warn'
  if (['cancelled', 'rejected', 'failed', 'overdue'].includes(value)) return 'status-pill--bad'
  return ''
}

export async function loadPortalDashboard() {
  const [meRes, petsRes, appointmentsRes, invoicesRes, notificationsRes, telemedicineRes] = await Promise.all([
    portalApi.me(),
    portalApi.pets.list(),
    portalApi.appointments.list({ upcoming: true, limit: 8 }),
    portalApi.invoices.list({ limit: 8 }),
    portalApi.notifications.list({ limit: 12 }),
    portalApi.telemedicine.list(),
  ])

  return {
    profile: unwrapPortalResult(meRes),
    pets: Array.isArray(unwrapPortalResult(petsRes)) ? unwrapPortalResult(petsRes) : [],
    appointments: Array.isArray(unwrapPortalResult(appointmentsRes)) ? unwrapPortalResult(appointmentsRes) : [],
    invoices: Array.isArray(unwrapPortalResult(invoicesRes)) ? unwrapPortalResult(invoicesRes) : [],
    notifications: Array.isArray(unwrapPortalResult(notificationsRes)) ? unwrapPortalResult(notificationsRes) : [],
    telemedicine: Array.isArray(unwrapPortalResult(telemedicineRes)) ? unwrapPortalResult(telemedicineRes) : [],
  }
}

export async function loadPortalPetBundle(petId) {
  const [detail, history, vaccinations, prescriptions] = await Promise.all([
    portalApi.pets.get(petId),
    portalApi.pets.medicalHistory(petId),
    portalApi.pets.vaccinations(petId),
    portalApi.pets.prescriptions(petId),
  ])

  return {
    pet: unwrapPortalResult(detail),
    history: Array.isArray(unwrapPortalResult(history)) ? unwrapPortalResult(history) : [],
    vaccinations: Array.isArray(unwrapPortalResult(vaccinations)) ? unwrapPortalResult(vaccinations) : [],
    prescriptions: Array.isArray(unwrapPortalResult(prescriptions)) ? unwrapPortalResult(prescriptions) : [],
  }
}

export async function loginPortalOwner(form) {
  return unwrapPortalResult(await portalApi.login({
    email: form.email,
    password: form.password,
  }))
}

export async function registerPortalOwner(form) {
  return unwrapPortalResult(await portalApi.register({
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    phone: form.phone,
    password: form.password,
  }))
}

export async function requestPortalPasswordReset(email) {
  return unwrapPortalResult(await portalApi.forgotPassword({ email }))
}

export async function createPortalAppointment(form) {
  return unwrapPortalResult(await portalApi.appointments.create({
    patientId: Number(form.patientId),
    appointmentDate: form.appointmentDate,
    reason: form.reason,
    notes: form.notes,
    branchId: form.branchId || null,
  }))
}

export async function cancelPortalAppointment(appointmentId) {
  return portalApi.appointments.cancel(appointmentId, 'Cancelado desde el portal del dueño')
}

export async function createPortalPayment(invoiceId) {
  return unwrapPortalResult(await portalApi.invoices.pay(invoiceId))
}

export async function markPortalNotificationAsRead(notificationId) {
  return portalApi.notifications.markRead(notificationId)
}

export async function savePortalProfile(form) {
  return portalApi.updateMe({
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    address: form.address,
    city: form.city,
  })
}

export async function updatePortalPassword(form) {
  return portalApi.changePassword({
    currentPassword: form.currentPassword,
    newPassword: form.newPassword,
  })
}

export async function registerPortalFcmDevice(form) {
  return portalApi.fcm.register({
    token: form.token,
    platform: form.platform,
    deviceName: form.deviceName,
  })
}

export function clearPortalViewSessionState(state) {
  portalApi.clearSession()
  state.session.value = portalApi.getSession()
  state.owner.value = null
  state.profile.value = null
  state.pets.value = []
  state.appointments.value = []
  state.invoices.value = []
  state.notifications.value = []
  state.telemedicine.value = []
  state.selectedPet.value = null
  state.petHistory.value = []
  state.petVaccinations.value = []
  state.petPrescriptions.value = []
  state.notice.value = ''
  state.errorMessage.value = ''
}
