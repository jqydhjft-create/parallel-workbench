/* store.js 数据层单元测试（Node 模拟浏览器环境） */
const fs = require('fs');
const path = require('path');

// 模拟浏览器环境
const memStore = {};
global.window = global;
global.localStorage = {
  getItem: k => (k in memStore ? memStore[k] : null),
  setItem: (k, v) => { memStore[k] = String(v); },
  removeItem: k => { delete memStore[k]; }
};
global.Blob = class { constructor(parts) { this.size = parts.join('').length; } };

eval(fs.readFileSync(path.join(__dirname, 'js', 'store.js'), 'utf8'));
const S = global.Store;
const U = S.utils;

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

console.log('== Store 初始化 ==');
S.load();
assert('种子数据加载：1 个项目', S.getProjects().length === 1);
assert('种子数据加载：5 个任务(4项目内+1收集箱)', S.getTasks().length === 5);
assert('收集箱 1 条', S.getInboxTasks().length === 1);
assert('今日计划预置 2 个', S.planTasks().length === 2);

console.log('== 健康度计算 (F04: 阻塞×2 + 今日到期×3 + 进行中) ==');
const p1 = S.getProjects()[0]; // 示例项目
const h1 = S.projectHealth(p1.id);
assert('项目1 有 1 个阻塞', h1.blocked === 1);
assert('项目1 有 1 个今日到期', h1.dueToday === 1);
assert('项目1 有 1 个进行中', h1.inProgress === 1);
assert('项目1 健康度 = 1*2+1*3+1 = 6', h1.score === 6);

console.log('== 任务 CRUD ==');
const nt = { id: U.uid(), project_id: p1.id, title: '测试任务', description: '', status: 'todo', priority: 'P1', due_date: U.todayStr(), estimate_min: 30, actual_min: 0, tags: ['test'], context_note: '', blocked_reason: '', created_at: Date.now(), updated_at: Date.now(), completed_at: null };
S.saveTask(nt);
assert('保存后共 6 个任务', S.getTasks().length === 6);
S.updateTaskStatus(nt.id, 'blocked');
S.setTaskBlocked(nt.id, '测试阻塞原因');
assert('阻塞原因写入', S.getTask(nt.id).blocked_reason === '测试阻塞原因');
S.updateTaskStatus(nt.id, 'done');
assert('完成后记录 completed_at', !!S.getTask(nt.id).completed_at);
S.deleteTask(nt.id);
assert('删除后回到 5 个', S.getTasks().length === 5);

console.log('== 今日计划 ==');
const plan = S.getTodayPlan();
assert('今日计划存在', !!plan && plan.date === U.todayStr());
plan.task_order = plan.task_order.filter(id => id !== S.getTasks()[0].id);
S.savePlan(plan);
assert('移除后计划 1 个', S.planTasks().length === 1);

console.log('== 时间记录 ==');
const t0 = S.getTasks()[0];
const beforeMin = S.getTask(t0.id).actual_min;
S.addTimeEntry(t0.id, 25, '补录测试');
assert('补录后 actual_min 增加 25', S.getTask(t0.id).actual_min === beforeMin + 25);
assert('时间记录条数 +1', S.getTimeEntries(t0.id).length >= 1);

console.log('== 上下文快照 ==');
S.saveSnapshot(p1.id, '测试备注更新', t0.id);
assert('快照备注保存', S.getSnapshot(p1.id).work_note === '测试备注更新');

console.log('== 备份 (F19) ==');
for (let i = 0; i < 10; i++) S.createBackup();
assert('备份最多保留 7 份', S.getBackups().length === 7);

console.log('== 导入导出 ==');
const json = S.exportJSON();
assert('导出 JSON 可解析', typeof JSON.parse(json).projects[0].id === 'string');
S.importJSON(json);
assert('导入后数据一致', S.getProjects().length === 1);

console.log('== 统计 ==');
const w = S.statsWeek();
assert('统计包含 perProject', w.perProject.length === 1);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
