<template>
  <div class="portal-shell">
    <section class="portal-hero">
      <div class="portal-hero__copy">
        <p class="eyebrow">Portal de duenos</p>
        <h1>Gestiona mascotas, turnos y pagos desde una sola sesion</h1>
        <p class="hero-copy">
          Interfaz operativa del duenio de mascota con login propio, historial de animales,
          turnos, facturas, notificaciones y telemedicina.
        </p>
        <div class="hero-chips">
          <span>Sesion propia</span>
          <span>Mascotas</span>
          <span>Turnos</span>
          <span>Facturas</span>
          <span>Notificaciones</span>
        </div>
      </div>

      <div class="portal-hero__status card">
        <template v-if="isAuthenticated">
          <div class="status-pill status-pill--ok">Sesion activa</div>
          <h2>{{ ownerLabel }}</h2>
          <p>{{ sessionSummary }}</p>
          <div class="status-grid">
            <div>
              <strong>{{ pets.length }}</strong>
              <span>Mascotas</span>
            </div>
            <div>
              <strong>{{ appointments.length }}</strong>
              <span>Turnos</span>
            </div>
            <div>
              <strong>{{ invoices.length }}</strong>
              <span>Facturas</span>
            </div>
            <div>
              <strong>{{ unreadNotifications }}</strong>
              <span>Sin leer</span>
            </div>
          </div>
          <button class="ghost-button" @click="refreshAll" :disabled="loading">
            {{ loading ? 'Actualizando...' : 'Actualizar' }}
          </button>
        </template>

        <template v-else>
          <div class="status-pill">Acceso del duenio</div>
          <h2>Ingresa o crea tu cuenta</h2>
          <p>Usa este portal para gestionar la experiencia del cliente sin depender del panel interno.</p>
          <div class="status-grid">
            <div>
              <strong>1</strong>
              <span>Login</span>
            </div>
            <div>
              <strong>2</strong>
              <span>Mascotas</span>
            </div>
            <div>
              <strong>3</strong>
              <span>Turnos</span>
            </div>
            <div>
              <strong>4</strong>
              <span>Pagos</span>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section v-if="notice" class="notice notice--success">
      {{ notice }}
    </section>
    <section v-if="errorMessage" class="notice notice--error">
      {{ errorMessage }}
    </section>

    <section v-if="!isAuthenticated" class="auth-grid">
      <div class="card auth-card">
        <div class="tab-row">
          <button
            v-for="tab in authTabs"
            :key="tab.key"
            :class="['tab-button', { 'tab-button--active': authMode === tab.key }]"
            @click="authMode = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <form v-if="authMode === 'login'" class="form-grid" @submit.prevent="handleLogin">
          <label>
            <span>Email</span>
            <input v-model.trim="loginForm.email" type="email" autocomplete="email" required />
          </label>
          <label>
            <span>Contrasena</span>
            <input v-model="loginForm.password" type="password" autocomplete="current-password" required />
          </label>
          <button class="primary-button" type="submit" :disabled="authBusy">
            {{ authBusy ? 'Ingresando...' : 'Entrar al portal' }}
          </button>
        </form>

        <form v-else-if="authMode === 'register'" class="form-grid" @submit.prevent="handleRegister">
          <div class="two-cols">
            <label>
              <span>Nombre</span>
              <input v-model.trim="registerForm.firstName" type="text" autocomplete="given-name" required />
            </label>
            <label>
              <span>Apellido</span>
              <input v-model.trim="registerForm.lastName" type="text" autocomplete="family-name" required />
            </label>
          </div>
          <label>
            <span>Email</span>
            <input v-model.trim="registerForm.email" type="email" autocomplete="email" required />
          </label>
          <label>
            <span>Telefono</span>
            <input v-model.trim="registerForm.phone" type="tel" autocomplete="tel" />
          </label>
          <label>
            <span>Contrasena</span>
            <input v-model="registerForm.password" type="password" autocomplete="new-password" required />
          </label>
          <button class="primary-button" type="submit" :disabled="authBusy">
            {{ authBusy ? 'Creando cuenta...' : 'Crear cuenta' }}
          </button>
        </form>

        <form v-else class="form-grid" @submit.prevent="handleForgotPassword">
          <label>
            <span>Email</span>
            <input v-model.trim="forgotForm.email" type="email" autocomplete="email" required />
          </label>
          <button class="primary-button" type="submit" :disabled="authBusy">
            {{ authBusy ? 'Enviando...' : 'Solicitar recuperacion' }}
          </button>
        </form>
      </div>

      <div class="card info-card">
        <h3>Que puede hacer el duenio</h3>
        <ul class="bullet-list">
          <li>Ver mascotas, fichas resumidas e historial medico firmado.</li>
          <li>Solicitar, cancelar y seguir turnos desde la misma sesion.</li>
          <li>Revisar facturas y generar pagos con MercadoPago.</li>
          <li>Ver notificaciones y sesiones de telemedicina.</li>
          <li>Registrar FCM para recibir push en el dispositivo.</li>
        </ul>
      </div>
    </section>

    <section v-else class="dashboard-grid">
      <div class="card profile-banner">
        <div>
          <p class="eyebrow">Bienvenido</p>
          <h2>{{ ownerLabel }}</h2>
          <p class="banner-copy">
            {{ profileSummary }}
          </p>
        </div>
        <div class="banner-actions">
          <button class="ghost-button" @click="refreshAll" :disabled="loading">
            {{ loading ? 'Actualizando...' : 'Sincronizar portal' }}
          </button>
          <button class="danger-button" @click="handleLogout">Cerrar sesion</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="card stat-card">
          <span>Mascotas</span>
          <strong>{{ pets.length }}</strong>
          <small>Activas y asociadas a la cuenta</small>
        </div>
        <div class="card stat-card">
          <span>Turnos</span>
          <strong>{{ appointments.length }}</strong>
          <small>Solicitudes y citas recientes</small>
        </div>
        <div class="card stat-card">
          <span>Facturas</span>
          <strong>{{ invoices.length }}</strong>
          <small>Documentos y saldos pendientes</small>
        </div>
        <div class="card stat-card">
          <span>Telemedicina</span>
          <strong>{{ telemedicine.length }}</strong>
          <small>Sesiones y enlaces disponibles</small>
        </div>
      </div>

      <div class="content-grid">
        <section class="card">
          <div class="section-head">
            <h3>Mascotas</h3>
            <span class="section-hint">Selecciona una mascota para ver su historial.</span>
          </div>

          <div class="pet-grid">
            <button
              v-for="pet in pets"
              :key="pet.id"
              class="pet-card"
              :class="{ 'pet-card--active': selectedPet?.id === pet.id }"
              @click="selectPet(pet)"
            >
              <div class="pet-card__top">
                <strong>{{ pet.name }}</strong>
                <span>{{ pet.species || 'Mascota' }}</span>
              </div>
              <p>{{ pet.breed || 'Sin raza registrada' }}</p>
              <small>{{ pet.microchip_number || 'Sin microchip' }}</small>
            </button>
          </div>

          <div v-if="selectedPet" class="selected-pet">
            <div class="section-head">
              <h4>{{ selectedPet.name }}</h4>
              <span>{{ selectedPet.species }} {{ selectedPet.breed ? `- ${selectedPet.breed}` : '' }}</span>
            </div>

            <div class="detail-grid">
              <div>
                <span>Fecha de nacimiento</span>
                <strong>{{ formatDate(selectedPet.birth_date) }}</strong>
              </div>
              <div>
                <span>Sexo</span>
                <strong>{{ selectedPet.sex || 'Sin dato' }}</strong>
              </div>
              <div>
                <span>Color</span>
                <strong>{{ selectedPet.color || 'Sin dato' }}</strong>
              </div>
              <div>
                <span>Microchip</span>
                <strong>{{ selectedPet.microchip_number || 'Sin dato' }}</strong>
              </div>
            </div>

            <div class="subgrid">
              <div>
                <h5>Historia medica</h5>
                <div v-if="petHistory.length" class="mini-list">
                  <article v-for="row in petHistory" :key="row.id">
                    <strong>{{ formatDate(row.visit_date) }}</strong>
                    <p>{{ row.reason_for_visit || row.chief_complaint || 'Sin detalle' }}</p>
                    <small>{{ row.vet_name || 'Equipo medico' }}</small>
                  </article>
                </div>
                <p v-else class="empty-state">No hay historia disponible.</p>
              </div>

              <div>
                <h5>Vacunaciones</h5>
                <div v-if="petVaccinations.length" class="mini-list">
                  <article v-for="row in petVaccinations" :key="row.id">
                    <strong>{{ row.vaccine_name }}</strong>
                    <p>{{ formatDate(row.administered_date) }} - {{ row.applied_by || 'Sin profesional' }}</p>
                    <small>Proxima: {{ formatDate(row.next_due_date) }}</small>
                  </article>
                </div>
                <p v-else class="empty-state">No hay vacunaciones cargadas.</p>
              </div>

              <div>
                <h5>Prescripciones</h5>
                <div v-if="petPrescriptions.length" class="mini-list">
                  <article v-for="row in petPrescriptions" :key="row.id">
                    <strong>{{ row.medication_name || 'Receta' }}</strong>
                    <p>{{ row.instructions || 'Sin instrucciones' }}</p>
                    <small>{{ row.prescribed_by || 'Sin profesional' }}</small>
                  </article>
                </div>
                <p v-else class="empty-state">No hay prescripciones cargadas.</p>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <h3>Solicitar turno</h3>
            <span class="section-hint">Crealo para la mascota seleccionada.</span>
          </div>

          <form class="form-grid" @submit.prevent="createAppointment">
            <label>
              <span>Mascota</span>
              <select v-model="appointmentForm.patientId" required>
                <option value="" disabled>Selecciona una mascota</option>
                <option v-for="pet in pets" :key="pet.id" :value="pet.id">{{ pet.name }}</option>
              </select>
            </label>
            <div class="two-cols">
              <label>
                <span>Fecha y hora</span>
                <input v-model="appointmentForm.appointmentDate" type="datetime-local" required />
              </label>
              <label>
                <span>Sucursal</span>
                <input v-model.trim="appointmentForm.branchId" type="text" placeholder="Opcional" />
              </label>
            </div>
            <label>
              <span>Motivo</span>
              <input v-model.trim="appointmentForm.reason" type="text" required />
            </label>
            <label>
              <span>Notas</span>
              <textarea v-model.trim="appointmentForm.notes" rows="3" placeholder="Opcional"></textarea>
            </label>
            <button class="primary-button" type="submit" :disabled="portalBusy === 'appointment'">
              {{ portalBusy === 'appointment' ? 'Enviando...' : 'Solicitar turno' }}
            </button>
          </form>

          <div class="list-block">
            <article v-for="item in appointments" :key="item.id" class="list-item">
              <div>
                <strong>{{ item.patient_name }}</strong>
                <p>{{ formatDateTime(item.appointment_date) }} - {{ item.clinic_name || 'Clinica' }}</p>
              </div>
              <div class="list-item__right">
                <span class="status-pill" :class="statusClass(item.status)">{{ item.status }}</span>
                <button
                  v-if="['requested', 'confirmed'].includes(item.status)"
                  class="ghost-button"
                  @click="cancelAppointment(item)"
                >
                  Cancelar
                </button>
              </div>
            </article>
            <p v-if="!appointments.length" class="empty-state">No hay turnos registrados.</p>
          </div>
        </section>
      </div>

      <div class="content-grid content-grid--wide">
        <section class="card">
          <div class="section-head">
            <h3>Facturas</h3>
            <span class="section-hint">Consulta el saldo y genera pago.</span>
          </div>

          <div class="list-block">
            <article v-for="invoice in invoices" :key="invoice.id" class="invoice-row">
              <div>
                <strong>{{ invoice.invoice_number }}</strong>
                <p>{{ invoice.patient_name || 'Mascota no asociada' }} - {{ invoice.clinic_name }}</p>
                <small>{{ formatDate(invoice.issued_date) }} - Vence {{ formatDate(invoice.due_date) }}</small>
              </div>
              <div class="invoice-row__right">
                <span>{{ formatMoney(invoice.total_amount - (invoice.paid_amount || 0), invoice.currency) }}</span>
                <button class="primary-button primary-button--soft" @click="payInvoice(invoice)">
                  Pagar
                </button>
                <a
                  v-if="invoicePaymentLinks[invoice.id]"
                  class="ghost-button"
                  :href="invoicePaymentLinks[invoice.id]"
                  target="_blank"
                  rel="noopener"
                >
                  Abrir pago
                </a>
              </div>
            </article>
            <p v-if="!invoices.length" class="empty-state">No hay facturas registradas.</p>
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <h3>Notificaciones</h3>
            <span class="section-hint">Marca como leidas las que ya revisaste.</span>
          </div>

          <div class="list-block">
            <article v-for="note in notifications" :key="note.id" class="list-item">
              <div>
                <strong>{{ note.title || note.notification_type || 'Notificacion' }}</strong>
                <p>{{ note.message }}</p>
                <small>{{ formatDateTime(note.sent_at) }}</small>
              </div>
              <button
                v-if="!note.read_at"
                class="ghost-button"
                @click="markNotification(note)"
              >
                Marcar leida
              </button>
              <span v-else class="status-pill">Leida</span>
            </article>
            <p v-if="!notifications.length" class="empty-state">No hay notificaciones.</p>
          </div>
        </section>
      </div>

      <div class="content-grid content-grid--wide">
        <section class="card">
          <div class="section-head">
            <h3>Telemedicina</h3>
            <span class="section-hint">Sesiones disponibles para consulta remota.</span>
          </div>

          <div class="list-block">
            <article v-for="session in telemedicine" :key="session.id" class="list-item">
              <div>
                <strong>{{ session.patient_name }}</strong>
                <p>{{ formatDateTime(session.session_date) }} - {{ session.vet_name || 'Profesional' }}</p>
                <small>{{ session.status }} - {{ session.session_type || 'telemedicina' }}</small>
              </div>
              <a v-if="session.meeting_url" class="ghost-button" :href="session.meeting_url" target="_blank" rel="noopener">
                Abrir sala
              </a>
            </article>
            <p v-if="!telemedicine.length" class="empty-state">No hay sesiones de telemedicina.</p>
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <h3>Mi perfil</h3>
            <span class="section-hint">Actualiza tus datos y la clave de acceso.</span>
          </div>

          <form class="form-grid" @submit.prevent="saveProfile">
            <div class="two-cols">
              <label>
                <span>Nombre</span>
                <input v-model.trim="profileForm.firstName" type="text" required />
              </label>
              <label>
                <span>Apellido</span>
                <input v-model.trim="profileForm.lastName" type="text" required />
              </label>
            </div>
            <div class="two-cols">
              <label>
                <span>Telefono</span>
                <input v-model.trim="profileForm.phone" type="tel" />
              </label>
              <label>
                <span>Ciudad</span>
                <input v-model.trim="profileForm.city" type="text" />
              </label>
            </div>
            <label>
              <span>Direccion</span>
              <input v-model.trim="profileForm.address" type="text" />
            </label>
            <button class="primary-button" type="submit" :disabled="portalBusy === 'profile'">
              {{ portalBusy === 'profile' ? 'Guardando...' : 'Guardar perfil' }}
            </button>
          </form>

          <form class="form-grid form-grid--spaced" @submit.prevent="changePassword">
            <h4>Cambiar contrasena</h4>
            <label>
              <span>Contrasena actual</span>
              <input v-model="passwordForm.currentPassword" type="password" required />
            </label>
            <label>
              <span>Nueva contrasena</span>
              <input v-model="passwordForm.newPassword" type="password" required />
            </label>
            <button class="primary-button primary-button--soft" type="submit" :disabled="portalBusy === 'password'">
              {{ portalBusy === 'password' ? 'Actualizando...' : 'Actualizar contrasena' }}
            </button>
          </form>
        </section>
      </div>

      <section class="card">
        <div class="section-head">
          <h3>Push / FCM</h3>
          <span class="section-hint">Registra el token del navegador o del dispositivo.</span>
        </div>

        <form class="form-grid" @submit.prevent="registerFcm">
          <div class="two-cols">
            <label>
              <span>Token</span>
              <input v-model.trim="fcmForm.token" type="text" required />
            </label>
            <label>
              <span>Plataforma</span>
              <select v-model="fcmForm.platform">
                <option value="web">Web</option>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
              </select>
            </label>
          </div>
          <label>
            <span>Nombre del dispositivo</span>
            <input v-model.trim="fcmForm.deviceName" type="text" placeholder="Ej: Chrome en notebook" />
          </label>
          <button class="primary-button" type="submit" :disabled="portalBusy === 'fcm'">
            {{ portalBusy === 'fcm' ? 'Registrando...' : 'Registrar push' }}
          </button>
        </form>
      </section>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { portalApi } from '../api/portal'
