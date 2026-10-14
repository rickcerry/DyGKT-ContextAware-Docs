# Summer Internship Report website

This repository keeps the original Notion export at the project root and publishes a separate, generated website from `docs/`. The site is static, responsive, and requires no framework or runtime dependencies.

## Preview locally

```sh
python3 -m http.server 4173 --directory docs
```

Then open <http://localhost:4173>.

## Update from a newer Notion export

1. Keep the top-level export HTML file and its companion folder together at the project root.
2. Replace the old exported files with the new export.
3. Run `node scripts/build-site.mjs`.
4. Run `node scripts/check-site.mjs` and review `docs/`.
5. Commit the original export and the regenerated site.

The converter discovers exported HTML pages, follows their internal links to preserve page order, rewrites local links, copies media into `docs/assets/notion/`, and creates browser-safe cover imagery when macOS `sips` is available. The files in `site/` contain the reusable design and behavior.

When the final public URL is known, include it while rebuilding so LinkedIn and other social networks receive absolute Open Graph URLs:

```sh
SITE_URL=https://username.github.io/repository node scripts/build-site.mjs
```

The GitHub Pages workflow performs this URL preparation automatically. For a custom domain, define a repository variable named `SITE_URL` containing the full public origin.

## Publish on GitHub Pages

The included GitHub Actions workflow deploys `docs/` whenever `main` is updated. In the repository on GitHub, open **Settings → Pages** and choose **GitHub Actions** under **Build and deployment**. Push to `main`; the deployment URL will appear in the workflow summary.

Alternatively, disable the workflow and configure Pages to deploy directly from the `docs/` folder on the `main` branch.
