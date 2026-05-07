import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('../layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '',          name: 'dashboard',    component: () => import('../views/DashboardView.vue') },
      { path: 'turnos',    name: 'turnos',       component: () => import('../views/TurnosView.vue') },
      { path: 'pacientes', name: 'pacientes',    component: () => import('../views/PacientesView.vue') },
      { path: 'evoluciones', name: 'evoluciones', component: () => import('../views/EvolucionesView.vue') },
      { path: 'vacunas',   name: 'vacunas',      component: () => import('../views/VacunasView.vue') },
      { path: 'inventario', name: 'inventario',  component: () => import('../views/InventarioView.vue') },
      { path: 'grooming',  name: 'grooming',     component: () => import('../views/GroomingView.vue') },
      { path: 'telemedicina', name: 'telemedicina', component: () => import('../views/TelemedicinaView.vue') },
      { path: 'facturacion', name: 'facturacion', component: () => import('../views/FacturacionView.vue') },
      { path: 'reportes',  name: 'reportes',     component: () => import('../views/ReportesView.vue') },
      { path: 'notificaciones', name: 'notificaciones', component: () => import('../views/NotificationsView.vue') },
      { path: 'documentos', name: 'documentos', component: () => import('../views/DocumentosView.vue') },
      { path: 'portal', name: 'portal', component: () => import('../views/PortalView.vue') },
      { path: 'ai', name: 'ai', component: () => import('../views/AiView.vue') },
      { path: 'laboratorio',      name: 'laboratorio',      component: () => import('../views/LaboratorioView.vue') },
      { path: 'imagenes',         name: 'imagenes',         component: () => import('../views/ImagenesView.vue') },
      { path: 'cirugias',         name: 'cirugias',         component: () => import('../views/CirugiasView.vue') },
      { path: 'hospitalizaciones', name: 'hospitalizaciones', component: () => import('../views/HospitalizacionesView.vue') },
      { path: 'patologia',        name: 'patologia',        component: () => import('../views/PatologiaView.vue') },
      { path: 'admin',     name: 'admin',        component: () => import('../views/AdminView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'
  if (to.path === '/login' && auth.isAuthenticated) return '/'
})

export default router
