'use strict';

const { Router } = require('express');
const { param } = require('express-validator');
const { db, R, requirePerm, getObjectBuffer, extractObjectRef, parseJson, logDocumentsError, createLabOrderFromDocument, validate } = require('../documents.common');
const { getDocumentCategoryCapability, isAutomaticIngestionSupported } = require('../lib/capabilities');

const router = Router();

router.post('/:id/ingest',
  requirePerm('medical_records:update'),
  param('id').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const document = await db.queryOne(
        `SELECT *
           FROM mail_document_inbox
          WHERE id = :id AND org_id = :orgId`,
        { id: req.params.id, orgId: req.user.orgId }
      );
      if (!document) return R.notFound(res, 'Inbox document not found');
      if (!document.patient_id) return R.conflict(res, 'Associate the document to a patient before ingestion');

      const metadata = parseJson(document.metadata_json, {});
      if (metadata.ingestion?.labOrderId) {
        return R.conflict(res, 'This document was already ingested into lab tables');
      }

      if (!isAutomaticIngestionSupported(document.document_category)) {
        const capability = getDocumentCategoryCapability(document.document_category);
        return R.error(
          res,
          501,
          `Automatic ingestion is not implemented for category '${document.document_category}' yet`,
          {
            category: document.document_category,
            automaticIngestionImplemented: false,
            notes: capability?.notes || 'Use manual association and downstream workflows.',
          },
          'DOCUMENTS_INGESTION_NOT_IMPLEMENTED'
        );
      }

      const ref = extractObjectRef(document.storage_path);
      if (!ref) return R.badRequest(res, 'Document has no readable storage reference');

      const pdfBuffer = await getObjectBuffer(ref.bucket, ref.objectName);
      let result;

      await db.transaction(async (conn) => {
        result = await createLabOrderFromDocument({ conn, document, pdfBuffer, user: req.user });

        const mergedMetadata = {
          ...metadata,
          ingestion: {
            kind: document.document_category,
            processedAt: new Date().toISOString(),
            labOrderId: result.orderId,
            orderNumber: result.orderNumber,
            createdItems: result.createdItems,
            extractedSummary: result.extractedSummary,
            extractedTextPreview: result.extractedText.slice(0, 4000),
          },
        };

        await conn.query(
          `UPDATE mail_document_inbox
              SET ingestion_status = 'processed',
                  error_message = NULL,
                  metadata_json = :metadataJson,
                  updated_at = NOW()
            WHERE id = :id AND org_id = :orgId`,
          { id: document.id, orgId: req.user.orgId, metadataJson: JSON.stringify(mergedMetadata) }
        );
      });

      return R.ok(res, {
        documentId: document.id,
        category: document.document_category,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        createdItems: result.createdItems,
      });
    } catch (err) {
      await db.query(
        `UPDATE mail_document_inbox
            SET ingestion_status = 'error',
                error_message = :message,
                updated_at = NOW()
          WHERE id = :id AND org_id = :orgId`,
        {
          id: req.params.id,
          orgId: req.user.orgId,
          message: String(err.message || 'Ingestion failed').slice(0, 512),
        }
      ).catch(() => {});
      logDocumentsError('POST /inbox/:id/ingest', err, { orgId: req.user?.orgId, id: req.params.id });
      next(err);
    }
  }
);

module.exports = { router };
