'use strict';

const { Router } = require('express');
const db = require('../../../../shared/db');
const R  = require('../../../../shared/response');

const router = Router();

function fromHeaders(req, _res, next) {
  req.user = {
    userId:   req.headers['x-user-id'],
    orgId:    req.headers['x-org-id'],
    branchId: req.headers['x-branch-id'],
    roles:    (req.headers['x-user-roles'] || '').split(',').filter(Boolean),
  };
  next();
}

function requireAdmin(req, res, next) {
  const roles = req.user?.roles || [];
  if (roles.some(r => ['superadmin', 'org_admin'].includes(r))) return next();
  return res.status(403).json({ success: false, error: { message: 'Se requiere rol org_admin', code: 'FORBIDDEN' } });
}

// Tablas operativas/sistema que no son de negocio — excluidas del explorador
const SYSTEM_TABLE_PATTERN = [
  '^v_',                        // vistas
  '^audit_',                    // logs de auditoría
  '_archive$',                  // archivos históricos
  '_session',                   // sesiones
  '_token',                     // tokens
  'login_history',
  'security_alert',
  'security_event',
  'notification_log',
  'message_log',
  'subscription_event',
  'report_run',
  'service_registry_snapshot',
  'data_classification',
  'data_retention',
  'webrtc_',
  'ip_rule',
  'api_key',
  'two_factor',
  'user_fcm',
  'cross_branch',
  'org_plugin',
  'org_role_override',
  'organization_auth_polic',
  'organization_sso',
  'migration_',
  'tenant',
  'business_rule',
  'stock_alert',
  'in_app_notification',
].join('|');