import {
  authTabs,
  cancelPortalAppointment,
  clearPortalViewSessionState,
  createPortalAppointment,
  createPortalPayment,
  extractPortalError,
  formatPortalDate,
  formatPortalDateTime,
  formatPortalMoney,
  loadPortalDashboard,
  loadPortalPetBundle,
  loginPortalOwner,
  logPortalViewError,
  markPortalNotificationAsRead,
  ownerLabelFrom,
  portalStatusClass,
  profileSummaryFrom,
  registerPortalFcmDevice,
  registerPortalOwner,
  requestPortalPasswordReset,
  savePortalProfile,
  sessionSummaryFrom,
  updatePortalPassword,
} from '../composables/portal/usePortalDomain'

const authMode = ref('login')
const authBusy = ref(false)
const loading = ref(false)
const portalBusy = ref('')
const notice = ref('')
const errorMessage = ref('')

const session = ref(portalApi.getSession())
const owner = ref(session.value.owner || null)
const profile = ref(null)

const pets = ref([])
const appointments = ref([])
const invoices = ref([])
const notifications = ref([])
const telemedicine = ref([])
const selectedPet = ref(null)
const petHistory = ref([])
const petVaccinations = ref([])
const petPrescriptions = ref([])
const invoicePaymentLinks = reactive({})

