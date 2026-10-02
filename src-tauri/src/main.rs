#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod images;
mod storage;
use std::sync::Mutex;
use storage::{Settings, Storage};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
struct State(Mutex<Result<Storage, String>>);
#[tauri::command]
async fn import_image(bytes: Vec<u8>, app: tauri::AppHandle) -> Result<images::Attachment, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || images::import(&dir, &bytes))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn paste_image(app: tauri::AppHandle) -> Result<images::Attachment, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let image = app.clipboard().read_image().map_err(|_| {
            "剪贴板中没有可读取的图片，请复制图片内容，或使用本地图片按钮选择文件".to_string()
        })?;
        images::import_rgba(&dir, image.width(), image.height(), image.rgba())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn read_data(state: tauri::State<State>) -> Result<serde_json::Value, String> {
    let lock = state.0.lock().map_err(|e| e.to_string())?;
    let s = lock.as_ref().map_err(Clone::clone)?;
    Ok(serde_json::json!({"data":s.data,"warning":s.warning}))
}
#[tauri::command]
fn save_content(content: serde_json::Value, state: tauri::State<State>) -> Result<(), String> {
    let mut lock = state.0.lock().map_err(|e| e.to_string())?;
    let s = lock.as_mut().map_err(|e| e.clone())?;
    let mut next = s.data.clone();
    next.content = content;
    s.save(next)
}
#[tauri::command]
fn save_settings(
    settings: Settings,
    state: tauri::State<State>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    settings.validate()?;
    let mut lock = state.0.lock().map_err(|e| e.to_string())?;
    let s = lock.as_mut().map_err(|e| e.clone())?;
    let mut next = s.data.clone();
    next.settings = settings.clone();
    if let Some(w) = app.get_webview_window("main") {
        w.set_always_on_top(settings.always_on_top)
            .map_err(|e| e.to_string())?;
    }
    s.save(next)?;
    app.emit("settings-updated", settings)
        .map_err(|e| e.to_string())
}
fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}
#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    } else {
        tauri::WebviewWindowBuilder::new(
            &app,
            "settings",
            tauri::WebviewUrl::App("index.html?settings".into()),
        )
        .title("便签设置")
        .inner_size(480.0, 620.0)
        .min_inner_size(360.0, 480.0)
        .build()
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn finish_exit(app: tauri::AppHandle) {
    app.exit(0);
}
fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .register_uri_scheme_protocol("note-image", |context, request| {
            let result = context
                .app_handle()
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .and_then(|dir| images::read(&dir, request.uri().path().trim_start_matches('/')));
            match result {
                Ok(bytes) => tauri::http::Response::builder()
                    .header("Content-Type", "image/png")
                    .header("X-Content-Type-Options", "nosniff")
                    .body(bytes)
                    .unwrap(),
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap(),
            }
        })
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE,
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            read_data,
            import_image,
            paste_image,
            save_content,
            save_settings,
            open_settings,
            finish_exit
        ])
        .setup(|app| {
            let stored = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .and_then(Storage::load);
            if let (Ok(s), Some(w)) = (&stored, app.get_webview_window("main")) {
                w.set_always_on_top(s.data.settings.always_on_top)?;
                let pos = w.outer_position()?;
                let size = w.outer_size()?;
                let visible = w.available_monitors()?.iter().any(|m| {
                    let p = m.position();
                    let z = m.size();
                    pos.x < p.x + z.width as i32
                        && pos.y < p.y + z.height as i32
                        && pos.x + size.width as i32 > p.x
                        && pos.y + size.height as i32 > p.y
                });
                if !visible {
                    w.center()?;
                }
            }
            app.manage(State(Mutex::new(stored)));
            use tauri::menu::{Menu, MenuItem};
            let show_item = MenuItem::with_id(app, "show", "显示便签", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &settings, &quit])?;
            tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("bundled icon").clone())
                .tooltip("Nalomu Note")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show(app),
                    "settings" => {
                        let _ = open_settings(app.clone());
                    }
                    "quit" => {
                        show(app);
                        let _ = app.emit_to("main", "request-exit", ());
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("启动便签失败");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
            if code.is_none() {
                api.prevent_exit();
                show(app);
                let _ = app.emit_to("main", "request-exit", ());
            }
        }
    });
}
