@echo off
REM 并行工作台 · Windows 开发构建脚本
REM 用法: build-dev.cmd    (开发模式 cargo run)
REM       build-dev.cmd --release  (发布模式，生成安装包)

setlocal
cd /d "%~dp0"

REM 确保 Rust 工具链在 PATH
set PATH=%USERPROFILE%\.cargo\bin;%PATH%

where rustc >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 rustc。请先安装: https://rustup.rs
  exit /b 1
)

if "%1"=="--release" (
  echo [构建] 发布模式 ...
  cargo build --release --manifest-path src-tauri\Cargo.toml
  if errorlevel 1 exit /b 1
  echo [完成] 可执行文件: src-tauri\target\release\parallel-workbench.exe
  echo [提示] 如需安装包，请安装 NSIS 后执行: cargo tauri build
) else (
  echo [构建] 开发模式 ...
  cargo build --manifest-path src-tauri\Cargo.toml
  if errorlevel 1 exit /b 1
  echo [完成] 可执行文件: src-tauri\target\debug\parallel-workbench.exe
)

endlocal
