#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Read only our fixed installer preference; no filesystem command is exposed to the UI.
fn installer_language() -> Option<&'static str> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    let file = std::env::current_exe().ok()?.parent()?.join("toolsiano-language.txt");
    if std::fs::metadata(&file).ok()?.len() > 16 {
        return None;
    }
    match std::fs::read_to_string(file).ok()?.trim() {
        "ru" => Some("ru"),
        "en" => Some("en"),
        _ => None,
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let initialization = match installer_language() {
                Some("ru") => "Object.defineProperty(window,'__TOOLSIANO_INSTALLER_LANGUAGE__',{value:'ru'});",
                Some("en") => "Object.defineProperty(window,'__TOOLSIANO_INSTALLER_LANGUAGE__',{value:'en'});",
                _ => "",
            };
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .initialization_script(initialization)
                .on_navigation(|url| {
                    url.port().is_none() && url.username().is_empty() && url.password().is_none() &&
                    ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (matches!(url.scheme(), "http" | "https")
                            && url.host_str() == Some("tauri.localhost")))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Could not start Toolsiano");
}
