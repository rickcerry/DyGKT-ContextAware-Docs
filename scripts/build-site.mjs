import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pageLinks, resolveLocalTarget, splitLocalHref } from "./page-links.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "docs");
const themeRoot = path.join(projectRoot, "site");
const siteUrl = (process.env.SITE_URL || "").replace(/\/+$/, "");

const encodePath = (value) => value.split("/").map(encodeURIComponent).join("/");
const normalise = (value) => path.resolve(value);
const escapeHtml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page";
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["docs", "site", "scripts", ".git", ".github", "node_modules"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

function getTitle(html, source) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title) throw new Error(`No <title> found in ${source}`);
  return title.replace(/<[^>]+>/g, "");
}

function getArticle(html, source) {
  const article = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0];
  if (!article) throw new Error(`No <article> found in ${source}`);
  return article.replace(/<style>@import url\('[^']*katex[^']*'\)<\/style>/gi, "");
}

function getIcon(html, title) {
  const icon = html.match(/<meta name="data-notion-page-icon" content="([^"]+)"/i)?.[1];
  if (icon && !icon.startsWith("attachment:")) return icon;
  return title === "Summer Internship Report" ? "⌁" : "§";
}

function rewriteUrls(article, page, bySource, assetFiles) {
  return article.replace(/\b(href|src)=(["'])(.*?)\2/gi, (whole, attribute, quote, rawValue) => {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(rawValue)) {
      if (attribute.toLowerCase() === "href" && /^https?:/i.test(rawValue)) {
        return `${attribute}=${quote}${rawValue}${quote} target="_blank" rel="noopener noreferrer"`;
      }
      return whole;
    }

    const localHref = splitLocalHref(rawValue);
    if (!localHref) return whole;

    const target = resolveLocalTarget(page.source, localHref.pathname);
    const linkedPage = bySource.get(target);
    if (linkedPage) return `${attribute}=${quote}${linkedPage.output}${localHref.suffix}${quote}`;

    if (target.startsWith(projectRoot + path.sep) && existsSync(target)) {
      const relative = path.relative(projectRoot, target).split(path.sep).join("/");
      assetFiles.add(target);
      return `${attribute}=${quote}assets/notion/${encodePath(relative)}${localHref.suffix}${quote}`;
    }
    return whole;
  });
}

function sidebarMarkup(pages, current) {
  const items = pages.map((page) => `
    <li>
      <a class="sidebar-link${page === current ? " is-active" : ""}" href="${page.output}"${page === current ? ' aria-current="page"' : ""}>
        <span class="nav-icon" aria-hidden="true">${escapeHtml(page.icon)}</span>
        <span>${escapeHtml(page.title)}</span>
      </a>
    </li>`).join("");

  return `
    <aside class="sidebar" id="site-sidebar" aria-label="Report navigation">
      <div class="sidebar-inner">
        <a class="site-brand" href="index.html">
          <span><strong>Summer Internship Report</strong><small>Riccardo Alfonso Cerrone</small></span>
        </a>
        <nav class="page-navigation" aria-label="Pages">
          <p class="nav-label">Report chapters</p>
          <ol>${items}</ol>
        </nav>
        <div class="outline-wrap">
          <p class="nav-label">On this page</p>
          <nav class="page-outline" id="page-outline" aria-label="On this page"></nav>
        </div>
        <div class="sidebar-meta">
          <span>Riccardo Alfonso Cerrone</span>
          <a href="mailto:cerrone@kth.se">cerrone@kth.se</a>
        </div>
      </div>
    </aside>`;
}

function enhanceInteractiveContent(article) {
  return article.replace(
    /<figure([^>]*)><div class="source"><a href="(https:\/\/www\.desmos\.com\/calculator\/[a-z0-9]+)"[^>]*>[\s\S]*?<\/a><\/div>([\s\S]*?)<\/figure>/gi,
    (_, attributes, url, caption) => `<figure${attributes} class="interactive-graph"><div class="interactive-graph-frame"><iframe src="${url}?embed" title="Interactive graph of the contextual relevance score" loading="lazy" allowfullscreen></iframe></div>${caption}<p class="interactive-graph-link"><a href="${url}" target="_blank" rel="noopener noreferrer">Open and edit the graph in Desmos ↗</a></p></figure>`,
  );
}

