# Architecture

## Modules

- `src/cli.ts`: CLI argument parsing and orchestration. Loads `regrizer.yaml` from the current working directory via `loadRegrizerConfig` and passes the resolved file type list to the renderer.
- `src/fileTypeConfig.ts`: `regrizer.yaml` loading, validation, and file type resolution (`loadRegrizerConfig`, `resolveFileType`).
- `src/gitlabClient.ts`: GitLab REST/GraphQL client and request helpers.
- `src/analyzer.ts`: Analysis pipeline (issue -> MRs -> merged commit -> files -> chunks -> blame attribution). Files are emitted with placeholder file type fields; the renderer stamps the resolved values.
- `src/diffParser.ts`: Unified diff hunk parsing.
- `src/reportRenderer.ts`: HTML rendering of the nested report model. `withFileTypeMarkers` resolves each file's type using `resolveFileType` and stamps `fileTypeName`, `fileTypeIcon`, and `fileTypeDisplayOrder`. The overview is rendered as a collapsible MR → commit → file-type → issues tree.
- `src/globMatcher.ts`: Glob-to-regexp conversion and path matching used by file type resolution.
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

When related issues on a row include the currently analyzed issue, the renderer marks all three provenance columns for that row group (previous commit, merge request, related issues) with reduced visual emphasis.

### 11) Render HTML report

No API call in this step.

Before rendering, `withFileTypeMarkers` iterates every file in every commit and calls `resolveFileType(mrProjectPath, filePath, fileTypes)` to stamp `fileTypeName`, `fileTypeIcon`, and `fileTypeDisplayOrder` onto each `ReportCommitFile`. `fileTypes` comes from `regrizer.yaml` (or a single default catch-all type named **Files** with icon **📄** when that file is absent). `resolveFileType` returns the first entry in list order whose project-path and file-path globs both match. `displayOrder` is used only to sort file types for display in the overview.

The **overview** is a collapsible tree rendered at the top of the report:

- Per analyzed issue (header)
- Per related MR (`<details open>`)
- Per commit in that MR (`<details open>`)
- Per file type present in that commit, in `displayOrder` order; types with no files in the commit are omitted
- For each file type: unique origin issues from all files of that type, excluding the currently analyzed issue

The **detail sections** output nested `details/summary` for issue → MR → commit → file (all `open` by default), with one color-coded unified table per file (`context`, `paired`, `added`, `removed` rows). Each file label is prefixed with its file type icon.

Each commit header includes one compact line with `Committed ... · Committer: ...` metadata.

Each merge request header includes a `Project` line showing the MR project path, followed by one compact line with `Merged ... · Author: ... · Assignees: ... · Reviewers: ...` metadata.

Within a file table, the `Code after commit` and `Code before commit` column titles link to GitLab blame pages when the MR project web URL is known. The links are built as `projectWebUrl/-/blame/<sha>/<filePath>`, using the commit SHA for the post-image and the first parent SHA (`parent_ids[0]`) for the pre-image.

Within a file table, non-overlapping chunk groups are separated by a row containing `…` in every column. Overlapping/adjacent groups are merged into a single contiguous section.

When Regrizer can determine post-image file length, it also adds boundary separators: one at the top if the first visible numbered row is not line 1, and one at the bottom if the last visible numbered row is not the file's last line.

Within a single hunk, unchanged lines in the middle of changes (for example a `where:` line between two modified groups) are rendered as `context` rows, not as modified rows.

Each issue section title is rendered from issue data (for example, `Issue #6380 - <issue title>`) instead of generic numbering.

For readability, repeated consecutive values in these provenance columns are rendered as merged cells (`rowspan`) within each file table:

- previous commit
- merge request
- related issues

When related issues on a row include the currently analyzed issue, the renderer marks all three provenance columns for that row group with reduced visual emphasis.

## Run tests

```bash
npm test
```
