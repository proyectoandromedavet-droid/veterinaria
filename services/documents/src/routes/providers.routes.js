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
    implemented: true,
    notes: 'Sincroniza adjuntos PDF con credenciales OAuth2 cargadas en settings.',
  },
  {
    key: 'imap',
    label: 'IMAP generico',
    authType: 'basic',
    syncMode: 'polling',
    implemented: true,
    notes: 'Sincroniza PDFs por IMAP con host, usuario y password/app password.',
  },
  {
    key: 'outlook',
    label: 'Microsoft 365 / Outlook',
    authType: 'oauth2',
    syncMode: 'api',
    implemented: false,
    notes: 'Pendiente de integrar via Microsoft Graph.',
  },
  {
    key: 'manual',
    label: 'Carga manual / importacion interna',
    authType: 'none',
    syncMode: 'manual',
    implemented: true,
    notes: 'Permite poblar la bandeja antes de tener conectores reales.',
  },
];

router.get('/', (_req, res) => R.ok(res, PROVIDERS));

module.exports = router;
