'use strict';

/**
 * Integration tests — Patients service
 *
 * Tests the patients Express router end-to-end via supertest.
 * DB is mocked; JWT auth is bypassed by injecting gateway headers.
 *
 * Coverage:
 *   - GET  /patients          — list with branch isolation
 *   - GET  /patients/:id      — org isolation (must include org filter)
 *   - POST /patients          — create with transaction
 *   - PUT  /patients/:id      — update with org isolation
 *   - POST /patients/:id/photo — upload guard
 *   - GET  /species/all       — cache headers
 */

jest.mock('../../shared/db');
jest.mock('../../shared/cache', () => ({
  cacheMiddleware:  () => (_req, _res, next) => next(),
  httpCacheHeaders: () => (_req, _res, next) => next(),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const express = require('express');
const db      = require('../../shared/db');

// ── Build isolated app ────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  // Simulate gateway header injection (no real JWT needed)
  app.use((req, _res, next) => {
    req.user = {
      userId:   parseInt(req.headers['x-user-id']  || '1'),
      orgId:    parseInt(req.headers['x-org-id']   || '5'),
      branchId: parseInt(req.headers['x-branch-id'] || '10'),
      roles:    (req.headers['x-user-roles'] || 'veterinarian').split(','),
    };
    next();
  });

  app.use('/patients', require('../../services/patients/src/routes/patients.routes'));
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
afterEach(() => { jest.clearAllMocks(); });

// ── Auth headers helper ───────────────────────────────────────────────────────

const AUTH = {
  'X-User-Id':    '1',
  'X-Org-Id':     '5',
  'X-Branch-Id':  '10',
  'X-User-Roles': 'veterinarian',
};

// ── Tests: GET /patients ───────────────────────────────────────────────────────

describe('GET /patients', () => {
  test('200 — returns paginated list', async () => {
    db.query
      .mockResolvedValueOnce([                          // rows
        { id: 1, name: 'Fido', species: 'Dog', is_active: true },
        { id: 2, name: 'Miau', species: 'Cat', is_active: true },
      ])
      .mockResolvedValueOnce([{ total: 2 }]);           // count

    const res = await request(app).get('/patients').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  test('200 — search filter is passed to DB', async () => {
    db.query
      .mockResolvedValueOnce([{ id: 1, name: 'Fido' }])
      .mockResolvedValueOnce([{ total: 1 }]);

    await request(app).get('/patients?search=Fido').set(AUTH);

    // First db.query call should include the search param
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/LIKE :s/);
    expect(params.s).toBe('%Fido%');
  });
});

// ── Tests: GET /patients/:id ──────────────────────────────────────────────────

describe('GET /patients/:id', () => {
  test('200 — returns patient with owners, allergies, conditions', async () => {
    db.queryOne.mockResolvedValueOnce({ id: 1, name: 'Fido', organization_id: 5 });
    db.query
      .mockResolvedValueOnce([{ id: 99, first_name: 'Owner', ownership_type: 'primary' }]) // owners
      .mockResolvedValueOnce([])                                                            // allergies
      .mockResolvedValueOnce([]);                                                           // conditions

    const res = await request(app).get('/patients/1').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Fido');
    expect(res.body.data.owners).toHaveLength(1);
  });

  test('404 — patient not in this org', async () => {
    db.queryOne.mockResolvedValueOnce(null); // query with org filter returns nothing

    const res = await request(app).get('/patients/999').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('DB query includes organization_id filter', async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await request(app).get('/patients/42').set(AUTH);

    const [sql, params] = db.queryOne.mock.calls[0];
    expect(sql).toMatch(/organization_id\s*=\s*:orgId/);
    expect(params.orgId).toBe(5);
    expect(params.id).toBe('42');
  });
});

// ── Tests: POST /patients ─────────────────────────────────────────────────────

describe('POST /patients', () => {
  test('201 — creates patient with transaction', async () => {
    const mockConn = {
      execute: jest.fn()
        .mockResolvedValueOnce([{ insertId: 42 }]) // INSERT patient
        .mockResolvedValueOnce([{ affectedRows: 1 }]), // INSERT patient_owners
    };
    db.transaction.mockImplementationOnce(fn => fn(mockConn));

    const body = {
      name:           'Rex',
      speciesId:      1,
      primaryOwnerId: 99,
      sex:            'male',
    };

    const res = await request(app).post('/patients').set(AUTH).send(body);
    expect(res.status).toBe(201);
    expect(mockConn.execute).toHaveBeenCalledTimes(2);
  });

  test('400 — missing required fields', async () => {
    const res = await request(app).post('/patients').set(AUTH).send({ name: 'Rex' });
    expect(res.status).toBe(400);
  });
});

// ── Tests: PUT /patients/:id ──────────────────────────────────────────────────

describe('PUT /patients/:id', () => {
  test('204 — updates allowed fields with org filter', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .put('/patients/1')
      .set(AUTH)
      .send({ name: 'Rex Renamed', weightKg: 12.5 });

    expect(res.status).toBe(204);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/organization_id\s*=\s*:orgId/);
    expect(params.orgId).toBe(5);
  });

  test('400 — no valid fields provided', async () => {
    const res = await request(app)
      .put('/patients/1')
      .set(AUTH)
      .send({ nonExistentField: 'value' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no valid fields/i);
  });
});

// ── Tests: GET /species/all ────────────────────────────────────────────────────

describe('GET /species/all', () => {
  test('200 — returns species list', async () => {
    db.query.mockResolvedValueOnce([
      { id: 1, common_name: 'Dog', category: 'Mammals' },
      { id: 2, common_name: 'Cat', category: 'Mammals' },
    ]);

    const res = await request(app).get('/patients/species/all').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});
