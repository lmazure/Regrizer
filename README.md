# Regrizer

A regression analyzer for GitLab issues that traces where related code came from and renders a simple HTML provenance report.

## What it does

Given a GitLab issue URL, Regrizer will:

1. Resolve the issue and discover related merged MRs (including cross-project references).
2. Collect files/lines modified by those MRs.
3. For each changed line, inspect the **line before** and determine:
   - which commit introduced that line,
   - which MR contains that commit,
   - which issue(s) are linked to that MR.
4. Generate an HTML report with compact per-file code windows:
   - 7 lines before,
   - changed line,
   - 7 lines after,
   - provenance metadata for the line-before only.

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
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" --output report.html
```

Add `--verbose` to print progress logs in the terminal:

```bash
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" --output report.html --verbose
```

Or run directly in dev mode:

```bash
npm run dev -- --issue-url "https://gitlab.example.com/group/project/-/issues/123" --output report.html
```

## Run tests

```bash
npm test
```

## Notes

- Related MR discovery combines REST and GraphQL, with fallback search strategies.
- Binary/deleted files are listed with a skip reason.
- If provenance cannot be resolved for a line-before, the report shows an explicit unresolved reason.
