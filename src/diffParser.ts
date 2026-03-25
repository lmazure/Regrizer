import { uniqueNumbers } from "./utils.js";

export interface ParsedDiffLine {
  lineNumber: number | null;
  text: string;
}

export interface ParsedDiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  beforeLines: ParsedDiffLine[];
  afterLines: ParsedDiffLine[];
}

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

export function parseUnifiedDiffHunks(diff: string): ParsedDiffHunk[] {
  const lines = diff.split("\n");
  const hunks: ParsedDiffHunk[] = [];

  let current: ParsedDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
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
        beforeLines: [],
        afterLines: [],
      };
      continue;
    }

    if (!current || line.startsWith("+++") || line.startsWith("---") || line.startsWith("\\")) {
      continue;
    }

    if (line.startsWith("+")) {
      current.afterLines.push({ lineNumber: newLine, text: line.slice(1) });
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      current.beforeLines.push({ lineNumber: oldLine, text: line.slice(1) });
      oldLine += 1;
      continue;
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
