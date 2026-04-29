'use strict';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

describe('gateway websocket token extraction', () => {
  test('prefers Authorization header over query token', () => {
    process.env.NODE_ENV = 'production';
    const { getTokenFromRequest } = require('../../gateway/src/websocket');

    const token = getTokenFromRequest({
      headers: { authorization: 'Bearer header-token' },
      url: '/ws?token=query-token',
    });

    expect(token).toBe('header-token');
  });

  test('rejects query token fallback in production', () => {
    process.env.NODE_ENV = 'production';
    const { getTokenFromRequest } = require('../../gateway/src/websocket');

    const token = getTokenFromRequest({
      headers: {},
      url: '/ws?token=query-token',
    });

    expect(token).toBeNull();
  });

  test('allows query token fallback in development', () => {
    process.env.NODE_ENV = 'development';
    const { getTokenFromRequest } = require('../../gateway/src/websocket');

    const token = getTokenFromRequest({
      headers: {},
      url: '/ws?token=query-token',
    });

    expect(token).toBe('query-token');
  });
});
