import { ErrorCode, errorStatus, type ErrorDetail } from '@bm/shared/errors';

/**
 * Standard API error class matching the shared error contract in 04-API.md.
 */
export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, message?: string, details?: ErrorDetail[]) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = errorStatus[code];
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(ErrorCode.NOT_FOUND, message);
  }

  static validation(details: ErrorDetail[], message = 'Validation failed'): ApiError {
    return new ApiError(ErrorCode.VALIDATION_FAILED, message, details);
  }

  static unauthenticated(message = 'Authentication required'): ApiError {
    return new ApiError(ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'Access forbidden'): ApiError {
    return new ApiError(ErrorCode.FORBIDDEN, message);
  }

  static conflict(message = 'Conflict'): ApiError {
    return new ApiError(ErrorCode.CONFLICT, message);
  }

  static internal(message = 'Something went wrong'): ApiError {
    return new ApiError(ErrorCode.INTERNAL, message);
  }

  static badRequest(
    code: ErrorCode = ErrorCode.VALIDATION_FAILED,
    message?: string,
    details?: ErrorDetail[]
  ): ApiError {
    return new ApiError(code, message, details);
  }
}
