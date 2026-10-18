// ApiError + Express error handling, producing the same envelope as the Python service:
// { success: false, message, code, details? }

export class ApiError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message, details) {
    return new ApiError(400, message, 'BAD_REQUEST', details)
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, 'UNAUTHORIZED')
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message, 'FORBIDDEN')
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message, 'NOT_FOUND')
  }
  static conflict(message) {
    return new ApiError(409, message, 'CONFLICT')
  }
  static tooMany(message = 'Too many requests, please try again later') {
    return new ApiError(429, message, 'TOO_MANY_REQUESTS')
  }
}

function payload(message, code, details) {
  const body = { success: false, message, code }
  if (details && (!Array.isArray(details) || details.length)) body.details = details
  return body
}

/** 404 for unknown /api paths. */
export function notFoundHandler(req, res) {
  res.status(404).json(payload('Not Found', 'NOT_FOUND'))
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json(payload(err.message, err.code, err.details))
  }
  // Malformed JSON body
  if (err?.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json(payload('Validation failed', 'BAD_REQUEST', [{ field: 'body', message: 'Request body is not valid JSON' }]))
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json(payload('Request is too large', 'BAD_REQUEST'))
  }
  // Static files (uploads / downloads) that do not exist, and other client errors
  if (err?.status === 404 || err?.statusCode === 404) {
    return res.status(404).json(payload('Not Found', 'NOT_FOUND'))
  }
  if (err?.expose && (err.status || err.statusCode) < 500) {
    return res.status(err.status || err.statusCode).json(payload(err.message, 'BAD_REQUEST'))
  }
  // Multer (uploads)
  if (err?.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message
    return res.status(400).json(payload(msg, 'BAD_REQUEST'))
  }
  // SQLite constraint errors -> same codes as the Python IntegrityError handler
  const text = String(err?.message || '')
  if (/UNIQUE constraint failed/.test(text)) {
    const field = text.includes(':') ? text.split(':').pop().trim() : 'field'
    return res.status(409).json(payload(`A record with this ${field} already exists`, 'DUPLICATE'))
  }
  if (/FOREIGN KEY constraint failed/.test(text)) {
    return res.status(400).json(payload('Referenced record does not exist', 'INVALID_REFERENCE'))
  }
  if (/constraint failed/i.test(text)) {
    return res.status(400).json(payload('Could not save the record', 'DB_ERROR'))
  }
  console.error('[error]', req.method, req.originalUrl, err)
  return res.status(500).json(payload('Something went wrong on our side. Please try again.', 'INTERNAL_ERROR'))
}