const loginForm = reactive({
  email: '',
  password: '',
})

const registerForm = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
})

const forgotForm = reactive({
  email: '',
})

const appointmentForm = reactive({
  patientId: '',
  appointmentDate: '',
  branchId: '',
  reason: '',
  notes: '',
})

const profileForm = reactive({
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  city: '',
})

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
})

const fcmForm = reactive({
  token: '',
  platform: 'web',
  deviceName: '',
})

const isAuthenticated = computed(() => portalApi.hasSession())
const ownerLabel = computed(() => {
  const current = profile.value || owner.value || session.value.owner || {}
  const fullName = [current.first_name || current.firstName, current.last_name || current.lastName].filter(Boolean).join(' ').trim()
  return fullName || current.name || current.email || 'Dueño'
})
const sessionSummary = computed(() => {
  const current = profile.value || owner.value || session.value.owner || {}
  return [current.email, current.organization_id ? `Org ${current.organization_id}` : null].filter(Boolean).join(' · ')
})
const profileSummary = computed(() => {
  if (!profile.value) return 'Mantiene contacto, turnos, facturas y notificaciones sincronizadas.'
  const pieces = []
  if (profile.value.phone) pieces.push(profile.value.phone)
  if (profile.value.address) pieces.push(profile.value.address)
  if (profile.value.city) pieces.push(profile.value.city)
  return pieces.length ? pieces.join(' · ') : 'Mantiene contacto, turnos, facturas y notificaciones sincronizadas.'
})
const unreadNotifications = computed(() => notifications.value.filter((item) => !item.read_at).length)

