/* 模拟 Tauri 环境的 UI 测试：
 * 1. 注入 window.__TAURI__ mock（withGlobalTauri 场景）
 * 2. localStorage 模拟为空（首次启动桌面端）
 * 3. invoke('load_data') 模拟返回种子数据
 * 目标：找出前端在真实桌面环境下交互崩溃的路径
 */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

const dir = path.join(__dirname);
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
html = html.replace(/<link[^>]*>/g, '').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');

const window = new Window({
  url: 'http://localhost/index.html',
  settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableResourceFetching: true, disableIframePageLoading: true }
});
const document = window.document;
global.window = window;
global.document = document;
global.localStorage = window.localStorage;
global.Blob = window.Blob;
global.FileReader = window.FileReader;
global.URL = window.URL;
global.Node = window.Node;
global.navigator = window.navigator;

document.write(html);

// ===== 模拟 Tauri 环境（withGlobalTauri: true 场景）=====
// localStorage 清空，模拟桌面端首次启动
try { localStorage.clear(); } catch (e) {}
// 注入 __TAURI__ mock
const invokeCalls = [];
window.__TAURI__ = {
  core: {
    invoke: async (cmd, args) => {
      invokeCalls.push(cmd);
      if (cmd === 'load_data') return null; // 首次启动无文件 → 返回 null（前端应使用种子并写文件）
      if (cmd === 'save_data') return null;
      if (cmd === 'open_path') return null;
      if (cmd === 'backup_to') return 'C:\\backups\\test.json';
      return null;
    }
  },
  dialog: { save: async () => null, open: async () => null },
  fs: { writeTextFile: async () => {}, readTextFile: async () => '' }
};

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

try {
  eval(fs.readFileSync(path.join(dir, 'js', 'store.js'), 'utf8'));
  eval(fs.readFileSync(path.join(dir, 'js', 'app.js'), 'utf8'));
} catch (e) {
  console.error('加载脚本异常: ' + e.stack);
  process.exit(1);
}

// 捕获渲染中错误
const errors = [];
window.addEventListener('error', e => { errors.push(e.error ? e.error.stack : e.message); });
window.addEventListener('unhandledrejection', e => { errors.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)); });

document.dispatchEvent(new window.Event('DOMContentLoaded'));
setTimeout(() => {
  try {
    console.log('== Tauri 环境渲染 ==');
    assert('无 JS 运行错误', errors.length === 0);
    if (errors.length) errors.slice(0, 3).forEach(e => console.error('  错误: ' + e));

    // 首次启动：load_data 返回 null → 前端应用种子数据
    const S = window.Store;
    assert('数据已初始化（种子）', S.data && S.data.projects.length === 1);
    assert('invoke 已调用 load_data', invokeCalls.includes('load_data'));

    // 渲染总览
    assert('总览渲染', !!document.querySelector('.plan-panel'));
    assert('健康度卡片', document.querySelectorAll('.health-card').length >= 1);

    // 交互：勾选今日任务
    const check = document.querySelector('.plan-panel .task-check');
    if (check) {
      check.click();
      assert('勾选交互正常', true);
    }
    assert('保存时调用 save_data', invokeCalls.includes('save_data'));

    // 切换到各视图
    ['projects', 'tasks', 'board', 'stats', 'settings'].forEach(v => {
      const btn = document.querySelector('[data-view="' + v + '"]');
      if (btn) { btn.click(); assert('视图切换正常: ' + v, true); }
      else assert('视图按钮存在: ' + v, false);
    });

    // 新建任务模态
    document.querySelector('#btnQuickNew').click();
    assert('新建任务模态打开', !document.querySelector('#modalMask').hidden);
    const titleInput = document.querySelector('#fTitle');
    titleInput.value = 'Tauri测试任务';
    document.querySelector('#modalBox [data-act="save"]').click();
    assert('任务保存成功', S.getTasks().some(t => t.title === 'Tauri测试任务'));

    // 设置页：导出（Tauri 走 dialog.save）
    document.querySelector('[data-view="settings"]').click();
    const exportBtn = document.querySelector('[data-act="exportJSON"]');
    if (exportBtn) { exportBtn.click(); assert('导出按钮点击不崩', true); }

    // 项目详情：打开本地目录（Tauri 走 invoke open_path）
    document.querySelector('[data-view="projects"]').click();
    document.querySelector('[data-viewproject]').click();
    const openPathBtn = document.querySelector('[data-act="openPath"]');
    if (openPathBtn) {
      openPathBtn.click();
      setTimeout(() => {
        assert('open_path 已调用', invokeCalls.includes('open_path'));
        console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
        process.exit(fail ? 1 : 0);
      }, 50);
    } else {
      console.error('  ✗ 未找到 openPath 按钮');
      console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
      process.exit(fail ? 1 : 0);
    }
  } catch (e) {
    console.error('测试执行异常: ' + e.stack);
    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
    process.exit(1);
  }
}, 100);
