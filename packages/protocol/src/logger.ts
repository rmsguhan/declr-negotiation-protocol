/**
 * Minimal structured logger injected by hosts; implementations must avoid throwing.
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** No-op implementation for tests or minimal wiring. */
export const noopLogger: Logger = {
  debug(): void {},
  info(): void {},
  warn(): void {},
  error(): void {},
};