function unwrapResult(result) {
  return result?.data?.data ?? result?.data ?? result
}

function resetMessage() {
  notice.value = ''
  errorMessage.value = ''
}

function showSuccess(message) {
  notice.value = message
  errorMessage.value = ''
}

function showError(error, fallback) {
  errorMessage.value = extractErrorMessage(error, fallback, { includeRequestId: true })
  notice.value = ''
  logError('portal.view', error)
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date)
}

function formatDateTime(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatMoney(amount, currency = 'ARS') {
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

function statusClass(status) {
  const value = String(status || '').toLowerCase()
  if (['confirmed', 'paid', 'completed', 'sent', 'read'].includes(value)) return 'status-pill--ok'
  if (['requested', 'pending', 'scheduled'].includes(value)) return 'status-pill--warn'
  if (['cancelled', 'rejected', 'failed', 'overdue'].includes(value)) return 'status-pill--bad'
  return ''
}

function syncSession(nextSession) {
  session.value = portalApi.setSession(nextSession)
  owner.value = session.value.owner || owner.value
}

async function loadDashboard() {
  if (!isAuthenticated.value) return
  loading.value = true
  resetMessage()
  try {
    const [meRes, petsRes, appointmentsRes, invoicesRes, notificationsRes, telemedicineRes] = await Promise.all([
      portalApi.me(),
      portalApi.pets.list(),
      portalApi.appointments.list({ upcoming: true, limit: 8 }),
      portalApi.invoices.list({ limit: 8 }),
      portalApi.notifications.list({ limit: 12 }),
      portalApi.telemedicine.list(),
    ])

    profile.value = unwrapResult(meRes)
    owner.value = { ...owner.value, ...profile.value }
    pets.value = Array.isArray(unwrapResult(petsRes)) ? unwrapResult(petsRes) : []
    appointments.value = Array.isArray(unwrapResult(appointmentsRes)) ? unwrapResult(appointmentsRes) : []
    invoices.value = Array.isArray(unwrapResult(invoicesRes)) ? unwrapResult(invoicesRes) : []
    notifications.value = Array.isArray(unwrapResult(notificationsRes)) ? unwrapResult(notificationsRes) : []
    telemedicine.value = Array.isArray(unwrapResult(telemedicineRes)) ? unwrapResult(telemedicineRes) : []

    if (pets.value.length) {
      await selectPet(pets.value[0], { quiet: true })
    } else {
      selectedPet.value = null
      petHistory.value = []
      petVaccinations.value = []
      petPrescriptions.value = []
    }

    if (profile.value) {
      profileForm.firstName = profile.value.first_name || profile.value.firstName || ''
      profileForm.lastName = profile.value.last_name || profile.value.lastName || ''
      profileForm.phone = profile.value.phone || ''
      profileForm.address = profile.value.address || ''
      profileForm.city = profile.value.city || ''
    }
    if (appointmentForm.patientId || pets.value[0]) {
      appointmentForm.patientId = appointmentForm.patientId || pets.value[0]?.id || ''
    }
  } catch (error) {
    showError(error, 'No se pudo cargar el portal')
  } finally {
    loading.value = false
  }
}

async function selectPet(pet, { quiet = false } = {}) {
  const candidate = pet && pet.id ? pet : pets.value.find((item) => item.id === pet)
  if (!candidate) return
  selectedPet.value = candidate
  appointmentForm.patientId = candidate.id
  if (!quiet) resetMessage()
  portalBusy.value = 'pet'
  try {
    const [detail, history, vaccinations, prescriptions] = await Promise.all([
      portalApi.pets.get(candidate.id),
      portalApi.pets.medicalHistory(candidate.id),
      portalApi.pets.vaccinations(candidate.id),
      portalApi.pets.prescriptions(candidate.id),
    ])
    const petDetail = unwrapResult(detail)
    selectedPet.value = petDetail || candidate
    petHistory.value = Array.isArray(unwrapResult(history)) ? unwrapResult(history) : []
    petVaccinations.value = Array.isArray(unwrapResult(vaccinations)) ? unwrapResult(vaccinations) : []
    petPrescriptions.value = Array.isArray(unwrapResult(prescriptions)) ? unwrapResult(prescriptions) : []
  } catch (error) {
    if (!quiet) showError(error, 'No se pudo cargar la mascota')
  } finally {
    portalBusy.value = ''
  }
}

async function handleLogin() {
  authBusy.value = true
  resetMessage()
  try {
    const payload = unwrapResult(await portalApi.login({
      email: loginForm.email,
      password: loginForm.password,
    }))
    syncSession({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      owner: payload.owner || null,
    })
    await loadDashboard()
    showSuccess('Sesion iniciada correctamente')
  } catch (error) {
    showError(error, 'No se pudo iniciar sesion')
  } finally {
    authBusy.value = false
  }
}

async function handleRegister() {
  authBusy.value = true
  resetMessage()
  try {
    const payload = unwrapResult(await portalApi.register({
      firstName: registerForm.firstName,
      lastName: registerForm.lastName,
      email: registerForm.email,
      phone: registerForm.phone,
      password: registerForm.password,
    }))
    syncSession({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      owner: { firstName: registerForm.firstName, lastName: registerForm.lastName, email: registerForm.email },
    })
    await loadDashboard()
    showSuccess('Cuenta creada y sesion iniciada')
  } catch (error) {
    showError(error, 'No se pudo crear la cuenta')
  } finally {
    authBusy.value = false
  }
}

async function handleForgotPassword() {
  authBusy.value = true
  resetMessage()
  try {
    const payload = unwrapResult(await portalApi.forgotPassword({ email: forgotForm.email }))
    showSuccess(payload?.message || 'Si el email existe, recibira un enlace de recuperacion')
  } catch (error) {
    showError(error, 'No se pudo enviar la recuperacion')
  } finally {
    authBusy.value = false
  }
}

async function createAppointment() {
  if (!appointmentForm.patientId) {
    errorMessage.value = 'Selecciona una mascota antes de solicitar un turno'
    return
  }

  portalBusy.value = 'appointment'
  resetMessage()
  try {
    const payload = unwrapResult(await portalApi.appointments.create({
      patientId: Number(appointmentForm.patientId),
      appointmentDate: appointmentForm.appointmentDate,
      reason: appointmentForm.reason,
      notes: appointmentForm.notes,
      branchId: appointmentForm.branchId || null,
    }))
    showSuccess(payload?.message || 'Solicitud de turno enviada')
    appointmentForm.reason = ''
    appointmentForm.notes = ''
    await loadDashboard()
  } catch (error) {
    showError(error, 'No se pudo solicitar el turno')
  } finally {
    portalBusy.value = ''
  }
}

async function cancelAppointment(item) {
  portalBusy.value = `cancel-${item.id}`
  resetMessage()
  try {
    await portalApi.appointments.cancel(item.id, 'Cancelado desde el portal del duenio')
    showSuccess('Turno cancelado')
    await loadDashboard()
  } catch (error) {
    showError(error, 'No se pudo cancelar el turno')
  } finally {
    portalBusy.value = ''
  }
}

async function payInvoice(invoice) {
  portalBusy.value = `invoice-${invoice.id}`
  resetMessage()
  try {
    const payload = unwrapResult(await portalApi.invoices.pay(invoice.id))
    const link = payload?.init_point || payload?.sandbox_init_point || payload?.url || null
    if (link) {
      invoicePaymentLinks[invoice.id] = link
      showSuccess('Se genero el enlace de pago')
    } else {
      showSuccess('Pago solicitado')
    }
  } catch (error) {
    showError(error, 'No se pudo generar el pago')
  } finally {
    portalBusy.value = ''
  }
}

async function markNotification(note) {
  portalBusy.value = `notification-${note.id}`
  resetMessage()
  try {
    await portalApi.notifications.markRead(note.id)
    showSuccess('Notificacion marcada como leida')
    await loadDashboard()
  } catch (error) {
    showError(error, 'No se pudo actualizar la notificacion')
  } finally {
    portalBusy.value = ''
  }
}

async function saveProfile() {
  portalBusy.value = 'profile'
  resetMessage()
  try {
    await portalApi.updateMe({
      firstName: profileForm.firstName,
      lastName: profileForm.lastName,
      phone: profileForm.phone,
      address: profileForm.address,
      city: profileForm.city,
    })
    showSuccess('Perfil actualizado')
    await loadDashboard()
  } catch (error) {
    showError(error, 'No se pudo guardar el perfil')
  } finally {
    portalBusy.value = ''
  }
}

async function changePassword() {
  portalBusy.value = 'password'
  resetMessage()
  try {
    await portalApi.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    showSuccess('Contrasena actualizada')
  } catch (error) {
    showError(error, 'No se pudo actualizar la contrasena')
  } finally {
    portalBusy.value = ''
  }
}

async function registerFcm() {
  portalBusy.value = 'fcm'
  resetMessage()
  try {
    await portalApi.fcm.register({
      token: fcmForm.token,
      platform: fcmForm.platform,
      deviceName: fcmForm.deviceName,
    })
    fcmForm.token = ''
    fcmForm.deviceName = ''
    showSuccess('Dispositivo registrado para push')
  } catch (error) {
    showError(error, 'No se pudo registrar el dispositivo')
  } finally {
    portalBusy.value = ''
  }
}

function handleLogout() {
  portalApi.clearSession()
  session.value = portalApi.getSession()
  owner.value = null
  profile.value = null
  pets.value = []
  appointments.value = []
  invoices.value = []
  notifications.value = []
  telemedicine.value = []
  selectedPet.value = null
  petHistory.value = []
  petVaccinations.value = []
  petPrescriptions.value = []
  notice.value = ''
  errorMessage.value = ''
}

async function refreshAll() {
  if (!isAuthenticated.value) return
  loading.value = true
  resetMessage()
  try {
    await portalApi.refresh()
    await loadDashboard()
    showSuccess('Portal sincronizado')
  } catch (error) {
    showError(error, 'No se pudo refrescar la sesion')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (isAuthenticated.value) {
    await loadDashboard()
  }
})
</script>

<style scoped>
.portal-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100%;
  background:
    radial-gradient(circle at top left, rgba(26, 158, 127, 0.12), transparent 30%),
    radial-gradient(circle at right 20%, rgba(255, 183, 3, 0.08), transparent 26%),
    var(--bg);
}

.portal-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.9fr);
  gap: 18px;
}

