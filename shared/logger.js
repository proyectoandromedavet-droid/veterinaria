'use strict';

/**
 * Shared structured logger — Winston.
 * Used by all microservices via serviceBase.buildApp().
 *
 * Console: colorised in dev, JSON in prod.
 * File transports: opt-in via LOG_TO_FILE=true (gateway enables them separately).
 */

const winston = require('winston');

const isProd  = process.env.NODE_ENV === 'production';
const level   = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const prettyFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level: lvl, message, stack, ...rest }) => {
    const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
    return `${timestamp} [${lvl}] ${stack || message}${extra}`;
  }),
);

function createLogger(service) {
  return winston.createLogger({
    level,
    defaultMeta: { service },
    transports: [
      new winston.transports.Console({
        format: isProd ? jsonFormat : prettyFormat,
        silent: process.env.NODE_ENV === 'test',
      }),
    ],
  });
}

module.exports = { createLogger };
