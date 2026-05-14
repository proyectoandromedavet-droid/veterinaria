function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function getErrorInfo(error, fallback = 'Ocurrio un error inesperado.') {
  const response = error?.response
  const payload = response?.data
  const payloadError = payload?.error
  const headers = response?.headers || {}
  const requestId = pickFirstString(
    payloadError?.requestId,
    payload?.requestId,
    headers['x-request-id'],
  )
  const traceId = pickFirstString(
    payloadError?.traceId,
    payload?.traceId,
    headers['x-trace-id'],
  )
  const code = pickFirstString(payloadError?.code, payload?.code)
  const message = pickFirstString(
    payloadError?.message,
    payload?.message,
    error?.message,
    fallback,
  )

  return {
    message,
    code: code || null,
    requestId: requestId || null,
    traceId: traceId || null,
    status: response?.status ?? null,
    details: payloadError?.details || payload?.details || null,
  }
}

export function extractErrorMessage(error, fallback = 'Ocurrio un error inesperado.', options = {}) {
  const { includeRequestId = false } = options
  const info = getErrorInfo(error, fallback)
  if (includeRequestId && info.requestId) {
    return `${info.message} Ref: ${info.requestId}`
  }
  return info.message
}

export function logError(scope, error, meta) {
  const prefix = `[frontend][${scope}]`
  const info = getErrorInfo(error)
  const context = {
    ...meta,
    ...(info.code ? { code: info.code } : {}),
    ...(info.status ? { status: info.status } : {}),
    ...(info.requestId ? { requestId: info.requestId } : {}),
    ...(info.traceId ? { traceId: info.traceId } : {}),
  }

  if (Object.keys(context).length === 0) {
    console.error(prefix, error)
    return
  }
  console.error(prefix, error, context)
}
