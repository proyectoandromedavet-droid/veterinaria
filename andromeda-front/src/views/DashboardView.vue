<template>
  <div class="dashboard" aria-live="polite">
    <div class="welcome">
      <div>
        <h2 class="welcome__title">{{ t('dashboard.greeting') }}, {{ firstName }} 👋</h2>
        <p class="welcome__sub">{{ today }}</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div v-for="kpi in kpis" :key="kpi.label" class="kpi-card" :style="{ '--accent': kpi.color }">
        <div class="kpi-card__icon" aria-hidden="true">{{ kpi.icon }}</div>
        <div class="kpi-card__body">
          <span class="kpi-card__value">{{ kpi.value }}</span>
          <span class="kpi-card__label">{{ kpi.label }}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section__head">
        <h3>{{ t('dashboard.todayAppointments') }}</h3>
        <RouterLink to="/turnos" class="section__link" :aria-label="t('dashboard.todayAppointments')">
          {{ t('common.viewAll') }} →
        </RouterLink>
      </div>
      <div v-if="loadingAppts" class="loading-placeholder" role="status" :aria-label="t('dashboard.loadingAppointments')">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="todayAppointments.length === 0" class="empty-state">
        <span aria-hidden="true">📅</span> {{ t('dashboard.noAppointments') }}
      </div>
      <div v-else class="appt-list">
        <div
          v-for="appt in todayAppointments"
          :key="appt.id"
          class="appt-row"
          tabindex="0"
        >
          <div class="appt-row__time">{{ formatTime(appt.scheduled_date) }}</div>
          <div class="appt-row__info">
            <span class="appt-row__patient">{{ appt.patient_name }}</span>
            <span class="appt-row__reason">{{ appt.reason || appt.appointment_type }}</span>
          </div>
          <span class="appt-row__badge" :class="`status--${appt.status}`">
            {{ STATUS_LABELS[appt.status] || appt.status }}
          </span>
        </div>
      </div>
    </div>

    <div class="section">
      <h3 class="section__head">{{ t('dashboard.quickAccess') }}</h3>
      <div class="quick-grid">
        <RouterLink
          v-for="item in auth.allowedMenu.slice(1, 7)"
          :key="item.key"
          :to="item.to"
          class="quick-card"
          :aria-label="item.label"
        >
          <span class="quick-card__icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="quick-card__label">{{ item.label }}</span>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import http from '../api/client'
import { t } from '../i18n'
import { useAuthStore } from '../stores/auth'

type AppointmentStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

type AppointmentRow = {
  id: number | string
  scheduled_date?: string
  patient_name?: string
  reason?: string
  appointment_type?: string
  status: AppointmentStatus | string
}

type KpiCard = {
  label: string
  icon: string
  value: string | number
  color: string
}

const auth = useAuthStore()

const firstName = computed(() => {
  const user = auth.user
  const name = user?.name || user?.email?.split('@')[0] || 'Usuario'
  return String(name).split(' ')[0]
})

const today = computed(() => new Date().toLocaleDateString('es-AR', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}))

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  confirmed: 'Confirmado',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
  no_show: 'Ausente',
}

const kpis = ref<KpiCard[]>([
  { label: t('dashboard.kpiAppointments'), icon: '📅', value: '—', color: 'var(--primary)' },
  { label: t('dashboard.kpiPatients'), icon: '🐾', value: '—', color: 'var(--accent-blue)' },
  { label: t('dashboard.kpiPending'), icon: '⏳', value: '—', color: 'var(--accent-yellow)' },
  { label: t('dashboard.kpiCompleted'), icon: '✅', value: '—', color: 'var(--accent-mint)' },
])

const todayAppointments = ref<AppointmentRow[]>([])
const loadingAppts = ref(true)

function formatTime(dt?: string) {
  if (!dt) return '—'
  return new Date(dt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  try {
    const currentDay = new Date().toISOString().split('T')[0]
    const { data } = await http.get('/appointments', {
      params: { date: currentDay, limit: 20 },
    })
    const list = (data.data || data.appointments || data || []) as AppointmentRow[]
    todayAppointments.value = list
    kpis.value[0].value = list.length
    kpis.value[2].value = list.filter((item) => item.status === 'scheduled' || item.status === 'confirmed').length
    kpis.value[3].value = list.filter((item) => item.status === 'completed').length
  } catch {
    todayAppointments.value = []
  } finally {
    loadingAppts.value = false
  }

  try {
    const { data } = await http.get('/patients', { params: { limit: 1 } })
    kpis.value[1].value = data.total ?? data.pagination?.total ?? '—'
  } catch {
    kpis.value[1].value = '—'
  }
})
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 28px; }
.welcome { display: flex; align-items: center; justify-content: space-between; }
.welcome__title { font-size: 1.4rem; font-weight: 700; color: var(--text); }
.welcome__sub { font-size: 0.85rem; color: var(--text-3); margin-top: 2px; text-transform: capitalize; }

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.kpi-card {
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: var(--shadow-sm);
  border-top: 3px solid var(--accent);
  transition: box-shadow var(--transition), transform var(--transition);
}

.kpi-card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
.kpi-card__icon { font-size: 1.8rem; }
.kpi-card__value { display: block; font-size: 1.6rem; font-weight: 700; color: var(--text); line-height: 1; }
.kpi-card__label { display: block; font-size: 0.78rem; color: var(--text-3); margin-top: 4px; }

.section { background: var(--white); border-radius: var(--radius-lg); padding: 22px; box-shadow: var(--shadow-sm); }
.section__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.section__head h3 { font-size: 1rem; font-weight: 600; color: var(--text); }
.section__link { font-size: 0.82rem; color: var(--primary); }

.appt-list { display: flex; flex-direction: column; gap: 8px; }
.appt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg);
  transition: background var(--transition);
  outline: none;
}

.appt-row:hover,
.appt-row:focus-visible { background: var(--primary-xlight); }
.appt-row__time { font-size: 0.85rem; font-weight: 600; color: var(--primary); min-width: 50px; }
.appt-row__info { flex: 1; min-width: 0; }
.appt-row__patient { display: block; font-size: 0.9rem; font-weight: 600; color: var(--text); }
.appt-row__reason { display: block; font-size: 0.78rem; color: var(--text-3); }

.appt-row__badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 20px;
  white-space: nowrap;
}

.status--scheduled { background: #EBF5FF; color: #2980b9; }
.status--confirmed { background: #EAF5EA; color: #27ae60; }
.status--in_progress { background: #FFF8E7; color: #d68910; }
.status--completed { background: #EAFAF1; color: #1e8449; }
.status--cancelled { background: var(--danger-light); color: #c0392b; }
.status--no_show { background: var(--surface-2); color: var(--text-3); }

.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.quick-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border-radius: var(--radius);
  background: var(--bg);
  text-decoration: none;
  color: var(--text-2);
  font-size: 0.8rem;
  font-weight: 500;
  text-align: center;
  transition: background var(--transition), color var(--transition), transform var(--transition);
}

.quick-card:hover,
.quick-card:focus-visible {
  background: var(--primary-xlight);
  color: var(--primary);
  transform: translateY(-2px);
}

.quick-card__icon { font-size: 1.6rem; }
.loading-placeholder { color: var(--text-3); font-size: 0.9rem; text-align: center; padding: 20px; }
.empty-state {
  text-align: center;
  padding: 28px;
  color: var(--text-3);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
</style>