.portal-hero__copy,
.portal-hero__status,
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  background: var(--surface);
}

.portal-hero__copy {
  padding: 28px;
  background: linear-gradient(135deg, #f8fcfb 0%, #edf7f1 100%);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.76rem;
  color: var(--text-3);
  margin-bottom: 10px;
}

.portal-hero h1 {
  font-size: clamp(1.9rem, 4vw, 3rem);
  line-height: 1.05;
  max-width: 14ch;
}

.hero-copy {
  margin-top: 14px;
  max-width: 64ch;
  color: var(--text-2);
  line-height: 1.65;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.hero-chips span,
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--primary-xlight);
  color: var(--primary);
  font-size: 0.82rem;
  font-weight: 700;
}

.status-pill--ok {
  background: rgba(6, 214, 160, 0.14);
  color: #0f8f6f;
}

.status-pill--warn {
  background: rgba(255, 183, 3, 0.14);
  color: #8c6100;
}

.status-pill--bad {
  background: rgba(239, 83, 80, 0.14);
  color: #b02825;
}

.portal-hero__status {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.portal-hero__status h2 {
  font-size: 1.4rem;
}

.portal-hero__status p {
  color: var(--text-2);
  line-height: 1.6;
}

.status-grid,
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.status-grid div,
.stat-card {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 12px;
}

.status-grid strong,
.stat-card strong {
  display: block;
  font-size: 1.15rem;
}

.status-grid span,
.stat-card span,
.stat-card small {
  color: var(--text-2);
  font-size: 0.82rem;
}

.ghost-button,
.primary-button,
.danger-button {
  border: none;
  border-radius: var(--radius);
  padding: 11px 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--transition), background var(--transition), color var(--transition), opacity var(--transition);
}

