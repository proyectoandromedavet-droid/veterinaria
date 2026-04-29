import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useAuthStore } from './stores/auth'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const auth = useAuthStore(pinia)

async function bootstrap() {
  await auth.bootstrap().catch(() => {})
  app.use(router)
  app.mount('#app')
}

bootstrap()
