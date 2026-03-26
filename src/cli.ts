import { writeFile } from "node:fs/promises";
import { IssueAnalyzer } from "./analyzer.js";
import { GitLabClient } from "./gitlabClient.js";
import { Logger } from "./logger.js";
import { renderHtmlReports } from "./reportRenderer.js";
import { parseGitLabIssueUrl } from "./utils.js";

interface CliArgs {
  issueUrls: string[];
  output: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  const issueUrls: string[] = [];
  let verbose = false;

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }

    if (value === "--verbose") {
      verbose = true;
      continue;
    }

    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    if (key === "issue-url") {
      issueUrls.push(next);
    } else {
      args.set(key, next);
    }
    index += 1;
  }

  if (issueUrls.length === 0) {
    throw new Error("Missing required argument --issue-url (can be provided multiple times)");
  }

  return {
    issueUrls,
    output: args.get("output") ?? "report.html",
    verbose,
  };
}

async function run(): Promise<void> {
  const { issueUrls, output, verbose } = parseArgs(process.argv);
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    throw new Error("GITLAB_TOKEN environment variable is required");
  }

  const logger = new Logger(verbose);
  logger.log(`Starting analysis for ${issueUrls.length} issue(s)`);
  const results = [];

  for (const [index, issueUrl] of issueUrls.entries()) {
    const parsed = parseGitLabIssueUrl(issueUrl);
    logger.log(`Analyzing issue ${index + 1}/${issueUrls.length}: ${issueUrl}`);

    const client = new GitLabClient(parsed.host, token, logger);
    const analyzer = new IssueAnalyzer(client, logger);

    const result = await analyzer.analyze(parsed);
    results.push(result);
  }

  const html = renderHtmlReports(results);
  await writeFile(output, html, "utf-8");
  logger.log(`HTML report written to ${output}`);
  process.stdout.write(`Report generated: ${output}\n`);
}

run().catch((error) => {
  process.stderr.write(`Error: ${(error as Error).message}\n`);
  process.stderr.write("Usage: node dist/src/cli.js --issue-url <url> [--issue-url <url> ...] [--output report.html] [--verbose]\n");
  process.exitCode = 1;
});