.ghost-button {
  background: var(--surface-2);
  color: var(--primary);
}

.primary-button {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
  color: var(--white);
}

.primary-button--soft {
  background: rgba(26, 158, 127, 0.12);
  color: var(--primary);
}

.danger-button {
  background: var(--danger-light);
  color: var(--danger);
}

.ghost-button:hover,
.primary-button:hover,
.danger-button:hover,
.tab-button:hover,
.pet-card:hover {
  transform: translateY(-1px);
}

.auth-grid,
.dashboard-grid {
  display: grid;
  gap: 18px;
}

.auth-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
}

.card {
  padding: 20px;
}

.auth-card,
.info-card,
.profile-banner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 9px 14px;
  background: var(--bg);
  color: var(--text-2);
  cursor: pointer;
  font-weight: 700;
}

.tab-button--active {
  background: var(--primary-xlight);
  color: var(--primary);
  border-color: rgba(26, 158, 127, 0.2);
}

.form-grid {
  display: grid;
  gap: 14px;
}

.form-grid--spaced {
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}

.two-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

label {
  display: grid;
  gap: 7px;
}

label span,
.section-hint {
  font-size: 0.82rem;
  color: var(--text-3);
}

input,
select,
textarea {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 11px 12px;
  background: var(--white);
  color: var(--text);
  outline: none;
}

