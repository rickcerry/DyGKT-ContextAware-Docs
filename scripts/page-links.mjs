import path from "node:path";

export function splitLocalHref(value) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;

  const suffixStart = value.search(/[?#]/);
  const pathname = suffixStart < 0 ? value : value.slice(0, suffixStart);
  if (!pathname) return null;

  return {
    pathname,
    suffix: suffixStart < 0 ? "" : value.slice(suffixStart),
  };
}

export function resolveLocalTarget(source, rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    decoded = rawPath;
  }
  return path.resolve(path.dirname(source), decoded);
}

export function pageLinks(article, source, bySource) {
  const links = [];
  for (const match of article.matchAll(/\bhref=(["'])(.*?)\1/gi)) {
    const localHref = splitLocalHref(match[2]);
    if (!localHref) continue;
    const target = bySource.get(resolveLocalTarget(source, localHref.pathname));
    if (target && !links.includes(target)) links.push(target);
  }
  return links;
}
