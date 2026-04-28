'use strict';

const path = require('path');
const YAML = require('yamljs');

describe('Gateway OpenAPI - critical frontend routes', () => {
  it('documents the route catalogs and aliases consumed by the frontend', () => {
    const spec = YAML.load(path.join(__dirname, '../../gateway/docs/openapi.yaml'));

    expect(spec.paths['/appointments/types']?.get).toBeDefined();
    expect(spec.paths['/vaccinations/vaccines']?.get).toBeDefined();
    expect(spec.paths['/vaccinations/deworming/products']?.get).toBeDefined();
    expect(spec.paths['/auth/admin/users']?.get).toBeDefined();
    expect(spec.paths['/auth/admin/users/{id}/deactivate']?.patch).toBeDefined();
    expect(spec.paths['/tele/stats']?.get).toBeDefined();
    expect(spec.paths['/tele/platforms']?.get).toBeDefined();
  });

  it('documents query params used by appointment and telemedicine list screens', () => {
    const spec = YAML.load(path.join(__dirname, '../../gateway/docs/openapi.yaml'));

    const appointmentParams = spec.paths['/appointments'].get.parameters.map((p) => p.name);
    expect(appointmentParams).toEqual(expect.arrayContaining([
      'date',
      'vetId',
      'status',
      'patientId',
      'limit',
    ]));

    const teleParams = spec.paths['/tele/sessions'].get.parameters.map((p) => p.name);
    expect(teleParams).toEqual(expect.arrayContaining([
      'status',
      'vetId',
      'date',
      'page',
      'limit',
    ]));
  });
});
