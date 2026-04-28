<template>
  <div class="page">

    <div class="page-header">
      <div class="page-header__left">
        <span class="page-emoji">📊</span>
        <div>
          <h2 class="page-title">Reportes</h2>
          <p class="page-sub">Estadísticas y análisis del sistema</p>
        </div>
      </div>
      <button class="btn-primary" @click="exportReport()">⬇️ Exportar</button>
    </div>

    <!-- Período -->
    <div class="period-bar">
      <span class="period-label">Período:</span>
      <button
        v-for="p in PERIODS"
        :key="p.value"
        class="period-btn"
        :class="{ 'period-btn--active': period === p.value }"
        @click="setPeriod(p.value)"
      >{{ p.label }}</button>
      <div class="period-custom">
        <input v-model="dateFrom" type="date" class="filter-input" @change="load()" />
        <span>—</span>
        <input v-model="dateTo" type="date" class="filter-input" @change="load()" />
      </div>
    </div>

    <div v-if="loading" class="loading-state"><span class="spin spin--dark" /> Generando reporte…</div>
    <div v-else-if="error" class="alert alert--error">{{ error }}</div>

    <template v-else>

      <!-- KPIs principales -->
      <div class="kpi-grid">
        <div class="kpi-card" style="--bc:#D6F3EC;--tc:#1A9E7F;--ic:🐾">
          <div class="kpi-card__icon">🐾</div>
          <div>
            <strong>{{ data.totalPatients ?? '—' }}</strong>
            <span>Pacientes totales</span>
          </div>
        </div>
        <div class="kpi-card" style="--bc:#D6EEFF;--tc:#1A5FAA;--ic:📅">
          <div class="kpi-card__icon">📅</div>
          <div>
            <strong>{{ data.totalAppointments ?? '—' }}</strong>
            <span>Turnos en el período</span>
          </div>
        </div>
        <div class="kpi-card" style="--bc:#FFF3CC;--tc:#8A6200;--ic:💉">
          <div class="kpi-card__icon">💉</div>
          <div>
            <strong>{{ data.totalVaccinations ?? '—' }}</strong>
            <span>Vacunas aplicadas</span>
          </div>
        </div>
        <div class="kpi-card" style="--bc:#FFE4D6;--tc:#c0392b;--ic:✂️">
          <div class="kpi-card__icon">✂️</div>
          <div>
            <strong>{{ data.totalGrooming ?? '—' }}</strong>
            <span>Sesiones de grooming</span>
          </div>
        </div>
        <div class="kpi-card" style="--bc:#EEE0FF;--tc:#7A3DAA;--ic:💻">
          <div class="kpi-card__icon">💻</div>
          <div>
            <strong>{{ data.totalTelemedicine ?? '—' }}</strong>
            <span>Teleconsultas</span>
          </div>
        </div>
        <div class="kpi-card" style="--bc:#E0FFE8;--tc:#2E8B57;--ic:💰">
          <div class="kpi-card__icon">💰</div>
          <div>
            <strong>${{ formatMoney(data.totalRevenue) }}</strong>
            <span>Facturación total</span>
          </div>
        </div>
      </div>

      <!-- Distribución de turnos por estado -->
      <div class="section-grid">
        <div class="report-section">
          <h3 class="section-title">📅 Turnos por estado</h3>
          <div class="bar-chart">
            <div v-for="(count, status) in data.appointmentsByStatus" :key="status" class="bar-row">
              <span class="bar-label">{{ STATUS_LABELS[status] || status }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: barWidth(count, maxApptStatus) + '%', background: statusColor(status) }" />
              </div>
              <span class="bar-count">{{ count }}</span>
            </div>
          </div>
        </div>

        <!-- Distribución de pacientes por especie -->
        <div class="report-section">
          <h3 class="section-title">🐾 Pacientes por especie</h3>
          <div class="species-list">
            <div v-for="(count, species) in data.patientsBySpecies" :key="species" class="species-row">
              <span class="species-emoji">{{ petEmoji(species) }}</span>
              <span class="species-name">{{ speciesLabel(species) }}</span>
              <div class="species-bar-track">
                <div class="species-bar" :style="{ width: barWidth(count, maxSpecies) + '%' }" />
              </div>
              <span class="species-count">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Top diagnósticos -->
      <div class="report-section" v-if="data.topDiagnoses?.length">
        <h3 class="section-title">📋 Top diagnósticos del período</h3>
        <div class="top-list">
          <div v-for="(d, idx) in data.topDiagnoses" :key="idx" class="top-item">
            <span class="top-rank">{{ idx + 1 }}</span>
            <span class="top-name">{{ d.diagnosis }}</span>
            <div class="top-bar-track">
              <div class="top-bar" :style="{ width: barWidth(d.count, data.topDiagnoses[0]?.count) + '%' }" />
            </div>
            <span class="top-count">{{ d.count }} casos</span>
          </div>
        </div>
      </div>

      <!-- Top vacunas -->
      <div class="report-section" v-if="data.topVaccines?.length">
        <h3 class="section-title">💉 Vacunas más aplicadas</h3>
        <div class="vaccine-chips">
          <div v-for="(v, idx) in data.topVaccines" :key="idx" class="vaccine-chip">
            <span class="vaccine-rank">{{ idx + 1 }}°</span>
            <span class="vaccine-name">{{ v.vaccine_name }}</span>
            <span class="vaccine-count">{{ v.count }}</span>
          </div>
        </div>
      </div>

      <!-- Revenue por mes -->
      <div class="report-section" v-if="data.revenueByMonth?.length">
        <h3 class="section-title">💵 Ingresos por mes</h3>
        <div class="revenue-chart">
          <div v-for="m in data.revenueByMonth" :key="m.month" class="rev-col">
            <div class="rev-bar-wrap">
              <div class="rev-bar" :style="{ height: barWidth(m.total, maxRevenue) + '%' }" />
            </div>
            <span class="rev-label">${{ formatMoneyShort(m.total) }}</span>
            <span class="rev-month">{{ formatMonth(m.month) }}</span>
          </div>
        </div>
      </div>

      <!-- Placeholder si no hay datos -->
      <div v-if="!hasData" class="empty-state">
        <span class="empty-state__emoji">📊</span>
        <p>No hay datos disponibles para el período seleccionado</p>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import http from '../api/client'

