import { uniqueNumbers } from "./utils.js";

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
