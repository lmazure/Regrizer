import { writeFile } from "node:fs/promises";
import { IssueAnalyzer } from "./analyzer.js";
import { GitLabClient } from "./gitlabClient.js";
import { Logger } from "./logger.js";
import { renderHtmlReport } from "./reportRenderer.js";
import { parseGitLabIssueUrl } from "./utils.js";

interface CliArgs {
  issueUrl: string;
  output: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
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

    args.set(key, next);
    index += 1;
  }

  const issueUrl = args.get("issue-url");
  if (!issueUrl) {
    throw new Error("Missing required argument --issue-url");
  }

  return {
    issueUrl,
    output: args.get("output") ?? "report.html",
    verbose,
  };
}

async function run(): Promise<void> {
  const { issueUrl, output, verbose } = parseArgs(process.argv);
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    throw new Error("GITLAB_TOKEN environment variable is required");
  }

  const parsed = parseGitLabIssueUrl(issueUrl);
  const logger = new Logger(verbose);
  logger.log(`Starting analysis for ${issueUrl}`);

  const client = new GitLabClient(parsed.host, token, logger);
  const analyzer = new IssueAnalyzer(client, logger);

  const result = await analyzer.analyze(parsed);
  const html = renderHtmlReport(result);

  await writeFile(output, html, "utf-8");
  logger.log(`HTML report written to ${output}`);
  process.stdout.write(`Report generated: ${output}\n`);
}

run().catch((error) => {
  process.stderr.write(`Error: ${(error as Error).message}\n`);
  process.stderr.write("Usage: node dist/src/cli.js --issue-url <url> [--output report.html] [--verbose]\n");
  process.exitCode = 1;
});
