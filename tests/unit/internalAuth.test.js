'use strict';

const { signRequest, verifySignature, HEADER } = require('../../shared/internalAuth');

const SECRET = 'test-secret-abc123';

beforeAll(() => { process.env.INTERNAL_SECRET = SECRET; });
afterAll(() => {
  delete process.env.INTERNAL_SECRET;
  delete process.env.DEPENDENCY_MODE_INTERNAL_AUTH;
});

describe('signRequest()', () => {
  test('returns non-empty string when secret exists', () => {
    const sig = signRequest('GET', '/api/v1/patients', '42');
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  test('format: t={timestamp}.s={hex}', () => {
    const sig = signRequest('POST', '/api/v1/clients', '7');
    expect(sig).toMatch(/^t=\d+\.s=[0-9a-f]+$/);
  });

  test('returns empty string without secret', () => {
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
  test('valid signature => ok:true', () => {
    const sig = signRequest('GET', '/api/v1/patients', '42');
    const result = verifySignature('GET', '/api/v1/patients', '42', sig);
    expect(result.ok).toBe(true);
  });

  test('different method => invalid_signature', () => {
    const sig = signRequest('GET', '/api/v1/patients', '42');
    const result = verifySignature('POST', '/api/v1/patients', '42', sig);
    expect(result.ok).toBe(false);
  });

  test('different path => invalid_signature', () => {
    const sig = signRequest('GET', '/api/v1/patients', '42');
    const result = verifySignature('GET', '/api/v1/clients', '42', sig);
    expect(result.ok).toBe(false);
  });

  test('different orgId => invalid_signature', () => {
    const sig = signRequest('GET', '/api/v1/patients', '42');
    const result = verifySignature('GET', '/api/v1/patients', '99', sig);
    expect(result.ok).toBe(false);
  });

  test('missing header => missing_header', () => {
    const result = verifySignature('GET', '/api/v1/patients', '42', '');
    expect(result).toMatchObject({ ok: false, reason: 'missing_header' });
  });

  test('malformed header => malformed_header', () => {
    const result = verifySignature('GET', '/', '42', 'invalid-format');
    expect(result).toMatchObject({ ok: false, reason: 'malformed_header' });
  });

  test('without secret and strict mode => missing_secret', () => {
    const savedSecret = process.env.INTERNAL_SECRET;
    delete process.env.INTERNAL_SECRET;
    process.env.DEPENDENCY_MODE_INTERNAL_AUTH = 'strict';
    jest.resetModules();
    const { verifySignature: verifyStrict } = require('../../shared/internalAuth');
    expect(verifyStrict('GET', '/', '42', '')).toMatchObject({ ok: false, reason: 'missing_secret' });
    process.env.INTERNAL_SECRET = savedSecret;
    delete process.env.DEPENDENCY_MODE_INTERNAL_AUTH;
    jest.resetModules();
  });

  test('HEADER export is correct', () => {
    expect(HEADER).toBe('x-internal-sig');
  });
});
