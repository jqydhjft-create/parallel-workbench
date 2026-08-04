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
            crate::commands::scan_workbench_files,
            crate::commands::check_workbuddy_integration,
            crate::commands::install_workbuddy_integration
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

    /// 检查 WorkBuddy 集成状态：工作空间目录下是否已导入项目级技能
    /// 入参：{ dir: String }（工作空间根目录）
    #[tauri::command]
    pub fn check_workbuddy_integration(dir: String) -> Result<Value, String> {
        use serde_json::json;
        let skill_dir = project_skill_dir(&dir);
        let skill_installed = skill_dir.join("SKILL.md").is_file();
        Ok(json!({
            "skill_installed": skill_installed,
            "skill_path": skill_dir.to_string_lossy().into_owned(),
            "installed": skill_installed
        }))
    }

    /// 导入 WorkBuddy 集成技能到工作空间目录：<dir>/.workbuddy/skills/workbench-json-sync
    /// 入参：{ dir: String }（工作空间根目录）；只写项目级，不写全局、不写记忆
    #[tauri::command]
    pub fn install_workbuddy_integration(dir: String) -> Result<Value, String> {
        use serde_json::json;
        let skill_dir = project_skill_dir(&dir);
        fs::create_dir_all(&skill_dir).map_err(|e| format!("创建技能目录失败: {e}"))?;
        let skill_ok = write_embedded_skill(&skill_dir).map_err(|e| format!("写入技能失败: {e}"))?;
        Ok(json!({
            "skill_installed": skill_ok,
            "skill_path": skill_dir.to_string_lossy().into_owned(),
            "installed": skill_ok
        }))
    }

    /// 项目级技能目录：<dir>/.workbuddy/skills/workbench-json-sync
    fn project_skill_dir(dir: &str) -> PathBuf {
        PathBuf::from(dir).join(".workbuddy").join("skills").join("workbench-json-sync")
    }

    /// 内置技能内容（include_str! 编译期嵌入，开发/发布一致）
    pub(crate) fn write_embedded_skill(skill_dir: &PathBuf) -> std::io::Result<bool> {
        use std::io::Write;
        let refs = skill_dir.join("references");
        fs::create_dir_all(&refs)?;
        let mut f = fs::File::create(skill_dir.join("SKILL.md"))?;
        f.write_all(include_str!("../resources/workbench-json-sync/SKILL.md").as_bytes())?;
        let mut r = fs::File::create(refs.join("schema.md"))?;
        r.write_all(
            include_str!("../resources/workbench-json-sync/references/schema.md").as_bytes(),
        )?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::commands::write_embedded_skill;
    use std::fs;
    use std::path::PathBuf;

    fn tmp_skill_dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("wb-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn embedded_skill_writes_files() {
        let dir = tmp_skill_dir();
        let ok = write_embedded_skill(&dir).unwrap();
        assert!(ok);
        assert!(dir.join("SKILL.md").is_file());
        assert!(dir.join("references").join("schema.md").is_file());
        let content = fs::read_to_string(dir.join("SKILL.md")).unwrap();
        assert!(content.contains("workbench-json-sync"), "SKILL.md 应包含技能名");
        assert!(!content.contains("D:/个人开发者项目管理器"), "SKILL.md 不应写死路径");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_writes_skill_to_project_dir() {
        // 用临时目录模拟工作空间根目录，验证项目级安装（写入 <dir>/.workbuddy/skills/）
        let ws = std::env::temp_dir().join(format!("wb-ws-{}", std::process::id()));
        let skill_dir = ws.join(".workbuddy").join("skills").join("workbench-json-sync");
        let _ = fs::remove_dir_all(&ws);

        fs::create_dir_all(&skill_dir).unwrap();
        let ok = write_embedded_skill(&skill_dir).unwrap();
        assert!(ok);

        assert!(skill_dir.join("SKILL.md").is_file(), "技能 SKILL.md 应写入工作空间 .workbuddy/skills");
        assert!(skill_dir.join("references").join("schema.md").is_file(), "技能 schema 应写入");
        let skill_content = fs::read_to_string(skill_dir.join("SKILL.md")).unwrap();
        assert!(skill_content.contains("workbench-v1"), "技能应含 schema 版本");
        assert!(!skill_content.contains("D:/个人开发者项目管理器"), "技能不应写死路径");
        // 不应写全局记忆
        assert!(!ws.join(".workbuddy").join("MEMORY.md").exists(), "不应写记忆文件");
        let _ = fs::remove_dir_all(&ws);
    }
}
