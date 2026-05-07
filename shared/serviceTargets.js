'use strict';

const { resolveServiceTarget, listServices } = require('./serviceRegistry');

const SERVICE_FALLBACKS = {
  auth:          process.env.SERVICE_AUTH          || 'http://localhost:4051',
  patients:      process.env.SERVICE_PATIENTS      || 'http://localhost:4052',
  medical:       process.env.SERVICE_MEDICAL       || 'http://localhost:4053',
  lab:           process.env.SERVICE_LAB           || 'http://localhost:4054',
  billing:       process.env.SERVICE_BILLING       || 'http://localhost:4055',
  telemedicine:  process.env.SERVICE_TELEMEDICINE  || 'http://localhost:4056',
  grooming:      process.env.SERVICE_GROOMING      || 'http://localhost:4057',
  reports:       process.env.SERVICE_REPORTS       || 'http://localhost:4058',
  notifications: process.env.SERVICE_NOTIFICATIONS || 'http://localhost:4059',
  portal:        process.env.SERVICE_PORTAL        || 'http://localhost:4060',
  ai:            process.env.SERVICE_AI            || 'http://localhost:4061',
  documents:     process.env.SERVICE_DOCUMENTS     || 'http://localhost:4062',
};

function getServiceFallback(name) {
  return SERVICE_FALLBACKS[name] || null;
}

async function resolveRuntimeServiceTarget(name) {
  return resolveServiceTarget(name, getServiceFallback(name));
}

async function listKnownServiceTargets() {
  const rows = await listServices().catch(() => []);
  const indexed = new Map(rows.map((row) => [row.name, row]));

  return Object.keys(SERVICE_FALLBACKS).map((name) => ({
    name,
    url: indexed.get(name)?.url || SERVICE_FALLBACKS[name],
    source: indexed.has(name) ? 'registry' : 'fallback',
    ...(indexed.get(name) || {}),
  }));
}

module.exports = {
  SERVICE_FALLBACKS,
  getServiceFallback,
  resolveRuntimeServiceTarget,
  listKnownServiceTargets,
};