// Etiquetas en español para tablas conocidas (opcional — si no está, se usa el nombre de la tabla)
const TABLE_LABELS = {
  patients:                    { label: 'Pacientes',              description: 'Animales registrados en el sistema' },
  clients:                     { label: 'Clientes / Propietarios',description: 'Dueños responsables de los pacientes' },
  appointments:                { label: 'Turnos',                 description: 'Citas agendadas para los pacientes' },
  appointment_types:           { label: 'Tipos de Turno',         description: 'Categorías de turnos disponibles' },
  vaccinations:                { label: 'Vacunaciones',           description: 'Historial de vacunas aplicadas' },
  vaccines:                    { label: 'Vacunas (catálogo)',      description: 'Vacunas disponibles en el sistema' },
  vaccine_manufacturers:       { label: 'Fabricantes de Vacunas', description: 'Laboratorios que producen las vacunas' },
  medical_records:             { label: 'Fichas Médicas',         description: 'Registro de cada consulta veterinaria' },
  anamnesis:                   { label: 'Anamnesis',              description: 'Historial clínico previo del paciente' },
  physical_examinations:       { label: 'Exámenes Físicos',       description: 'Resultados de exámenes físicos en consulta' },
  species:                     { label: 'Especies',               description: 'Catálogo de especies animales' },
  species_categories:          { label: 'Categorías de Especies', description: 'Grupos de especies (mascotas, aves, etc.)' },
  breeds:                      { label: 'Razas',                  description: 'Razas por especie' },
  coat_colors:                 { label: 'Colores de Pelaje',      description: 'Colores disponibles para identificar el animal' },
  inventory_items:             { label: 'Inventario',             description: 'Medicamentos e insumos de la clínica' },
  inventory_batches:           { label: 'Lotes de Inventario',    description: 'Lotes con fecha de vencimiento' },
  inventory_movements:         { label: 'Movimientos de Stock',   description: 'Entradas y salidas de inventario' },
  inventory_stock:             { label: 'Stock por Sucursal',     description: 'Stock actual por sucursal e ítem' },
  invoices:                    { label: 'Facturas',               description: 'Comprobantes de cobro a clientes' },
  invoice_items:               { label: 'Ítems de Factura',       description: 'Líneas de detalle de cada factura' },
  payments:                    { label: 'Pagos',                  description: 'Pagos recibidos por facturas' },
  surgeries:                   { label: 'Cirugías',               description: 'Procedimientos quirúrgicos' },
  surgery_types:               { label: 'Tipos de Cirugía',       description: 'Catálogo de procedimientos quirúrgicos' },
  surgery_categories:          { label: 'Categorías de Cirugía',  description: 'Grupos de tipos de cirugía' },
  anesthesia_records:          { label: 'Registros de Anestesia', description: 'Control anestésico en cirugías' },
  hospitalizations:            { label: 'Hospitalizaciones',      description: 'Internaciones de pacientes' },
  hospitalization_medications: { label: 'Medicación Internados',  description: 'Medicamentos administrados a internados' },
  hospitalization_monitoring:  { label: 'Control de Internados',  description: 'Signos vitales y evolución de internados' },
  kennels:                     { label: 'Jaulas / Espacios',      description: 'Espacios de internación disponibles' },
  wards:                       { label: 'Sectores de Internación', description: 'Sectores del área de internación' },
  prescriptions:               { label: 'Recetas',                description: 'Recetas médicas emitidas' },
  prescription_items:          { label: 'Ítems de Receta',        description: 'Medicamentos de cada receta' },
  lab_orders:                  { label: 'Pedidos de Lab.',        description: 'Órdenes de análisis de laboratorio' },
  lab_order_items:             { label: 'Análisis Pedidos',       description: 'Tests individuales de cada orden' },
  lab_tests:                   { label: 'Análisis (catálogo)',     description: 'Tipos de análisis disponibles' },
  lab_test_categories:         { label: 'Categorías de Lab.',     description: 'Grupos de análisis (hematología, etc.)' },
  lab_test_panels:             { label: 'Paneles de Lab.',        description: 'Combinaciones de tests habituales' },
  lab_panel_tests:             { label: 'Tests de Paneles',       description: 'Tests que integran cada panel' },
  lab_results:                 { label: 'Resultados de Lab.',     description: 'Resultados de cada análisis' },
  lab_reference_ranges:        { label: 'Rangos de Referencia',   description: 'Valores normales por especie y test' },
  imaging_orders:              { label: 'Pedidos de Imágenes',    description: 'Órdenes de estudios de imagen' },
  imaging_studies:             { label: 'Estudios de Imagen',     description: 'Radiografías, ecografías, etc.' },
  imaging_images:              { label: 'Imágenes',               description: 'Archivos de imagen de estudios' },
  imaging_reports:             { label: 'Informes de Imagen',     description: 'Informes de estudios de imagen' },
  imaging_types:               { label: 'Tipos de Imagen',        description: 'Tipos de estudios de imagen' },
  pathology_orders:            { label: 'Pedidos Patología',      description: 'Órdenes de análisis histopatológico' },
  pathology_samples:           { label: 'Muestras de Patología',  description: 'Muestras enviadas a patología' },
  pathology_results:           { label: 'Resultados Patología',   description: 'Informes de patología' },
  pathology_types:             { label: 'Tipos de Patología',     description: 'Categorías de análisis patológico' },
  grooming_appointments:       { label: 'Turnos de Grooming',     description: 'Citas de peluquería/baño' },
  grooming_records:            { label: 'Registros de Grooming',  description: 'Servicios de grooming realizados' },
  grooming_service_types:      { label: 'Servicios de Grooming',  description: 'Catálogo de servicios de grooming' },
  grooming_ratings:            { label: 'Calificaciones Grooming',description: 'Valoraciones de clientes al grooming' },
  groomers:                    { label: 'Groomers',               description: 'Personal de peluquería' },
  groomer_commission_records:  { label: 'Comisiones Groomer',     description: 'Comisiones calculadas por groomer' },
  patient_grooming_profile:    { label: 'Perfil Grooming Paciente',description: 'Preferencias de grooming del animal' },
  tele_sessions:               { label: 'Sesiones Telemedicina',  description: 'Consultas realizadas por videollamada' },
  tele_messages:               { label: 'Mensajes Telemedicina',  description: 'Chat de sesiones de telemedicina' },
  tele_platforms:              { label: 'Plataformas Tele',       description: 'Plataformas de videollamada configuradas' },
  tele_digital_prescriptions:  { label: 'Recetas Digitales Tele', description: 'Recetas emitidas en telemedicina' },
  tele_pre_anamnesis:          { label: 'Pre-Anamnesis Tele',     description: 'Formulario previo a la teleconsulta' },
  tele_ratings:                { label: 'Calificaciones Tele',    description: 'Valoraciones de las teleconsultas' },
  tele_shared_documents:       { label: 'Docs Compartidos Tele',  description: 'Documentos enviados en telemedicina' },
  antiparasitic_products:      { label: 'Antiparasitarios',       description: 'Productos antiparasitarios disponibles' },
  deworming_records:           { label: 'Desparasitaciones',      description: 'Historial de desparasitaciones' },
  medications:                 { label: 'Medicamentos',           description: 'Catálogo de medicamentos' },
  treatments:                  { label: 'Tratamientos',           description: 'Tratamientos aplicados a pacientes' },
  diagnoses:                   { label: 'Diagnósticos',           description: 'Diagnósticos registrados en fichas' },
  patient_allergies:           { label: 'Alergias del Paciente',  description: 'Alergias conocidas de cada animal' },
  patient_chronic_conditions:  { label: 'Condiciones Crónicas',   description: 'Enfermedades crónicas del paciente' },
  patient_transfers:           { label: 'Transferencias',         description: 'Transferencias de paciente entre sucursales' },
  emergency_triage:            { label: 'Triaje de Emergencias',  description: 'Clasificación de urgencias al ingreso' },
  reminders:                   { label: 'Recordatorios',          description: 'Recordatorios enviados a clientes' },
  follow_ups:                  { label: 'Seguimientos',           description: 'Seguimiento post-consulta de pacientes' },
  services_catalog:            { label: 'Catálogo de Servicios',  description: 'Servicios ofrecidos por la clínica' },
  service_categories:          { label: 'Categorías de Servicios',description: 'Grupos de servicios' },
  price_lists:                 { label: 'Listas de Precios',      description: 'Listas de precios configuradas' },
  price_list_items:            { label: 'Ítems de Lista de Precios',description: 'Precios por servicio o producto' },
  suppliers:                   { label: 'Proveedores',            description: 'Proveedores de insumos y medicamentos' },
  purchase_orders:             { label: 'Órdenes de Compra',      description: 'Pedidos realizados a proveedores' },
  purchase_order_items:        { label: 'Ítems Orden de Compra',  description: 'Detalle de cada orden de compra' },
  branches:                    { label: 'Sucursales',             description: 'Sucursales de la organización' },
  organizations:               { label: 'Organizaciones',        description: 'Clínicas u organizaciones registradas' },
  users:                       { label: 'Usuarios del Sistema',   description: 'Personal con acceso al sistema' },
  roles:                       { label: 'Roles',                  description: 'Roles de acceso disponibles' },
  species_categories_ref:      { label: 'Categorías de Especies', description: 'Clasificación de especies' },
  countries:                   { label: 'Países',                 description: 'Países disponibles para configuración' },
  states:                      { label: 'Provincias / Estados',   description: 'Provincias o estados por país' },
  cities:                      { label: 'Ciudades',               description: 'Ciudades disponibles' },
  currencies:                  { label: 'Monedas',                description: 'Monedas configuradas en el sistema' },
};

