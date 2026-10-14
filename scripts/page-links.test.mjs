import assert from "node:assert/strict";
import test from "node:test";
import { pageLinks, splitLocalHref } from "./page-links.mjs";

test("discovers nested pages with encoded paths, query strings, and fragments", () => {
  const source = "/export/Report.html";
  const child = { title: "Child page" };
  const grandchild = { title: "Grandchild" };
  const bySource = new Map([
    ["/export/Report/Child page.html", child],
    ["/export/Report/Nested/Grandchild.html", grandchild],
  ]);
  const article = `
    <a href="Report/Child%20page.html?view=1#section">Child</a>
    <a href='Report/Nested/Grandchild.html#part'>Grandchild</a>
    <a href="https://example.com/page.html">External</a>
    <a href="#section">Same page</a>`;

  assert.deepEqual(pageLinks(article, source, bySource), [child, grandchild]);
});

test("resolves local links without requiring an HTML suffix", () => {
  const child = { title: "Child page" };
  const bySource = new Map([["/export/Report/Child", child]]);

  assert.deepEqual(pageLinks('<a href="Report/Child?view=compact">Child</a>', "/export/Report.html", bySource), [child]);
});

test("preserves query strings and fragments while identifying the local path", () => {
  assert.deepEqual(splitLocalHref("Report/Child.html?view=1#section"), {
    pathname: "Report/Child.html",
    suffix: "?view=1#section",
  });
  assert.equal(splitLocalHref("https://example.com/Child.html"), null);
});
