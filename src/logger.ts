export class Logger {
  constructor(private readonly verbose: boolean) {}

  log(message: string): void {
    if (!this.verbose) {
      return;
    }

    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${message}\n`);
  }
}
