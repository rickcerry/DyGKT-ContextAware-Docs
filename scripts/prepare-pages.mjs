import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(projectRoot, "docs");
const siteUrl = (process.env.SITE_URL || "").replace(/\/+$/, "");

if (!siteUrl) throw new Error("SITE_URL is required to prepare absolute social metadata.");

const pages = (await readdir(docsRoot)).filter((name) => name.endsWith(".html") && name !== "404.html");
for (const page of pages) {
  const file = path.join(docsRoot, page);
  let html = await readFile(file, "utf8");
  html = html
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${siteUrl}/${page}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${siteUrl}/assets/social-card.jpg">`)
    .replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${siteUrl}/assets/social-card.jpg">`);
  await writeFile(file, html);
}

console.log(`Prepared absolute social metadata for ${pages.length} pages at ${siteUrl}.`);
