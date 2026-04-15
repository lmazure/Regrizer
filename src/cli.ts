import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { IssueAnalyzer } from "./analyzer.js";
import { loadRegrizerConfig } from "./fileTypeConfig.js";
import { GitLabClient } from "./gitlabClient.js";
import { Logger } from "./logger.js";
import { renderHtmlReports } from "./reportRenderer.js";
import { loadIssueUrlsFromFile, parseGitLabIssueUrl } from "./utils.js";

/**
 * Normalized CLI argument values.
 */
interface CliArgs {
  issueUrls: string[];
  output: string;
  display: boolean;
  verboseLevel: number;
}

/**
 * Captures a failed issue analysis for report output.
 */
interface FailedIssueAnalysis {
  issueUrl: string;
  errorMessage: string;
}

/**
 * Parses process arguments into validated CLI options.
 * @param argv Process argument array.
 * @returns Parsed CLI arguments.
 */
function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const issueUrls: string[] = [];
  const issueUrlFiles: string[] = [];
  let verboseLevel = 0;
  let display = false;
  const knownFlags = new Set(["issue-url", "issue-url-file", "output"]);

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      issueUrls.push(value);
      continue;
    }

    if (value === "--verbose") {
      verboseLevel += 1;
      continue;
    }

    if (value === "--display") {
      display = true;
      continue;
    }

    const key = value.slice(2);
    if (!knownFlags.has(key)) {
      throw new Error(`Unknown flag: --${key}`);
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    if (key === "issue-url") {
      issueUrls.push(next);
    } else if (key === "issue-url-file") {
      issueUrlFiles.push(next);
    } else {
      args.set(key, next);
    }
    index += 1;
  }

  for (const issueUrlFile of issueUrlFiles) {
    issueUrls.push(...loadIssueUrlsFromFile(issueUrlFile));
  }

  if (issueUrls.length === 0) {
    throw new Error("Missing required issue URL input (provide --issue-url and/or --issue-url-file)");
  }

  return {
    issueUrls,
    output: args.get("output") ?? "report.html",
    display,
    verboseLevel,
  };
}

/**
 * Opens a local file in the default browser for the current operating system.
 * @param filePath Output report path.
 * @returns Promise that resolves when the opener command exits successfully.
 */
async function openReportInBrowser(filePath: string): Promise<void> {
  const absolutePath = resolve(filePath);
  const targetUrl = pathToFileURL(absolutePath).href;

  const opener = process.platform === "win32"
    ? { command: process.env.ComSpec ?? "cmd", args: ["/c", "start", "", targetUrl] }
    : process.platform === "darwin"
      ? { command: "open", args: [targetUrl] }
      : { command: "xdg-open", args: [targetUrl] };

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(opener.command, opener.args, { stdio: "ignore" });

    child.on("error", (error) => {
      rejectPromise(new Error(`Failed to open report in browser (${opener.command}): ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Failed to open report in browser (${opener.command} exited with code ${String(code)})`));
    });
  });
}

/**
 * Executes issue analysis and writes the HTML report.
 * @returns Promise that resolves when the report is written.
 */
async function run(): Promise<void> {
  const { issueUrls, output, display, verboseLevel } = parseArgs(process.argv);
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    throw new Error("GITLAB_TOKEN environment variable is required");
  }

  const config = loadRegrizerConfig("regrizer.yaml");

  const logger = new Logger(verboseLevel);
  logger.log(`Starting analysis for ${issueUrls.length} issue(s)`);
  const results = [];
  const failedIssues: FailedIssueAnalysis[] = [];

  for (const [index, issueUrl] of issueUrls.entries()) {
    logger.log(`Analyzing issue ${index + 1}/${issueUrls.length}: ${issueUrl}`);
    try {
      const parsed = parseGitLabIssueUrl(issueUrl);
      const client = new GitLabClient(parsed.host, token, logger);
      const analyzer = new IssueAnalyzer(client, logger);

      const result = await analyzer.analyze(parsed);
      results.push(result);
    } catch (error) {
      const errorMessage = (error as Error).message;
      failedIssues.push({ issueUrl, errorMessage });
      logger.log(`Issue analysis failed for ${issueUrl}: ${errorMessage}`);
      process.stderr.write(`Issue failed: ${issueUrl}\n  ${errorMessage}\n`);
    }
  }

  if (results.length === 0 && failedIssues.length > 0) {
    throw new Error("All input issues failed to analyze");
  }

  const html = renderHtmlReports(results, failedIssues, { fileTypes: config.fileTypes });
  await writeFile(output, html, "utf-8");
  logger.log(`HTML report written to ${output}`);
  if (display) {
    await openReportInBrowser(output);
    logger.log(`Opened report in browser: ${output}`);
  }
  process.stdout.write(`Report generated: ${output}\n`);
}

run().catch((error) => {
  process.stderr.write(`Error: ${(error as Error).message}\n`);
  process.stderr.write(
    "Usage: node dist/src/cli.js --issue-url <url> [--issue-url <url> ...] [--issue-url-file <file> ...] [--output report.html] [--display] [--verbose] [--verbose]\n",
  );
  process.exitCode = 1;
});
