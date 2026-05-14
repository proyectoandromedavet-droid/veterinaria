'use strict';

/**
 * shared/ai.js
 * Adaptador unificado para proveedores de IA.
 * Soporta: openai (GPT-4o), anthropic (Claude), mock (tests/dev sin clave).
 */

const PROVIDER = process.env.AI_PROVIDER || 'openai';
const DEFAULT_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '1024');
const { getBreaker } = require('./circuitBreaker');
const { getSecret } = require('./secrets');
const aiBreaker = getBreaker('openai', {
  threshold: parseInt(process.env.AI_CIRCUIT_THRESHOLD || process.env.CIRCUIT_THRESHOLD || '5'),
  timeout: parseInt(process.env.AI_CIRCUIT_TIMEOUT_MS || process.env.CIRCUIT_TIMEOUT_MS || '30000'),
  successReq: parseInt(process.env.AI_CIRCUIT_SUCCESS || process.env.CIRCUIT_SUCCESS || '2'),
});

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function _post(hostname, path, extraHeaders, body) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type'  : 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...extraHeaders,
    };
    const req = https.request(
      { hostname, path, method: 'POST', headers },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

const adapters = {

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  openai: {
    async complete(messages, opts = {}) {
      const body = {
        model      : opts.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        max_tokens : opts.maxTokens || DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? 0.3,
      };
      if (opts.json) body.response_format = { type: 'json_object' };

      const res = await _post(
        'api.openai.com', '/v1/chat/completions',
        { Authorization: `Bearer ${getSecret('OPENAI_API_KEY', { defaultValue: '' })}` },
        body
      );
      if (res.error) throw Object.assign(new Error(res.error.message), { code: 'AI_API_ERROR', provider: 'openai' });
      return res.choices[0].message.content;
    },

    async analyzeImage(base64OrUrl, prompt, opts = {}) {
      const imgContent = base64OrUrl.startsWith('http')
        ? { type: 'image_url', image_url: { url: base64OrUrl, detail: 'high' } }
        : { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64OrUrl}`, detail: 'high' } };

      const res = await _post(
        'api.openai.com', '/v1/chat/completions',
        { Authorization: `Bearer ${getSecret('OPENAI_API_KEY', { defaultValue: '' })}` },
        {
          model     : opts.model || process.env.OPENAI_VISION_MODEL || 'gpt-4o',
          messages  : [{ role: 'user', content: [imgContent, { type: 'text', text: prompt }] }],
          max_tokens: opts.maxTokens || 1024,
        }
      );
      if (res.error) throw Object.assign(new Error(res.error.message), { code: 'AI_API_ERROR', provider: 'openai' });
      return res.choices[0].message.content;
    },

    async embedText(text) {
      const res = await _post(
        'api.openai.com', '/v1/embeddings',
        { Authorization: `Bearer ${getSecret('OPENAI_API_KEY', { defaultValue: '' })}` },
        { model: 'text-embedding-3-small', input: text.slice(0, 8192) }
      );
      if (res.error) throw Object.assign(new Error(res.error.message), { code: 'AI_API_ERROR', provider: 'openai' });
      return res.data[0].embedding;
    },
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────
  anthropic: {
    async complete(messages, opts = {}) {
      const system   = messages.find(m => m.role === 'system')?.content || '';
      const filtered = messages.filter(m => m.role !== 'system');
      const body = {
        model     : opts.model || process.env.ANTHROPIC_MODEL || 'claude-haiku-20240307',
        max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
        messages  : filtered,
      };
      if (system) body.system = system;

      const res = await _post(
        'api.anthropic.com', '/v1/messages',
        { 'x-api-key': getSecret('ANTHROPIC_API_KEY', { defaultValue: '' }), 'anthropic-version': '2023-06-01' },
        body
      );
      if (res.type === 'error') throw Object.assign(new Error(res.error?.message || 'Anthropic error'), { code: 'AI_API_ERROR', provider: 'anthropic' });
      return res.content[0].text;
    },

    async analyzeImage(base64OrUrl, prompt, opts = {}) {
      const imgSource = base64OrUrl.startsWith('http')
        ? { type: 'url', url: base64OrUrl }
        : { type: 'base64', media_type: opts.mimeType || 'image/jpeg', data: base64OrUrl };

      const res = await _post(
        'api.anthropic.com', '/v1/messages',
        { 'x-api-key': getSecret('ANTHROPIC_API_KEY', { defaultValue: '' }), 'anthropic-version': '2023-06-01' },
        {
          model     : opts.model || process.env.ANTHROPIC_VISION_MODEL || 'claude-opus-4-5',
          max_tokens: opts.maxTokens || 1024,
          messages  : [{
            role   : 'user',
            content: [
              { type: 'image', source: imgSource },
              { type: 'text',  text: prompt },
            ],
          }],
        }
      );
      if (res.type === 'error') throw Object.assign(new Error(res.error?.message || 'Anthropic error'), { code: 'AI_API_ERROR', provider: 'anthropic' });
      return res.content[0].text;
    },

    async embedText() {
      throw Object.assign(new Error('Embeddings no soportados en Anthropic'), { code: 'NOT_SUPPORTED' });
    },
  },

  // ── Mock (tests y dev sin clave) ─────────────────────────────────────────────
  mock: {
    async complete(messages, opts = {}) {
      const last = messages[messages.length - 1]?.content || '';
      if (opts.json) return JSON.stringify({ mock: true, input: last.slice(0, 80) });
      return `[MOCK] ${last.slice(0, 80)}`;
    },
    async analyzeImage(_src, prompt) {
      return `[MOCK-VISION] ${prompt.slice(0, 80)}`;
    },
    async embedText(text) {
      const vec = new Array(1536).fill(0);
      vec[0] = (text.length % 1000) / 1000;
      return vec;
    },
  },
};

// ─── Public API ────────────────────────────────────────────────────────────────

function getAdapter() {
  const a = adapters[PROVIDER];
  if (!a) throw Object.assign(new Error(`Proveedor IA desconocido: ${PROVIDER}`), { code: 'UNKNOWN_PROVIDER' });
  return a;
}

/**
 * Genera una respuesta de chat.
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts] — model, maxTokens, temperature, json
 * @returns {Promise<string>}
 */
async function complete(messages, opts = {}) {
  if (!aiBreaker.canRequest()) {
    throw Object.assign(new Error('AI provider temporarily unavailable'), { code: 'AI_CIRCUIT_OPEN' });
  }
  try {
    const result = await getAdapter().complete(messages, opts);
    aiBreaker.onSuccess();
    return result;
  } catch (err) {
    aiBreaker.onFailure();
    throw err;
  }
}

/**
 * Analiza una imagen médica.
 * @param {string} base64OrUrl — base64 data o URL pública
 * @param {string} prompt
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function analyzeImage(base64OrUrl, prompt, opts = {}) {
  if (!aiBreaker.canRequest()) {
    throw Object.assign(new Error('AI provider temporarily unavailable'), { code: 'AI_CIRCUIT_OPEN' });
  }
  try {
    const result = await getAdapter().analyzeImage(base64OrUrl, prompt, opts);
    aiBreaker.onSuccess();
    return result;
  } catch (err) {
    aiBreaker.onFailure();
    throw err;
  }
}

/**
 * Genera un embedding de texto para búsqueda semántica / RAG.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedText(text) {
  if (!aiBreaker.canRequest()) {
    throw Object.assign(new Error('AI provider temporarily unavailable'), { code: 'AI_CIRCUIT_OPEN' });
  }
  try {
    const result = await getAdapter().embedText(text);
    aiBreaker.onSuccess();
    return result;
  } catch (err) {
    aiBreaker.onFailure();
    throw err;
  }
}

module.exports = { complete, analyzeImage, embedText, PROVIDER, adapters };
