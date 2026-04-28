'use strict';

const path = require('path');
const YAML = require('yamljs');

describe('Gateway OpenAPI — GET /patients', () => {
  it('accepts the patient list query params used by the app and service', () => {
    const spec = YAML.load(path.join(__dirname, '../../gateway/docs/openapi.yaml'));
    const params = spec.paths['/patients'].get.parameters.map((p) => p.name);

    expect(params).toEqual(expect.arrayContaining([
      'search',
      'species',
      'speciesId',
      'isActive',
      'is_active',
      'page',
      'limit',
    ]));
  });
});
