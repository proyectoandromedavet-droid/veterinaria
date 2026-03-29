'use strict';

const { validateWebhookSignature, mapMpStatus } = require('../../shared/mercadopago');
const crypto = require('crypto');

describe('MercadoPago helpers', () => {

  describe('mapMpStatus', () => {
    test('approved → completed', () => expect(mapMpStatus('approved')).toBe('completed'));
    test('pending → pending',   () => expect(mapMpStatus('pending')).toBe('pending'));
    test('in_process → pending',() => expect(mapMpStatus('in_process')).toBe('pending'));
    test('rejected → failed',   () => expect(mapMpStatus('rejected')).toBe('failed'));
    test('refunded → refunded', () => expect(mapMpStatus('refunded')).toBe('refunded'));
    test('cancelled → cancelled',()=> expect(mapMpStatus('cancelled')).toBe('cancelled'));
    test('desconocido → pending',() => expect(mapMpStatus('unknown_xyz')).toBe('pending'));
  });

  describe('validateWebhookSignature', () => {
    test('retorna true si no hay MP_WEBHOOK_SECRET (modo dev)', () => {
      delete process.env.MP_WEBHOOK_SECRET;
      expect(validateWebhookSignature('ts=123,v1=abc', 'req-1', 'data-1')).toBe(true);
    });

    test('valida firma correcta', () => {
      process.env.MP_WEBHOOK_SECRET = 'test-secret';
      const ts       = '1711234567';
      const xReqId   = 'req-abc';
      const dataId   = '12345';
      const manifest = `id:${dataId};request-id:${xReqId};ts:${ts};`;
      const hash     = crypto.createHmac('sha256', 'test-secret').update(manifest).digest('hex');
      const xSig     = `ts=${ts},v1=${hash}`;

      expect(validateWebhookSignature(xSig, xReqId, dataId)).toBe(true);
      delete process.env.MP_WEBHOOK_SECRET;
    });

    test('rechaza firma incorrecta', () => {
      process.env.MP_WEBHOOK_SECRET = 'test-secret';
      expect(validateWebhookSignature('ts=123,v1=firmainvalida', 'req-1', 'data-1')).toBe(false);
      delete process.env.MP_WEBHOOK_SECRET;
    });
  });
});
