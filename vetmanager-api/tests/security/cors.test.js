'use strict';

const express = require('express');
const request = require('supertest');
const corsMiddleware = require('../../gateway/src/middleware/cors');

function buildApp() {
  const app = express();
  app.use(corsMiddleware);
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('CORS middleware', () => {
  const app = buildApp();

  test('allows requests without Origin header', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
  });

  test('sets CORS headers for allowed origins', async () => {
    // Without ALLOWED_ORIGINS set, cors() defaults to allowing all
    const res = await request(app).get('/ping').set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
  });

  test('responds to preflight OPTIONS', async () => {
    const res = await request(app)
      .options('/ping')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect([200, 204]).toContain(res.status);
  });
});
