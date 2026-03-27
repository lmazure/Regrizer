export class Logger {
  constructor(private readonly verboseLevel: number) {}

  log(message: string): void {
    if (!this.isEnabled(1)) {
      return;
    }

    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${message}\n`);
  }

  logPayload(label: string, payload: unknown): void {
    if (!this.isEnabled(2)) {
      return;
    }

    const formattedPayload = this.stringifyPayload(payload);
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${label}: ${formattedPayload}\n`);
  }

  private isEnabled(level: number): boolean {
    return this.verboseLevel >= level;
  }

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
