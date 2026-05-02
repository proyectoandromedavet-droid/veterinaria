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

// Tablas de negocio habilitadas + descripciones de columnas
const TABLES = {
  patients: {
    label: 'Pacientes',
    description: 'Animales registrados en el sistema. Cada fila es un animal con su información clínica básica.',
    filterType: 'org',
    columns: {
      id:               'ID único autogenerado del paciente',
      organization_id:  'Organización a la que pertenece',
      species_id:       'Especie del animal (referencia tabla species)',
      breed_id:         'Raza del animal (referencia tabla breeds)',
      name:             'Nombre del animal',
      sex:              'Sexo: male (macho), female (hembra), unknown (desconocido)',
      birthdate:        'Fecha de nacimiento',
      birth_date:       'Fecha de nacimiento (campo alternativo)',
      weight_kg:        'Peso en kilogramos al último registro',
      chip_number:      'Número de microchip de identificación',
      microchip_number: 'Número de microchip (campo alternativo)',
      is_sterilized:    'Castrado/Esterilizado: 1=Sí, 0=No',
      is_deceased:      'Si el animal falleció: 1=Sí, 0=No',
      is_active:        'Registro activo en el sistema: 1=Sí, 0=No',
      notes:            'Notas generales del paciente',
      created_at:       'Fecha y hora de alta en el sistema',
      updated_at:       'Última modificación del registro',
      deleted_at:       'Fecha de borrado lógico (null = activo)',
    },
  },
  clients: {
    label: 'Clientes / Propietarios',
    description: 'Personas responsables de los pacientes. Un cliente puede tener varios animales.',
    filterType: 'branch',
    columns: {
      id:              'ID único del cliente',
      branch_id:       'Sucursal donde está registrado',
      first_name:      'Nombre del propietario',
      last_name:       'Apellido del propietario',
      email:           'Correo electrónico de contacto',
      phone:           'Teléfono principal',
      document_type:   'Tipo de documento (DNI, Pasaporte, CUIT, etc.)',
      document_number: 'Número del documento de identidad',
      is_active:       'Si el cliente está activo: 1=Sí, 0=No',
      created_at:      'Fecha de registro',
    },
  },
  appointments: {
    label: 'Turnos / Citas',
    description: 'Consultas agendadas para los pacientes. Incluye turnos pasados, presentes y futuros.',
    filterType: 'branch',
    columns: {
      id:                  'ID único del turno',
      branch_id:           'Sucursal donde se realiza',
      patient_id:          'Paciente que asiste (referencia tabla patients)',
      vet_id:              'Veterinario asignado (referencia tabla users)',
      appointment_type_id: 'Tipo de turno (referencia tabla appointment_types)',
      scheduled_date:      'Fecha y hora programada del turno',
      duration_minutes:    'Duración estimada en minutos',
      status:              'Estado: scheduled, confirmed, in_progress, completed, cancelled, no_show',
      is_emergency:        'Indica si es una emergencia: 1=Sí, 0=No',
      reason:              'Motivo de la consulta',
      notes:               'Observaciones adicionales',
      created_at:          'Cuándo se registró el turno',
    },
  },
  appointment_types: {
    label: 'Tipos de Turno',
    description: 'Categorías de consultas disponibles (Consulta general, Vacunación, Cirugía, etc.).',
    filterType: 'none',
    columns: {
      id:                       'ID único del tipo',
      name:                     'Nombre del tipo de turno',
      default_duration_minutes: 'Duración predeterminada en minutos',
      color_hex:                'Color en formato HEX para mostrar en el calendario',
      is_active:                'Si está disponible para agendar: 1=Sí, 0=No',
    },
  },
  vaccinations: {
    label: 'Vacunaciones',
    description: 'Historial de vacunas aplicadas a cada paciente, con fechas y lotes.',
    filterType: 'branch',
    columns: {
      id:               'ID único del registro',
      branch_id:        'Sucursal donde se aplicó',
      patient_id:       'Paciente vacunado (referencia tabla patients)',
      vaccine_id:       'Vacuna aplicada (referencia tabla vaccines)',
      vaccination_date: 'Fecha en que se aplicó la vacuna',
      next_due_date:    'Fecha de vencimiento o próxima dosis',
      batch_number:     'Número de lote del vial',
      dose:             'Dosis administrada',
      route:            'Vía: subcutaneous, intramuscular, intranasal, oral, other',
      administered_by:  'Veterinario que aplicó la vacuna (referencia tabla users)',
      notes:            'Observaciones adicionales',
    },
  },
  vaccines: {
    label: 'Vacunas (Catálogo)',
    description: 'Listado de vacunas disponibles en el sistema con su información técnica.',
    filterType: 'none',
    columns: {
      id:                'ID único de la vacuna',
      name:              'Nombre comercial o genérico',
      species_id:        'Especie a la que aplica (referencia tabla species)',
      target_diseases:   'Enfermedades que previene',
      manufacturer:      'Fabricante / laboratorio',
      frequency_months:  'Cada cuántos meses se revacuna',
      is_active:         'Si está disponible: 1=Sí, 0=No',
    },
  },
  medical_records: {
    label: 'Fichas Médicas',
    description: 'Registro de cada consulta veterinaria: síntomas, diagnóstico y evolución del paciente.',
    filterType: 'vet',
    columns: {
      id:                  'ID único de la ficha',
      appointment_id:      'Turno al que corresponde (referencia tabla appointments)',
      patient_id:          'Paciente consultado (referencia tabla patients)',
      vet_id:              'Veterinario responsable (referencia tabla users)',
      chief_complaint:     'Motivo principal de consulta relatado',
      status:              'Estado: open (abierta), signed (firmada), amended (corregida)',
      weight_kg:           'Peso del animal en la consulta',
      temperature_celsius: 'Temperatura corporal en °C',
      visit_date:          'Fecha y hora de la consulta',
      notes:               'Notas clínicas del veterinario',
      signed_at:           'Cuándo firmó el veterinario',
    },
  },
  species: {
    label: 'Especies',
    description: 'Catálogo maestro de especies animales (Perro, Gato, Conejo, etc.).',
    filterType: 'none',
    columns: {
      id:                  'ID único de la especie',
      common_name:         'Nombre común en español (ej: Perro, Gato)',
      scientific_name:     'Nombre científico (ej: Canis lupus familiaris)',
      avg_lifespan_years:  'Expectativa de vida promedio en años',
      gestation_days:      'Días de gestación promedio',
      is_active:           'Disponible para registrar pacientes: 1=Sí, 0=No',
    },
  },
  breeds: {
    label: 'Razas',
    description: 'Catálogo de razas por especie (Labrador, Siamés, etc.).',
    filterType: 'none',
    columns: {
      id:         'ID único de la raza',
      species_id: 'Especie a la que pertenece (referencia tabla species)',
      name:       'Nombre de la raza',
      is_active:  'Disponible para usar: 1=Sí, 0=No',
    },
  },
  inventory_items: {
    label: 'Inventario',
    description: 'Medicamentos, insumos y productos disponibles en la clínica.',
    filterType: 'branch',
    columns: {
      id:            'ID único del ítem',
      branch_id:     'Sucursal donde está el stock',
      name:          'Nombre del producto o medicamento',
      item_type:     'Categoría: medication, supply, equipment, food, accessory, vaccine, other',
      unit:          'Unidad de medida (comprimido, ml, unidad, pipeta, etc.)',
      stock_quantity:'Cantidad disponible actualmente en stock',
      minimum_stock: 'Stock mínimo antes de generar alerta de reposición',
      unit_cost:     'Costo unitario de compra (precio al que se adquiere)',
      sale_price:    'Precio de venta al cliente',
      is_active:     'Disponible para usar/vender: 1=Sí, 0=No',
      expiry_date:   'Fecha de vencimiento del lote actual',
    },
  },
  invoices: {
    label: 'Facturas',
    description: 'Comprobantes de cobro emitidos a los clientes por servicios prestados.',
    filterType: 'branch',
    columns: {
      id:           'ID único de la factura',
      branch_id:    'Sucursal que emite la factura',
      client_id:    'Cliente facturado (referencia tabla clients)',
      patient_id:   'Paciente asociado (referencia tabla patients)',
      total_amount: 'Monto total de la factura',
      status:       'Estado: draft (borrador), issued (emitida), paid (pagada), cancelled (anulada)',
      issued_at:    'Fecha y hora de emisión',
      due_date:     'Fecha límite de pago',
      notes:        'Observaciones del comprobante',
    },
  },
  surgeries: {
    label: 'Cirugías',
    description: 'Registro de procedimientos quirúrgicos programados y realizados.',
    filterType: 'branch',
    columns: {
      id:              'ID único de la cirugía',
      branch_id:       'Sucursal donde se realiza',
      patient_id:      'Paciente operado (referencia tabla patients)',
      surgeon_id:      'Cirujano principal (referencia tabla users)',
      surgery_type_id: 'Tipo de procedimiento (referencia tabla surgery_types)',
      scheduled_at:    'Fecha y hora programada',
      started_at:      'Inicio real de la cirugía',
      ended_at:        'Finalización de la cirugía',
      status:          'Estado: scheduled, in_progress, completed, cancelled',
      notes:           'Notas del procedimiento quirúrgico',
    },
  },
  hospitalizations: {
    label: 'Hospitalizaciones',
    description: 'Internaciones de pacientes en la clínica, con seguimiento diario.',
    filterType: 'branch',
    columns: {
      id:             'ID único de la hospitalización',
      branch_id:      'Sucursal donde está internado',
      patient_id:     'Paciente internado (referencia tabla patients)',
      vet_id:         'Veterinario responsable',
      kennel_id:      'Jaula o espacio asignado (referencia tabla kennels)',
      admission_date: 'Fecha y hora de ingreso',
      discharge_date: 'Fecha y hora de alta (null si sigue internado)',
      reason:         'Motivo de la internación',
      status:         'Estado: active (internado), discharged (de alta), deceased (fallecido)',
      notes:          'Notas clínicas de la internación',
    },
  },
};

