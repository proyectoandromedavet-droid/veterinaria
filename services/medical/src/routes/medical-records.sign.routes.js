'use strict';

const { Router, db, R, logMedicalError } = require('./medical-records.sections.common');

// Roles autorizados para firmar fichas clínicas
const SIGN_ALLOWED_ROLES = new Set(['vet', 'veterinarian', 'admin', 'superadmin']);

const router = Router();

router.post('/:id/sign', async (req, res, next) => {
  try {
    // Solo roles autorizados pueden firmar fichas clínicas
    const userRoles = req.user?.roles || [];
    const canSign = userRoles.some((r) => SIGN_ALLOWED_ROLES.has(r));
    if (!canSign) {
      return R.forbidden(res, 'Solo veterinarios o administradores pueden firmar fichas clinicas', 'SIGN_FORBIDDEN');
    }

    // Verificar que la ficha no esté ya firmada antes de intentar la actualización
    // (doble firma: la ficha debe estar en estado 'open' o 'in_progress')
    // SEC: si el usuario tiene branchId asignado, exigir coincidencia exacta (no permitir null bypass)
    const userBranchId = req.user.branchId || null;
    const branchClause = userBranchId
      ? 'AND a.branch_id = :branchId'
      : '';   // sin branchId → usuario org-level (admin), se acepta cualquier sucursal de la org

    const [result] = await db.query(
      `UPDATE medical_records mr
       JOIN patients p ON mr.patient_id = p.id
       LEFT JOIN appointments a ON a.id = mr.appointment_id
       SET mr.status = 'signed',
           mr.signed_at = NOW(),
           mr.signed_by = :uid,
           mr.updated_at = NOW()
       WHERE mr.id = :id
         AND p.organization_id = :orgId
         ${branchClause}
         AND mr.signed_at IS NULL
         AND mr.status NOT IN ('signed', 'closed', 'cancelled')`,
      {
        id: req.params.id,
        uid: req.user.userId,
        orgId: req.user.orgId,
        branchId: userBranchId,
      }
    );

    if (!result.affectedRows) {
      // Verificar si existe o ya está firmada para dar el error correcto
      const existing = await db.queryOne(
        `SELECT mr.id, mr.status, mr.signed_at
           FROM medical_records mr
           JOIN patients p ON mr.patient_id = p.id
          WHERE mr.id = :id AND p.organization_id = :orgId`,
        { id: req.params.id, orgId: req.user.orgId }
      );
      if (!existing) return R.notFound(res, 'Ficha clinica no encontrada');
      return R.conflict(res, 'La ficha ya fue firmada o no admite modificaciones', 'MEDICAL_RECORD_ALREADY_SIGNED');
    }
    return R.ok(res, { message: 'Ficha clinica firmada exitosamente' });
  } catch (e) {
    if (e.message?.includes('SQLSTATE')) {
      return R.badRequest(res, e.message.replace(/.*SQLSTATE\[45000\]:.*: \d+ /, ''));
    }
    logMedicalError('records.POST /medical-records/:id/sign', e, { recordId: req.params.id, userId: req.user?.userId });
    next(e);
  }
});

module.exports = { router };
