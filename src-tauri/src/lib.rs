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
            crate::commands::backup_to,
            crate::commands::scan_workbench_files
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

    /// 扫描工作空间根目录，查找含 workbench.json 对接文档的子目录（WorkBuddy 集成）
    /// 入参：{ dir: String }；返回：{ projects: [ { name, path, tech_stack, desc, status, tasks_count, doc } ] }
    #[tauri::command]
    pub fn scan_workbench_files(dir: String) -> Result<Value, String> {
        use serde_json::json;
        let root = PathBuf::from(&dir);
        if !root.is_dir() {
            return Err(format!("目录不存在: {dir}"));
        }
        let mut projects = Vec::new();
        let entries = fs::read_dir(&root).map_err(|e| format!("读取目录失败: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }
            let doc_path = p.join("workbench.json");
            if !doc_path.is_file() {
                continue;
            }
            let text = fs::read_to_string(&doc_path).unwrap_or_default();
            let doc: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
            let proj = doc.get("project");
            let tasks = doc.get("tasks");
            let tasks_count = tasks
                .and_then(|t| t.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            projects.push(json!({
                "name": proj.and_then(|x| x.get("name")).and_then(|x| x.as_str()).unwrap_or(name).to_string(),
                "path": p.to_string_lossy().into_owned(),
                "tech_stack": proj.and_then(|x| x.get("tech_stack")).and_then(|x| x.as_str()).unwrap_or("").to_string(),
                "desc": proj.and_then(|x| x.get("description")).and_then(|x| x.as_str()).unwrap_or("").to_string(),
                "status": proj.and_then(|x| x.get("status")).and_then(|x| x.as_str()).unwrap_or("active").to_string(),
                "repo_url": proj.and_then(|x| x.get("repo_url")).and_then(|x| x.as_str()).unwrap_or("").to_string(),
                "tasks_count": tasks_count,
                "doc": doc
            }));
        }
        projects.sort_by(|a, b| {
            a.get("name").and_then(|x| x.as_str()).unwrap_or("")
                .cmp(b.get("name").and_then(|x| x.as_str()).unwrap_or(""))
        });
        Ok(json!({ "projects": projects }))
    }
}
