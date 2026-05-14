'use strict';

const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const { logger } = require('../middleware/logger');
const { config } = require('../config');

const openApiPath = path.join(__dirname, '../../docs/openapi.yaml');

function registerDocsRoutes(app, version) {
  const supportedVersions = config.supportedApiVersions || [version];
  if (config.swaggerEnabled) {
    try {
      const swaggerDoc = YAML.load(openApiPath);
      for (const supportedVersion of supportedVersions) {
        app.use(`/api/${supportedVersion}/docs`, swaggerUi.serve, swaggerUi.setup({
          ...swaggerDoc,
          servers: (swaggerDoc.servers || []).map((server) => ({
            ...server,
            url: server.url.replace(`/api/${version}`, `/api/${supportedVersion}`),
          })),
        }, {
          customSiteTitle: 'VetManager Pro API',
          swaggerOptions: { persistAuthorization: false },
        }));
      }
      app.get('/api/docs', (_req, res) => res.redirect(302, `/api/${config.defaultApiVersion}/docs`));
      logger.info(`Swagger UI at /api/${version}/docs`);
    } catch (error) {
      logger.warn('openapi.yaml not found - Swagger UI disabled', { error: error?.message });
    }
  } else {
    app.use(`/api/${version}/docs`, (_req, res) => res.status(404).json({ success: false, error: { message: 'Not found' } }));
  }
}

function registerOpenApiValidation(app) {
  if (!config.openApiValidate) return;

  try {
    const { middleware: openApiValidator } = require('express-openapi-validator');
    app.use(openApiValidator({
      apiSpec: openApiPath,
      validateRequests: true,
      validateResponses: false,
      validateSecurity: false,
      ignorePaths: /^\/health|^\/metrics|^\/api\/v\d+\/docs/,
    }));
    app.use((err, req, res, next) => {
      if (err.status === 400 && err.errors) {
        return res.status(400).json({
          success: false,
          error: { message: 'Request validation failed', code: 'VALIDATION_ERROR', details: err.errors },
        });
      }
      if (err.status === 405) {
        logger.warn('OpenAPI 405 method not allowed', { method: req.method, path: req.originalUrl });
        return res.status(405).json({
          success: false,
          error: { message: err.message || 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
        });
      }
      if (err.status === 404) {
        return res.status(404).json({
          success: false,
          error: { message: 'Not found', code: 'NOT_FOUND' },
        });
      }
      next(err);
    });
    logger.info('OpenAPI request validation enabled');
  } catch (error) {
    logger.warn('express-openapi-validator not available - request validation disabled', { error: error?.message });
  }
}

module.exports = { registerDocsRoutes, registerOpenApiValidation };
