/**
 * Unit tests for lib/zip.ts — getCommonRoot and stripRoot.
 * No browser required; no network calls.
 */
import { test, expect } from "@playwright/test";
import type AdmZip from "adm-zip";
import { getCommonRoot, stripRoot } from "../lib/zip";

// Minimal mock — getCommonRoot only reads entryName and isDirectory
function e(name: string): AdmZip.IZipEntry {
  return { entryName: name, isDirectory: name.endsWith("/") } as AdmZip.IZipEntry;
}

test.describe("getCommonRoot", () => {
  test("all entries under single folder → returns that folder", () => {
    const entries = [
      e("my-app/index.html"),
      e("my-app/src/main.js"),
      e("my-app/styles.css"),
    ];
    expect(getCommonRoot(entries)).toBe("my-app");
  });

  test("mixed roots → null", () => {
    const entries = [
      e("my-app/index.html"),
      e("other/main.js"),
    ];
    expect(getCommonRoot(entries)).toBeNull();
  });

  test("files at root (no directory) → null", () => {
    const entries = [
      e("index.html"),
      e("style.css"),
    ];
    expect(getCommonRoot(entries)).toBeNull();
  });

  test("single root-level file → null", () => {
    expect(getCommonRoot([e("index.html")])).toBeNull();
  });

  test("empty entries → null", () => {
    expect(getCommonRoot([])).toBeNull();
  });

  test("directory entries are ignored, file entries drive result", () => {
    // adm-zip includes directory entries; they should not affect root detection
    const entries = [
      e("project/"),        // directory entry
      e("project/index.html"),
      e("project/src/"),    // directory entry
      e("project/src/main.js"),
    ];
    expect(getCommonRoot(entries)).toBe("project");
  });
});

test.describe("stripRoot", () => {
  test("strips the root prefix", () => {
    expect(stripRoot("my-app/index.html", "my-app")).toBe("index.html");
    expect(stripRoot("my-app/src/main.js", "my-app")).toBe("src/main.js");
  });

  test("entry that does not start with prefix is returned unchanged", () => {
    expect(stripRoot("other/index.html", "my-app")).toBe("other/index.html");
  });

  test("entry equal to root + slash becomes empty string", () => {
    expect(stripRoot("my-app/", "my-app")).toBe("");
  });
});
