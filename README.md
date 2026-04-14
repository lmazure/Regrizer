# Regrizer

Regrizer is a TypeScript CLI that builds an HTML report for GitLab issues by analyzing merged merge requests and their code changes.

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

The `--output` flag specifies the output file path for the HTML report. It defaults to `report.html` if not provided.

Classify files as test vs production in the HTML report with `--test-file-glob` (comma-separated list of globs). Any file whose path matches one of the globs is marked as test:

```bash
node dist/src/cli.js \
  --issue-url "https://gitlab.example.com/group/project/-/issues/123" \
  --test-file-glob "**/*.test.ts,**/__tests__/**"
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

The generated `--output` file will contain one section per input issue.

If one issue fails (for example, 404 not found), Regrizer continues analyzing the remaining issues, logs the failure to stderr, and includes a failed-issue section in the final HTML report.

Add `--verbose` to print progress logs in the terminal:

```bash
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" --verbose
```

Repeat the flag (`--verbose --verbose`) to also print payload-only REST and GraphQL request/response logs:

```bash
node dist/src/cli.js --issue-url "https://gitlab.example.com/group/project/-/issues/123" --verbose --verbose
```

Or run directly in dev mode:

```bash
npm run dev -- --issue-url "https://gitlab.example.com/group/project/-/issues/123"
```

### Notes

- Authentication: set a GitLab personal access token in `GITLAB_TOKEN`.
- Use `--verbose` to print progress and REST/GraphQL call summaries.
- Use `--verbose --verbose` to print payload-only REST and GraphQL request/response logs.
- `--issue-url` can be repeated to process several issues in one execution.
- `--issue-url-file <file>` loads issue URLs from a file (one URL per non-empty line).
- `--test-file-glob "glob1,glob2"` marks matching files as test code in the HTML report.
- Binary/unavailable diffs are included with a skip reason.
- If blame cannot resolve a previous commit for a line, the report marks it as unresolved.

## Report structure

The report hierarchy is:

0. An overview table at the top of the report summarizing, per input issue and per related merge request, the production/test files touched and the origin issues detected for each file
1. Merge requests (latest merged first)
2. Commit selected as the merge result on target branch
3. Files touched by that commit
4. For each file:
   - a single table containing all modified chunks for that file
   - each gap between two non-overlapping chunk groups is rendered as a separator row with `…` in every column
   - overlapping/adjacent chunks in the same file are merged before rendering
   - if rendered rows do not include line 1, a leading `…` row is inserted
   - if rendered rows do not include the file's last line, a trailing `…` row is inserted
5. Table columns:
     - line number (as in file after commit)
     - code after commit
     - code before commit
     - previous commit
     - merge request
     - related issues
   - previous commit / merge request / related issues cells are vertically merged when consecutive rows have the same value
   - unchanged rows fill only line number + code-after columns
   - changed rows fill before/provenance columns when applicable
6. Every hierarchy level (MR, commit, file) is collapsible and expanded by default when the report opens
7. Each commit section shows one compact metadata line with commit timestamp and committer identity (`Name <email>`) when available
8. Each merge request section shows a `Project` line (from the MR's own project, which may differ from the input issue project) plus merged timestamp, author, assignees, and reviewers metadata

## Architecture

Main modules:

- `src/cli.ts`: CLI argument parsing and orchestration.
- `src/gitlabClient.ts`: GitLab REST/GraphQL client and request helpers.
- `src/analyzer.ts`: Analysis pipeline (issue -> MRs -> merged commit -> files -> chunks -> blame attribution).
- `src/diffParser.ts`: Unified diff hunk parsing.
- `src/reportRenderer.ts`: HTML rendering of the nested report model.
- `src/types.ts`: Shared API and report data structures.
- `src/logger.ts`: Verbose logger (`--verbose`).

## Data retrieval pipeline and GitLab API calls

The analyzer executes the following steps.

### 1) Resolve input issue URL

- Parse URL (`/issues/:iid` or `/work_items/:iid`) to get:
  - `host`
  - `projectPath`
  - `issueIid`

No API call in this step.

### 2) Resolve project metadata

- **REST** [`GET /projects/:url_encoded_path`](https://docs.gitlab.com/api/projects//#retrieve-a-project)

Used to get the numeric project ID.

### 3) Fetch issue

- **REST** [`GET /projects/:project_id/issues/:issue_iid`](https://docs.gitlab.com/api/issues/#retrieve-a-project-issue)

Used as the input issue object in the final report.

### 4) Discover merge requests related to the issue

Regrizer intentionally uses the union of these two endpoints:

- **REST** [`GET /projects/:project_id/issues/:issue_iid/related_merge_requests`](https://docs.gitlab.com/api/issues/#list-all-merge-requests-related-to-an-issue)
- **REST** [`GET /projects/:project_id/issues/:issue_iid/closed_by`](https://docs.gitlab.com/api/issues/#list-all-merge-requests-that-close-an-issue-on-merge)

Then it deduplicates by `(project_id, iid)`.

### 5) Hydrate each MR and keep only merged MRs

For each MR reference from step 4:

- **REST** [`GET /projects/:mr_project_id/merge_requests/:mr_iid`](https://docs.gitlab.com/api/merge_requests/#retrieve-a-merge-request)

Filtering and ordering:

- Keep only `state == "merged"`
- Sort by `merged_at` descending

### 6) Resolve the commit representing the MR merge on target branch

For each merged MR, Regrizer chooses one SHA from MR payload fields (in this order):

1. `merge_commit_sha`
2. `squash_commit_sha`
3. `sha` (fast-forward fallback)

This identifies the commit that landed on target branch.

### 7) Fetch selected commit details and its diff

- **REST** [`GET /projects/:project_id/repository/commits/:sha`](https://docs.gitlab.com/api/commits/#retrieve-a-commit)
- **REST** [`GET /projects/:project_id/repository/commits/:sha/diff`](https://docs.gitlab.com/api/commits/#retrieve-a-commit)

The commit object provides parent SHAs; for merge commits, the analyzer uses the first parent as pre-image reference.

### 8) Parse diff into chunks

No API call in this step.

Local parsing with unified hunk headers, producing:

- old range (`oldStart`, `oldCount`)
- new range (`newStart`, `newCount`)
- old-side removed lines (`-`) and new-side added lines (`+`)
- leading/trailing unchanged hunk context lines (space-prefixed in unified diff)
- ordered hunk entries so unchanged lines between change groups are preserved as context
- synthetic trailing blank lines from diff text are ignored, preventing bogus `line 0` context rows in deleted-file hunks

### 9) Fetch file contents for context windows

For each changed file:

- Post-image (after commit):
  - **REST** [`GET /projects/:project_id/repository/files/:url_encoded_new_path/raw?ref=:commit_sha`](https://docs.gitlab.com/api/repository_files/#retrieve-a-raw-file-from-a-repository)
- Pre-image (before commit), when parent exists:
  - **REST** [`GET /projects/:project_id/repository/files/:url_encoded_old_path/raw?ref=:first_parent_sha`](https://docs.gitlab.com/api/repository_files/#retrieve-a-raw-file-from-a-repository)

Used to render 3 lines before/after plus exact chunk lines in a single table per file. Unchanged rows only populate the first two columns; changed rows also carry before/provenance metadata.

When splitting raw file contents into lines, Regrizer drops only the synthetic trailing empty element caused by terminal newlines, so created/deleted file views do not show a ghost final context row.

### 10) Attribute previous commit per old-side line

For each removed line with a valid old line number:

- **REST** [`GET /projects/:project_id/repository/files/:url_encoded_old_path/blame?ref=:first_parent_sha&range[start]=:line&range[end]=:line`](https://docs.gitlab.com/api/repository_files/#retrieve-file-blame-history-from-a-repository)

Then, when a previous commit SHA is found, Regrizer enriches the row for links and related metadata:

- **REST** [`GET /projects/:project_id/repository/commits/:previous_commit_sha`](https://docs.gitlab.com/api/commits/#retrieve-a-commit)
  - used to link the SHA to the commit page (`web_url`)
- **REST** [`GET /projects/:project_id/repository/commits/:previous_commit_sha/merge_requests`](https://docs.gitlab.com/api/commits/#list-merge-requests-associated-with-a-commit)
  - used to resolve a related merged MR for the commit
- **REST** [`GET /projects/:mr_project_id/merge_requests/:mr_iid/closes_issues`](https://docs.gitlab.com/api/merge_requests/#list-issues-that-close-on-merge)
  - used to list issues closed by the MR
- **REST** [`GET /projects/:mr_project_id/merge_requests/:mr_iid/related_issues`](https://docs.gitlab.com/api/merge_requests/#list-issues-related-to-the-merge-request)
  - used to list issues related to the MR

Issues from both endpoints are merged and deduplicated (with existing [GraphQL](https://docs.gitlab.com/api/graphql/) fallback for `closes_issues` if needed).

Rows with old-side (`-`) lines include:

- previous commit (short SHA hyperlink)
- merge request hyperlink (if found)
- related issue hyperlinks (if found)

### 11) Render HTML report

No API call in this step.

The renderer outputs nested `details/summary` sections for issue -> MR -> commit -> file (all `open` by default), with one color-coded unified table per file (`context`, `paired`, `added`, `removed` rows).

Each commit header includes one compact line with `Committed ... · Committer: ...` metadata.

Each merge request header includes a `Project` line showing the MR project path, followed by one compact line with `Merged ... · Author: ... · Assignees: ... · Reviewers: ...` metadata.

Within a file table, non-overlapping chunk groups are separated by a row containing `…` in every column. Overlapping/adjacent groups are merged into a single contiguous section.

When Regrizer can determine post-image file length, it also adds boundary separators: one at the top if the first visible numbered row is not line 1, and one at the bottom if the last visible numbered row is not the file's last line.

Within a single hunk, unchanged lines in the middle of changes (for example a `where:` line between two modified groups) are rendered as `context` rows, not as modified rows.

Each issue section title is rendered from issue data (for example, `Issue #6380 - <issue title>`) instead of generic numbering.

For readability, repeated consecutive values in these provenance columns are rendered as merged cells (`rowspan`) within each file table:

- previous commit
- merge request
- related issues

## Run tests

```bash
npm test
```

