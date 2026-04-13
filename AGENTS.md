# AGENTS.md

## Purpose
This file provides guidance for AI/code agents working in this repository.

## Canonical documentation
- Always read `README.md` before doing any work in this repository.
- `README.md` is the canonical source for product behavior, architecture, CLI usage, and API flow.
- Do not duplicate README content here; this file should only contain agent workflow constraints.
- For report/CLI invariants, follow README and keep behavior aligned with it.

## Agent workflow rules
- Prefer minimal, focused changes that address root causes.
- Avoid changing public behavior unless the task explicitly requests it.
- If behavior or implementation changes, update `README.md` in the same task.

## Validation checklist (for any non-trivial change)
1. `npm run build`
2. `npm test` (when tests exist for impacted area)
3. Ensure README examples/notes still match actual CLI and report behavior.
