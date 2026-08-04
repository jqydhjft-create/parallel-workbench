// 并行工作台 · Tauri 入口

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    parallel_workbench_lib::run();
}