// Descripciones de columnas comunes a todas las tablas
const COMMON_COL_DESC = {
  id:              'Identificador único autogenerado',
  organization_id: 'Organización a la que pertenece el registro',
  branch_id:       'Sucursal a la que pertenece el registro',
  created_at:      'Fecha y hora de creación del registro',
  updated_at:      'Última vez que se modificó el registro',
  deleted_at:      'Fecha de borrado lógico (null = activo)',
  is_active:       'Si el registro está activo: 1=Sí, 0=No',
  notes:           'Notas u observaciones adicionales',
  name:            'Nombre descriptivo',
  status:          'Estado actual del registro',
  created_by:      'Usuario que creó el registro',
  updated_by:      'Último usuario que modificó el registro',
};

// Cache en memoria: { tables: [], columnsMap: {}, ttl: timestamp }
let schemaCache = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function loadSchema() {
  if (schemaCache && Date.now() - schemaCache.ts < CACHE_TTL_MS) return schemaCache;

  // Todas las tablas base, excluyendo las operativas/sistema
  const tables = await db.query(
    `SELECT TABLE_NAME AS name, TABLE_ROWS AS approxRows
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'BASE TABLE'
       AND TABLE_NAME NOT REGEXP :pattern
     ORDER BY TABLE_NAME`,
    { pattern: SYSTEM_TABLE_PATTERN },
  );

  // Todas las columnas de esas tablas en una sola query
  const tableNames = tables.map(t => t.name);
  if (!tableNames.length) {
    schemaCache = { tables: [], columnsMap: {}, ts: Date.now() };
    return schemaCache;
  }

  const placeholders = tableNames.map((_, i) => `:t${i}`).join(',');
  const params = Object.fromEntries(tableNames.map((n, i) => [`t${i}`, n]));

  const cols = await db.query(
    `SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col, DATA_TYPE AS type,
            IS_NULLABLE AS nullable, COLUMN_COMMENT AS comment, ORDINAL_POSITION AS pos
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${placeholders})
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    params,
  );

  const columnsMap = {};
  for (const c of cols) {
    if (!columnsMap[c.tbl]) columnsMap[c.tbl] = [];
    columnsMap[c.tbl].push(c);
  }

  // Detectar filterType automáticamente por columnas presentes
  const enrichedTables = tables.map(t => {
    const tcols = columnsMap[t.name] || [];
    const colNames = new Set(tcols.map(c => c.col));
    const meta = TABLE_LABELS[t.name] || {};
    let filterType = 'none';
    if (colNames.has('organization_id')) filterType = 'org';
    else if (colNames.has('branch_id'))  filterType = 'branch';
    return {
      key:         t.name,
      label:       meta.label       || t.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: meta.description || '',
      filterType,
      approxRows:  t.approxRows || 0,
    };
  });

  schemaCache = { tables: enrichedTables, columnsMap, ts: Date.now() };
  return schemaCache;
}

function buildFilter(filterType, orgId) {
  switch (filterType) {
    case 'org':    return { where: 'WHERE organization_id = :orgId', params: { orgId } };
    case 'branch': return { where: 'WHERE branch_id IN (SELECT id FROM branches WHERE organization_id = :orgId)', params: { orgId } };
    default:       return { where: '', params: {} };
  }
}

// GET /admin/preview — lista dinámica de tablas de negocio
router.get('/', fromHeaders, requireAdmin, async (req, res, next) => {
  try {
    // ?refresh=1 fuerza recarga del cache
    if (req.query.refresh) schemaCache = null;
    const { tables } = await loadSchema();
    return R.ok(res, { tables, cachedAt: new Date(schemaCache.ts).toISOString() });
  } catch (e) { next(e); }
});

// GET /admin/preview/:tableName — columnas + 10 registros (siempre del esquema real)
router.get('/:tableName', fromHeaders, requireAdmin, async (req, res, next) => {
  try {
    const { tableName } = req.params;
    const { tables, columnsMap } = await loadSchema();

    const tableDef = tables.find(t => t.key === tableName);
    if (!tableDef) {
      return res.status(404).json({ success: false, error: { message: `Tabla '${tableName}' no disponible`, code: 'NOT_FOUND' } });
    }

    const orgId = req.user.orgId;

    // Columnas siempre vienen del esquema real — las descripciones son hints
    const rawCols = columnsMap[tableName] || [];
    const colHints = TABLE_LABELS[tableName]?.columns || {};
    const columns = rawCols.map(c => ({
      name:        c.col,
      type:        c.type,
      nullable:    c.nullable === 'YES',
      description: colHints[c.col] || COMMON_COL_DESC[c.col] || c.comment || '—',
    }));

    const { where, params } = buildFilter(tableDef.filterType, orgId);
    const rows = await db.query(
      `SELECT * FROM \`${tableName}\` ${where} ORDER BY id DESC LIMIT 10`,
      params,
    );

    return R.ok(res, {
      table:       tableName,
      label:       tableDef.label,
      description: tableDef.description,
      filterType:  tableDef.filterType,
      columns,
      rows,
    });
  } catch (e) { next(e); }
});

module.exports = router;
