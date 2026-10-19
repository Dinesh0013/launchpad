import type AdmZip from "adm-zip";

/**
 * Returns the single common top-level directory that ALL non-directory entries
 * share, or null if entries are mixed-root or already at the root level.
 *
 * Examples:
 *   ["my-app/index.html", "my-app/src/main.js"] → "my-app"
 *   ["a/index.html", "b/main.js"]               → null  (mixed)
 *   ["index.html", "style.css"]                  → null  (root-level)
 */
export function getCommonRoot(entries: AdmZip.IZipEntry[]): string | null {
  const fileEntries = entries.filter((e) => !e.isDirectory);
  if (fileEntries.length === 0) return null;

  // Map each entry to its first path component, or null if there is no "/"
  const firstComponents = fileEntries.map((e) => {
    const slash = e.entryName.indexOf("/");
    return slash > 0 ? e.entryName.slice(0, slash) : null;
  });

  const first = firstComponents[0];
  if (!first) return null; // first entry is at root level

  const allSame = firstComponents.every((c) => c === first);
  return allSame ? first : null;
}

/**
 * Strips `root + "/"` from the beginning of entryName.
 * Returns the original name if it does not start with the prefix.
 */
export function stripRoot(entryName: string, root: string): string {
  const prefix = `${root}/`;
  return entryName.startsWith(prefix) ? entryName.slice(prefix.length) : entryName;
}
