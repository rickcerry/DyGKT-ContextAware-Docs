const body = document.body;
const sidebar = document.querySelector(".sidebar");
const menuToggle = document.querySelector(".menu-toggle");
const scrim = document.querySelector(".sidebar-scrim");
const progress = document.querySelector(".reading-progress span");
const outline = document.querySelector("#page-outline");
const article = document.querySelector("article");
const menuLabel = menuToggle?.querySelector("span:last-child");

const closeNavigation = () => {
  body.classList.remove("nav-open");
  menuToggle?.setAttribute("aria-expanded", "false");
  if (menuLabel) menuLabel.textContent = "Contents";
  scrim?.setAttribute("tabindex", "-1");
};

menuToggle?.addEventListener("click", () => {
  const isOpen = body.classList.toggle("nav-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  if (menuLabel) menuLabel.textContent = isOpen ? "Close" : "Contents";
  scrim?.setAttribute("tabindex", isOpen ? "0" : "-1");
  if (isOpen) sidebar?.querySelector("a")?.focus();
});
scrim?.addEventListener("click", closeNavigation);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeNavigation();
});
sidebar?.addEventListener("click", (event) => {
  if (event.target.closest("a") && window.innerWidth <= 960) closeNavigation();
});

const headings = [...(article?.querySelectorAll(".page-body h1, .page-body h2, .page-body h3") || [])];
const usedIds = new Set();
for (const heading of headings) {
  let id = heading.id || heading.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
  const base = id;
  let counter = 2;
  while (usedIds.has(id)) id = `${base}-${counter++}`;
  usedIds.add(id);
  heading.id = id;

  const link = document.createElement("a");
  link.className = "outline-link";
  link.href = `#${id}`;
  link.dataset.level = heading.tagName.slice(1);
  link.textContent = heading.textContent.trim();
  outline?.append(link);
}

if (!headings.length) document.querySelector(".outline-wrap")?.remove();

const outlineLinks = [...(outline?.querySelectorAll("a") || [])];
if ("IntersectionObserver" in window && headings.length) {
  const visible = new Map();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
    const active = headings.find((heading) => visible.get(heading.id)) || headings.filter((heading) => heading.getBoundingClientRect().top < 160).at(-1);
    outlineLinks.forEach((link) => link.classList.toggle("is-active", active && link.hash === `#${CSS.escape(active.id)}`));
  }, { rootMargin: "-10% 0px -76% 0px" });
  headings.forEach((heading) => observer.observe(heading));
}

const updateProgress = () => {
  if (!progress) return;
  const maximum = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = `${maximum > 0 ? Math.min(100, window.scrollY / maximum * 100) : 0}%`;
};
updateProgress();
window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", () => {
  updateProgress();
  if (window.innerWidth > 960) closeNavigation();
});
