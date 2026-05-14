'use strict';

const { Router } = require('express');
const { verifyDocument, getPublicKeyPem } = require('../../../../shared/digitalSignature');
const { R, logClientsError } = require('./clients.common');

const router = Router();

router.get('/signatures/public-key', (_req, res) => {
  const pem = getPublicKeyPem();
  res.setHeader('Content-Type', 'text/plain');
  res.send(pem);
});

router.post('/signatures/verify', async (req, res, next) => {
  try {
    const { document, signature } = req.body;
    if (!document || !signature) return R.badRequest(res, 'document y signature requeridos');
    const result = verifyDocument(document, signature);
    return R.ok(res, result);
  } catch (e) {
    logClientsError('POST /clients/signatures/verify', e, { body: req.body });
    next(e);
  }
});

module.exports = router;
