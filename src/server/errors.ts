/**
 * Typed service errors (AGENTS.md → Errors). Services throw these; server actions
 * and route handlers map them to user-safe messages and HTTP status codes.
 */
export class AppError extends Error {
  readonly status: number = 500;
  /** Safe to show to the user. */
  readonly publicMessage: string = "Something went wrong. Please try again.";
}

export class ForbiddenError extends AppError {
  override readonly status = 403;
  override readonly publicMessage = "You do not have access to this.";
  constructor(detail = "forbidden") {
    super(detail);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  override readonly status = 404;
  override readonly publicMessage = "Not found.";
  constructor(detail = "not found") {
    super(detail);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  override readonly status = 400;
  constructor(
    override readonly publicMessage: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(publicMessage);
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  override readonly status = 409;
  constructor(override readonly publicMessage: string) {
    super(publicMessage);
    this.name = "ConflictError";
  }
}

export class RateLimitedError extends AppError {
  override readonly status = 429;
  override readonly publicMessage = "Too many attempts. Wait a few minutes and try again.";
  constructor() {
    super("rate limited");
    this.name = "RateLimitedError";
  }
}
