'use strict';

async function resolveMedicalRecordId(conn, { patientId, branchId, medicalRecordId = null }) {
  if (medicalRecordId) return medicalRecordId;
  if (!patientId || !branchId) return null;

  const row = await conn.queryOne(
    `SELECT mr.id
       FROM medical_records mr
       JOIN appointments a ON a.id = mr.appointment_id
      WHERE mr.patient_id = :patientId
        AND a.branch_id = :branchId
      ORDER BY FIELD(mr.status, 'open', 'amended', 'signed'),
               COALESCE(mr.visit_date, mr.opened_at) DESC,
               mr.id DESC
      LIMIT 1`,
    { patientId, branchId }
  );

  return row?.id || null;
}

module.exports = {
  resolveMedicalRecordId,
};
