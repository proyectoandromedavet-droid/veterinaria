export type Locale = 'es-AR' | 'en-US'

const messages = {
  'es-AR': {
    common: {
      save: 'Guardar',
      cancel: 'Cancelar',
      close: 'Cerrar',
      loading: 'Cargando...',
      empty: 'Sin resultados',
    },
  },
  'en-US': {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      loading: 'Loading...',
      empty: 'No results',
    },
  },
} as const

let currentLocale: Locale = 'es-AR'

export function setLocale(locale: Locale) {
  currentLocale = locale
}

export function t(path: keyof typeof messages['es-AR']) {
  return messages[currentLocale][path]
}
