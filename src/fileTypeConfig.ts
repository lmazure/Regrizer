import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { matchesAnyGlob } from "./globMatcher.js";

/**
 * Configuration for a single file type classification.
 */
export interface FileTypeConfig {
  typeName: string;
  projectPathGlobs: string[];
  filePathGlobs: string[];
  icon: string;
  displayOrder: number;
}

/**
 * Top-level structure of regrizer.yaml.
 */
export interface RegrizerConfig {
  fileTypes: FileTypeConfig[];
}

const DEFAULT_CONFIG: RegrizerConfig = {
  fileTypes: [
    {
      typeName: "Files",
      projectPathGlobs: [],
      filePathGlobs: [],
      icon: "📄",
      displayOrder: 1,
    },
  ],
};

/**
 * Loads and validates regrizer.yaml from the given path.
 * Returns a default single-type config when the file is not found.
 * @param configPath Path to regrizer.yaml.
 * @returns Parsed and validated configuration.
 */
export function loadRegrizerConfig(configPath: string): RegrizerConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return DEFAULT_CONFIG;
  }

  const parsed = parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`regrizer.yaml: file must be a YAML mapping`);
  }

  const root = parsed as Record<string, unknown>;

  if (!("fileTypes" in root)) {
    throw new Error(`regrizer.yaml: missing required 'fileTypes' field`);
  }

  const fileTypesRaw = root["fileTypes"];
  if (!Array.isArray(fileTypesRaw) || fileTypesRaw.length === 0) {
    throw new Error(`regrizer.yaml: 'fileTypes' must be a non-empty array`);
  }

  const fileTypes: FileTypeConfig[] = fileTypesRaw.map((item: unknown, index: number) => {
    if (!item || typeof item !== "object") {
      throw new Error(`regrizer.yaml: fileTypes[${index}] must be an object`);
    }
    const entry = item as Record<string, unknown>;

    if (typeof entry["typeName"] !== "string" || entry["typeName"].trim().length === 0) {
      throw new Error(`regrizer.yaml: fileTypes[${index}].typeName is required and must be a non-empty string`);
    }
    if (typeof entry["icon"] !== "string" || entry["icon"].trim().length === 0) {
      throw new Error(`regrizer.yaml: fileTypes[${index}].icon is required and must be a non-empty string`);
    }
    if (typeof entry["displayOrder"] !== "number") {
      throw new Error(`regrizer.yaml: fileTypes[${index}].displayOrder is required and must be a number`);
    }

    return {
      typeName: entry["typeName"].trim(),
      icon: entry["icon"].trim(),
      displayOrder: entry["displayOrder"],
      projectPathGlobs: normalizeGlobList(entry["projectPathGlobs"], `fileTypes[${index}].projectPathGlobs`),
      filePathGlobs: normalizeGlobList(entry["filePathGlobs"], `fileTypes[${index}].filePathGlobs`),
    };
  });

  // Validate: no duplicate display orders
  const orderSet = new Set<number>();
  for (const ft of fileTypes) {
    if (orderSet.has(ft.displayOrder)) {
      throw new Error(`regrizer.yaml: duplicate displayOrder value ${ft.displayOrder} is not allowed`);
    }
    orderSet.add(ft.displayOrder);
  }

  // Validate: the last entry in the list must be a catch-all (matches any project and file)
  const last = fileTypes[fileTypes.length - 1];
  if (last.projectPathGlobs.length > 0 || last.filePathGlobs.length > 0) {
    throw new Error(
      `regrizer.yaml: the last fileType entry ("${last.typeName}") must have no projectPathGlobs and no filePathGlobs so it matches all files`,
    );
  }

  // fileTypes is kept in list order — matching uses list position, not displayOrder.
  // Callers that need display order must sort by displayOrder themselves.
  return { fileTypes };
}

function normalizeGlobList(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`regrizer.yaml: ${fieldName} must be an array of strings`);
  }
  return value.map((item: unknown, i: number) => {
    if (typeof item !== "string") {
      throw new Error(`regrizer.yaml: ${fieldName}[${i}] must be a string`);
    }
    return item;
  });
}

/**
 * Returns the first FileTypeConfig whose project and file path globs match.
 * Expects fileTypes to be sorted by displayOrder ascending.
 * @param projectPath Project path with namespace (e.g. "group/project").
 * @param filePath File path relative to repository root.
 * @param fileTypes Sorted list of file type configs.
 * @returns Matching file type config.
 */
export function resolveFileType(projectPath: string, filePath: string, fileTypes: FileTypeConfig[]): FileTypeConfig {
  for (const ft of fileTypes) {
    const projectMatch = ft.projectPathGlobs.length === 0 || matchesAnyGlob(projectPath, ft.projectPathGlobs);
    const fileMatch = ft.filePathGlobs.length === 0 || matchesAnyGlob(filePath, ft.filePathGlobs);
    if (projectMatch && fileMatch) {
      return ft;
    }
  }
  return fileTypes[fileTypes.length - 1];
}
