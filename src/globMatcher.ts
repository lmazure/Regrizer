export function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function globToRegExp(glob: string): RegExp {
  const normalized = normalizePath(glob).trim();

  let source = "";
  let index = 0;

  const escapeChar = (value: string): string => value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

  while (index < normalized.length) {
    const current = normalized[index];

    // Special-case '/**' at end: match the prefix with an optional '/...' suffix.
    if (
      current === "/" &&
      normalized[index + 1] === "*" &&
      normalized[index + 2] === "*" &&
      index + 3 === normalized.length
    ) {
      source += "(?:/.*)?";
      index += 3;
      continue;
    }

    // Special-case '**/' optionally matching zero or more directories.
    if (current === "*" && normalized[index + 1] === "*" && normalized[index + 2] === "/") {
      source += "(?:.*/)?";
      index += 3;
      continue;
    }

    // '**' matches anything, including '/'.
    if (current === "*" && normalized[index + 1] === "*") {
      source += ".*";
      index += 2;
      continue;
    }

    // '*' matches within a segment.
    if (current === "*") {
      source += "[^/]*";
      index += 1;
      continue;
    }

    source += escapeChar(current);
    index += 1;
  }

  return new RegExp(`^${source}$`);
}

export function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  if (globs.length === 0) {
    return false;
  }

  const normalizedPath = normalizePath(path);
  return globs.some((glob) => {
    const normalizedGlob = normalizePath(glob).trim();
    if (normalizedGlob.length === 0) {
      return false;
    }
    return globToRegExp(normalizedGlob).test(normalizedPath);
  });
}
