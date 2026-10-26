# Toolsiano

## Optional project support links

Edit `src/data/support.json`: `links.russia` and `links.international` accept full HTTPS payment-page URLs. Empty URLs keep the corresponding option disabled; `enabled: false` hides all support entry points. All dialog copy and button labels live in `text`, with `ru` and `en` translations in the same file. Provider descriptions should name the selected payment service; only list payment methods it actually accepts. No payment widgets, click tracking or test payment URLs are included. The web footer and About page open the dialog; the desktop sidebar also includes a heart button. External payment links open in a new browser tab (web) or the system browser (desktop). Rebuild the website and desktop installers after changes. See the support configuration section in `README.ru.md` for field-by-field instructions.

Private tools for images, PDFs, passwords and QR codes. Russian and English. Static Astro + TypeScript; processing happens in the browser. No accounts, analytics, view counters, external CDNs or file-upload backend. The `old/` website is not part of this project.

## Run locally

Node.js 24 LTS and npm. Docker is optional for development.

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://127.0.0.1:4321. The development command builds both locales, starts a server with production CSP and watches `src/` and `public/`. Refresh after a successful rebuild. If a build fails, fix the reported error and save again. The server is a local QA utility, not the production host.

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

`preview` serves the existing `dist/`. Browser tests start the QA server automatically if it is not already running. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a locally installed Chromium for testing; normally leave it unset.

## Tools

- Image editor: batch JPG/PNG/WebP and static AVIF/SVG input; JPEG, PNG, WebP, AVIF and SVG output. AVIF uses the pinned @jsquash/avif 2.1.1 single-thread libavif encoder in a dedicated worker; all WASM is self-hosted and included offline. Export caps are 4 MP, or 2 MP on narrow screens/x86, with a 60-second timeout and cancellation; workers are terminated after every image to release codec memory. SVG output embeds a freshly encoded PNG, preserves raster detail and transparency, and is explicitly labeled as not vectorization. SVG output is capped at 25 MiB. SVG input supports only static allowlisted markup (2 MiB excluding embedded PNG data, 25 MiB total, 5,000 nodes/depth 64); embedded PNG dimensions and aggregate pixels are bounded before decoding. Scripts, external resources, animation, filters and use remain blocked. All editor operations, backgrounds and watermarks work before export. Extra codec notices in src/licenses/avif are appended to dependency licenses. CSP permits WebAssembly compilation via wasm-unsafe-eval, without permitting JavaScript unsafe-eval. Other tools and logo inputs retain JPG/PNG/WebP scope.
- Images to PDF: A4 or image-sized pages, margins, ordering. Photographs are JPEG-encoded rather than expanded to PNG; PNG transparency is retained.
- PDF pages: merge, reorder, rotate, remove, page ranges and separate-page ZIP. Thumbnails are generated as tiles enter the viewport.
- Compression: images, target JPEG size (at most 7 quality-search attempts), PDF structure optimization, explicit lossy PDF rasterization, ZIP bundling. Target size and size reduction are not guaranteed.
- Metadata: inspect EXIF. JPEG/PNG are stripped without re-encoding when orientation permits. JPEG APP/COM data, including ICC profiles, is removed. Rotated JPEG/WebP inputs are re-encoded. Check colors, orientation and the result. APNG is rejected.
- Passwords: Web Crypto only; no insecure fallback. Uniform sampling with rejection to enforce selected character groups.
- QR generator: text, URL, Wi-Fi, vCard; PNG and SVG.
- QR reader: one QR from an image, decoded as text; never opens the link automatically. No camera access.
- PDF export: selected pages to JPG/PNG/ZIP, or existing text layer to TXT. No OCR.
- Scan cleanup: manual trim, small-angle straightening, contrast, brightness, grayscale; JPEG output. No automatic perspective correction.
- PDF watermark: text (including Cyrillic), image/logo, date, page numbers, selected ranges and first-selected-page preview. Nine positions, proportional width, opacity, margin, rotation and tiling are shared with the image editor. Logos are PNG/JPEG/WebP, at most 5 MB and 2 megapixels, stored in tab memory only. A PDF reuses the embedded logo across pages and preserves its original text and vector content. Not a digital signature, copy protection or redaction.

Pomodoro, accent conversion, SEO analysis, notes and lottery calculations have been removed. Their routes return HTTP 410. OCR and HEIC remain deferred pending device-performance testing.