input:focus,
select:focus,
textarea:focus {
  border-color: rgba(26, 158, 127, 0.55);
  box-shadow: 0 0 0 3px rgba(26, 158, 127, 0.1);
}

.bullet-list {
  padding-left: 18px;
  color: var(--text-2);
  line-height: 1.75;
}

.notice {
  padding: 14px 16px;
  border-radius: var(--radius);
  border: 1px solid transparent;
}

.notice--success {
  background: rgba(6, 214, 160, 0.12);
  border-color: rgba(6, 214, 160, 0.2);
  color: #0f8f6f;
}

.notice--error {
  background: rgba(239, 83, 80, 0.12);
  border-color: rgba(239, 83, 80, 0.2);
  color: #b02825;
}

.dashboard-grid {
  grid-template-columns: minmax(0, 1fr);
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.content-grid--wide {
  align-items: start;
}

.profile-banner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  background: linear-gradient(135deg, #f8fcfb 0%, #edf7f1 100%);
}

.banner-copy {
  margin-top: 8px;
  color: var(--text-2);
  line-height: 1.6;
}

.banner-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
}

.section-head h3,
.section-head h4 {
  color: var(--text);
}

.pet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.pet-card {
  display: grid;
  gap: 6px;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  background: var(--bg);
  cursor: pointer;
}

