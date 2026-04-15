# Regrizer

Given a GitLab issue that fixes a bug, Regrizer identifies which earlier changes introduced it.

The algorithm is straightforward: given the URL of a GitLab issue fixing a bug, it determines the GitLab issues that introduced the code lines changed by the bug correction.

## Requirements

- Node.js 20+
- A GitLab token with API access in `GITLAB_TOKEN`

## Install

```bash
npm install
```

## Usage

```bash
npm run build
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123"
```

You can provide `--issue-url` multiple times to analyze several issues in one run and include all of them in a single output HTML report:

```bash
node dist/src/cli.js \
  --issue-url "https://gitlab.example.com/group/project/-/issues/123" \
  --issue-url "https://gitlab.example.com/group/project/-/issues/456"
```

You can also provide issue URLs from a file with `--issue-url-file` (one issue URL per line; blank lines are ignored):

```bash
node dist/src/cli.js --issue-url-file ./issues.txt
```

You can combine repeated `--issue-url`, positional URLs, and one or more `--issue-url-file` flags:

```bash
node dist/src/cli.js \
  --issue-url "https://gitlab.example.com/group/project/-/issues/123" \
  --issue-url-file ./issues-team-a.txt \
  --issue-url-file ./issues-team-b.txt
```

Additional issue URLs can also be passed positionally after the first `--issue-url` value:

```bash
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" "https://gitlab.example.com/group/project/-/issues/456"
```

Classify files as test vs production in the HTML report with `--test-file-glob` (comma-separated list of globs). Any file whose path matches one of the globs is marked as test:

```bash
node dist/src/cli.js \
  --issue-url "https://gitlab.example.com/group/project/-/issues/123" \
  --test-file-glob "**/*.test.ts,**/__tests__/**"
```

The generated `--output` file will contain one section per input issue.

If one issue fails (for example, 404 not found), Regrizer continues analyzing the remaining issues, logs the failure to stderr, and includes a failed-issue section in the final HTML report.

The `--output` flag specifies the output file path for the HTML report. It defaults to `report.html` if not provided.

```bash
npm run build
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" --output report_123.html
```

Use `--display` to open the generated report automatically in the system default browser after generation:

```bash
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" --display
```

Add `--verbose` to print progress logs in the terminal:

```bash
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" --verbose
```

Repeat the flag (`--verbose --verbose`) to also print payload-only REST and GraphQL request/response logs:

```bash
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" --verbose --verbose
```

Run directly in dev mode:

```bash
npm run dev -- --issue-url "https://gitlab.example.com/group/project/-/issues/123"
```

## Report structure

The report hierarchy is:

1. An overview table at the top of the report summarizing, per input issue and per related merge request, the production/test files touched and the origin issues detected for each file
2. Merge requests (latest merged first)
3. Commit selected as the merge result on target branch
4. Files touched by that commit
5. For each file:
   - a single table containing all modified chunks for that file
   - each gap between two non-overlapping chunk groups is rendered as a separator row with `…` in every column
   - overlapping/adjacent chunks in the same file are merged before rendering
   - if rendered rows do not include line 1, a leading `…` row is inserted
   - if rendered rows do not include the file's last line, a trailing `…` row is inserted
6. Table columns:
     - line number (as in file after commit)
     - code after commit
     - code before commit
     - previous commit
     - merge request
     - related issues
   - previous commit / merge request / related issues cells are vertically merged when consecutive rows have the same value
   - unchanged rows fill only line number + code-after columns
   - changed rows fill before/provenance columns when applicable
7. Every hierarchy level (MR, commit, file) is collapsible and expanded by default when the report opens
8. Each commit section shows one compact metadata line with commit timestamp and committer identity (`Name <email>`) when available
9. Each merge request section shows a `Project` line (from the MR's own project, which may differ from the input issue project) plus merged timestamp, author, assignees, and reviewers metadata
