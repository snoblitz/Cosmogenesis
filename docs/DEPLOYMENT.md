# Deployment

Cosmogenesis is a fully static site with zero build step. Anywhere you can serve a folder of files over HTTP, it runs.

This doc covers GitHub Pages (current production), plus notes for any other static host.

---

## GitHub Pages (current production)

### One-time setup

1. Go to **Settings → Pages** on the repo: https://github.com/snoblitz/Cosmogenesis/settings/pages
2. Under **Build and deployment**:
   - **Source:** *Deploy from a branch*
   - **Branch:** `main`
   - **Folder:** `/ (root)`
3. Click **Save**

GitHub provisions the site within a minute or two. The URL is:

> **https://snoblitz.github.io/Cosmogenesis/**

The same URL is also linked from the repo's About sidebar (top-right of the repo home), which you can edit via the gear icon next to "About".

### How it deploys

- Every push to `main` triggers a Pages build automatically (look for the **github-pages** environment under Actions).
- The build takes ~30-60 seconds. Hard-refresh after to pick up the new asset versions.
- `.nojekyll` in the repo root tells Pages to skip Jekyll preprocessing (we don't want anything starting with `_` filtered out, and we have no template logic).

### Cache behavior

GitHub Pages serves assets with `Cache-Control: max-age=600` (10 minutes) by default. Players who load the page right after a deploy may see the previous version for up to 10 minutes. For a meditative game this is acceptable.

If we ever need cache-busting for a critical fix, options:
- Add a `?v=0.x.y` query string to the script + stylesheet `<link>`/`<script>` tags in `index.html` (the ES module imports inside `src/*.js` are harder because they're written without query strings)
- Bump the import paths themselves (rename `src/main.js` → `src/main.v2.js`)
- Wait 10 minutes

### Custom domain (not configured)

If we ever want `cosmogenesis.snoblitz.io` or similar:

1. Add a `CNAME` file at the repo root containing the domain (e.g. `cosmogenesis.snoblitz.io\n`)
2. Configure the DNS provider with a CNAME record pointing the subdomain at `snoblitz.github.io`
3. Wait for DNS to propagate
4. In **Settings → Pages**, enter the domain and tick "Enforce HTTPS"

---

## Local dev server

```bash
node server.js
```

Serves on http://localhost:8001 with `Cache-Control: no-cache` so file changes show on refresh. The server is ~50 lines and intentionally minimal. Not used in production.

---

## Any other static host

Cosmogenesis is just HTML + CSS + JS modules + one SVG. Any of these work without modification:

- Netlify (`netlify deploy --dir=.`)
- Vercel (`vercel`)
- Cloudflare Pages (point at the repo)
- AWS S3 + CloudFront
- A USB stick served from `python -m http.server`

Requirements:
- Serve `.js` files with `Content-Type: application/javascript` (or `text/javascript`) — required for ES module imports
- Serve `.svg` files with `Content-Type: image/svg+xml` — for the favicon

Most static hosts handle these correctly out of the box.

---

## What's NOT needed

- No backend
- No database
- No environment variables
- No secrets
- No build pipeline
- No CDN configuration
- No SSL setup (the host provides it)

This is the entire deployment story. Three steps, one checkbox, fully reproducible.