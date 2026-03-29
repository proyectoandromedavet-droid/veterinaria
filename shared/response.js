'use strict';

/**
 * Standard API response envelope.
 * { success, data, meta, error }
 */

function ok(res, data = null, meta = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta,
  });
}

function created(res, data = null) {
  return ok(res, data, {}, 201);
}

function paginated(res, rows, total, page, limit) {
  return ok(res, rows, {
    total,
    page:       parseInt(page),
    limit:      parseInt(limit),
    totalPages: Math.ceil(total / limit),
  });
}

function noContent(res) {
  return res.status(204).end();
}

function error(res, statusCode, message, details = null) {
  const body = { success: false, error: { message } };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
}

function accepted(res, data = null) {
  return ok(res, data, {}, 202);
}

const badRequest    = (res, msg = 'Bad request', details = null) => error(res, 400, msg, details);
const unauthorized  = (res, msg = 'Unauthorized')                => error(res, 401, msg);
const forbidden     = (res, msg = 'Forbidden')                   => error(res, 403, msg);
const notFound      = (res, msg = 'Not found')                   => error(res, 404, msg);
const conflict      = (res, msg = 'Conflict')                    => error(res, 409, msg);
const serverError   = (res, msg = 'Internal server error')       => error(res, 500, msg);
const tooMany       = (res, msg = 'Too many requests')           => error(res, 429, msg);

module.exports = {
  ok, created, accepted, paginated, noContent,
  error, badRequest, unauthorized, forbidden,
  notFound, conflict, serverError, tooMany,
};