const loading = ref(false)
const error   = ref('')
const period  = ref('month')
const dateFrom = ref('')
const dateTo   = ref('')

const data = ref({
  totalPatients: null,
  totalAppointments: null,
  totalVaccinations: null,
  totalGrooming: null,
  totalTelemedicine: null,
  totalRevenue: 0,
  appointmentsByStatus: {},
  patientsBySpecies: {},
  topDiagnoses: [],
  topVaccines: [],
  revenueByMonth: [],
})

const PERIODS = [
  { value: 'today',  label: 'Hoy' },
  { value: 'week',   label: 'Esta semana' },
  { value: 'month',  label: 'Este mes' },
  { value: 'year',   label: 'Este año' },
]

const STATUS_LABELS = {
  scheduled: 'Programados', confirmed: 'Confirmados',
  in_progress: 'En curso', completed: 'Completados',
  cancelled: 'Cancelados', no_show: 'Ausentes',
}

const maxApptStatus = computed(() => Math.max(1, ...Object.values(data.value.appointmentsByStatus || {})))
const maxSpecies    = computed(() => Math.max(1, ...Object.values(data.value.patientsBySpecies || {})))
const maxRevenue    = computed(() => Math.max(1, ...(data.value.revenueByMonth || []).map(m => m.total)))
const hasData       = computed(() => data.value.totalPatients !== null || Object.keys(data.value.appointmentsByStatus || {}).length > 0)

function barWidth(val, max) { return max ? Math.round((val / max) * 100) : 0 }

function petEmoji(s) {
  const m = { dog:'🐶', cat:'🐱', rabbit:'🐰', bird:'🐦', fish:'🐟', reptile:'🦎', hamster:'🐹' }
  return m[s] || '🐾'
}

function speciesLabel(s) {
  const m = { dog:'Perro', cat:'Gato', rabbit:'Conejo', bird:'Ave', fish:'Pez', reptile:'Reptil', hamster:'Hámster' }
  return m[s] || s
}

function statusColor(s) {
  const m = { scheduled:'#90D5F0', confirmed:'#06D6A0', in_progress:'#FFB703', completed:'#1A9E7F', cancelled:'#EF5350', no_show:'#C8E8DC' }
  return m[s] || 'var(--primary)'
}

