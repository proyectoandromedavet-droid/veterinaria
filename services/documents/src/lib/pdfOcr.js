'use strict';

const fs = require('fs/promises');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { createWorker, PSM } = require('tesseract.js');
const eng = require('@tesseract.js-data/eng');
const spa = require('@tesseract.js-data/spa');

const OCR_LANGS = ['spa', 'eng'];
const OCR_TESSDATA_DIR = path.resolve(__dirname, '../../../../.cache/tessdata');
const OCR_MIN_LENGTH = 80;

// ── Worker singleton ──────────────────────────────────────────────────────────
// Tesseract worker carga ~300ms y consume ~150MB. Se inicializa una sola vez
// y se reutiliza entre requests. Si falla, se descarta y el próximo request
// crea uno nuevo.

let _worker = null;
let _initPromise = null;

async function _initWorker() {
  const tessdataDir = await ensureLanguageData();
  const w = await createWorker(OCR_LANGS, 1, { langPath: tessdataDir, gzip: true });
  await w.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
  });
  _worker = w;
  return w;
}

async function getWorker() {
  if (_worker) return _worker;
  if (!_initPromise) {
    _initPromise = _initWorker().catch((err) => {
      _initPromise = null; // permite reintentar en el próximo request
      throw err;
    });
  }
  return _initPromise;
}

function resetWorker() {
  _worker = null;
  _initPromise = null;
}

class NodeCanvasFactory {
  create(width, height) {
    if (!(width > 0 && height > 0)) {
      throw new Error('Invalid canvas size');
    }
    const canvas = createCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext('2d'),
    };
  }

  reset(target, width, height) {
    if (!target?.canvas) {
      throw new Error('Canvas target is required');
    }
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target) {
    if (!target?.canvas) return;
    target.canvas.width = 0;
    target.canvas.height = 0;
    target.canvas = null;
    target.context = null;
  }
}

function compact(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasUsefulText(text) {
  const cleaned = compact(text);
  if (cleaned.length < OCR_MIN_LENGTH) return false;
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  return wordCount >= 12;
}

async function ensureLanguageData() {
  await fs.mkdir(OCR_TESSDATA_DIR, { recursive: true });

  const languages = [eng, spa];
  for (const lang of languages) {
    const source = path.join(lang.langPath, `${lang.code}.traineddata.gz`);
    const target = path.join(OCR_TESSDATA_DIR, `${lang.code}.traineddata.gz`);
    try {
      await fs.access(target);
    } catch {
      await fs.copyFile(source, target);
    }
  }

  return OCR_TESSDATA_DIR;
}

async function renderPdfPages(pdfBuffer, maxPages = 3) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableWorker: true,
    isEvalSupported: false,
  });

  const document = await loadingTask.promise;
  const canvasFactory = new NodeCanvasFactory();
  const pages = [];

  try {
    const totalPages = Math.min(document.numPages || 0, maxPages);
    for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
      const page = await document.getPage(pageNum);
      const MAX_DIM_PX = 4096;
      const rawScale = 2;
      const baseViewport = page.getViewport({ scale: 1 });
      const maxScale = Math.min(rawScale, MAX_DIM_PX / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale: maxScale });
      const target = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));

      try {
        await page.render({
          canvasContext: target.context,
          viewport,
          canvasFactory,
        }).promise;

        pages.push({
          pageNumber: pageNum,
          image: target.canvas.toBuffer('image/png'),
        });
      } finally {
        page.cleanup();
        canvasFactory.destroy(target);
      }
    }
  } finally {
    await document.destroy();
    await loadingTask.destroy();
  }

  return pages;
}

async function extractTextWithOcr(pdfBuffer, options = {}) {
  const maxPages = Math.min(Math.max(Number(options.maxPages) || 3, 1), 50);
  const pages = await renderPdfPages(pdfBuffer, maxPages);
  const texts = [];

  const worker = await getWorker();
  try {
    for (const page of pages) {
      const result = await worker.recognize(page.image);
      const text = compact(result?.data?.text);
      if (text) texts.push(`--- page ${page.pageNumber} ---\n${text}`);
    }
  } catch (err) {
    // Worker en estado inválido — resetear para que el próximo request lo recree
    resetWorker();
    throw err;
  }

  return {
    text: compact(texts.join('\n\n')),
    source: 'ocr',
    pagesProcessed: pages.length,
  };
}

module.exports = {
  extractTextWithOcr,
  hasUsefulText,
};
