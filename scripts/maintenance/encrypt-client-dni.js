'use strict';
/**
 * Cifra el document_number (DNI) de los clientes que todavía están en texto plano.
 *
 * IMPORTANTE: ejecutar en el entorno que tiene el FIELD_ENCRYPTION_SECRET de PRODUCCIÓN
 * (p.ej. el shell de Railway del servicio patients). Si se corre con otra clave, la app
 * no podrá descifrar los valores -> pérdida de datos.
 *
 * Es idempotente: salta los registros que ya estén cifrados.
 *
 *   node scripts/maintenance/encrypt-client-dni.js
 */
require('dotenv').config();
const db = require('../../shared/db');
const { encrypt, isEncrypted } = require('../../shared/encryption');

(async () => {
  if (!process.env.FIELD_ENCRYPTION_SECRET) {
    console.error('ABORTADO: FIELD_ENCRYPTION_SECRET no está seteado en este entorno.');
    process.exit(1);
  }
  const rows = await db.query(
    `SELECT id, document_number FROM clients
      WHERE document_number IS NOT NULL AND document_number <> ''`
  );
  let cifrados = 0, saltados = 0;
  for (const r of rows) {
    if (isEncrypted(r.document_number)) { saltados++; continue; }
    await db.query(
      `UPDATE clients SET document_number = :v WHERE id = :id`,
      { v: encrypt(r.document_number), id: r.id }
    );
    cifrados++;
  }
  console.log(`document_number cifrados: ${cifrados} | ya cifrados (saltados): ${saltados} | total revisados: ${rows.length}`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