function formatMoney(n) { return parseFloat(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }) }
function formatMoneyShort(n) {
  const v = parseFloat(n || 0)
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000)    return (v / 1000).toFixed(1) + 'K'
  return v.toFixed(0)
}

function formatMonth(m) {
  if (!m) return ''
  const d = new Date(m + '-01')
  return d.toLocaleDateString('es-AR', { month: 'short' })
}

function setPeriod(p) {
  period.value = p
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  if (p === 'today') {
    dateFrom.value = today; dateTo.value = today
  } else if (p === 'week') {
    const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1)
    dateFrom.value = mon.toISOString().split('T')[0]; dateTo.value = today
  } else if (p === 'month') {
    dateFrom.value = today.slice(0, 7) + '-01'; dateTo.value = today
  } else if (p === 'year') {
    dateFrom.value = today.slice(0, 4) + '-01-01'; dateTo.value = today
  }
  load()
}

async function load() {
  loading.value = true; error.value = ''
  const from = dateFrom.value
  const to   = dateTo.value
  try {
    // Fetch available reports in parallel; each call is independent
    const [appts, patients, revenue, apptReport] = await Promise.allSettled([
      http.get('/appointments', { params: { limit: 1 } }),
      http.get('/patients',     { params: { limit: 1 } }),
      http.get('/reports/revenue',      { params: { from, to } }),
      http.get('/reports/appointments', { params: { from, to } }),
    ])

    const apptMeta    = appts.status === 'fulfilled'    ? appts.value.data?.meta    : null
    const patientMeta = patients.status === 'fulfilled' ? patients.value.data?.meta : null
    const rev         = revenue.status === 'fulfilled'  ? (revenue.value.data?.data  || revenue.value.data || []) : []
    const apptData    = apptReport.status === 'fulfilled' ? (apptReport.value.data?.data || apptReport.value.data || {}) : {}

    // Revenue totals
    const totalRev = Array.isArray(rev)
      ? rev.reduce((s, r) => s + parseFloat(r.gross_revenue || r.total_amount || 0), 0)
      : 0

    data.value = {
      totalPatients:      patientMeta?.total ?? null,
      totalAppointments:  apptMeta?.total ?? null,
      totalVaccinations:  null,
      totalGrooming:      null,
      totalTelemedicine:  null,
      totalRevenue:       totalRev,
      appointmentsByStatus: {},
      patientsBySpecies:  {},
      topDiagnoses:       [],
      topVaccines:        [],
      revenueByMonth:     Array.isArray(rev)
        ? rev.slice(0, 12).map((row) => ({ month: row.period, total: row.gross_revenue || 0 }))
        : [],
    }

    if (apptData.summary) {
      data.value.appointmentsByStatus = {
        scheduled:   Number(apptData.summary.total_scheduled || 0),
        completed:   Number(apptData.summary.completed || 0),
        cancelled:   Number(apptData.summary.cancelled || 0),
        no_show:     Number(apptData.summary.no_show || 0),
        in_progress: Number(apptData.summary.in_progress || 0),
      }
    }
  } catch (e) {
    error.value = ''
  } finally { loading.value = false }
}

async function exportReport() {
  try {
    const payload = { format: 'csv' }
    if (dateFrom.value) payload.from = dateFrom.value
    if (dateTo.value)   payload.to   = dateTo.value
    const { data: blob } = await http.post('/reports/revenue/export', payload, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `reporte_${dateFrom.value || 'periodo'}.csv`
    a.click(); URL.revokeObjectURL(url)
  } catch {
    alert('La exportación no está disponible en este momento.')
  }
}

onMounted(() => setPeriod('month'))
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.page-header__left { display: flex; align-items: center; gap: 14px; }
.page-emoji { font-size: 2rem; }
.page-title { font-size: 1.35rem; font-weight: 700; color: var(--text); }
.page-sub   { font-size: 0.82rem; color: var(--text-2); margin-top: 2px; }

/* Período */
.period-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.period-label { font-size: 0.82rem; font-weight: 600; color: var(--text-2); }
.period-btn { padding: 6px 14px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--white); color: var(--text-2); font-size: 0.82rem; font-weight: 500; cursor: pointer; transition: all var(--transition); }
.period-btn:hover { background: var(--surface-2); }
.period-btn--active { background: var(--primary); color: white; border-color: var(--primary); }
.period-custom { display: flex; align-items: center; gap: 6px; margin-left: 8px; }

