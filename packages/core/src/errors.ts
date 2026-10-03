export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A safety / approval / identity rule refused an action. */
export class PolicyViolationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "POLICY_VIOLATION", 403, details);
  }
}

export class BudgetExceededError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "BUDGET_EXCEEDED", 402, details);
  }
}

/**
 * The capability is not available through an official, supported API.
 * We raise this instead of faking the behaviour.
 */
export class NotSupportedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "NOT_SUPPORTED", 501, details);
  }
}

export class NotConfiguredError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "NOT_CONFIGURED", 503, details);
  }
}
