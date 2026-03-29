'use strict';

/**
 * AFIP — Factura Electrónica Argentina (WSFE).
 * Usa @afipsdk/afip.js que encapsula WSAA + WSFE via SOAP.
 *
 * Variables de entorno por organización (o globales de entorno):
 *   AFIP_CUIT          — CUIT de la organización (sin guiones, ej: 20123456789)
 *   AFIP_CERT          — Contenido del certificado .pem (o ruta con AFIP_CERT_PATH)
 *   AFIP_KEY           — Clave privada .key (o ruta con AFIP_KEY_PATH)
 *   AFIP_PRODUCTION    — 'true' para producción, 'false' para homologación (sandbox)
 *   AFIP_PUNTO_VENTA   — Número de punto de venta (ej: 1)
 *
 * Tipos de comprobante más comunes:
 *   1  = Factura A       (responsable inscripto → responsable inscripto)
 *   6  = Factura B       (responsable inscripto → consumidor final)
 *   11 = Factura C       (monotributista)
 *   3  = Nota de Crédito A
 *   8  = Nota de Crédito B
 *
 * Docs: https://www.afip.gob.ar/fe/documentos/
 */

const Afip = require('@afipsdk/afip.js');
const fs   = require('fs');
const db   = require('./db');

// ── Cache de instancias por CUIT ──────────────────────────────────────────────
const _instances = new Map();

/**
 * Obtener instancia AFIP para una org.
 * Si la org tiene credenciales en DB las usa; si no, cae a las de entorno.
 * @param {number} orgId
 */
async function getInstance(orgId) {
  if (_instances.has(orgId)) return _instances.get(orgId);

  // Intentar cargar credenciales desde DB
  let cuit, cert, key, production, puntoVenta;

  const creds = orgId
    ? await db.queryOne(
        `SELECT afip_cuit, afip_cert, afip_key, afip_production, afip_punto_venta
         FROM organizations WHERE id=:id`,
        { id: orgId }
      ).catch(() => null)
    : null;

  if (creds?.afip_cuit) {
    cuit        = creds.afip_cuit;
    cert        = creds.afip_cert;
    key         = creds.afip_key;
    production  = creds.afip_production === 1;
    puntoVenta  = creds.afip_punto_venta || 1;
  } else {
    // Fallback a variables de entorno
    cuit        = process.env.AFIP_CUIT;
    production  = process.env.AFIP_PRODUCTION === 'true';
    puntoVenta  = parseInt(process.env.AFIP_PUNTO_VENTA || '1');

    cert = process.env.AFIP_CERT
      || (process.env.AFIP_CERT_PATH ? fs.readFileSync(process.env.AFIP_CERT_PATH, 'utf8') : null);
    key  = process.env.AFIP_KEY
      || (process.env.AFIP_KEY_PATH  ? fs.readFileSync(process.env.AFIP_KEY_PATH,  'utf8') : null);
  }

  if (!cuit || !cert || !key) {
    throw new Error('Credenciales AFIP no configuradas para esta organización');
  }

  const instance = new Afip({ CUIT: cuit, cert, key, production, res_folder: '/tmp/afip_tokens' });
  _instances.set(orgId, { client: instance, puntoVenta, cuit });
  return _instances.get(orgId);
}

// ── Obtener último número de comprobante ──────────────────────────────────────
/**
 * @param {number} orgId
 * @param {number} tipoComprobante  (1=FA, 6=FB, 11=FC, etc.)
 */
async function getLastVoucherNumber(orgId, tipoComprobante) {
  const { client, puntoVenta } = await getInstance(orgId);
  return client.ElectronicBilling.getLastVoucher(puntoVenta, tipoComprobante);
}

