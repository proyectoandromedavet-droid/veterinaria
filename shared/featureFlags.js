'use strict';

/**
 * Feature Flags - per-org feature toggles persisted in Redis.
 */

const { getClient } = require('./cache');

const DEFAULT_FLAGS = {
  ai_diagnosis:        false,
  ai_image_analysis:   false,
  ai_chatbot:          false,
  ai_risk_assessment:  false,
  telemedicine:        true,
  grooming:            true,
  portal_owner:        true,
  digital_signature:   false,
  whatsapp_notify:     false,
  advanced_reports:    true,
  multi_branch:        true,
  inventory_advanced:  false,
};

const FLAG_DEFINITIONS = [
  { key: 'ai_diagnosis',       label: 'Diagnostico asistido',    description: 'Habilita sugerencias diagnosticas por IA.', category: 'ai' },
  { key: 'ai_image_analysis',  label: 'Analisis de imagenes',    description: 'Habilita analisis automatizado de estudios e imagenes.', category: 'ai' },
  { key: 'ai_chatbot',         label: 'Chat clinico',            description: 'Habilita el asistente conversacional clinico.', category: 'ai' },
  { key: 'ai_risk_assessment', label: 'Evaluacion de riesgo',    description: 'Habilita calculo e historial de riesgo del paciente.', category: 'ai' },
  { key: 'telemedicine',       label: 'Telemedicina',            description: 'Habilita modulos y flujos de telemedicina.', category: 'general' },
  { key: 'grooming',           label: 'Grooming',                description: 'Habilita el modulo de grooming.', category: 'general' },
  { key: 'portal_owner',       label: 'Portal de duenos',        description: 'Habilita el portal del cliente final.', category: 'general' },
  { key: 'digital_signature',  label: 'Firma digital',           description: 'Habilita captura y validacion de firmas digitales.', category: 'general' },
  { key: 'whatsapp_notify',    label: 'Notificaciones WhatsApp', description: 'Habilita flujos de mensajeria por WhatsApp.', category: 'general' },
  { key: 'advanced_reports',   label: 'Reportes avanzados',      description: 'Habilita reportes avanzados y consolidados.', category: 'general' },
  { key: 'multi_branch',       label: 'Multi sucursal',          description: 'Habilita capacidades multi-sucursal en la organizacion.', category: 'general' },
  { key: 'inventory_advanced', label: 'Inventario avanzado',     description: 'Habilita funciones avanzadas de inventario.', category: 'general' },
];

function normalizeFlags(input = {}) {
  const merged = { ...DEFAULT_FLAGS };
  for (const key of Object.keys(DEFAULT_FLAGS)) {
    if (Object.prototype.hasOwnProperty.call(input, key)) merged[key] = Boolean(input[key]);
  }
  return merged;
}

async function readOrgFlags(orgId) {
  if (!orgId) return { ...DEFAULT_FLAGS };
  try {
    const redis = await getClient();
    const raw = await redis.get(`ff:org:${orgId}`);
    if (!raw) return { ...DEFAULT_FLAGS };
    return normalizeFlags(JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT_FLAGS };
  }
}

async function isEnabled(flag, orgId) {
  const flags = await getFlags(orgId);
  if (flag in flags) return Boolean(flags[flag]);
  return Boolean(DEFAULT_FLAGS[flag] ?? false);
}

async function getFlags(orgId) {
  return readOrgFlags(orgId);
}

async function setFlag(orgId, flag, value) {
  return setFlags(orgId, { [flag]: value });
}

async function setFlags(orgId, updates = {}) {
  const next = normalizeFlags({ ...(await readOrgFlags(orgId)), ...updates });
  try {
    const redis = await getClient();
    await redis.set(`ff:org:${orgId}`, JSON.stringify(next));
  } catch (_) {}
  return next;
}

function requireFeature(flag) {
  return async (req, res, next) => {
    try {
      const orgId = req.user?.orgId;
      if (await isEnabled(flag, orgId)) return next();

      res.status(403).json({
        success: false,
        error:   { message: `Feature '${flag}' is not enabled for your organization`, code: 'FEATURE_DISABLED' },
      });
    } catch (_) {
      next();
    }
  };
}

module.exports = {
  isEnabled,
  getFlags,
  setFlag,
  setFlags,
  requireFeature,
  DEFAULT_FLAGS,
  FLAG_DEFINITIONS,
};