.pet-card--active {
  border-color: rgba(26, 158, 127, 0.4);
  background: rgba(26, 158, 127, 0.08);
}

.pet-card__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.pet-card__top span,
.pet-card small,
.mini-list p,
.list-item p,
.invoice-row p,
.empty-state {
  color: var(--text-2);
}

.selected-pet {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px dashed var(--border);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.detail-grid div,
.mini-list article {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--white);
}

.detail-grid span,
.mini-list small,
.invoice-row small,
.list-item small {
  display: block;
  color: var(--text-3);
  margin-bottom: 4px;
  font-size: 0.78rem;
}

.subgrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.subgrid h5 {
  margin-bottom: 10px;
}

.mini-list {
  display: grid;
  gap: 10px;
}

.list-block {
  display: grid;
  gap: 12px;
}

.list-item,
.invoice-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
}

.list-item__right,
.invoice-row__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.empty-state {
  padding: 10px 0 0;
}

@media (max-width: 1080px) {
  .portal-hero,
  .auth-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .status-grid,
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .portal-hero__copy,
  .portal-hero__status,
  .card {
    padding: 18px;
  }

  .profile-banner,
  .section-head,
  .list-item,
  .invoice-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .banner-actions,
  .list-item__right,
  .invoice-row__right {
    width: 100%;
    justify-content: flex-start;
  }

  .two-cols,
  .status-grid,
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
