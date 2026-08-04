/* UI 渲染冒烟测试：happy-dom 模拟浏览器，验证六视图渲染与核心交互 */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

const dir = path.join(__dirname);
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
// 剥掉外部资源标签（脚本由测试手动 eval），避免 happy-dom 发起真实网络请求
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
global.HTMLElement = window.HTMLElement;

document.write(html);

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

try {
  eval(fs.readFileSync(path.join(dir, 'js', 'store.js'), 'utf8'));
  eval(fs.readFileSync(path.join(dir, 'js', 'app.js'), 'utf8'));
} catch (e) {
  console.error('加载脚本异常: ' + e.message);
  process.exit(1);
}

document.dispatchEvent(new window.Event('DOMContentLoaded'));
setTimeout(() => {
  try {
    console.log('== 视图渲染 ==');
    assert('默认视图为总览', document.querySelector('#topbarTitle').textContent === '总览');
    assert('总览含今日计划面板', !!document.querySelector('.plan-panel'));
    assert('总览含健康度卡片(≥1)', document.querySelectorAll('.health-card').length >= 1);
    assert('总览含收集箱入口', !!document.querySelector('[data-viewinbox]'));

    document.querySelector('[data-view="projects"]').click();
    assert('项目列表渲染', document.querySelectorAll('.health-card').length >= 1);
    assert('新建项目按钮存在', !!document.querySelector('[data-act="newProject"]'));

    document.querySelector('[data-viewproject]').click();
    assert('项目详情渲染', !!document.querySelector('.pd-head'));
    assert('上下文快照存在', !!document.querySelector('[data-snapnote]'));
    assert('项目任务行带前缀', !!document.querySelector('[data-act="task-toggle"]'));

    document.querySelector('[data-view="tasks"]').click();
    assert('任务视图渲染', document.querySelectorAll('.task-item').length >= 4);
    assert('筛选控件存在', document.querySelectorAll('.filters select').length >= 4);

    document.querySelector('[data-view="board"]').click();
    assert('看板四列', document.querySelectorAll('.board-col').length === 4);
    assert('看板卡片存在', document.querySelectorAll('.board-card').length >= 3);

    document.querySelector('[data-view="stats"]').click();
    assert('统计渲染', document.querySelectorAll('.stat-big').length >= 4);
    assert('生成周报按钮存在', !!document.querySelector('[data-act="genReport"]'));

    document.querySelector('[data-view="settings"]').click();
    assert('设置渲染', !!document.querySelector('[data-act="exportJSON"]'));
    assert('备份区存在', !!document.querySelector('[data-act="backup"]'));

    console.log('== 交互冒烟 ==');
    document.querySelector('[data-view="tasks"]').click();
    document.querySelector('#btnQuickNew').click();
    assert('新建任务模态打开', !document.querySelector('#modalMask').hidden);
    const closeBtn = document.querySelector('#modalBox [data-close]');
    if (closeBtn) closeBtn.click();
    assert('模态可关闭', document.querySelector('#modalMask').hidden);

    // 新建任务提交（Enter 路径）
    document.querySelector('#btnQuickNew').click();
    const titleInput = document.querySelector('#fTitle');
    titleInput.value = '冒烟测试任务';
    document.querySelector('#modalBox [data-act="save"]').click();
    assert('保存任务后列表含新任务', document.body.innerHTML.includes('冒烟测试任务'));

    // 看板拖拽 drop
    document.querySelector('[data-view="board"]').click();
    const card = document.querySelector('.board-card');
    if (card) {
      const dropCol = document.querySelector('[data-dropcol="done"]');
      const dt = new window.DataTransfer();
      card.dispatchEvent(new window.Event('dragstart', { bubbles: true, dataTransfer: dt }));
      dropCol.dispatchEvent(new window.Event('drop', { bubbles: true, dataTransfer: dt }));
      assert('拖拽到已完成列后状态持久化', window.Store.getTask(card.dataset.task).status === 'done');
    }

    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('测试执行异常: ' + e.stack);
    process.exit(1);
  }
}, 100);
