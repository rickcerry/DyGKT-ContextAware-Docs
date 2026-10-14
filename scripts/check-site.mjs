import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(projectRoot, "docs");
const pages = (await readdir(docsRoot)).filter((name) => name.endsWith(".html"));
const failures = [];

for (const page of pages) {
  const source = path.join(docsRoot, page);
  const html = await readFile(source, "utf8");
  if (!html.includes("<!doctype html>")) failures.push(`${page}: missing HTML doctype`);
  if (page !== "404.html" && !html.includes("<main")) failures.push(`${page}: missing main landmark`);

  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/gi)) {
    const raw = match[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(raw)) continue;
    const targetPath = raw.split("#")[0];
    if (!targetPath) continue;
    let decoded;
    try { decoded = decodeURIComponent(targetPath); } catch { decoded = targetPath; }
    const target = path.resolve(path.dirname(source), decoded);
    try { await access(target); } catch { failures.push(`${page}: missing local target ${raw}`); }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${pages.length} HTML files: every local link and asset resolves.`);
}