function enhanceHomeTopics(article, pages) {
  const knowledgeTracing = pages.find((page) => page.title === "The Problem: Knowledge Tracing");
  if (!knowledgeTracing) return article;
  const topicLinks = `<div class="topic-links" aria-label="Topics covered">
    <a href="https://en.wikipedia.org/wiki/Educational_data_mining" target="_blank" rel="noopener noreferrer"><span>Educational data mining</span><span aria-hidden="true">↗</span></a>
    <a href="${knowledgeTracing.output}"><span>Knowledge tracing</span><span aria-hidden="true">→</span></a>
    <a href="https://www.puppygraph.com/blog/dynamic-graph" target="_blank" rel="noopener noreferrer"><span>Dynamic graphs</span><span aria-hidden="true">↗</span></a>
  </div>`;
  return article.replace(/(<p[^>]*><strong>Topics covered<\/strong><\/p>)/i, `$1${topicLinks}`);
}

function enhanceReferences(article) {
  const referenceLinks = [
    ["3cdb16cc-09dd-8046-b8f3-e278da3ddb0d", "https://arxiv.org/abs/2201.06953", "Knowledge Tracing: a survey"],
    ["3cdb16cc-09dd-804e-8b9d-e3229dca5575", "https://learninganalytics.upenn.edu/MOOT/bigdataeducation.html", "Big Data and Education"],
    ["3cdb16cc-09dd-80df-a9f0-f2ca34249524", "https://arxiv.org/abs/1506.05908", "Deep Knowledge Tracing"],
    ["3cdb16cc-09dd-809d-bc63-f70ca694693d", "https://arxiv.org/abs/2407.20824", "DyGKT"],
    ["3cdb16cc-09dd-80e8-9284-c7967be99c18", "https://arxiv.org/abs/2408.03772", "Relevance Meets Diversity"],
    ["473b16cc-09dd-83bb-a92f-8182f96f8cd5", "https://dl.acm.org/doi/10.1145/3488560.3498374", "Improving Knowledge Tracing with Collaborative Information"],
  ];

  let enhanced = article;
  for (const [id, url, title] of referenceLinks) {
    const pattern = new RegExp(`(<ol\\b[^>]*id="${id}"[\\s\\S]*?<\\/ol>)(<\\/div><\\/aside>)`, "i");
    const link = `<p class="reference-action"><a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(title)}">Open source <span aria-hidden="true">↗</span></a></p>`;
    enhanced = enhanced.replace(pattern, `$1${link}$2`);
  }
  return enhanced;
}

function pagerMarkup(pages, current) {
  const index = pages.indexOf(current);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  return `
    <nav class="chapter-pager" aria-label="Chapter navigation">
      ${previous ? `<a class="pager-link pager-previous" href="${previous.output}"><span>Previous</span><strong>← ${escapeHtml(previous.title)}</strong></a>` : "<span></span>"}
      ${next ? `<a class="pager-link pager-next" href="${next.output}"><span>Next</span><strong>${escapeHtml(next.title)} →</strong></a>` : "<span></span>"}
    </nav>`;
}