function buildFilter(filterType, orgId) {
  switch (filterType) {
    case 'org':    return { where: 'WHERE organization_id = :orgId', params: { orgId } };
    case 'branch': return { where: 'WHERE branch_id IN (SELECT id FROM branches WHERE organization_id = :orgId)', params: { orgId } };
    case 'vet':    return { where: 'WHERE vet_id IN (SELECT id FROM users WHERE branch_id IN (SELECT id FROM branches WHERE organization_id = :orgId))', params: { orgId } };
    default:       return { where: '', params: {} };
  }
}

// GET /admin/preview — lista de tablas disponibles
router.get('/', fromHeaders, requireAdmin, (_req, res) => {
  return R.ok(res, {
    tables: Object.entries(TABLES).map(([key, def]) => ({
      key,
      label:       def.label,
      description: def.description,
    })),
  });
});

// GET /admin/preview/:tableName — columnas reales + 10 registros
router.get('/:tableName', fromHeaders, requireAdmin, async (req, res, next) => {
  try {
    const { tableName } = req.params;
    const tableDef = TABLES[tableName];
    if (!tableDef) {
      return res.status(404).json({ success: false, error: { message: `Tabla '${tableName}' no disponible`, code: 'NOT_FOUND' } });
    }

    const orgId = req.user.orgId;
    if (!orgId && tableDef.filterType !== 'none') {
      return res.status(401).json({ success: false, error: { message: 'Missing org context', code: 'UNAUTHORIZED' } });
    }

    // Columnas reales desde information_schema
    const schemaRows = await db.query(
      `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_COMMENT AS comment
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName
       ORDER BY ORDINAL_POSITION`,
      { tableName },
    );

    const columns = schemaRows.map(col => ({
      name:        col.name,
      type:        col.type,
      nullable:    col.nullable === 'YES',
      description: tableDef.columns[col.name] || col.comment || '—',
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
      columns,
      rows,
    });
  } catch (e) { next(e); }
});

module.exports = router;
