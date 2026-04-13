import { uniqueNumbers } from "./utils.js";

/**
 * A single line in a parsed diff with its target line number.
 */
export interface ParsedDiffLine {
  lineNumber: number | null;
  text: string;
}

/**
 * One normalized entry inside a parsed unified diff hunk.
 */
export interface ParsedHunkEntry {
  kind: "context" | "added" | "removed";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  text: string;
}

/**
 * Parsed representation of a unified diff hunk.
 */
export interface ParsedDiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  entries: ParsedHunkEntry[];
  leadingContextNew: ParsedDiffLine[];
  trailingContextNew: ParsedDiffLine[];
  beforeLines: ParsedDiffLine[];
  afterLines: ParsedDiffLine[];
}

/**
 * Extracts changed line numbers from the new side of a unified diff.
 * @param diff Unified diff text.
 * @returns Unique changed line numbers on the new side.
 */
export function extractChangedNewLineNumbers(diff: string): number[] {
  const lines = diff.split("\n");
  const changed: number[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const header = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!header) {
        continue;
      }

      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      continue;
    }

    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("\\")) {
      continue;
    }

    if (line.startsWith("+")) {
      changed.push(newLine);
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      oldLine += 1;
      continue;
    }

    oldLine += 1;
    newLine += 1;
  }

  return uniqueNumbers(changed);
}

/**
 * Parses unified diff text into structured hunk objects.
 * @param diff Unified diff text.
 * @returns Parsed diff hunks.
 */
export function parseUnifiedDiffHunks(diff: string): ParsedDiffHunk[] {
  const lines = diff.split("\n");
  const hunks: ParsedDiffHunk[] = [];

  let current: ParsedDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let seenModification = false;
  let trailingContextCandidate: ParsedDiffLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length === 0 && index === lines.length - 1) {
      continue;
    }

    if (line.startsWith("@@")) {
      if (current) {
        hunks.push(current);
      }

      const header = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!header) {
        current = null;
        continue;
      }

      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      current = {
        oldStart: oldLine,
        oldCount: Number(header[2] ?? "1"),
        newStart: newLine,
        newCount: Number(header[4] ?? "1"),
        entries: [],
        leadingContextNew: [],
        trailingContextNew: [],
        beforeLines: [],
        afterLines: [],
      };
      seenModification = false;
      trailingContextCandidate = [];
      continue;
    }

    if (!current || line.startsWith("+++") || line.startsWith("---") || line.startsWith("\\")) {
      continue;
    }

    if (line.startsWith("+")) {
      seenModification = true;
      trailingContextCandidate = [];
      current.entries.push({
        kind: "added",
        oldLineNumber: null,
        newLineNumber: newLine,
        text: line.slice(1),
      });
      current.afterLines.push({ lineNumber: newLine, text: line.slice(1) });
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      seenModification = true;
      trailingContextCandidate = [];
      current.entries.push({
        kind: "removed",
        oldLineNumber: oldLine,
        newLineNumber: null,
        text: line.slice(1),
      });
      current.beforeLines.push({ lineNumber: oldLine, text: line.slice(1) });
      oldLine += 1;
      continue;
    }

    const contextText = line.startsWith(" ") ? line.slice(1) : line;
    const contextLine: ParsedDiffLine = {
      lineNumber: newLine,
      text: contextText,
    };
    current.entries.push({
      kind: "context",
      oldLineNumber: oldLine,
      newLineNumber: newLine,
      text: contextText,
    });
    if (!seenModification) {
      current.leadingContextNew.push(contextLine);
    } else {
      trailingContextCandidate.push(contextLine);
      current.trailingContextNew = [...trailingContextCandidate];
    }

    // Unified diff context line: advances cursors but is not a modified line.
    oldLine += 1;
    newLine += 1;
  }

  if (current) {
    hunks.push(current);
  }

  return hunks;
}