function renderPage(page, pages, article) {
  const index = pages.indexOf(page);
  const description = "A Context-Aware Extension of Dynamic Graph-based Knowledge Tracing.";
  const socialTitle = page === pages[0] ? page.title : `${page.title} · Summer Internship Report`;
  const pageUrl = siteUrl ? `${siteUrl}/${page.output}` : page.output;
  const socialImage = siteUrl ? `${siteUrl}/assets/social-card.jpg` : "assets/social-card.jpg";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(page.title)} — ${description}">
  <meta name="theme-color" content="#f4f1ea">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(socialTitle)}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(socialImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Summer Internship Report at KTH Royal Institute of Technology">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(socialTitle)}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${escapeHtml(socialImage)}">
  <title>${escapeHtml(page === pages[0] ? page.title : `${page.title} · Summer Internship Report`)}</title>
  <link rel="icon" type="image/png" href="assets/notion/Summer%20Internship%20Report/KTH_Logotyp_RGB_2013.png">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex-swap.min.css">
  <link rel="stylesheet" href="assets/theme.css">
  <script src="assets/site.js" defer></script>
</head>
<body data-page-index="${index}">
  <a class="skip-link" href="#report-content">Skip to report content</a>
  <div class="reading-progress" aria-hidden="true"><span></span></div>
  <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-sidebar">
    <span class="menu-icon" aria-hidden="true"></span>
    <span>Contents</span>
  </button>
  <button class="sidebar-scrim" type="button" aria-label="Close navigation" tabindex="-1"></button>
  ${sidebarMarkup(pages, page)}
  <main class="site-main" id="report-content">
    <div class="topline">
      <a href="index.html">Summer Internship Report</a>
      <a class="references-link" href="references.html">References</a>
    </div>
    <div class="paper">
      ${article}
      ${pagerMarkup(pages, page)}
    </div>
    <footer class="site-footer"><a href="#report-content">Back to top ↑</a></footer>
  </main>
</body>
</html>`;
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, "assets", "notion"), { recursive: true });

const allFiles = await walk(projectRoot);
const htmlFiles = allFiles.filter((file) => file.endsWith(".html"));
if (!htmlFiles.length) throw new Error("No Notion HTML files were found.");

const sourcePages = [];
for (const source of htmlFiles) {
  const html = await readFile(source, "utf8");
  const title = getTitle(html, source);
  sourcePages.push({
    source: normalise(source),
    html,
    article: getArticle(html, source),
    title,
    icon: getIcon(html, title),
    depth: path.relative(projectRoot, source).split(path.sep).length,
  });
}

const rootPage = [...sourcePages].sort((a, b) => a.depth - b.depth || a.title.localeCompare(b.title))[0];
const usedSlugs = new Set();
for (const page of sourcePages) {
  let slug = page === rootPage ? "index" : slugify(page.title);
  let suffix = 2;
  while (usedSlugs.has(slug)) slug = `${slugify(page.title)}-${suffix++}`;
  usedSlugs.add(slug);
  page.output = `${slug}.html`;
}

const bySource = new Map(sourcePages.map((page) => [page.source, page]));
const ordered = [];
const queue = [rootPage];
while (queue.length) {
  const page = queue.shift();
  if (ordered.includes(page)) continue;
  ordered.push(page);
  queue.push(...pageLinks(page.article, page.source, bySource));
}
ordered.push(...sourcePages.filter((page) => !ordered.includes(page)).sort((a, b) => a.title.localeCompare(b.title)));

const assets = new Set();
for (const page of ordered) {
  let rewritten = enhanceInteractiveContent(rewriteUrls(page.article, page, bySource, assets));
  if (page === rootPage) rewritten = enhanceHomeTopics(rewritten, ordered);
  if (page.title === "References") rewritten = enhanceReferences(rewritten);
  await writeFile(path.join(outputRoot, page.output), renderPage(page, ordered, rewritten));
}

for (const asset of assets) {
  const relative = path.relative(projectRoot, asset);
  const destination = path.join(outputRoot, "assets", "notion", relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(asset, destination);
}

// HEIC is not consistently supported by browsers. Keep the export untouched and
// create a web-safe derivative only inside the generated site. Quick Look handles
// modern iPhone HEIC/HDR files more reliably than a direct sips conversion.
for (const asset of assets) {
  if (path.extname(asset).toLowerCase() !== ".heic") continue;
  const relative = path.relative(projectRoot, asset);
  const sourceInDocs = path.join(outputRoot, "assets", "notion", relative);
  const jpegInDocs = sourceInDocs.replace(/\.heic$/i, ".jpg");
  const previewDirectory = await mkdtemp(path.join(tmpdir(), "notion-cover-"));
  try {
    execFileSync("qlmanage", ["-t", "-s", "1800", "-o", previewDirectory, sourceInDocs], { stdio: "ignore" });
    const preview = path.join(previewDirectory, `${path.basename(sourceInDocs)}.png`);
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", preview, "--out", jpegInDocs], { stdio: "ignore" });
    if ((await stat(jpegInDocs)).size < 10_000) throw new Error("Generated cover is unexpectedly small");
    for (const page of ordered) {
      const outputPath = path.join(outputRoot, page.output);
      const html = await readFile(outputPath, "utf8");
      await writeFile(outputPath, html.replaceAll(encodePath(relative), encodePath(relative.replace(/\.heic$/i, ".jpg"))));
    }
    await rm(sourceInDocs, { force: true });
  } catch {
    await rm(jpegInDocs, { force: true });
    console.warn(`Could not convert ${relative}; the original HEIC asset was retained.`);
  } finally {
    await rm(previewDirectory, { recursive: true, force: true });
  }
}

async function createSocialCard() {
  const assetRoot = path.join(outputRoot, "assets", "notion", "Summer Internship Report");
  const coverPath = path.join(assetRoot, "IMG_2625.jpg");
  const logoPath = path.join(assetRoot, "KTH_Logotyp_RGB_2013.png");
  const [cover, logo] = await Promise.all([readFile(coverPath), readFile(logoPath)]);
  const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <clipPath id="card"><rect x="20" y="20" width="1160" height="590" rx="48"/></clipPath>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#f3f1ec"/>
  <g clip-path="url(#card)">
    <rect x="20" y="20" width="1160" height="590" fill="#fff"/>
    <image href="data:image/jpeg;base64,${cover.toString("base64")}" x="20" y="20" width="1160" height="280" preserveAspectRatio="xMidYMid slice"/>
    <rect x="20" y="190" width="1160" height="110" fill="url(#shade)"/>
  </g>
  <rect x="902" y="54" width="218" height="50" rx="25" fill="#fff" fill-opacity=".93"/>
  <text x="1011" y="86" text-anchor="middle" fill="#171817" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" letter-spacing="1.2">RESEARCH REPORT</text>
  <rect x="60" y="218" width="164" height="164" rx="34" fill="#fff"/>
  <clipPath id="logo"><rect x="72" y="230" width="140" height="140" rx="24"/></clipPath>
  <image href="data:image/png;base64,${logo.toString("base64")}" x="72" y="230" width="140" height="140" clip-path="url(#logo)"/>
  <text x="68" y="448" fill="#171817" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" letter-spacing="-2.2">Summer Internship Report</text>
  <rect x="70" y="472" width="62" height="10" rx="5" fill="#fff2c9"/>
  <text x="68" y="529" fill="#23455e" font-family="Arial, Helvetica, sans-serif" font-size="29" font-weight="600" letter-spacing="-.6">A Context-Aware Extension of Dynamic Graph-based</text>
  <text x="68" y="566" fill="#23455e" font-family="Arial, Helvetica, sans-serif" font-size="29" font-weight="600" letter-spacing="-.6">Knowledge Tracing</text>
  <text x="1130" y="579" text-anchor="end" fill="#696b68" font-family="Arial, Helvetica, sans-serif" font-size="18">Riccardo Alfonso Cerrone</text>
</svg>`;

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "report-social-card-"));
  const svgPath = path.join(temporaryDirectory, "social-card.svg");
  const previewPath = `${svgPath}.png`;
  const destination = path.join(outputRoot, "assets", "social-card.jpg");
  try {
    await writeFile(svgPath, cardSvg);
    try {
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", svgPath, "--out", destination], { stdio: "ignore" });
      const dimensions = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", destination], { encoding: "utf8" });
      if (!dimensions.includes("pixelWidth: 1200") || !dimensions.includes("pixelHeight: 630")) throw new Error("Incorrect direct-render dimensions");
    } catch {
      execFileSync("qlmanage", ["-t", "-s", "1200", "-o", temporaryDirectory, svgPath], { stdio: "ignore" });
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", previewPath, "--out", destination], { stdio: "ignore" });
      execFileSync("sips", ["--cropToHeightWidth", "630", "1200", "--cropOffset", "0", "0", destination], { stdio: "ignore" });
    }
    if ((await stat(destination)).size < 20_000) throw new Error("Generated social card is unexpectedly small");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await createSocialCard();

await cp(path.join(themeRoot, "theme.css"), path.join(outputRoot, "assets", "theme.css"));
await cp(path.join(themeRoot, "site.js"), path.join(outputRoot, "assets", "site.js"));
await writeFile(path.join(outputRoot, ".nojekyll"), "");
await writeFile(path.join(outputRoot, "404.html"), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./index.html"><title>Page not found</title><a href="./index.html">Return to the report</a>`);

console.log(`Built ${ordered.length} pages and copied ${assets.size} source assets to docs/.`);
