class AppError extends Error {
  /**
   * @param {string} message 
   * @param {number} statusCode 
   * @param {string} code 
   */
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class AuthenticationError extends AppError { constructor(message = 'Authentication failed') { super(message, 401, 'UNAUTHORIZED'); } }
class AuthorizationError extends AppError { constructor(message = 'Access denied') { super(message, 403, 'FORBIDDEN'); } }
class ValidationError extends AppError { constructor(message = 'Validation failed') { super(message, 400, 'VALIDATION_ERROR'); } }
class NotFoundError extends AppError { constructor(message = 'Not found') { super(message, 404, 'NOT_FOUND'); } }
class ConflictError extends AppError { constructor(message = 'Resource conflict') { super(message, 409, 'CONFLICT'); } }
class ServiceUnavailableError extends AppError { constructor(message = 'Service unavailable') { super(message, 503, 'SERVICE_UNAVAILABLE'); } }

module.exports = {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError
};
