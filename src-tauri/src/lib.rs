// 并行工作台 · Tauri 库入口（Tauri 2 推荐结构：lib.rs + main.rs）

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            crate::commands::load_data,
            crate::commands::save_data,
            crate::commands::open_path,
            crate::commands::backup_to
        ])
        .setup(|_app| {
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("并行工作台启动失败");

    app.run(|_app_handle, _event| {});
}

pub mod commands {
    use serde_json::Value;
    use std::fs;
    use std::path::PathBuf;
    use tauri::Manager;

    /// 数据文件路径：{app_data_dir}/workbench-data.json
    fn data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
        fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
        Ok(dir.join("workbench-data.json"))
    }

    /// 读取本地数据（启动时前端调用）
    #[tauri::command]
    pub fn load_data(app: tauri::AppHandle) -> Result<Option<Value>, String> {
        let path = data_path(&app)?;
        if !path.exists() {
            return Ok(None);
        }
        let text = fs::read_to_string(&path).map_err(|e| format!("读取数据失败: {e}"))?;
        serde_json::from_str(&text)
            .map(Some)
            .map_err(|e| format!("数据解析失败: {e}"))
    }

    /// 保存本地数据（每次操作后前端调用）
    #[tauri::command]
    pub fn save_data(app: tauri::AppHandle, json: Value) -> Result<(), String> {
        let path = data_path(&app)?;
        let text =
            serde_json::to_string_pretty(&json).map_err(|e| format!("序列化失败: {e}"))?;
        fs::write(&path, text).map_err(|e| format!("写入数据失败: {e}"))
    }

    /// 打开本地目录/文件（F16 快速恢复指引）
    #[tauri::command]
    pub fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
        use tauri_plugin_shell::ShellExt;
        if path.is_empty() {
            return Err("路径为空".into());
        }
        let expanded = if path.starts_with("~/") || path.starts_with("~\\") {
            let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
            format!("{home}{}", &path[1..])
        } else {
            path.clone()
        };
        app.shell()
            .open(&expanded, None)
            .map_err(|e| format!("打开失败: {e}"))
    }

    /// 备份到指定目录（F19 增强：备份文件可还原）
    #[tauri::command]
    pub fn backup_to(dir: String, json: Value) -> Result<String, String> {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
        let path = PathBuf::from(&dir).join(format!("workbench-backup-{stamp}.json"));
        let text = serde_json::to_string_pretty(&json).map_err(|e| format!("序列化失败: {e}"))?;
        fs::write(&path, text).map_err(|e| format!("写入备份失败: {e}"))?;
        Ok(path.to_string_lossy().into_owned())
    }
}
