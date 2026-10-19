import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

// ─── Error type ──────────────────────────────────────────────────────────────

export class BuildError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BuildError";
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type Framework = "vite" | "next-static" | "cra" | "prebuilt" | "script";

export interface DetectResult {
  framework: Framework;
  outDir: string;
}

type LogCallback = (stage: string, level: string, message: string) => void;

// ─── Package.json shape ───────────────────────────────────────────────────────

interface PkgJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

// ─── Framework detection ─────────────────────────────────────────────────────

export async function detectFramework(
  sourceDir: string,
): Promise<DetectResult> {
  const pkgPath = path.join(sourceDir, "package.json");
  let pkg: PkgJson | null = null;

  try {
    const raw = await fs.promises.readFile(pkgPath, "utf-8");
    pkg = JSON.parse(raw) as PkgJson;
  } catch {
    // no package.json — handled below
  }

  if (pkg !== null) {
    const allDeps: Record<string, string> = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    // 1. TanStack Start → SSR unsupported
    if ("@tanstack/start" in allDeps) {
      throw new BuildError(
        "SSR_UNSUPPORTED",
        "This app needs a server; static hosting coming soon",
      );
    }

    // 2. Next.js — read config to distinguish static export vs SSR
    let dirEntries: string[] = [];
    try {
      dirEntries = await fs.promises.readdir(sourceDir);
    } catch { /* ignore */ }

    const nextConfigFiles = dirEntries.filter((f) => f.startsWith("next.config"));
    if ("next" in allDeps || nextConfigFiles.length > 0) {
      let isStaticExport = false;
      for (const configFile of nextConfigFiles) {
        try {
          const content = await fs.promises.readFile(
            path.join(sourceDir, configFile),
            "utf-8",
          );
          if (/output\s*:\s*['"]export['"]/.test(content)) {
            isStaticExport = true;
            break;
          }
        } catch { /* unreadable config */ }
      }

      if (isStaticExport) {
        return { framework: "next-static", outDir: path.join(sourceDir, "out") };
      }
      throw new BuildError(
        "SSR_UNSUPPORTED",
        "This app needs a server; static hosting coming soon",
      );
    }

    // 3. Vite — config file OR "vite" in deps
    const viteConfigFiles = dirEntries.filter((f) => f.startsWith("vite.config"));
    if ("vite" in allDeps || viteConfigFiles.length > 0) {
      return { framework: "vite", outDir: path.join(sourceDir, "dist") };
    }

    // 4. CRA
    if ("react-scripts" in allDeps) {
      return { framework: "cra", outDir: path.join(sourceDir, "build") };
    }

    // 5. Build-script fallback — any project that has a "build" npm script.
    //    outDir is provisional (dist); buildFromSource will scan dist/ → out/ → build/
    //    after the run and use whichever contains index.html.
    if (pkg.scripts?.build) {
      return { framework: "script", outDir: path.join(sourceDir, "dist") };
    }

    // package.json present with NO build script AND no framework signal
    throw new BuildError(
      "UNKNOWN_FRAMEWORK",
      "Could not detect how to build this project",
    );
  }

  // 5. No package.json + index.html at root → pre-built static site
  try {
    await fs.promises.access(path.join(sourceDir, "index.html"));
    return { framework: "prebuilt", outDir: sourceDir };
  } catch { /* no index.html */ }

  throw new BuildError(
    "UNKNOWN_FRAMEWORK",
    "Could not detect how to build this project",
  );
}

// ─── Package manager ─────────────────────────────────────────────────────────

function detectPackageManager(sourceDir: string): "pnpm" | "yarn" | "npm" {
  if (fs.existsSync(path.join(sourceDir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(sourceDir, "yarn.lock"))) return "yarn";
  return "npm";
}

// ─── Spawn helper ─────────────────────────────────────────────────────────────

function spawnCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  log: LogCallback,
  stage: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const recentLines: string[] = [];
    let settled = false;

    // shell:true is required on Windows where npm/pnpm/yarn are .cmd files.
    // Pass as a single string (not array) to avoid Node 22 DEP0190 warning.
    const proc: ChildProcess = spawn(`${cmd} ${args.join(" ")}`, {
      cwd,
      shell: true,
      env: { ...process.env, CI: "1" },
    });

    function handleLine(line: string) {
      recentLines.push(line);
      if (recentLines.length > 500) recentLines.shift();
      log(stage, "info", line);
    }

    let stdoutBuf = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) handleLine(l);
    });

    let stderrBuf = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split(/\r?\n/);
      stderrBuf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) handleLine(l);
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      reject(
        new BuildError(
          "BUILD_FAILED",
          `Command timed out after ${timeoutMs / 1000}s\n${recentLines.slice(-30).join("\n")}`,
        ),
      );
    }, timeoutMs);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (stdoutBuf.trim()) handleLine(stdoutBuf);
      if (stderrBuf.trim()) handleLine(stderrBuf);
      if (code !== 0) {
        reject(
          new BuildError(
            "BUILD_FAILED",
            `'${cmd} ${args.join(" ")}' exited ${code ?? "null"}\n${recentLines.slice(-30).join("\n")}`,
          ),
        );
      } else {
        resolve();
      }
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new BuildError("BUILD_FAILED", `Failed to spawn '${cmd}': ${err.message}`));
    });
  });
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function buildFromSource({
  sourceDir,
  log,
}: {
  sourceDir: string;
  log: LogCallback;
}): Promise<{ outDir: string; framework: Framework }> {
  log("validating", "info", "Detecting framework…");

  const { framework, outDir } = await detectFramework(sourceDir);

  log("validating", "info", `Framework: ${framework}`);

  if (framework === "prebuilt") {
    log("validating", "info", "Pre-built site — skipping install and build");
    return { outDir, framework };
  }

  const pm = detectPackageManager(sourceDir);
  log("building", "info", `Package manager: ${pm}`);

  // Install
  const installArgs =
    pm === "pnpm"
      ? ["install", "--frozen-lockfile"]
      : pm === "yarn"
        ? ["install", "--frozen-lockfile"]
        : fs.existsSync(path.join(sourceDir, "package-lock.json"))
          ? ["ci"]
          : ["install"];

  const timeoutMs = Number(process.env.BUILD_TIMEOUT_MS) || 180_000;

  log("building", "info", `Running: ${pm} ${installArgs.join(" ")}`);
  await spawnCommand(pm, installArgs, sourceDir, timeoutMs, log, "building");

  // Build
  const buildArgs = ["run", "build"];
  log("deploying", "info", `Running: ${pm} ${buildArgs.join(" ")}`);
  await spawnCommand(pm, buildArgs, sourceDir, timeoutMs, log, "deploying");

  // For build-script fallback, scan candidates in priority order to find actual output
  let resolvedOutDir = outDir;
  if (framework === "script") {
    for (const dir of ["dist", "out", "build"].map((d) => path.join(/*turbopackIgnore: true*/ sourceDir, d))) {
      try {
        await fs.promises.access(path.join(dir, "index.html"));
        resolvedOutDir = dir;
        break;
      } catch { /* try next candidate */ }
    }
  }

  // Verify output
  try {
    await fs.promises.access(path.join(resolvedOutDir, "index.html"));
  } catch {
    throw new BuildError(
      "NO_OUTPUT",
      `Build finished but produced no index.html (expected in ${resolvedOutDir})`,
    );
  }

  log("deploying", "info", `Build complete → ${resolvedOutDir}`);
  return { outDir: resolvedOutDir, framework };
}