## Language and domains

Both languages are built into every deployment:

```text
https://toolsiano.com/       → /en/
https://toolsiano.ru/        → /ru/
https://toolsiano.com/pdf/   → /en/pdf/
https://toolsiano.ru/pdf/    → /ru/pdf/
```

Explicit `/en/` and `/ru/` paths win over the domain default. The language switch stays on the current tool and does not transfer inputs or files. No IP geolocation, language cookie, visitor ID or cross-domain state is used. Localhost defaults to Russian. A small script supplies equivalent routing on static hosts without redirects; Caddy and the QA server perform redirects on the server.

The preferred canonical for English is `https://toolsiano.com/en/...`, and for Russian `https://toolsiano.ru/ru/...`. Reciprocal `hreflang` links are generated. Each domain serves its corresponding sitemap and robots file. If using different domain names, set `PUBLIC_EN_ORIGIN` and `PUBLIC_RU_ORIGIN` during build. These are public configuration, not secrets. Update the domain routing in Caddy if changing the `.com`/`.ru` scheme.

`src/` contains Russian authoring templates and explicit `t()` calls for client messages. `src/i18n/en.json` contains reviewed English translations. `scripts/localize.mjs` creates real localized HTML at build time and fails if untranslated Cyrillic remains in source UI text. There is no runtime translation service. New client messages should use `t()` and have corresponding dictionary entries and tests.

## Resource limits and privacy

25 MiB/file, 30 files and 100 MiB total input per task. Up to 12 megapixels/50 PDF pages on narrow screens; 24 megapixels/100 pages on other screens. Screen width is only a conservative hint, not a measurement of available memory. PNG/JPEG/WebP dimensions are inspected before decoding when the header can be read. Browser decoding still carries memory risks; test with real target devices.

Processing is sequential, pica uses a limited worker pool, PDFs use a local PDF.js worker, and thumbnails are lazy. PDF manipulation and encoding still require memory and may occupy the main thread. Cancellation takes effect at processing boundaries; closing the tab stops the task. Results are capped at 100 MiB and kept only in memory. Clear results or close the tab when finished. ZIP uses STORE to avoid repeatedly compressing JPEG/PDF output and still needs memory for the final archive. No performance guarantee is made for low-memory devices.

The server receives normal HTTP requests and an IP address, but the supplied Caddyfile does not enable access logging. Review upstream proxy/provider policies separately. Zero-Knowledge refers to local-processing architecture, not a cryptographic proof. Extensions, malware, the system clipboard and downloaded files are outside the app's control. Removing metadata does not hide visible information in pixels. Signed/protected PDFs are rejected for editing; copying pages can lose forms/bookmarks. Rasterization loses text, links and vector content.

The web version saves only the theme preference in localStorage. The desktop app also saves the interface language. The offline button caches the app's pages and libraries, never user files. No download/installation counter or offline telemetry is implemented. Downloading app resources is not proof of a PWA installation. Clear site data to remove settings/cache. The source ZIP and license notices are not pre-cached; they remain separate downloads.

## Desktop download pages and owner statistics

`/ru/download/` and `/en/download/` are static localized pages, linked in navigation and the footer. They highlight the visitor's desktop OS locally without storing or transmitting it; all platforms remain visible. Mobile devices are not treated as desktop. Pages use the normal canonical, hreflang, sitemap and offline cache pipeline.

A Tauri desktop implementation is included in src-tauri/. No desktop binary or GitHub repository has been published yet. The checked-in `src/data/desktop-releases.json` intentionally contains no releases, and the page clearly says builds are not available. The browser offline copy remains a separate feature. See src-tauri/README.md for native builds, permissions and release requirements.

After publishing actual stable installers in a **public** GitHub repository, run:

```sh
npm run desktop:sync -- --repo OWNER/REPOSITORY
npm run build
```

The sync command imports published stable releases and installer metadata. Drafts, prereleases, update archives, signatures and source ZIPs are excluded. Supported installer extensions are `.exe`, `.msi`, `.dmg`, `.AppImage`, `.deb`; names must include `x86`/`i686`/`ia32`, `x64`/`x86_64`/`amd64`, `arm64`/`aarch64`, or `universal`. Every installer must have a GitHub `sha256:` digest. Invalid metadata fails before replacing the catalog. Do not disable these checks to publish an unverified link. OS builds/signatures and release requirements must be checked before release. Put installation requirements and release notes in the GitHub release description. Direct asset links, file sizes, SHA-256 sums, repository and release history render at build time; visitors never call GitHub API. Commit the updated catalog when ready. A later sync and rebuild refresh the site; no background polling is installed.

