'use strict';

/**
 * shared/fileUpload.js
 * File upload hardening con validación de magic bytes, límites de tamaño,
 * extensiones peligrosas y sanitización de nombres.
 *
 * Uso:
 *   const { createUploader, validateMagicBytes } = require('./fileUpload');
 *
 *   // En una ruta que acepta imágenes:
 *   router.post('/upload', createUploader('images').single('file'), handler);
 *
 *   // En el handler, verificar magic bytes del archivo ya guardado:
 *   await validateMagicBytes(req.file.path, req.file.mimetype);
 *
 * Configuración (env vars):
 *   UPLOAD_DIR          — directorio base fuera del public root (default: /tmp/uploads)
 *   UPLOAD_MAX_SIZE_MB  — tamaño máximo por archivo en MB (default: 10)
 *   UPLOAD_ALLOWED_TYPES — tipos MIME permitidos separados por coma
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const { AppError } = require('./errors');

// ── Configuración ────────────────────────────────────────────────────────────

const UPLOAD_DIR     = process.env.UPLOAD_DIR     || '/tmp/uploads';
const MAX_SIZE_BYTES = parseInt(process.env.UPLOAD_MAX_SIZE_MB || '10') * 1024 * 1024;

// Tipos MIME permitidos por categoría
const ALLOWED_MIME_TYPES = new Set(
  (process.env.UPLOAD_ALLOWED_TYPES ||
    'image/jpeg,image/png,image/gif,image/webp,image/avif,' +
    'application/pdf,' +
    'video/mp4,video/webm,' +
    'audio/mpeg,audio/wav,audio/ogg'
  ).split(',').map(m => m.trim())
);

// Extensiones ejecutables que NUNCA deben subirse
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bat', '.cmd', '.ps1', '.msi', '.dll', '.so', '.dylib',
  '.php', '.php3', '.php4', '.php5', '.phtml', '.phar',
  '.asp', '.aspx', '.jsp', '.jspx',
  '.py', '.rb', '.pl', '.cgi',
  '.jar', '.war', '.ear',
  '.htaccess', '.htpasswd',
  '.svg',   // SVG puede contener JS — requiere sanitización adicional
]);

// Magic bytes por tipo MIME
const MAGIC_SIGNATURES = {
  'image/jpeg':       [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png':        [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/gif':        [Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
  'image/webp':       [Buffer.from([0x52, 0x49, 0x46, 0x46])],   // RIFF....WEBP
  'application/pdf':  [Buffer.from([0x25, 0x50, 0x44, 0x46])],   // %PDF
  'video/mp4':        [Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])],
  'audio/mpeg':       [Buffer.from([0xFF, 0xFB]), Buffer.from([0xFF, 0xF3]), Buffer.from([0x49, 0x44, 0x33])],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitiza el nombre de archivo para evitar path traversal y caracteres especiales.
 */
function sanitizeFilename(original) {
  // Solo letras, números, guiones y puntos. Elimina path traversal.
  const base = path.basename(original)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_');

  // Truncar a 200 caracteres
  return base.slice(0, 200) || 'file';
}

/**
 * Lee los primeros N bytes de un archivo.
 */
async function readFirstBytes(filePath, n = 16) {
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    await fd.read(buf, 0, n, 0);
    return buf;
  } finally {
    await fd.close();
  }
}

/**
 * Verifica que el contenido real del archivo coincida con el MIME declarado.
 * @param {string} filePath — ruta absoluta al archivo subido
 * @param {string} declaredMime — MIME type declarado por el cliente
 * @throws {AppError} si los magic bytes no coinciden
 */
async function validateMagicBytes(filePath, declaredMime) {
  const signatures = MAGIC_SIGNATURES[declaredMime];
  if (!signatures) return;   // tipo sin firma conocida → skip (se confía en multer filter)

  const header = await readFirstBytes(filePath, 16);

  const valid = signatures.some(sig => header.slice(0, sig.length).equals(sig));
  if (!valid) {
    // Eliminar archivo malicioso inmediatamente
    await fs.promises.unlink(filePath).catch(() => {});
    throw new AppError(
      'El contenido del archivo no coincide con el tipo declarado',
      400,
      'UPLOAD_MAGIC_MISMATCH'
    );
  }
}

// ── Storage engine ───────────────────────────────────────────────────────────

/**
 * Multer storage que guarda archivos en UPLOAD_DIR/{category}/
 * con nombre aleatorio para evitar conflictos y path traversal.
 */
function createStorage(category = 'misc') {
  // Asegurar que el directorio exista
  const dest = path.join(UPLOAD_DIR, category);
  fs.mkdirSync(dest, { recursive: true });

  return multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, dest);
    },
    filename(_req, file, cb) {
      const ext  = path.extname(sanitizeFilename(file.originalname)).toLowerCase();
      const rand = crypto.randomBytes(16).toString('hex');
      cb(null, `${rand}${ext}`);
    },
  });
}

// ── Multer file filter ───────────────────────────────────────────────────────

function fileFilter(_req, file, cb) {
  // Verificar MIME type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new AppError(
      `Tipo de archivo no permitido: ${file.mimetype}`,
      400,
      'UPLOAD_TYPE_BLOCKED'
    ), false);
  }

  // Verificar extensión del nombre original
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return cb(new AppError(
      `Extensión de archivo bloqueada: ${ext}`,
      400,
      'UPLOAD_EXT_BLOCKED'
    ), false);
  }

  cb(null, true);
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Crea un multer configurado con todas las protecciones activadas.
 *
 * @param {string} category — subcarpeta dentro de UPLOAD_DIR (ej: 'images', 'docs')
 * @param {object} [opts]
 * @param {number} [opts.maxSizeBytes] — override del tamaño máximo
 * @param {number} [opts.maxFiles=5]   — máximo de archivos en upload múltiple
 * @returns {multer.Multer}
 */
function createUploader(category = 'misc', opts = {}) {
  return multer({
    storage:  createStorage(category),
    fileFilter,
    limits: {
      fileSize:  opts.maxSizeBytes || MAX_SIZE_BYTES,
      files:     opts.maxFiles     || 5,
      fields:    20,
      fieldSize: 1024 * 1024,   // 1MB por campo no-archivo
    },
  });
}

/**
 * Middleware de error para errores de multer.
 * Usar después de las rutas de upload.
 */
function uploadErrorHandler(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `El archivo supera el tamaño máximo permitido (${MAX_SIZE_BYTES / 1024 / 1024}MB)`
      : `Error de carga: ${err.message}`;
    return res.status(400).json({ success: false, error: { message: msg, code: err.code } });
  }
  if (err?.code?.startsWith('UPLOAD_')) {
    return res.status(400).json({ success: false, error: { message: err.message, code: err.code } });
  }
  next(err);
}

module.exports = {
  createUploader,
  validateMagicBytes,
  uploadErrorHandler,
  sanitizeFilename,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
};
