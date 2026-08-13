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
