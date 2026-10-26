# Localized installer license

The same `licenses.nsh` hook also writes the initial installer language (`ru`/`en`) to `toolsiano-language.txt` in the application directory. Existing files are retained during installation; uninstall removes the file. The app's saved language preference has priority over this initial setting. No extra frontend filesystem permission is granted.

`template.nsi` is the stock Tauri NSIS template from the pinned CLI 2.12.4:
https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi

It is used under its MIT license; the upstream notice is retained in `UPSTREAM-LICENSE-MIT`.
The only functional changes replace the license-page argument with `$(ToolsianoLicense)` and invoke `TOOLSIANO_LICENSE_LANGUAGES` after the MUI languages are registered.

`licenses.nsh` registers the English license from the root `LICENSE` and the Russian translation from `LICENSE.ru.txt`. NSIS selects the text using the installer's selected language, including when navigating back. The original English MIT text remains authoritative and is included in the source archive. Third-party notices are not renamed or translated.

When upgrading the pinned Tauri CLI, review changes to the upstream NSIS template and reapply these two changes. Keep its license notice. Do not edit generated files in `target/`.
