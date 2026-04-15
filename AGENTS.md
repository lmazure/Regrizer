# AGENTS.md

## Purpose
This file provides guidance for AI/code agents working in this repository.

## Canonical documentation
- Always read `README.md` and `architecture.md` before doing any work in this repository.
- `README.md` is the canonical source for product behavior and CLI usage.
- `architecture.md` is the canonical source for architecture and module structure.
- Do not duplicate README or architecture content here; this file should only contain agent workflow constraints.

## Agent workflow rules
- Prefer minimal, focused changes that address root causes.
- Avoid changing public behavior unless the task explicitly requests it.
- If behavior changes, update `README.md` in the same task.
- If implementation changes, update `architecture.md` in the same task.

## Validation checklist (for any non-trivial change)
1. `npm run build`
2. `npm test` (when tests exist for impacted area)
3. Ensure `README.md` still matches actual CLI and report behavior.
4. Ensure `architecture.md` still matches actual architecture, module structure, data retrieval pipeline, and GitLab API calls.
