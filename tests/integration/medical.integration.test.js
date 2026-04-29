'use strict';

jest.mock('../../shared/db');
jest.mock('../../shared/internalAuth', () => ({
  requireInternalSig: (_req, _res, next) => next(),
  signRequest: jest.fn(() => ''),
  verifySignature: jest.fn(() => ({ ok: true })),
  HEADER: 'x-internal-sig',
}));

const request = require('supertest');
const db = require('../../shared/db');

process.env.INTERNAL_SECRET = '';
process.env.NODE_ENV = 'test';

const app = require('../../services/medical/src/index');

const AUTH = {
  'x-user-id': '1',
  'x-org-id': '10',
  'x-branch-id': '5',
  'x-user-roles': 'org_admin,veterinarian',
  'x-user-email': 'admin@clinic.com',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('medical service', () => {
  test('POST /medical-records creates walk-in appointment and record with base schema columns only', async () => {
    db.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ patient_id: 77 });

    const executed = [];
    db.query.mockImplementation((sql) => {
      executed.push(sql);
      if (sql.includes('INSERT INTO appointments')) {
        return Promise.resolve([{ insertId: 555 }]);
      }
      if (sql.includes('INSERT INTO medical_records')) {
        return Promise.resolve([{ insertId: 777 }]);
      }
      return Promise.resolve([]);
    });

    const res = await request(app)
      .post('/medical-records')
      .set(AUTH)
      .send({
        patientId: 77,
        chiefComplaint: 'Dolor abdominal',
        weightKg: 12.3,
        bodyConditionScore: 4,
        temperatureC: 38.7,
      });

    expect(res.status).toBe(201);
    expect(executed.some(sql => sql.includes('client_id'))).toBe(false);
    expect(executed.some(sql => sql.includes('veterinarian_id'))).toBe(false);
    expect(executed.some(sql => sql.includes('appointment_date'))).toBe(false);
    expect(executed.some(sql => sql.includes('reason_for_visit'))).toBe(false);
    expect(executed.some(sql => sql.includes('visit_date'))).toBe(false);
    expect(executed.find(sql => sql.includes('INSERT INTO appointments'))).toContain('scheduled_date');
    expect(executed.find(sql => sql.includes('INSERT INTO medical_records'))).toContain('chief_complaint');
  });

  test('POST /medical-records/:id/sign updates medical record directly without SP', async () => {
    const executed = [];
    db.query.mockImplementation((sql) => {
      executed.push(sql);
      if (sql.includes('UPDATE medical_records')) {
        return Promise.resolve([{ affectedRows: 1 }]);
      }
      return Promise.resolve([]);
    });

    const res = await request(app)
      .post('/medical-records/321/sign')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(executed[0]).toContain('UPDATE medical_records');
    expect(executed[0]).not.toContain('sp_sign_medical_record');
    expect(executed[0]).toContain('signed_at = NOW()');
    expect(executed[0]).toContain('signed_by = :uid');
  });
});
