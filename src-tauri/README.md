# Toolsiano desktop

Tauri 2 application using the same eleven local tools and translations as the website. All pages, JavaScript, PDF workers, fonts and license notices are bundled. No remote website is embedded. No account, installation identifier, usage telemetry, background update check or file-upload backend is implemented.

## Build

Install Node 24, Rust stable and the [native prerequisites](https://v2.tauri.app/start/prerequisites/). Windows needs MSVC Build Tools and WebView2; macOS builds need Xcode tools; Linux needs WebKitGTK 4.1 development packages. Rust/Cargo dependencies are pinned in `Cargo.lock`; npm dependencies are pinned in the root lockfile.

From the repository root (the contents of `new/`):

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run desktop:build -- --bundles nsis -- --locked
node scripts/package-desktop.mjs --architecture x64
```

The Windows command produces a current-user NSIS installer with English/Russian installer UI and the offline WebView2 installer. Including the runtime makes the installer substantially larger; installation can work offline. It does not require Docker or a running VPS. The standalone executable requires a system WebView2 runtime; prefer the installer for distribution.

Use `--bundles dmg --target universal-apple-darwin` on macOS after installing both `x86_64-apple-darwin` and `aarch64-apple-darwin` Rust targets. Use `--bundles deb,appimage` on a compatible Linux builder. The manual `Build desktop packages` GitHub workflow builds all three platforms, uploads artifacts and does not publish a release. Successful CI compilation does not replace real-device tests. Current intended platforms: Windows 10/11 x64, macOS 11+ Intel/Apple Silicon, Linux x64 with the relevant WebKitGTK 4.1 system dependencies. AppImage does not guarantee compatibility with every Linux distribution.

`npm run desktop:dev` runs the bundled frontend in a development window; rebuild/restart after frontend changes. `npm run desktop:frontend` generates `work/desktop-dist`. On this development machine, a workspace-local Rust installation can live in `work/cargo` and `work/rustup`; the wrapper discovers it without changing the system PATH. Native dependency notices are generated from the platform's Cargo metadata and included in the application. `build-info.json` hashes the transformed desktop files, not the website originals.

## Behavior and permissions

The native interface has a collapsible navigation rail, a sticky primary action, collapsed optional image/QR/watermark settings, and collapsible help. Changed optional settings receive a visible badge. Layout adapts to the available workspace width, including expanded navigation on small windows. Navigation layout is stored in sessionStorage for the current app session only; theme and language remain in localStorage.

Windows x86 is built separately with `npm run desktop:build -- --target i686-pc-windows-msvc --bundles nsis -- --locked` after `rustup target add i686-pc-windows-msvc`. Package it with `node scripts/package-desktop.mjs --architecture x86`. Its application binary must have PE machine type `0x014c`; x64 uses `0x8664`. The NSIS installer itself is a 32-bit launcher for both architectures, so inspecting only the installer does not establish the app's architecture. x86 limits are 15 files/50 MiB total input, 25 MiB per file, 12 megapixels, 50 PDF pages and 50 MiB total results. These are conservative limits, not a guarantee against running out of memory. A 32-bit build does not add support for obsolete Windows versions.

- Language priority is the saved app choice, then the initial Windows installer language, then the WebView system language (Russian for `ru`, English otherwise). NSIS writes `toolsiano-language.txt` next to the executable; native code reads only this fixed file and passes a validated `ru`/`en` value to the local UI before it loads. The resolved language is saved on first launch, so updates do not reset it. macOS/Linux use the system fallback. Switching a tool's language discards unsaved input, as in the web version.
- Theme choices are System default, Light and Dark. System default follows OS changes while the app is open; an explicit selection overrides them and persists. No clock, geolocation or network lookup is used.
- Theme and language preferences are persisted. Navigation layout is stored for the current session only. Inputs/results stay in page memory. Closing or changing pages releases them; saved output files remain on disk.
- Inputs use HTML's native file picker and browser drag-and-drop. Native drag interception is disabled so the existing dropzones work.
- Outputs use the native save dialog. Only `dialog:allow-save` and scoped `fs:allow-write-file` are granted. The selected path is added to a temporary filesystem scope; there is no general read, shell, arbitrary network or persisted filesystem scope. Selected paths remain permitted for the running process and are cleared at exit.
- Local result limits remain 100 MiB. Native save errors are visible; cancelling does not discard the result. No silent download fallback writes to an unexpected directory.
- HTTPS links and the support email open via the OS. Remote pages cannot navigate inside the app or use its native bridge. CSP permits local resources, local blob URLs and Tauri IPC only.
- The offline-cache/download UI is removed from the native package. The app itself needs no service worker or local HTTP server. The OS WebView runtime and operating system have their own update/network behavior, outside the app's telemetry policy.

## Release checklist

The initial local Windows build is an unsigned test build. Before a public release, sign the Windows installer, sign/notarize macOS packages, test on target systems, and review the generated packages and license notices. Do not instruct users to disable OS protections. Signing credentials belong in CI secrets, never the repository. Signing certificates and Apple account credentials are provided by the owner.

`package-desktop.mjs` copies installers to `work/desktop-packages`, renames them to the website's platform/architecture convention, writes SHA-256 files and includes the source ZIP. Use a clean build target/output when packaging a new version. Publish stable installers manually in GitHub Releases, then run `npm run desktop:sync -- --repo OWNER/REPOSITORY` and rebuild the website. Download statistics remain distribution-side only. Updating is manual: download and run a newer installer. The package is not advertised as publicly available until real release URLs exist.
