'use strict';

const crypto = require('crypto');
const axios = require('axios');

const discoveryCache = new Map();

function normalizeProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

function getSupportedProviders() {
  return ['google', 'microsoft'];
}

function getProviderDefaults(provider) {
  switch (normalizeProvider(provider)) {
    case 'google':
      return {
        issuer: 'https://accounts.google.com',
        scopes: ['openid', 'email', 'profile'],
      };
    case 'microsoft':
      return {
        issuer: 'https://login.microsoftonline.com/common/v2.0',
        scopes: ['openid', 'email', 'profile'],
      };
    default:
      throw new Error(`Unsupported OIDC provider '${provider}'`);
  }
}

function getRedirectUri(provider) {
  const p = normalizeProvider(provider);
  const appUrl = (process.env.APP_URL || process.env.GATEWAY_URL || 'http://localhost:4050').replace(/\/$/, '');
  return `${appUrl}/api/v1/auth/sso/${p}/callback`;
}

function getEnvConfig(provider) {
  const p = normalizeProvider(provider).toUpperCase();
  const defaults = getProviderDefaults(provider);
  return {
    clientId: process.env[`OIDC_${p}_CLIENT_ID`] || process.env[`${p}_CLIENT_ID`] || '',
    clientSecret: process.env[`OIDC_${p}_CLIENT_SECRET`] || process.env[`${p}_CLIENT_SECRET`] || '',
    issuer: process.env[`OIDC_${p}_ISSUER`] || defaults.issuer,
    scopes: (process.env[`OIDC_${p}_SCOPES`] || defaults.scopes.join(' ')).split(/[,\s]+/).filter(Boolean),
  };
}

async function getDiscovery(provider, issuerOverride) {
  const issuer = issuerOverride || getEnvConfig(provider).issuer;
  const cacheKey = `${normalizeProvider(provider)}:${issuer}`;
  if (discoveryCache.has(cacheKey)) return discoveryCache.get(cacheKey);

  const url = issuer.endsWith('/.well-known/openid-configuration')
    ? issuer
    : `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const { data } = await axios.get(url, { timeout: 10000 });
  discoveryCache.set(cacheKey, data);
  return data;
}

function buildPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function buildAuthorizationUrl(provider, config) {
  const discovery = await getDiscovery(provider, config.issuer);
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const pkce = buildPkcePair();
  const url = new URL(discovery.authorization_endpoint);

  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri || getRedirectUri(provider));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', (config.scopes || []).join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');

  return { url: url.toString(), state, nonce, verifier: pkce.verifier };
}

async function exchangeCode(provider, config, code, codeVerifier) {
  const discovery = await getDiscovery(provider, config.issuer);
  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri || getRedirectUri(provider),
    code_verifier: codeVerifier,
  });
  const { data } = await axios.post(discovery.token_endpoint, payload.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  return data;
}

function decodeJwtWithoutVerify(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) throw new Error('Invalid JWT structure');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

module.exports = {
  normalizeProvider,
  getSupportedProviders,
  getProviderDefaults,
  getRedirectUri,
  getEnvConfig,
  getDiscovery,
  buildAuthorizationUrl,
  exchangeCode,
  decodeJwtWithoutVerify,
};
