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

    /// 检查 WorkBuddy 集成状态：技能与记忆是否已安装
    #[tauri::command]
    pub fn check_workbuddy_integration() -> Result<Value, String> {
        use serde_json::json;
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".into());
        let skills_dir = PathBuf::from(&home).join(".workbuddy").join("skills");
        let skill_dir = skills_dir.join("workbench-json-sync");
        let memory_file = PathBuf::from(&home).join(".workbuddy").join("MEMORY.md");
        let skill_installed = skill_dir.join("SKILL.md").is_file();
        let memory_merged = memory_file.is_file()
            && fs::read_to_string(&memory_file)
                .unwrap_or_default()
                .contains("WorkBench");
        Ok(json!({
            "home": home,
            "skill_installed": skill_installed,
            "memory_merged": memory_merged,
            "skill_path": skill_dir.to_string_lossy().into_owned(),
            "memory_path": memory_file.to_string_lossy().into_owned(),
            "installed": skill_installed && memory_merged
        }))
    }

    /// 一键安装 WorkBuddy 集成：写入技能到 ~/.workbuddy/skills/ + 合并记忆到 MEMORY.md
    #[tauri::command]
    pub fn install_workbuddy_integration() -> Result<Value, String> {
        use serde_json::json;
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".into());
        let wb_dir = PathBuf::from(&home).join(".workbuddy");
        let skills_dir = wb_dir.join("skills");
        let skill_dir = skills_dir.join("workbench-json-sync");
        let memory_file = wb_dir.join("MEMORY.md");

        // 1. 技能：从内置常量写入（include_str! 编译期嵌入，开发/发布一致）
        fs::create_dir_all(&skill_dir).map_err(|e| format!("创建技能目录失败: {e}"))?;
        let skill_ok = write_embedded_skill(&skill_dir).map_err(|e| format!("写入技能失败: {e}"))?;

        // 2. 记忆：合并模板到用户级 MEMORY.md（去重）
        let template = embedded_memory_template();
        let memory_merged = if memory_file.exists() {
            let existing = fs::read_to_string(&memory_file).unwrap_or_default();
            if existing.contains("并行工作台 · WorkBench") {
                true
            } else {
                let merged = format!("{}\n\n{}\n", existing.trim_end(), template);
                fs::write(&memory_file, merged).map_err(|e| format!("写入记忆失败: {e}"))?;
                true
            }
        } else {
            let content = format!("# 用户长期记忆\n\n{}\n", template);
            fs::write(&memory_file, content).map_err(|e| format!("写入记忆失败: {e}"))?;
            true
        };

        Ok(json!({
            "skill_installed": skill_ok,
            "memory_merged": memory_merged,
            "installed": skill_ok && memory_merged
        }))
    }

    /// 回退：内置技能内容（与 resources/workbench-json-sync 保持一致）
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

    /// 记忆模板（与安装包 templates/memory-user.md 保持一致）
    pub(crate) fn embedded_memory_template() -> &'static str {
        include_str!("../resources/memory-user-template.md")
    }
}

#[cfg(test)]
mod tests {
    use super::commands::{embedded_memory_template, write_embedded_skill};
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
    fn memory_template_is_generic() {
        let tmpl = embedded_memory_template();
        assert!(tmpl.contains("WorkBench"));
        assert!(!tmpl.contains("D:/个人开发者项目管理器"), "记忆模板不应写死路径");
        assert!(tmpl.contains("定位项目根目录"), "应包含动态定位规则");
    }

    #[test]
    fn install_writes_skill_and_memory() {
        // 用临时目录模拟独立用户 HOME，验证完整安装写入逻辑
        let fake_home = std::env::temp_dir().join(format!("wb-home-{}", std::process::id()));
        let wb = fake_home.join(".workbuddy");
        let skill_dir = wb.join("skills").join("workbench-json-sync");
        let mem_file = wb.join("MEMORY.md");
        let _ = fs::remove_dir_all(&fake_home);

        fs::create_dir_all(&skill_dir).unwrap();
        let ok = write_embedded_skill(&skill_dir).unwrap();
        assert!(ok);
        let tmpl = embedded_memory_template();
        fs::write(&mem_file, format!("# 用户长期记忆\n\n{}\n", tmpl)).unwrap();

        assert!(skill_dir.join("SKILL.md").is_file(), "技能 SKILL.md 应写入");
        assert!(skill_dir.join("references").join("schema.md").is_file(), "技能 schema 应写入");
        let mem = fs::read_to_string(&mem_file).unwrap();
        assert!(mem.contains("WorkBench"), "记忆应含规范");
        let skill_content = fs::read_to_string(skill_dir.join("SKILL.md")).unwrap();
        assert!(skill_content.contains("workbench-v1"), "技能应含 schema 版本");
        assert!(!skill_content.contains("D:/个人开发者项目管理器"), "技能不应写死路径");
        let _ = fs::remove_dir_all(&fake_home);
    }
}