For your statistics, run locally:

```sh
npm run downloads:stats -- --repo OWNER/REPOSITORY
```

Open `work/download-statistics/index.html`. The report shows version, platform, filename and cumulative installer download counts. Each run also saves an aggregate timestamped JSON snapshot with asset IDs. It contains no visitor records, makes no installation or uniqueness claims, and is excluded from the build, source ZIP, Docker context and Git. Repeated manual snapshots allow comparison over time; a change between snapshots is an observed increment, not an exact daily count. Replacing/deleting a GitHub asset can reset or remove its counter. Updates and repeat downloads can increase totals. No credentials or database are needed for public repositories; GitHub API rate limits apply. Public GitHub asset counts are inherently public even when your report stays local. No public counter, click tracking or app telemetry is added.

GitHub processes downloads under its own privacy statement. Hosting installers there reduces VPS traffic, but should not be described as eliminating all processing of network data. The website's privacy page explains the distinction.

## VPS deployment

Use a Linux VPS with Docker Engine and Compose. Point both domains' DNS A/AAAA records to the VPS. Open TCP 80/443 and optionally UDP 443. Copy **the contents of `new/`** to the repository root, never include `old/`, runtime logs or keys.

```sh
git clone <YOUR-REPOSITORY-URL> toolsiano
cd toolsiano
printf 'SITE_ADDRESS=toolsiano.com, toolsiano.ru\n' > .env
docker compose up -d --build
```

Caddy serves both names and obtains/renews public TLS certificates. The `caddy_data` and `caddy_config` volumes must persist. Docker builds with Node, then runs only Caddy and static files. The default `localhost` configuration uses local certificates; use the Node QA server for ordinary HTTP local testing rather than bypassing browser certificate warnings.

If another web server already occupies the ports, integrate `dist/` into that server or put this container behind the existing proxy. Preserve CSP, MIME types for `.mjs`, no-cache HTML/Service Worker, localized redirects, removed-tool 410 responses and language-specific error pages/sitemaps. Hashed `/_astro/` assets can be cached long-term. `SITE_ROOT` overrides `/srv` only for native Caddy QA; the container default is correct.

Update with `git pull` and `docker compose up -d --build`. Roll back by checking out a tested release tag and rebuilding. Nothing here publishes to GitHub or a VPS automatically. `.github/workflows/check.yml` runs type checks, unit/browser tests and builds an artifact. Add deployment credentials only in GitHub Secrets if automatic deployment is implemented later.

## Offline copy and browser checks

The footer's “Offline access” dialog shows local copy status and save date, and can save, update or delete it while retaining the theme. Resources are kept in Cache Storage for the current browser and origin, never as a Downloads file. A failed update preserves the previous working copy. Optional PWA installation through the browser is separate; raster app icons and localized manifests are provided.

GitHub Actions checks Chromium, Firefox and WebKit on Linux and builds/smoke-tests the Docker image without deploying it. Select a local engine with `PLAYWRIGHT_BROWSER=firefox` or `webkit` after `npx playwright install firefox webkit`. `PLAYWRIGHT_BASE_URL` selects a running QA server. WebKit automation does not prove behavior on a physical iPhone. Docker build origins are passed through Compose's `PUBLIC_EN_ORIGIN` and `PUBLIC_RU_ORIGIN` arguments. Native Canvas filters have a bounded-strip pixel fallback for WebKit versions that lack them.

## Source and licenses

Each build includes `toolsiano-source.zip`, dependency license notices and SHA-256 metadata in `build-info.json`. Dependencies are pinned by `package-lock.json`. `npm audit` is useful but is not an independent security audit. Application code is MIT-licensed; third-party license notices are included. The actual repository URL can be added to the libraries page after creating the repository.

Desktop UI: native-only collapsible navigation, optional settings/help disclosures and sticky primary actions. Windows x86 is a separate build with conservative memory limits; see src-tauri/README.md. Web layout is unchanged.
