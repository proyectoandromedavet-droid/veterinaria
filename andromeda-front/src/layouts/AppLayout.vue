<template>
  <div class="app-layout">

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'sidebar--open': sidebarOpen }">
      <div class="sidebar__header">
        <AppLogo size="sm" />
        <button class="sidebar__close" @click="sidebarOpen = false" aria-label="Cerrar menú">✕</button>
      </div>

      <nav class="sidebar__nav">
        <RouterLink
          v-for="item in auth.allowedMenu"
          :key="item.key"
          :to="item.to"
          class="sidebar__link"
          active-class="sidebar__link--active"
          @click="sidebarOpen = false"
        >
          <span class="sidebar__icon">{{ item.icon }}</span>
          <span class="sidebar__label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar__footer">
        <div class="sidebar__user">
          <div class="sidebar__avatar">{{ initials }}</div>
          <div class="sidebar__user-info">
            <span class="sidebar__user-name">{{ displayName }}</span>
            <span class="sidebar__user-role">{{ displayRole }}</span>
          </div>
        </div>
        <button class="sidebar__logout" @click="handleLogout" title="Cerrar sesión">⏻</button>
      </div>
    </aside>

    <!-- Overlay mobile -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false" />

    <!-- Contenido principal -->
    <div class="main">
      <header class="topbar">
        <button class="topbar__menu" @click="sidebarOpen = true" aria-label="Abrir menú">☰</button>
        <h1 class="topbar__title">{{ currentTitle }}</h1>
        <div class="topbar__right">
          <span class="topbar__greeting">Hola, {{ firstName }}</span>
        </div>
      </header>

      <main class="page-content">
        <RouterView />
      </main>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppLogo from '../components/AppLogo.vue'

const auth   = useAuthStore()
const router = useRouter()
const route  = useRoute()

const sidebarOpen = ref(false)

const displayName = computed(() => {
  const u = auth.user
  if (!u) return ''
  return u.name || u.email?.split('@')[0] || 'Usuario'
})

const firstName = computed(() => displayName.value.split(' ')[0])

const initials = computed(() =>
  displayName.value.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
)

const ROLE_LABELS = {
  superadmin: 'Super Admin',
  org_admin: 'Admin',
  branch_manager: 'Gerente',
  veterinarian: 'Veterinario/a',
  vet_technician: 'Técnico/a Vet.',
  receptionist: 'Recepcionista',
  groomer: 'Peluquero/a',
  grooming_manager: 'Gerente Grooming',
  tele_vet: 'Vet. Telemedicina',
  pharmacist: 'Farmacéutico/a',
  accountant: 'Contador/a',
  lab_technician: 'Técnico/a Lab.',
  imaging_tech: 'Técnico/a Imágenes',
  surgeon: 'Cirujano/a',
  read_only: 'Solo Lectura',
}
const displayRole = computed(() =>
  auth.roles.map(r => ROLE_LABELS[r] || r).join(', ') || ''
)

const PAGE_TITLES = {
  dashboard: 'Inicio',
  turnos: 'Gestión de Turnos',
  pacientes: 'Pacientes',
  evoluciones: 'Evoluciones Médicas',
  vacunas: 'Vacunaciones',
  inventario: 'Inventario',
  grooming: 'Grooming',
  telemedicina: 'Telemedicina',
  facturacion: 'Facturación',
  reportes: 'Reportes',
  admin: 'Administración',
}
const currentTitle = computed(() => PAGE_TITLES[route.name] || 'Sistema Andromeda')

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────── */
.sidebar {
  width: 240px;
  min-width: 240px;
  background: var(--white);
  border-right: 1.5px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
  transition: transform var(--transition);
  z-index: 100;
}

.sidebar__header {
  padding: 20px 16px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar__close {
  display: none;
  background: none; border: none; cursor: pointer;
  font-size: 1.1rem; color: var(--text-2);
}

.sidebar__nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar__link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: 0.9rem;
  font-weight: 500;
  text-decoration: none;
  transition: background var(--transition), color var(--transition);
}
.sidebar__link:hover { background: var(--primary-xlight); color: var(--primary); }
.sidebar__link--active {
  background: var(--primary-xlight);
  color: var(--primary);
  font-weight: 600;
}
.sidebar__icon { font-size: 1.15rem; width: 22px; text-align: center; }

.sidebar__footer {
  padding: 14px 12px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar__user { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }

.sidebar__avatar {
  width: 34px; height: 34px; min-width: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-pink) 100%);
  color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; font-weight: 700;
}

.sidebar__user-info { min-width: 0; }
.sidebar__user-name {
  display: block;
  font-size: 0.82rem; font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sidebar__user-role {
  display: block;
  font-size: 0.72rem; color: var(--text-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.sidebar__logout {
  background: none; border: none; cursor: pointer;
  font-size: 1.1rem; color: var(--text-3); padding: 6px;
  border-radius: var(--radius-sm);
  transition: background var(--transition), color var(--transition);
}
.sidebar__logout:hover { background: var(--danger-light); color: var(--danger); }

/* ── Main ──────────────────────────────────────── */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.topbar {
  padding: 0 24px;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--white);
  border-bottom: 1.5px solid var(--border);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}

.topbar__menu {
  display: none;
  background: none; border: none; cursor: pointer;
  font-size: 1.3rem; color: var(--text-2); padding: 4px;
}

.topbar__title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  flex: 1;
}

.topbar__greeting {
  font-size: 0.85rem;
  color: var(--text-2);
}

.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px 28px;
}

/* ── Responsive ─────────────────────────────────── */
.sidebar-overlay {
  display: none;
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 99;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0; top: 0;
    transform: translateX(-100%);
  }
  .sidebar--open { transform: translateX(0); }
  .sidebar__close { display: block; }
  .sidebar-overlay { display: block; }
  .topbar__menu { display: block; }
  .page-content { padding: 20px 16px; }
}
</style>