.filter-input { padding: 7px 11px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; background: var(--white); color: var(--text); outline: none; }
.filter-input:focus { border-color: var(--primary); }

/* KPIs */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.kpi-card { background: var(--bc); border-radius: var(--radius-lg); padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-card__icon { font-size: 1.8rem; }
.kpi-card strong { display: block; font-size: 1.4rem; font-weight: 700; color: var(--tc); line-height: 1; }
.kpi-card span   { font-size: 0.72rem; color: var(--tc); opacity: 0.75; margin-top: 4px; display: block; }

/* Sections */
.section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.report-section { background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); padding: 20px 22px; }
.section-title { font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 16px; }

/* Bar chart */
.bar-chart { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: grid; grid-template-columns: 100px 1fr 36px; align-items: center; gap: 10px; }
.bar-label { font-size: 0.78rem; color: var(--text-2); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { background: var(--surface-2); border-radius: 4px; height: 10px; }
.bar-fill  { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.bar-count { font-size: 0.78rem; font-weight: 600; color: var(--text); }

/* Species */
.species-list { display: flex; flex-direction: column; gap: 10px; }
.species-row { display: grid; grid-template-columns: 24px 80px 1fr 36px; align-items: center; gap: 8px; }
.species-emoji { font-size: 1.2rem; }
.species-name  { font-size: 0.82rem; color: var(--text-2); }
.species-bar-track { background: var(--surface-2); border-radius: 4px; height: 10px; }
.species-bar { background: var(--primary); height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.species-count { font-size: 0.78rem; font-weight: 600; color: var(--text); }

/* Top list */
.top-list { display: flex; flex-direction: column; gap: 8px; }
.top-item { display: grid; grid-template-columns: 24px 1fr 2fr 70px; align-items: center; gap: 10px; }
.top-rank { width: 22px; height: 22px; background: var(--primary-xlight); color: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; }
.top-name { font-size: 0.85rem; color: var(--text); }
.top-bar-track { background: var(--surface-2); border-radius: 4px; height: 8px; }
.top-bar { background: var(--accent-mint); height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.top-count { font-size: 0.78rem; color: var(--text-3); text-align: right; }

/* Vaccine chips */
.vaccine-chips { display: flex; flex-wrap: wrap; gap: 10px; }
.vaccine-chip { display: flex; align-items: center; gap: 6px; background: #FDEAEA; border-radius: var(--radius); padding: 8px 14px; }
.vaccine-rank { width: 20px; height: 20px; background: #EF5350; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; }
.vaccine-name { font-size: 0.85rem; color: var(--text); font-weight: 500; }
.vaccine-count { font-size: 0.75rem; color: #c0392b; font-weight: 600; }

/* Revenue chart */
.revenue-chart { display: flex; align-items: flex-end; gap: 8px; height: 140px; }
.rev-col { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; height: 100%; justify-content: flex-end; }
.rev-bar-wrap { flex: 1; display: flex; align-items: flex-end; width: 100%; }
.rev-bar { width: 100%; background: linear-gradient(to top, var(--primary), var(--accent-mint)); border-radius: 6px 6px 0 0; transition: height 0.6s ease; }
.rev-label { font-size: 0.65rem; color: var(--text-2); font-weight: 600; }
.rev-month { font-size: 0.7rem; color: var(--text-3); }

/* Buttons */
.btn-primary { padding: 10px 20px; background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%); color: white; border: none; border-radius: var(--radius); font-size: 0.9rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: opacity var(--transition), transform var(--transition); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }

.alert { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 0.875rem; }
.alert--error { background: #FDEAEA; color: #c0392b; border-left: 3px solid var(--danger); }

.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-3); font-size: 0.9rem; background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); }
.empty-state__emoji { font-size: 3rem; }
.spin { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
.spin--dark { border-color: rgba(0,0,0,0.1); border-top-color: var(--primary); }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 700px) {
  .section-grid { grid-template-columns: 1fr; }
  .bar-row { grid-template-columns: 70px 1fr 30px; }
  .top-item { grid-template-columns: 22px 1fr 50px; }
  .top-bar-track { display: none; }
}
</style>
