export type ErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_INVALID'
  | 'PROVIDER_CONFIGURATION'
  | 'PROVIDER_DISABLED'
  | 'ORIGIN_DENIED'
  | 'NOT_FOUND'
  | 'UPGRADE_REQUIRED'
  | 'UNAUTHORIZED'
  | 'CONNECTION_LIMIT'
  | 'PROVIDER_BUSY'
  | 'INVALID_PROVIDER_INPUT'
  | 'DATA_POLICY_BLOCKED'
  | 'DATABASE_UNAVAILABLE'
  | 'RATE_LIMITED';

export class ApplicationError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}
