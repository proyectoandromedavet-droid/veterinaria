<template>
  <div class="page">
    <div class="hero">
      <div>
        <h2 class="page-title">Portal de duenos</h2>
        <p class="page-sub">Este modulo existe en backend, pero usa autenticacion propia para clientes y no comparte la sesion del panel interno.</p>
      </div>
      <div class="hero-badge">Servicio separado</div>
    </div>

    <div class="grid">
      <section class="card">
        <h3>Que expone el servicio</h3>
        <ul class="feature-list">
          <li>Autenticacion del dueno</li>
          <li>Mascotas y fichas resumidas</li>
          <li>Turnos, facturas y pagos</li>
          <li>Notificaciones y telemedicina</li>
          <li>Registro FCM para push al cliente</li>
        </ul>
      </section>

      <section class="card">
        <h3>Rutas principales</h3>
        <div class="route-list">
          <code>/api/v1/portal/auth/login</code>
          <code>/api/v1/portal/pets</code>
          <code>/api/v1/portal/appointments</code>
          <code>/api/v1/portal/invoices</code>
          <code>/api/v1/portal/notifications</code>
          <code>/api/v1/portal/telemedicine</code>
        </div>
      </section>
    </div>

    <section class="card">
      <h3>Como usarlo desde esta operacion</h3>
      <div class="steps">
        <div class="step">
          <strong>1. Backend</strong>
          <p>El gateway ya lo publica y Railway ya lo levanta como servicio independiente.</p>
        </div>
        <div class="step">
          <strong>2. Front del cliente</strong>
          <p>Para usar estas APIs hace falta un frontend dedicado para duenos con login propio.</p>
        </div>
        <div class="step">
          <strong>3. Panel interno</strong>
          <p>Desde este panel se puede visualizar el alcance del modulo, pero no reutilizar la sesion del staff para consumir sus endpoints privados.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 18px; }
.hero, .card { background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.hero { padding: 24px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border: 1px solid var(--border); background: linear-gradient(135deg, #f8fcfb 0%, #eef7f3 100%); }
.hero-badge { padding: 8px 12px; border-radius: 999px; background: rgba(32, 134, 126, 0.12); color: var(--primary); font-weight: 700; font-size: 0.82rem; }
.page-title { font-size: 1.4rem; font-weight: 700; color: var(--text); }
.page-sub { margin-top: 6px; color: var(--text-3); max-width: 760px; line-height: 1.5; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.card { padding: 20px; }
.card h3 { margin-bottom: 14px; font-size: 1rem; color: var(--text); }
.feature-list { margin: 0; padding-left: 18px; color: var(--text-2); line-height: 1.8; }
.route-list { display: grid; gap: 10px; }
.route-list code { background: var(--bg); border: 1px solid var(--border); padding: 10px 12px; border-radius: var(--radius); color: var(--text); }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.step { background: var(--bg); border-radius: var(--radius); padding: 14px; border: 1px solid var(--border); }
.step strong { display: block; margin-bottom: 8px; color: var(--text); }
.step p { color: var(--text-2); line-height: 1.5; }
@media (max-width: 768px) {
  .hero { flex-direction: column; }
}
</style>
