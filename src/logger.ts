/**
 * Simple leveled logger used by CLI and service classes.
 */
export class Logger {
  /**
   * Creates a logger with numeric verbosity levels.
   * @param verboseLevel Numeric verbosity threshold.
   */
  constructor(private readonly verboseLevel: number) {}

  /**
   * Logs a timestamped message when basic verbosity is enabled.
   * @param message Log message text.
   * @returns Nothing.
   */
  log(message: string): void {
    if (!this.isEnabled(1)) {
      return;
    }

    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${message}\n`);
  }

  /**
   * Logs structured payload data when debug verbosity is enabled.
   * @param label Prefix label for the payload.
   * @param payload Structured payload value.
   * @returns Nothing.
   */
  logPayload(label: string, payload: unknown): void {
    if (!this.isEnabled(2)) {
      return;
    }

    const formattedPayload = this.stringifyPayload(payload);
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${label}: ${formattedPayload}\n`);
  }

  /**
   * Returns whether a given verbosity level is enabled.
   * @param level Minimum level to check.
   * @returns True when logging is enabled for that level.
   */
  private isEnabled(level: number): boolean {
    return this.verboseLevel >= level;
  }

  /**
   * Safely serializes payload data for log output.
   * @param payload Value to serialize.
   * @returns Serialized string representation.
   */
  private stringifyPayload(payload: unknown): string {
    if (payload === undefined) {
      return "undefined";
    }

    try {
      return JSON.stringify(payload);
    } catch (error) {
      return `[unserializable payload: ${(error as Error).message}]`;
    }
  }
}
