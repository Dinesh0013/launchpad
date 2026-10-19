import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// ─── materializeFromStorage ───────────────────────────────────────────────────
// Downloads all files for a project from Supabase Storage to a local directory,
// recreating the relative path structure under destDir.

export async function materializeFromStorage({
  supabase,
  userId,
  projectId,
  destDir,
}: {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  destDir: string;
}): Promise<void> {
  const basePath = `${userId}/${projectId}/`;

  await fs.promises.mkdir(destDir, { recursive: true });

  const { data: probeData, error: probeError } = await supabase.storage
    .from("deployments")
    .list(basePath, { limit: 100, offset: 0 });

  if (probeError) {
    console.error("Storage list error:", probeError);
    throw new Error("Storage not configured. Contact support.");
  }

  // probeData may be [] if no files yet — not an error; recurse handles it
  void probeData;

  async function recurse(dir: string): Promise<void> {
    const { data, error } = await supabase.storage
      .from("deployments")
      .list(dir, { limit: 1000 });

    if (error || !data) return;

    for (const item of data) {
      const fullPath = `${dir}/${item.name}`;

      if (item.id === null) {
        // Directory — recurse
        await recurse(fullPath);
      } else {
        const { data: blob } = await supabase.storage
          .from("deployments")
          .download(fullPath);

        if (blob) {
          const relativePath = fullPath.slice(basePath.length + 1);
          const localPath = path.join(destDir, relativePath);
          await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
          const buf = Buffer.from(await blob.arrayBuffer());
          await fs.promises.writeFile(localPath, buf);
        }
      }
    }
  }

  await recurse(basePath);
}

// ─── collectFiles ─────────────────────────────────────────────────────────────
// Recursively collects all files under dir, returning paths relative to dir.
// Skips node_modules, .git, and .cache directories.

const SKIP_DIRS = new Set(["node_modules", ".git", ".cache"]);

export async function collectFiles(
  dir: string,
): Promise<{ path: string; content: Buffer }[]> {
  const results: { path: string; content: Buffer }[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.promises.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(current, entry.name);
      // Always use forward slashes for CF Pages compatibility
      const relativePath = path.relative(dir, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const content = await fs.promises.readFile(fullPath);
        results.push({ path: relativePath, content });
      }
    }
  }

  await walk(dir);
  return results;
}
