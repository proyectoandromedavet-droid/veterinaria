'use strict';

/**
 * shared/encryption.js
 * Cifrado a nivel de campo — AES-256-GCM con clave maestra derivada de env.
 *
 * Uso:
 *   const { encrypt, decrypt, encryptFields, decryptFields } = require('./encryption');
 *
 *   // Guardar en DB:
 *   const encrypted = encrypt('04-12345678-9');
 *   // Leer de DB:
 *   const plain = decrypt(encrypted);
 *
 *   // Objeto completo:
 *   const dbRow  = encryptFields(client, ['dni', 'phone', 'email']);
 *   const plain  = decryptFields(dbRow,  ['dni', 'phone', 'email']);
 *
 * Formato de campo cifrado: "iv:authTag:ciphertext" (todo base64, separado por ':')
 */

const crypto = require('crypto');

// ─── Clave maestra ────────────────────────────────────────────────────────────

const ALGORITHM    = 'aes-256-gcm';
const KEY_LENGTH   = 32;   // 256 bits
const IV_LENGTH    = 12;   // 96 bits — recomendado para GCM
const TAG_LENGTH   = 16;   // 128 bits auth tag

// Derivar clave AES-256 a partir del secret de entorno (PBKDF2)
let _masterKey = null;
function getMasterKey () {
  if (_masterKey) return _masterKey;
  const secret = process.env.FIELD_ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('FIELD_ENCRYPTION_SECRET no configurado');
  const salt = Buffer.from(process.env.FIELD_ENCRYPTION_SALT || 'vetmanager_enc_salt_v1');
  _masterKey = crypto.pbkdf2Sync(secret, salt, 100_000, KEY_LENGTH, 'sha256');
  return _masterKey;
}

// ─── Primitivas ───────────────────────────────────────────────────────────────

/**
 * Cifra un valor string con AES-256-GCM.
 * @param {string|null|undefined} plaintext
 * @returns {string|null} — "iv:tag:ciphertext" en base64, o null si el input es falsy
 */
function encrypt (plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext ?? null;

  const key  = getMasterKey();
  const iv   = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Descifra un campo previamente cifrado con `encrypt`.
 * Si el valor no tiene el formato esperado, lo devuelve tal cual (retrocompatibilidad).
 * @param {string|null} ciphertext
 * @returns {string|null}
 */
function decrypt (ciphertext) {
  if (!ciphertext) return ciphertext ?? null;

  // Verificar formato "iv:tag:data"
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext;  // no está cifrado

  try {
    const key  = getMasterKey();
    const iv   = Buffer.from(parts[0], 'base64');
    const tag  = Buffer.from(parts[1], 'base64');
    const data = Buffer.from(parts[2], 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);

    return decipher.update(data) + decipher.final('utf8');
  } catch (_) {
    return ciphertext;  // no se pudo descifrar → devolver original
  }
}

/**
 * Devuelve true si el valor parece estar cifrado.
 */
function isEncrypted (value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => /^[A-Za-z0-9+/=]+$/.test(p));
}

// ─── Helpers de objeto ────────────────────────────────────────────────────────

/**
 * Cifra campos específicos de un objeto.
 * @param {object} obj
 * @param {string[]} fields
 * @returns {object} — copia con los campos cifrados
 */
function encryptFields (obj, fields) {
  if (!obj) return obj;
  const out = { ...obj };
  for (const field of fields) {
    if (field in out && out[field] !== null && out[field] !== undefined) {
      out[field] = encrypt(out[field]);
    }
  }
  return out;
}

/**
 * Descifra campos específicos de un objeto.
 * @param {object} obj
 * @param {string[]} fields
 * @returns {object}
 */
function decryptFields (obj, fields) {
  if (!obj) return obj;
  const out = { ...obj };
  for (const field of fields) {
    if (field in out) {
      out[field] = decrypt(out[field]);
    }
  }
  return out;
}

/**
 * Descifra campos en un array de objetos.
 */
function decryptRows (rows, fields) {
  return (rows || []).map(row => decryptFields(row, fields));
}

/**
 * Hash unidireccional para búsquedas en campos cifrados.
 * Permite buscar por DNI/email sin exponer el valor real.
 * @param {string} value
 * @returns {string} — SHA-256 hex
 */
function hashForSearch (value) {
  if (!value) return null;
  const secret = process.env.FIELD_ENCRYPTION_SECRET || 'default';
  return crypto.createHmac('sha256', secret).update(String(value).toLowerCase().trim()).digest('hex');
}

// ─── Campos PII sugeridos por entidad ────────────────────────────────────────

const PII_FIELDS = {
  clients      : ['dni', 'email', 'phone', 'address', 'document_number'],
  users        : ['email', 'phone'],
  tele_sessions: ['chief_complaint', 'notes'],
  medical_records: ['subjective', 'objective', 'assessment', 'plan', 'notes'],
};

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  encryptFields,
  decryptFields,
  decryptRows,
  hashForSearch,
  PII_FIELDS,
};