// ── Autorizar comprobante (obtener CAE) ───────────────────────────────────────
/**
 * Crea el comprobante en AFIP y devuelve el CAE.
 *
 * @param {object} opts
 * @param {number}   opts.orgId
 * @param {number}   opts.tipoComprobante     1=FA, 6=FB, 11=FC
 * @param {number}   opts.tipoDocReceptor     80=CUIT, 86=CUIL, 96=DNI, 99=Consumidor Final
 * @param {string}   opts.nroDocReceptor      CUIT/DNI del receptor ('0' para consumidor final)
 * @param {number}   opts.importeTotal        Total de la factura
 * @param {number}   opts.importeNeto         Importe neto gravado
 * @param {number}   opts.importeIVA          Importe IVA
 * @param {number}   opts.importeNoGravado    Importe no gravado (0 si no aplica)
 * @param {number}   opts.importeExento       Importe exento (0 si no aplica)
 * @param {object[]} [opts.iva]               Alícuotas IVA [{id, baseImp, importe}]
 * @param {string}   [opts.concepto]          1=Productos, 2=Servicios, 3=Ambos (default 3)
 * @returns {{ cae, caeFechaVencimiento, nroComprobante }}
 */
async function authorizeVoucher(opts) {
  const {
    orgId, tipoComprobante, tipoDocReceptor = 99, nroDocReceptor = '0',
    importeTotal, importeNeto = 0, importeIVA = 0,
    importeNoGravado = 0, importeExento = 0,
    iva = [], concepto = '3',
  } = opts;

  const { client, puntoVenta } = await getInstance(orgId);

  // Obtener próximo número
  const lastNumber  = await client.ElectronicBilling.getLastVoucher(puntoVenta, tipoComprobante);
  const nroComp     = lastNumber + 1;

  const today = new Date();
  const fecha = today.toISOString().slice(0, 10).replace(/-/g, '');  // YYYYMMDD
  // Vencimiento CAE: +10 días
  const vto   = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '');

  const data = {
    'CantReg':       1,
    'PtoVta':        puntoVenta,
    'CbteTipo':      tipoComprobante,
    'Concepto':      parseInt(concepto),
    'DocTipo':       tipoDocReceptor,
    'DocNro':        nroDocReceptor,
    'CbteDesde':     nroComp,
    'CbteHasta':     nroComp,
    'CbteFch':       fecha,
    'ImpTotal':      importeTotal,
    'ImpTotConc':    importeNoGravado,
    'ImpNeto':       importeNeto,
    'ImpOpEx':       importeExento,
    'ImpIVA':        importeIVA,
    'ImpTrib':       0,
    'FchServDesde':  concepto !== '1' ? fecha : null,
    'FchServHasta':  concepto !== '1' ? fecha : null,
    'FchVtoPago':    concepto !== '1' ? vto   : null,
    'MonId':         'PES',
    'MonCotiz':      1,
    'Iva':           iva.length ? iva : [{ 'Id': 5, 'BaseImp': importeNeto, 'Importe': importeIVA }],
  };

  const result = await client.ElectronicBilling.createVoucher(data);

  return {
    cae:                result.CAE,
    caeFechaVencimiento: result.CAEFchVto,
    nroComprobante:     nroComp,
    puntoVenta,
  };
}

// ── Tipos de comprobante ──────────────────────────────────────────────────────
const TIPOS_COMPROBANTE = {
  FACTURA_A:        1,
  NOTA_CREDITO_A:   3,
  NOTA_DEBITO_A:    2,
  FACTURA_B:        6,
  NOTA_CREDITO_B:   8,
  NOTA_DEBITO_B:    7,
  FACTURA_C:        11,
  NOTA_CREDITO_C:   13,
};

const TIPO_DOC = {
  CUIT: 80,
  CUIL: 86,
  DNI:  96,
  CONSUMIDOR_FINAL: 99,
};

/**
 * Determinar tipo de comprobante según la condición fiscal del receptor.
 * Responsable Inscripto → FA; Monotributo/Consumidor Final → FB
 * @param {'RI'|'MO'|'CF'|'EX'} condicionFiscal
 */
function getTipoComprobante(condicionFiscal) {
  return condicionFiscal === 'RI' ? TIPOS_COMPROBANTE.FACTURA_A : TIPOS_COMPROBANTE.FACTURA_B;
}

module.exports = {
  getInstance,
  getLastVoucherNumber,
  authorizeVoucher,
  TIPOS_COMPROBANTE,
  TIPO_DOC,
  getTipoComprobante,
};
