'use strict';

/**
 * shared/jwt.js
 * JWT RS256 asimétrico.
 *
 * Configuración de claves (en orden de prioridad):
 *   1. JWT_PRIVATE_KEY + JWT_PUBLIC_KEY  (env, PEM o base64)  ← producción
 *   2. JWT_KEY_FILE  (ruta a archivo PEM con clave privada)    ← staging
 *   3. Par de claves efímero RSA-2048 generado en memoria      ← dev/test
 *
 * En NODE_ENV=production sin JWT_PRIVATE_KEY/JWT_PUBLIC_KEY → error al arrancar.
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const fs     = require('fs');

// ─── Gestión de claves ────────────────────────────────────────────────────────
//
// Key rotation: se soportan DOS pares activos simultáneamente.
//   - Clave ACTUAL  → JWT_PRIVATE_KEY / JWT_PUBLIC_KEY    (firma y verificación)
//   - Clave ANTIGUA → JWT_PRIVATE_KEY_OLD / JWT_PUBLIC_KEY_OLD  (solo verificación, grace period)
//
// Durante la rotación:
//   1. Generar nuevo par RSA-2048
//   2. Renombrar la variable actual a _OLD
//   3. Setear las nuevas variables
//   4. Reiniciar pods gradualmente (rolling deploy)
//   5. Después del grace period (ej: 30 min = TTL del access token), remover _OLD

let _privateKey    = null;
let _publicKey     = null;
let _keyId         = null;
let _oldPublicKey  = null;  // clave anterior — solo para verificación durante rotación

function _loadPem(envVar) {
  const raw = process.env[envVar];
  if (!raw) return null;
  // Soporte para PEM en base64 (útil en variables de entorno sin saltos de línea)
  if (!raw.includes('-----')) return Buffer.from(raw, 'base64').toString('utf8');
  return raw;
}

function _initKeys() {
  if (_publicKey !== null) return;   // ya inicializadas

  const privPem = _loadPem('JWT_PRIVATE_KEY');
  const pubPem  = _loadPem('JWT_PUBLIC_KEY');

  if (privPem && pubPem) {
    _privateKey = privPem;
    _publicKey  = pubPem;
    _keyId = crypto.createHash('sha256').update(pubPem).digest('hex').slice(0, 16);
    // Cargar clave anterior si existe (rotación en curso)
    _oldPublicKey = _loadPem('JWT_PUBLIC_KEY_OLD') || null;
    return;
  }

  // Fallback: archivo PEM (staging)
  const keyFile = process.env.JWT_KEY_FILE;
  if (keyFile) {
    try {
      const privFile = fs.readFileSync(keyFile, 'utf8');
      const keyObj   = crypto.createPrivateKey(privFile);
      const pubObj   = crypto.createPublicKey(keyObj);
      _privateKey = privFile;
      _publicKey  = pubObj.export({ type: 'spki', format: 'pem' });
      _keyId = crypto.createHash('sha256').update(_publicKey).digest('hex').slice(0, 16);
      return;
    } catch (_) { /* continuar al siguiente fallback */ }
  }

  // Producción sin claves → error explícito
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_PRIVATE_KEY y JWT_PUBLIC_KEY deben estar configurados en producción. ' +
      'Generá un par RSA-2048 y asignalo como variables de entorno.'
    );
  }

  // Dev / test → par efímero (generado una sola vez por proceso)
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength:      2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  _privateKey = privateKey;
  _publicKey  = publicKey;
  _keyId = crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
}

// ─── Configuración de expiración ──────────────────────────────────────────────

const ACCESS_EXP  = process.env.JWT_ACCESS_EXPIRES  || '15m';
const REFRESH_EXP = process.env.JWT_REFRESH_EXPIRES || '7d';

// ─── Operaciones de token ─────────────────────────────────────────────────────

/**
 * Firma un access token (RS256).
 * Agrega jti (JWT ID) si el payload no trae uno.
 * @param {object} payload  { userId, orgId, branchId, roles, email, tokenVersion? }
 */
function signAccess(payload) {
  _initKeys();
  return jwt.sign(
    { ...payload, jti: payload.jti || crypto.randomBytes(16).toString('hex') },
    _privateKey,
    { expiresIn: ACCESS_EXP, algorithm: 'RS256', keyid: _keyId }
  );
}

