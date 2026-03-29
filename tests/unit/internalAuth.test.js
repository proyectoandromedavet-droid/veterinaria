'use strict';

const { signRequest, verifySignature, HEADER } = require('../../shared/internalAuth');

const SECRET = 'test-secret-abc123';

beforeAll(() => { process.env.INTERNAL_SECRET = SECRET; });
afterAll(() => { delete process.env.INTERNAL_SECRET; });

describe('signRequest()', () => {
  test('retorna string no vacío cuando hay secret', () => {
    const sig = signRequest('GET', '/api/v1/patients', '42');
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  test('formato: t={timestamp}.s={hex}', () => {
    const sig = signRequest('POST', '/api/v1/clients', '7');
    expect(sig).toMatch(/^t=\d+\.s=[0-9a-f]+$/);
  });

  test('retorna string vacío sin secret', () => {
    const saved = process.env.INTERNAL_SECRET;
    delete process.env.INTERNAL_SECRET;
    jest.resetModules();
    const { signRequest: sr } = require('../../shared/internalAuth');
    expect(sr('GET', '/', '')).toBe('');
    process.env.INTERNAL_SECRET = saved;
    jest.resetModules();
  });
});

describe('verifySignature()', () => {
  test('firma válida → ok:true', () => {
    const sig    = signRequest('GET', '/api/v1/patients', '42');
    const result = verifySignature('GET', '/api/v1/patients', '42', sig);
    expect(result.ok).toBe(true);
  });

  test('método diferente → invalid_signature', () => {
    const sig    = signRequest('GET', '/api/v1/patients', '42');
    const result = verifySignature('POST', '/api/v1/patients', '42', sig);
    expect(result.ok).toBe(false);
  });

  test('path diferente → invalid_signature', () => {
    const sig    = signRequest('GET', '/api/v1/patients', '42');
    const result = verifySignature('GET', '/api/v1/clients', '42', sig);
    expect(result.ok).toBe(false);
  });

  test('orgId diferente → invalid_signature', () => {
    const sig    = signRequest('GET', '/api/v1/patients', '42');
    const result = verifySignature('GET', '/api/v1/patients', '99', sig);
    expect(result.ok).toBe(false);
  });

  test('header faltante → missing_header', () => {
    const result = verifySignature('GET', '/api/v1/patients', '42', '');
    expect(result).toMatchObject({ ok: false, reason: 'missing_header' });
  });

  test('header malformado → malformed_header', () => {
    const result = verifySignature('GET', '/', '42', 'invalid-format');
    expect(result).toMatchObject({ ok: false, reason: 'malformed_header' });
  });

  test('HEADER export es la clave correcta', () => {
    expect(HEADER).toBe('x-internal-sig');
  });
});
