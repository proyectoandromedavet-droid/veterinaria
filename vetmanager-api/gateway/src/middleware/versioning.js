'use strict';

/**
 * API versioning middleware.
 *
 * Adds versioning headers to all API responses:
 *   API-Version:      the current active version (e.g. v1)
 *   API-Supported:    comma-separated list of supported versions
 *
 * For deprecated routes, adds RFC 8594 / draft-ietf-httpapi-deprecation-header:
 *   Deprecation:      ISO date when deprecation took effect (or "true")
 *   Sunset:           ISO date when the version will be removed
 *   Link:             <url>; rel="deprecation"
 *
 * Config:
 *   DEPRECATED_VERSIONS  — JSON: { "v0": { "sunset": "2025-12-31", "migration": "/api/v1/docs" } }
 *   API_VERSIONS         — comma-separated: "v1,v2" (default: current version only)
 */

const CURRENT_VERSION = process.env.API_VERSION || 'v1';

// Parse DEPRECATED_VERSIONS from env — format:
// { "v0": { "sunset": "2025-12-31", "deprecation": "2024-01-01", "migration": "/api/v1/docs" } }
function getDeprecatedVersions() {
  try {
    return JSON.parse(process.env.DEPRECATED_VERSIONS || '{}');
  } catch {
    return {};
  }
}

function getSupportedVersions() {
  const extra = (process.env.API_VERSIONS || '').split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set([CURRENT_VERSION, ...extra])];
}

/**
 * Middleware — attaches versioning headers to every API response.
 * Mount before proxy routes.
 */
function versioningMiddleware(req, res, next) {
  const supported = getSupportedVersions();
  res.setHeader('API-Version',   CURRENT_VERSION);
  res.setHeader('API-Supported', supported.join(', '));

  // Detect which version is being requested (from path prefix)
  const match = req.path.match(/^\/api\/(v\d+)\//);
  if (!match) return next();

  const requestedVersion = match[1];
  const deprecated = getDeprecatedVersions();

  if (deprecated[requestedVersion]) {
    const info = deprecated[requestedVersion];

    // RFC 8594 Deprecation header
    const deprecationDate = info.deprecation
      ? new Date(info.deprecation).toUTCString()
      : 'true';
    res.setHeader('Deprecation', deprecationDate);

    // RFC 8594 Sunset header
    if (info.sunset) {
      res.setHeader('Sunset', new Date(info.sunset).toUTCString());
    }

    // Link to migration docs
    if (info.migration) {
      res.setHeader('Link', `<${info.migration}>; rel="deprecation"`);
    }
  }

  next();
}

/**
 * Middleware factory — marks a specific route as deprecated.
 * Use directly on a route when you want per-route deprecation notices:
 *   app.get('/v1/old-endpoint', deprecated({ sunset: '2025-06-01' }), handler)
 *
 * @param {object} opts
 * @param {string} [opts.sunset]       — ISO date string
 * @param {string} [opts.deprecation]  — ISO date string (defaults to now)
 * @param {string} [opts.migration]    — URL to replacement docs
 */
function deprecated({ sunset, deprecation, migration } = {}) {
  return (_req, res, next) => {
    res.setHeader('Deprecation', deprecation ? new Date(deprecation).toUTCString() : 'true');
    if (sunset)    res.setHeader('Sunset', new Date(sunset).toUTCString());
    if (migration) res.setHeader('Link', `<${migration}>; rel="deprecation"`);
    next();
  };
}

/**
 * Middleware que inyecta X-API-Version en el request antes del proxy.
 * El servicio downstream puede leer este header para comportamiento v2.
 */
function injectVersionHeader(version) {
  return (req, _res, next) => {
    req.headers['x-api-version'] = version;
    next();
  };
}

module.exports = { versioningMiddleware, deprecated, injectVersionHeader };
