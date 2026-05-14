'use strict';

const { Router } = require('express');
const { body, db, R, validate, logMedicalError } = require('./medical.common');
const { encrypt, encryptFields, ANAMNESIS_FIELDS } = require('../../../../shared/encryption');

module.exports = {
  Router,
  body,
  db,
  R,
  validate,
  logMedicalError,
  encrypt,
  encryptFields,
  ANAMNESIS_FIELDS,
};
