import { writeFile } from "node:fs/promises";
import { IssueAnalyzer } from "./analyzer.js";
import { GitLabClient } from "./gitlabClient.js";
import { Logger } from "./logger.js";
import { renderHtmlReports } from "./reportRenderer.js";
import { loadIssueUrlsFromFile, parseGitLabIssueUrl } from "./utils.js";

interface CliArgs {
  issueUrls: string[];
  output: string;
  verboseLevel: number;
  testFileGlob: string[];
}

interface FailedIssueAnalysis {
  issueUrl: string;
  errorMessage: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const issueUrls: string[] = [];
  const issueUrlFiles: string[] = [];
  let verboseLevel = 0;

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

    const key = value.slice(2);
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
    verboseLevel,
    testFileGlob: (args.get("test-file-glob") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  };
}

async function run(): Promise<void> {
  const { issueUrls, output, verboseLevel, testFileGlob } = parseArgs(process.argv);
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    throw new Error("GITLAB_TOKEN environment variable is required");
  }

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

  const html = renderHtmlReports(results, failedIssues, { testFileGlob });
  await writeFile(output, html, "utf-8");
  logger.log(`HTML report written to ${output}`);
  process.stdout.write(`Report generated: ${output}\n`);
}

run().catch((error) => {
  process.stderr.write(`Error: ${(error as Error).message}\n`);
  process.stderr.write(
    "Usage: node dist/src/cli.js --issue-url <url> [--issue-url <url> ...] [--issue-url-file <file> ...] [--output report.html] [--test-file-glob \"glob1,glob2\"] [--verbose] [--verbose]\n",
  );
  process.exitCode = 1;
});
