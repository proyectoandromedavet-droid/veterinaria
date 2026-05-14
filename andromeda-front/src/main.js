import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useAuthStore } from './stores/auth'
import { setLocale } from './i18n'
import { logError } from './utils/errors'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
setLocale(navigator.language?.startsWith('en') ? 'en-US' : 'es-AR')

app.config.errorHandler = (error) => {
  logError('app', error)
}

window.addEventListener('unhandledrejection', (event) => {
  logError('unhandledrejection', event.reason)
})

const auth = useAuthStore(pinia)

async function bootstrap() {
  await auth.bootstrap().catch((error) => {
    logError('bootstrap', error)
  })
  app.use(router)
  app.mount('#app')
}

bootstrap()