/**
 * Firma un refresh token (RS256).
 */
function signRefresh(payload) {
  _initKeys();
  return jwt.sign(
    { ...payload, jti: payload.jti || crypto.randomBytes(16).toString('hex') },
    _privateKey,
    { expiresIn: REFRESH_EXP, algorithm: 'RS256', keyid: _keyId }
  );
}

/**
 * Rechaza explícitamente tokens con alg:none o algoritmos simétricos (HS*).
 * Lanza JsonWebTokenError antes de intentar la verificación criptográfica.
 * Esto previene el ataque de "algorithm confusion" donde un atacante cambia
 * el header alg a 'none' o a HS256 para bypassear la firma.
 */
function _rejectUnsafeAlgorithm(token) {
  // Decodificar header sin verificar firma (solo para inspeccionar alg)
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new jwt.JsonWebTokenError('Token malformado');

  const alg = (decoded.header?.alg || '').toLowerCase();

  // Rechazar alg:none y todos los algoritmos simétricos HMAC
  if (alg === 'none' || alg === '' || alg.startsWith('hs')) {
    throw new jwt.JsonWebTokenError(
      `Algoritmo no permitido: ${decoded.header?.alg || 'none'}. Solo se acepta RS256.`
    );
  }
}

/**
 * Verifica un access token. Lanza si es inválido o expirado.
 * Durante rotación, intenta la clave actual y luego la anterior.
 */
function verifyAccess(token) {
  _initKeys();
  _rejectUnsafeAlgorithm(token);   // protección alg:none antes de verify
  try {
    return jwt.verify(token, _publicKey, { algorithms: ['RS256'] });
  } catch (err) {
    // Durante key rotation: si el token fue firmado con la clave anterior, sigue siendo válido
    if (_oldPublicKey && (err.name === 'JsonWebTokenError')) {
      return jwt.verify(token, _oldPublicKey, { algorithms: ['RS256'] });
    }
    throw err;
  }
}

/**
 * Verifica un refresh token.
 * Durante rotación, intenta la clave actual y luego la anterior.
 */
function verifyRefresh(token) {
  _initKeys();
  _rejectUnsafeAlgorithm(token);   // protección alg:none antes de verify
  try {
    return jwt.verify(token, _publicKey, { algorithms: ['RS256'] });
  } catch (err) {
    if (_oldPublicKey && (err.name === 'JsonWebTokenError')) {
      return jwt.verify(token, _oldPublicKey, { algorithms: ['RS256'] });
    }
    throw err;
  }
}

/**
 * Genera un token opaco para refresh tokens almacenados en DB.
 */
function generateOpaqueToken() {
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Hash SHA-256 de un token para almacenamiento seguro.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Retorna la clave pública PEM actual (para verificación externa).
 */
function getPublicKey() {
  _initKeys();
  return _publicKey;
}

/**
 * Retorna el kid (fingerprint de la clave pública).
 */
function getKeyId() {
  _initKeys();
  return _keyId;
}

/**
 * Genera un JWK (JSON Web Key) a partir de una clave pública PEM.
 */
function _toJwk(pubPem, kid) {
  const keyObject = crypto.createPublicKey(pubPem);
  const jwk = keyObject.export({ format: 'jwk' });
  return { ...jwk, use: 'sig', alg: 'RS256', kid };
}

/**
 * Retorna el JWKS completo con todas las claves activas.
 * Incluye la clave anterior durante rotación (grace period).
 * Compatible con el endpoint /.well-known/jwks.json: res.json(getJwks())
 */
function getJwks() {
  _initKeys();
  const keys = [_toJwk(_publicKey, _keyId)];
  if (_oldPublicKey) {
    const oldKid = crypto.createHash('sha256').update(_oldPublicKey).digest('hex').slice(0, 16);
    keys.push(_toJwk(_oldPublicKey, oldKid));
  }
  return { keys };
}

/** Alias — retorna un solo JWK (la clave actual). Útil cuando solo se necesita la clave activa. */
function getJwksSet() {
  return getJwks();
}

module.exports = {
  signAccess,
  signRefresh,
  verifyAccess,
  verifyRefresh,
  generateOpaqueToken,
  hashToken,
  getPublicKey,
  getKeyId,
  getJwks,
  getJwksSet,
};
