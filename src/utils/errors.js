export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
  }
}

export class BadRequestError extends DomainError {
  constructor(message) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Petición válida que la regla de negocio no permite (HTTP 422) con un código estable. */
export class UnprocessableError extends DomainError {
  constructor(message, code) {
    super(message);
    this.name = "UnprocessableError";
    this.code = code;
  }
}
