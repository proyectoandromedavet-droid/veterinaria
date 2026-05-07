'use strict';

const { Router } = require('express');
const R = require('../../../../shared/response');

const router = Router();

const PROVIDERS = [
  {
    key: 'gmail',
    label: 'Gmail API',
    authType: 'oauth2',
    syncMode: 'api',
    implemented: false,
    notes: 'Preparado para integrar watch + descarga de adjuntos PDF.',
  },
  {
    key: 'imap',
    label: 'IMAP genérico',
    authType: 'basic',
    syncMode: 'polling',
    implemented: false,
    notes: 'Pensado para casillas estándar con lectura por IMAP.',
  },
  {
    key: 'outlook',
    label: 'Microsoft 365 / Outlook',
    authType: 'oauth2',
    syncMode: 'api',
    implemented: false,
    notes: 'Pendiente de integrar vía Microsoft Graph.',
  },
  {
    key: 'manual',
    label: 'Carga manual / importación interna',
    authType: 'none',
    syncMode: 'manual',
    implemented: true,
    notes: 'Permite poblar la bandeja antes de tener conectores reales.',
  },
];

router.get('/', (_req, res) => {
  return R.ok(res, PROVIDERS);
});

module.exports = router;
