# Regrizer

Regrizer is a TypeScript CLI that builds an HTML report for a GitLab issue by analyzing merged merge requests and their code changes.

The report hierarchy is:

1. Merge requests (latest merged first)
2. Commit selected as the merge result on target branch
3. Files touched by that commit
4. Diff chunks per file
5. For each chunk:
   - 7 lines before context
   - lines after commit (new side)
   - lines before commit (old side) with:
     - previous commit (clickable SHA to commit page)
     - merge request link for that commit (when available)
     - related issue links for that merge request
   - 7 lines after context

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

- **REST** `GET /projects/:url_encoded_path`

Used to get the numeric project ID.

### 3) Fetch issue

- **REST** `GET /projects/:project_id/issues/:issue_iid`

Used as the input issue object in the final report.

### 4) Discover merge requests related to the issue

Regrizer intentionally uses the union of these two endpoints:

- **REST** `GET /projects/:project_id/issues/:issue_iid/related_merge_requests`
- **REST** `GET /projects/:project_id/issues/:issue_iid/closed_by`

Then it deduplicates by `(project_id, iid)`.

### 5) Hydrate each MR and keep only merged MRs

For each MR reference from step 4:

- **REST** `GET /projects/:mr_project_id/merge_requests/:mr_iid`

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

- **REST** `GET /projects/:project_id/repository/commits/:sha`
- **REST** `GET /projects/:project_id/repository/commits/:sha/diff`

The commit object provides parent SHAs; for merge commits, the analyzer uses the first parent as pre-image reference.

### 8) Parse diff into chunks

No API call in this step.

Local parsing with unified hunk headers, producing:

- old range (`oldStart`, `oldCount`)
- new range (`newStart`, `newCount`)
- old-side removed lines and new-side added lines

### 9) Fetch file contents for context windows

For each changed file:

- Post-image (after commit):
  - **REST** `GET /projects/:project_id/repository/files/:url_encoded_new_path/raw?ref=:commit_sha`
- Pre-image (before commit), when parent exists:
  - **REST** `GET /projects/:project_id/repository/files/:url_encoded_old_path/raw?ref=:first_parent_sha`

Used to render 7 lines before/after plus exact before/after lines for chunk content.

### 10) Attribute previous commit per old-side line

For each removed line with a valid old line number:

- **REST** `GET /projects/:project_id/repository/files/:url_encoded_old_path/blame?ref=:first_parent_sha&range[start]=:line&range[end]=:line`

Then, when a previous commit SHA is found, Regrizer enriches the row for links and related metadata:

- **REST** `GET /projects/:project_id/repository/commits/:previous_commit_sha`
  - used to link the SHA to the commit page (`web_url`)
- **REST** `GET /projects/:project_id/repository/commits/:previous_commit_sha/merge_requests`
  - used to resolve a related merged MR for the commit
- **REST** `GET /projects/:mr_project_id/merge_requests/:mr_iid/closes_issues`
  - used to list issues closed by the MR
- **REST** `GET /projects/:mr_project_id/merge_requests/:mr_iid/related_issues`
  - used to list issues related to the MR

Issues from both endpoints are merged and deduplicated (with existing GraphQL fallback for `closes_issues` if needed).

The resulting old-side table row includes:

- previous commit (short SHA hyperlink)
- merge request hyperlink (if found)
- related issue hyperlinks (if found)

### 11) Render HTML report

No API call in this step.

The renderer outputs nested, collapsible sections for MR -> commit -> file -> chunk with code blocks and metadata.

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

- Authentication: set a GitLab personal access token in `GITLAB_TOKEN`.
- Use `--verbose` to print every REST call and progress stage.
- Binary/unavailable diffs are included with a skip reason.
- If blame cannot resolve a previous commit for a line, the report marks it as unresolved.
