'use strict';

const fs = require('fs');
const path = require('path');

let bundleCache = null;
let bundleLoaded = false;

function normalizeValue(value, { trim = true } = {}) {
  if (value == null) return value;
  const text = String(value);
  return trim ? text.trim() : text;
}

function loadBundle() {
  if (bundleLoaded) return bundleCache;
  bundleLoaded = true;
  bundleCache = {};

  const inlineJson = process.env.SECRETS_JSON;
  const bundleFile = process.env.SECRETS_FILE;

  try {
    if (inlineJson) {
      bundleCache = JSON.parse(inlineJson);
      return bundleCache;
    }

    if (bundleFile) {
      bundleCache = JSON.parse(fs.readFileSync(path.resolve(bundleFile), 'utf8'));
      return bundleCache;
    }
  } catch (err) {
    const wrapped = new Error(`Secrets bundle could not be loaded: ${err.message}`);
    wrapped.cause = err;
    throw wrapped;
  }

  return bundleCache;
}

function readSecretFile(filePath, { trim = false } = {}) {
  if (!filePath) return null;
  return normalizeValue(fs.readFileSync(path.resolve(filePath), 'utf8'), { trim });
}

function getSecret(name, {
  defaultValue = null,
  trim = true,
  allowEmpty = false,
  fileEnvName = `${name}_FILE`,
} = {}) {
  const direct = process.env[name];
  if (direct != null) {
    const value = normalizeValue(direct, { trim });
    if (allowEmpty || value !== '') return value;
  }

  const fromFile = process.env[fileEnvName];
  if (fromFile) {
    const value = readSecretFile(fromFile, { trim });
    if (allowEmpty || value !== '') return value;
  }

  const bundle = loadBundle();
  if (bundle && typeof bundle === 'object' && Object.prototype.hasOwnProperty.call(bundle, name)) {
    const value = normalizeValue(bundle[name], { trim });
    if (allowEmpty || value !== '') return value;
  }

  return defaultValue;
}

function getAnySecret(names, options = {}) {
  for (const name of names) {
    const value = getSecret(name, options);
    if (value != null && (options.allowEmpty || value !== '')) return value;
  }
  return options.defaultValue ?? null;
}

function resetSecretCache() {
  bundleCache = null;
  bundleLoaded = false;
}

module.exports = {
  getSecret,
  getAnySecret,
  readSecretFile,
  resetSecretCache,
};
