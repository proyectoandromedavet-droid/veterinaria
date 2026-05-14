import { authApi } from '../../api/auth'
import { extractErrorMessage, logError } from '../../utils/errors'

export function getLoginError(error, fallback) {
  return extractErrorMessage(error, fallback, { includeRequestId: true })
}

export async function login(authStore, credentials) {
  return authStore.login(credentials)
}

export async function verifyTwoFactor(authStore, pendingToken, code) {
  return authStore.twoFaChallenge(pendingToken, code)
}

export async function requestPasswordReset(email) {
  return authApi.resetRequest(email)
}

export function startSso(provider, email) {
  authApi.ssoRedirect(provider, {
    email: email || '',
    redirectTo: `${window.location.origin}/`,
  })
}

export function loginErrorScope(scope, error, meta) {
  logError(scope, error, meta)
}

export default function useLoginDomain() {
  return {
    login,
    verifyTwoFactor,
    requestPasswordReset,
    startSso,
    getLoginError,
    loginErrorScope,
  }
}
