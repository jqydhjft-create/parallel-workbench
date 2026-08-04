/* ============================================================
 * 并行工作台 · UI 层 (app.js)
 * 单页应用：总览 / 项目 / 任务 / 看板 / 统计 / 设置
 * ============================================================ */
(function () {
  'use strict';
  const S = window.Store;
  const U = S.utils;

  const VIEW_TITLES = { home: '总览', projects: '项目', tasks: '任务', board: '看板', stats: '统计', settings: '设置' };
  const STATE = {
    view: 'home',
    projectId: null,          // 项目详情当前项目
    filters: { status: 'all', priority: 'all', tag: 'all', due: 'all', sort: 'due', search: '' },
    boardProject: 'all',
    inboxFilter: false,
    statsRange: 'week',       // 统计面板时间范围：week | month
    // 拖拽状态
    dragTaskId: null
  };

  /* ================= 工具 ================= */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg, type) {
    const w = $('#toastWrap');
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    w.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 1900);
    setTimeout(() => el.remove(), 2300);
  }
  function projectColor(id) {
    const p = S.getProject(id);
    return p ? p.color : '#868e96';
  }
  function projectName(id) {
    return S.getProject(id) ? S.getProject(id).name : '收集箱';
  }
  const STATUS_LABEL = { todo: '待办', in_progress: '进行中', blocked: '阻塞', done: '已完成' };
  const STATUS_TAG = { todo: 'st-todo', in_progress: 'st-in_progress', blocked: 'st-blocked', done: 'st-done' };

  /* ================= 导航 ================= */
  function switchView(view, projectId) {
    STATE.view = view;
    STATE.projectId = projectId || null;
    $$('#nav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#topbarTitle').textContent = view === 'projects' && STATE.projectId ? S.getProject(STATE.projectId).name : VIEW_TITLES[view];
    render();
  }

  /* ================= 渲染分发 ================= */
  function render() {
    const c = $('#content');
    switch (STATE.view) {
      case 'home': c.innerHTML = renderHome(); bindHome(); break;
      case 'projects': c.innerHTML = STATE.projectId ? renderProjectDetail() : renderProjects(); if (STATE.projectId) bindProjectsDetail(); else bindProjects(); break;
      case 'tasks': c.innerHTML = renderTasks(); bindTasks(); break;
      case 'board': c.innerHTML = renderBoard(); bindBoard(); break;
      case 'stats': c.innerHTML = renderStats(); bindStats(); break;
      case 'settings': c.innerHTML = renderSettings(); bindSettings(); break;
    }
    // 全局搜索同步
    $('#globalSearch').value = STATE.filters.search;
  }

  /* ================= 计时器 (F11) ================= */
  // 任务行操作区的计时按钮组（pfx 为视图前缀：'' 或 'task-'）
  function timerBtns(t, pfx) {
    const tm = S.getTimer();
    if (!tm || tm.task_id !== t.id) {
      return '<button class="icon-btn timer-btn" data-act="' + pfx + 'timer" title="开始计时">▶</button>';
    }
    const pauseAct = pfx + 'timer-pause', stopAct = pfx + 'timer-stop';
    const pauseBtn = tm.running
      ? '<button class="icon-btn timer-btn on" data-act="' + pauseAct + '" title="暂停计时">⏸</button>'
      : '<button class="icon-btn timer-btn paused" data-act="' + pauseAct + '" title="继续计时">▶</button>';
    return pauseBtn + '<button class="icon-btn timer-btn stop" data-act="' + stopAct + '" title="停止计时">⏹</button>' +
      '<span class="timer-tick">' + S.formatTimerMs(S.timerElapsedMs()) + '</span>';
  }
  // 看板卡片的迷你计时按钮
  function timerMiniBtn(t) {
    const tm = S.getTimer();
    if (!tm || tm.task_id !== t.id) {
      return '<button class="bc-timer timer-btn" data-act="timer" data-task="' + t.id + '" title="开始计时">▶</button>';
    }
    const btn = tm.running
      ? '<button class="bc-timer timer-btn on" data-act="timer" data-task="' + t.id + '" title="暂停">⏸</button>'
      : '<button class="bc-timer timer-btn paused" data-act="timer" data-task="' + t.id + '" title="继续">▶</button>';
    return btn + '<span class="timer-tick">' + S.formatTimerMs(S.timerElapsedMs()) + '</span>';
  }
  // 点击计时按钮的统一处理
  function handleTimerToggle(taskId) {
    const t = S.getTask(taskId);
    if (!t) return;
    if (t.status === 'done') { toast('已完成任务不能计时', 'err'); return; }
    const r = S.toggleTimer(taskId);
    if (!r) return;
    if (r.action === 'start') {
      toast(r.settled
        ? '已结算「' + esc((S.getTask(r.settled.task_id) || { title: '任务' }).title) + '」' + r.settled.minutes + ' 分钟，开始「' + esc(t.title) + '」'
        : '开始计时：' + esc(t.title), 'ok');
    } else if (r.action === 'pause') { toast('已暂停计时'); }
    else { toast('已继续计时', 'ok'); }
    render(); updateTimerChip();
  }
  function handleTimerStop(taskId) {
    const r = S.stopTimer(taskId);
    if (r) {
      toast(r.discarded ? '计时时间过短，未记录' : '已记录 ' + r.minutes + ' 分钟', r.discarded ? 'err' : 'ok');
      render(); updateTimerChip();
    }
  }

  /* ================= 任务卡片公共 ================= */
  function taskChip(t) {
    const tags = (t.tags || []).map(tg => '<span class="tag tl">' + esc(tg) + '</span>').join('');
    const due = t.due_date ? '<span title="截止">⏱ ' + U.fmtDate(t.due_date) + '</span>' : '';
    const pj = '<span><span class="proj-dot" style="background:' + projectColor(t.project_id) + '"></span>' + esc(projectName(t.project_id)) + '</span>';
    return '<div class="t-sub">' + pj + '<span class="tag ' + STATUS_TAG[t.status] + '">' + STATUS_LABEL[t.status] + '</span><span class="tag ' + t.priority.toLowerCase() + '">' + t.priority + '</span>' + due + tags + '</div>';
  }

  function taskRow(t, opts) {
    opts = opts || {};
    const pfx = opts.prefix || '';
    const checked = t.status === 'done' ? 'checked' : '';
    const blockInfo = t.status === 'blocked' && t.blocked_reason ? ' <span class="muted" title="阻塞原因">⚠ ' + esc(t.blocked_reason) + '</span>' : '';
    const est = t.estimate_min ? '<span>预计 ' + U.fmtMinutes(t.estimate_min) + '</span>' : '';
    const act = t.actual_min ? '<span>实记 ' + U.fmtMinutes(t.actual_min) + '</span>' : '';
    const timing = S.getTimer() && S.getTimer().task_id === t.id;
    return '<div class="task-item' + (t.status === 'done' ? ' done' : '') + (timing ? ' timing' : '') + '" draggable="true" data-task="' + t.id + '" data-status="' + t.status + '">' +
      '<button class="task-check ' + checked + '" data-act="' + pfx + 'toggle" title="标记完成/未完成">' + (checked ? '✓' : '') + '</button>' +
      '<div class="t-main"><div class="t-title">' + esc(t.title) + '</div>' + taskChip(t) + blockInfo + '</div>' +
      '<div class="t-sub" style="gap:8px;">' + est + act + '</div>' +
      '<div class="t-actions">' +
      timerBtns(t, pfx) +
      '<button class="icon-btn" data-act="' + pfx + 'edit" title="编辑">✎</button>' +
      '<button class="icon-btn danger" data-act="' + pfx + 'del" title="删除">✕</button>' +
      '</div></div>';
  }

  /* ================= 总览 ================= */
  function renderHome() {
    const plan = S.getTodayPlan();
    const planTasks = S.planTasks();
    const doneN = planTasks.filter(t => t.status === 'done').length;
    const pct = planTasks.length ? Math.round(doneN / planTasks.length * 100) : 0;
    const estTotal = planTasks.reduce((a, t) => a + (t.estimate_min || 0), 0);
    const inbox = S.getInboxTasks().length;

    // 健康度排序：score desc，其次最近截止
    const projects = S.getActiveProjects().map(p => {
      const h = S.projectHealth(p.id);
      const due = S.nextDueDate(p.id);
      return { p, h, due, days: U.daysUntil(due) };
    }).sort((a, b) => b.h.score - a.h.score || (a.days == null ? 1 : a.days) - (b.days == null ? 1 : b.days));

    const healthCards = projects.map(x => {
      const cls = x.h.score >= 4 ? 'hot' : (x.h.score >= 2 ? 'warm' : '');
      const dueTxt = x.due ? (x.days < 0 ? '已逾期 ' + (-x.days) + ' 天' : (x.days === 0 ? '今天到期' : x.days + ' 天后到期')) : '无截止';
      const lastActive = x.p.updated_at ? U.fmtDateTime(x.p.updated_at) : '—';
      return '<div class="health-card ' + cls + '" style="--proj-c:' + x.p.color + '" data-viewproject="' + x.p.id + '" title="点击进入项目">' +
        '<span class="urgency">紧急度 ' + x.h.score + '</span>' +
        '<div class="hc-top"><span class="proj-dot" style="background:' + x.p.color + '"></span><span class="hc-name">' + esc(x.p.name) + '</span></div>' +
        '<div class="hc-stats">' +
        '<div class="stat"><b style="color:' + (x.h.blocked ? '#e03131' : 'var(--ink)') + '">' + x.h.blocked + '</b><span>阻塞</span></div>' +
        '<div class="stat"><b style="color:' + (x.h.dueToday ? '#f08c00' : 'var(--ink)') + '">' + x.h.dueToday + '</b><span>今日到期</span></div>' +
        '<div class="stat"><b>' + x.h.inProgress + '</b><span>进行中</span></div>' +
        '<div class="stat"><b>' + x.h.total + '</b><span>全部任务</span></div>' +
        '</div>' +
        '<div class="hc-meta"><span>⏱ ' + dueTxt + '</span><span>活跃 ' + lastActive + '</span></div>' +
        '</div>';
    }).join('');

    const planRows = planTasks.length ? planTasks.map(t => taskRow(t)).join('')
      : '<div class="empty">今日计划为空<br><span class="small">点击「＋ 添加」从各项目挑选任务，或按 <kbd>N</kbd> 快速新建</span></div>';

    return '<div class="hero"><div><h2>早上好，开发者 👋</h2><div class="date">' + (new Date().getMonth() + 1) + '月' + new Date().getDate() + '日 周' + '日一二三四五六'[new Date().getDay()] + ' · 共 ' + S.getActiveProjects().length + ' 个进行中项目 · 收集箱 ' + inbox + ' 条</div></div></div>' +
      '<div class="grid grid-2">' +
      '  <div class="card plan-panel">' +
      '    <div class="plan-head"><h3 style="margin:0;">今日计划</h3><span class="muted">' + doneN + '/' + planTasks.length + ' 完成</span>' +
      '      <div class="progress"><i class="' + (pct >= 100 ? 'ok' : '') + '" style="width:' + pct + '%"></i></div>' +
      '      <button class="btn btn-sm btn-primary" data-act="addPlan">＋ 添加</button>' +
      '      <button class="btn btn-sm" data-act="clearPlan" title="清空今日计划">清空</button></div>' +
      '    <div class="muted" style="margin-top:4px;">预计总耗时 ' + U.fmtMinutes(estTotal) + (plan.daily_note ? ' · 备注：' + esc(plan.daily_note) : '') + '</div>' +
      '    <div id="planList" style="margin-top:6px;">' + planRows + '</div>' +
      '  </div>' +
      '  <div>' +
      '    <h3 style="margin-bottom:10px;">项目健康度 <span class="muted small">(阻塞×2 + 今日到期×3 + 进行中)</span></h3>' +
      '    <div class="grid" style="gap:10px;">' + (healthCards || '<div class="empty">暂无进行中项目</div>') + '</div>' +
      '    <div class="card" style="margin-top:12px;cursor:pointer;" data-viewinbox>' +
      '      <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:22px;">📥</span><div><b>收集箱</b><div class="muted">未归类的 ' + inbox + ' 条想法/任务，2 步归入项目</div></div><span class="grow" style="flex:1"></span><button class="btn btn-sm">去归类 →</button></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  function bindHome() {
    $('#content').querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('click', e => {
        const act = el.dataset.act;
        const item = el.closest('.task-item');
        const taskId = item ? item.dataset.task : null;
        if (act === 'toggle') { toggleTask(taskId); }
        else if (act === 'edit') { openTaskModal(taskId); }
        else if (act === 'del') { confirmDeleteTask(taskId); }
        else if (act === 'timer' || act === 'timer-pause') { handleTimerToggle(taskId); }
        else if (act === 'timer-stop') { handleTimerStop(taskId); }
        else if (act === 'addPlan') { openAddPlanModal(); }
        else if (act === 'clearPlan') { clearPlan(); }
      });
    });
    $('#content').querySelectorAll('[data-viewproject]').forEach(el => el.addEventListener('click', () => switchView('projects', el.dataset.viewproject)));
    const inboxCard = $('#content').querySelector('[data-viewinbox]');
    if (inboxCard) inboxCard.addEventListener('click', () => { STATE.filters.status = 'all'; STATE.inboxFilter = true; switchView('tasks'); });
    initDragSort('planList');
  }

  function toggleTask(id) {
    const t = S.getTask(id);
    if (!t) return;
    const willDone = t.status !== 'done';
    // 勾选完成且该任务正在计时 → 先结算
    const tm = S.getTimer();
    if (willDone && tm && tm.task_id === id) {
      const r = S.stopTimer(id);
      if (r && !r.discarded) toast('完成并结算 ' + r.minutes + ' 分钟', 'ok');
    }
    S.updateTaskStatus(id, willDone ? 'done' : 'todo');
    render(); updateTimerChip();
  }
  function clearPlan() {
    const plan = S.getTodayPlan();
    plan.task_order = [];
    S.savePlan(plan);
    toast('今日计划已清空', 'ok');
    render();
  }
  function openAddPlanModal() {
    const candidates = S.getTasks().filter(t => t.status !== 'done' && !S.getTodayPlan().task_order.includes(t.id));
    openModal('<h3>添加到今日计划</h3>', '<div class="muted" style="margin-bottom:10px;">从任意项目挑选任务（可多选，Ctrl+点击）</div>' +
      (candidates.length ? '<div style="max-height:46vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">' + candidates.map(t =>
        '<label class="task-item" style="cursor:pointer;margin:0;"><input type="checkbox" class="plan-cand" value="' + t.id + '" style="width:16px;height:16px;accent-color:var(--accent);">' +
        '<div class="t-main"><div class="t-title">' + esc(t.title) + '</div>' + taskChip(t) + '</div></label>'
      ).join('') + '</div>' : '<div class="empty">没有可添加的任务，先按 N 新建一个</div>') +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn btn-primary" data-act="confirmAddPlan">加入计划</button></div>');
    $('#modalBox').querySelector('[data-act="confirmAddPlan"]').addEventListener('click', () => {
      const ids = $$('.plan-cand:checked').map(i => i.value);
      if (!ids.length) { toast('请至少选择一个任务', 'err'); return; }
      const plan = S.getTodayPlan();
      ids.forEach(id => { if (!plan.task_order.includes(id)) plan.task_order.push(id); });
      S.savePlan(plan);
      closeModal();
      toast('已加入 ' + ids.length + ' 个任务', 'ok');
      render();
    });
  }

  /* ================= 项目列表 ================= */
  let projFilter = 'all';
  let projSearch = '';
  function renderProjects() {
    const projs = S.getProjects().filter(p => (projFilter === 'all' || p.status === projFilter) &&
      (!projSearch || p.name.toLowerCase().includes(projSearch.toLowerCase()) || (p.tech_stack || '').toLowerCase().includes(projSearch.toLowerCase())));
    const counts = { active: S.getProjects().filter(p => p.status === 'active').length, paused: 0, archived: 0 };
    S.getProjects().forEach(p => { if (p.status === 'paused') counts.paused++; if (p.status === 'archived') counts.archived++; });
    const cards = projs.map(p => {
      const h = S.projectHealth(p.id);
      const due = S.nextDueDate(p.id);
      const days = U.daysUntil(due);
      const dueTxt = due ? (days < 0 ? '已逾期 ' + (-days) + ' 天' : (days === 0 ? '今天到期' : days + ' 天后到期')) : '无截止';
      return '<div class="health-card" style="--proj-c:' + p.color + ';cursor:pointer;" data-viewproject="' + p.id + '">' +
        '<div class="hc-top"><span class="proj-dot" style="background:' + p.color + '"></span><span class="hc-name">' + esc(p.name) + '</span>' +
        '<span class="tag ' + (p.status === 'active' ? 'st-active' : p.status === 'paused' ? 'st-paused' : 'st-archived') + '">' + ({ active: '进行中', paused: '暂停', archived: '归档' }[p.status]) + '</span></div>' +
        '<div class="small muted" style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(p.tech_stack || '—') + '</div>' +
        '<div class="hc-stats">' +
        '<div class="stat"><b style="color:' + (h.blocked ? '#e03131' : 'var(--ink)') + '">' + h.blocked + '</b><span>阻塞</span></div>' +
        '<div class="stat"><b>' + h.inProgress + '</b><span>进行中</span></div>' +
        '<div class="stat"><b>' + h.total + '</b><span>任务</span></div>' +
        '</div>' +
        '<div class="hc-meta"><span>⏱ ' + dueTxt + '</span><span>更新 ' + U.fmtDateTime(p.updated_at) + '</span></div>' +
        '</div>';
    }).join('');

    return '<div class="hero"><div><h2>项目</h2><div class="date">共 ' + S.getProjects().length + ' 个项目</div></div>' +
      '<button class="btn btn-primary" data-act="newProject">＋ 新建项目</button></div>' +
      '<div class="filters">' +
      '<div class="seg">' +
      [['all', '全部'], ['active', '进行中'], ['paused', '暂停'], ['archived', '归档']].map(([k, v]) =>
        '<button class="' + (projFilter === k ? 'active' : '') + '" data-pf="' + k + '">' + v + (k !== 'all' ? ' ' + counts[k === 'active' ? 'active' : k] : '') + '</button>').join('') +
      '</div>' +
      '<input type="text" id="projSearch" placeholder="搜索项目名 / 技术栈…" value="' + esc(projSearch) + '" style="padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font-family:inherit;outline:none;width:220px;">' +
      '</div>' +
      '<div class="grid grid-auto">' + (cards || '<div class="empty" style="grid-column:1/-1;">没有符合条件的项目</div>') + '</div>';
  }
  function bindProjects() {
    const c = $('#content');
    $$('#content [data-pf]').forEach(b => b.addEventListener('click', () => { projFilter = b.dataset.pf; render(); }));
    const ps = $('#projSearch');
    if (ps) ps.addEventListener('input', e => { projSearch = e.target.value; render(); });
    $('#content').querySelectorAll('[data-viewproject]').forEach(el => el.addEventListener('click', () => switchView('projects', el.dataset.viewproject)));
    const np = $('#content').querySelector('[data-act="newProject"]');
    if (np) np.addEventListener('click', openProjectModal);
  }
  function renderProjectsInto() {
    render();
  }

  /* ================= 项目详情 ================= */
  function renderProjectDetail() {
    const p = S.getProject(STATE.projectId);
    if (!p) { switchView('projects'); return ''; }
    const h = S.projectHealth(p.id);
    const snap = S.getSnapshot(p.id);
    const tasks = S.getProjectTasks(p.id);
    const stLabel = { active: '进行中', paused: '暂停', archived: '归档' }[p.status];
    const stCls = p.status === 'active' ? 'st-active' : p.status === 'paused' ? 'st-paused' : 'st-archived';
    const info = [['技术栈', p.tech_stack], ['代码仓库', p.repo_url], ['本地路径', p.local_path], ['端口', p.ports],
      ['环境变量', p.env_notes], ['文档', p.docs_link], ['部署地址', p.deploy_url]].map(([k, v]) => {
        const isPath = k === '本地路径' && v;
        return '<div class="il"><b>' + k + '</b><span>' + (v ? esc(v) + (isPath ? ' <button class="icon-btn" data-act="openPath" data-path="' + esc(v) + '" title="在文件管理器中打开">📂</button>' : '') : '—') + '</span></div>';
      }).join('');

    const lastTask = snap ? S.getTask(snap.last_task_id) : null;
    const taskRows = tasks.length ? tasks.map(t => taskRow(t, { prefix: 'task-' })).join('')
      : '<div class="empty">该项目还没有任务，按 <kbd>N</kbd> 新建</div>';

    return '<div class="pd-head">' +
      '<span class="proj-dot" style="width:14px;height:14px;background:' + p.color + '"></span>' +
      '<span class="pd-name">' + esc(p.name) + '</span>' +
      (p.workspace ? '<span class="tag tl" title="来自 WorkBuddy 对接文档 workbench.json">🤖 对接项目</span>' : '') +
      '<span class="tag ' + stCls + '">' + stLabel + '</span>' +
      '<span class="grow"></span>' +
      '<div class="pd-actions">' +
      '<button class="btn btn-sm" data-act="toggleStatus">' + (p.status === 'active' ? '⏸ 暂停' : '▶ 恢复') + '</button>' +
      (p.status !== 'archived' ? '<button class="btn btn-sm" data-act="archive">🗄 归档</button>' : '<button class="btn btn-sm" data-act="unarchive">↺ 取消归档</button>') +
      '<button class="btn btn-sm" data-act="edit">✎ 编辑档案</button>' +
      '<button class="btn btn-sm btn-danger" data-act="del">删除</button>' +
      '</div></div>' +

      '<div class="pd-body">' +
      '<div class="card">' +
      '<h3>📋 任务 <span class="tag ' + STATUS_TAG.todo + '">' + h.total + '</span>' +
      '<span class="grow"></span><button class="btn btn-sm btn-primary" data-act="newTask">＋ 新建</button></h3>' +
      '<div>' + taskRows + '</div>' +
      '</div>' +
      '<div>' +
      '<div class="card" style="margin-bottom:14px;">' +
      '<h3>🗂 项目档案</h3>' +
      '<div class="small muted">' + (p.description ? esc(p.description) : '暂无描述') + '</div>' +
      '<div class="info-list" style="margin-top:10px;">' + info + '</div>' +
      '</div>' +
      '<div class="card">' +
      '<h3>🧭 上下文快照 <span class="small muted">(最后活跃 ' + (snap ? U.fmtDateTime(snap.last_active_at) : '—') + ')</span></h3>' +
      '<div class="small muted">切回项目时 10 秒内恢复「上次做到哪」</div>' +
      '<div class="snap"><div class="snap-label">上次进行的任务</div><p>' + (lastTask ? esc(lastTask.title) : '—') + '</p></div>' +
      '<div class="snap" style="margin-top:8px;"><div class="snap-label">工作备注（可编辑，自动保存）</div>' +
      '<textarea data-snapnote placeholder="记录当前进度、下一步、卡点…">' + esc(snap ? snap.work_note : '') + '</textarea></div>' +
      '<div class="small muted" style="margin-top:8px;">💡 计时结束时也会自动写入快照。</div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }
  function bindProjectsDetail() {
    const c = $('#content');
    $$('#content [data-act]').forEach(el => {
      el.addEventListener('click', e => {
        const act = el.dataset.act;
        if (act === 'toggleStatus') { const p = S.getProject(STATE.projectId); p.status = p.status === 'active' ? 'paused' : 'active'; S.saveProject(p); render(); toast('已切换状态', 'ok'); }
        else if (act === 'archive') { confirmArchive(); }
        else if (act === 'unarchive') { const p = S.getProject(STATE.projectId); p.status = 'active'; S.saveProject(p); render(); }
        else if (act === 'edit') { openProjectModal(STATE.projectId); }
        else if (act === 'del') { confirmDeleteProject(STATE.projectId); }
        else if (act === 'newTask') { openTaskModal(null, STATE.projectId); }
        else if (act === 'openPath') {
          const path = el.dataset.path;
          S.openLocalPath(path).then(() => toast('已打开 ' + path, 'ok')).catch(e => toast('打开失败：' + e.message, 'err'));
        }
        else if (act === 'task-toggle' || act === 'task-edit' || act === 'task-del') {
          const item = el.closest('.task-item');
          if (!item) return;
          const id = item.dataset.task;
          if (act === 'task-toggle') toggleTask(id);
          else if (act === 'task-edit') openTaskModal(id);
          else if (act === 'task-del') confirmDeleteTask(id);
        }
        else if (act === 'task-timer' || act === 'task-timer-pause') {
          const item = el.closest('.task-item');
          if (item) handleTimerToggle(item.dataset.task);
        }
        else if (act === 'task-timer-stop') {
          const item = el.closest('.task-item');
          if (item) handleTimerStop(item.dataset.task);
        }
      });
    });
    const note = $('#content [data-snapnote]');
    if (note) note.addEventListener('change', e => { S.saveSnapshot(STATE.projectId, e.target.value); toast('快照备注已保存', 'ok'); });
  }

  function confirmArchive() {
    const p = S.getProject(STATE.projectId);
    openModal('<h3>归档项目</h3>', '<p>归档后「' + esc(p.name) + '」将从总览健康度中隐藏，任务保留。确定归档？</p>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn btn-primary" data-act="ok">归档</button></div>');
    $('#modalBox [data-act="ok"]').addEventListener('click', () => { p.status = 'archived'; S.saveProject(p); closeModal(); toast('已归档', 'ok'); render(); });
  }
  function confirmDeleteProject(id) {
    const p = S.getProject(id);
    openModal('<h3>删除项目</h3>', '<p style="color:var(--danger);">⚠ 将删除项目「' + esc(p.name) + '」，其下任务会移入收集箱（不删除任务）。此操作不可撤销。</p>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn btn-danger" data-act="ok">确认删除</button></div>');
    $('#modalBox [data-act="ok"]').addEventListener('click', () => { S.deleteProject(id); closeModal(); toast('项目已删除', 'ok'); switchView('projects'); });
  }
  function confirmDeleteTask(id) {
    const t = S.getTask(id);
    openModal('<h3>删除任务</h3>', '<p>确定删除任务「' + esc(t.title) + '」？相关计时记录也会一并删除。</p>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn btn-danger" data-act="ok">确认删除</button></div>');
    $('#modalBox [data-act="ok"]').addEventListener('click', () => { S.deleteTask(id); closeModal(); toast('任务已删除', 'ok'); render(); });
  }

  /* ================= 任务视图 ================= */
  function renderTasks() {
    const F = STATE.filters;
    let tasks = S.getTasks().filter(t => {
      if (STATE.inboxFilter && t.project_id) return false;
      if (!STATE.inboxFilter && F.status !== 'all' && t.status !== F.status) return false;
      if (F.priority !== 'all' && t.priority !== F.priority) return false;
      if (F.tag !== 'all' && !(t.tags || []).includes(F.tag)) return false;
      if (F.due === 'overdue' && !(t.due_date && U.daysUntil(t.due_date) < 0)) return false;
      if (F.due === 'today' && !(t.due_date && U.daysUntil(t.due_date) === 0)) return false;
      if (F.due === 'week' && !(t.due_date && U.daysUntil(t.due_date) >= 0 && U.daysUntil(t.due_date) <= 7)) return false;
      if (F.due === 'none' && t.due_date) return false;
      if (F.search && !t.title.toLowerCase().includes(F.search.toLowerCase()) && !(t.description || '').toLowerCase().includes(F.search.toLowerCase())) return false;
      return true;
    });
    if (F.sort === 'due') tasks.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    else if (F.sort === 'priority') tasks.sort((a, b) => a.priority.localeCompare(b.priority));
    else if (F.sort === 'created') tasks.sort((a, b) => b.created_at - a.created_at);
    else if (F.sort === 'project') tasks.sort((a, b) => projectName(a.project_id).localeCompare(projectName(b.project_id)));

    const allTags = Array.from(new Set(S.getTasks().flatMap(t => t.tags || [])));
    const rows = tasks.length ? tasks.map(t => taskRow(t)).join('') : '<div class="empty">没有符合条件的任务</div>';

    return (STATE.inboxFilter ? '<div class="hero"><div><h2>收集箱</h2><div class="date">未归类的 ' + S.getInboxTasks().length + ' 条任务</div></div><div style="display:flex;gap:8px;"><button class="btn btn-sm" data-act="exitInbox">← 返回任务视图</button><button class="btn btn-sm btn-primary" data-act="newTask">＋ 新建</button></div></div>' : '') +
      '<div class="filters">' +
      '<div class="seg">' + [['all', '全部'], ['todo', '待办'], ['in_progress', '进行中'], ['blocked', '阻塞'], ['done', '已完成']]
      .map(([k, v]) => '<button class="' + (F.status === k && !STATE.inboxFilter ? 'active' : '') + '" data-f="status" data-v="' + k + '">' + v + '</button>').join('') + '</div>' +
      '<select data-f="priority"><option value="all">优先级：全部</option>' + ['P0', 'P1', 'P2', 'P3'].map(p => '<option ' + (F.priority === p ? 'selected' : '') + ' value="' + p + '">' + p + '</option>').join('') + '</select>' +
      '<select data-f="tag"><option value="all">标签：全部</option>' + allTags.map(t => '<option ' + (F.tag === t ? 'selected' : '') + ' value="' + t + '">' + t + '</option>').join('') + '</select>' +
      '<select data-f="due"><option value="all">截止：全部</option>' +
      [['overdue', '已逾期'], ['today', '今天到期'], ['week', '未来 7 天'], ['none', '无截止日期']].map(([k, v]) => '<option ' + (F.due === k ? 'selected' : '') + ' value="' + k + '">' + v + '</option>').join('') + '</select>' +
      '<select data-f="sort"><option value="due">排序：截止日期</option>' + [['priority', '优先级'], ['created', '创建时间'], ['project', '所属项目']].map(([k, v]) => '<option ' + (F.sort === k ? 'selected' : '') + ' value="' + k + '">' + v + '</option>').join('') + '</select>' +
      '<span class="grow" style="flex:1"></span><span class="muted">' + tasks.length + ' 条结果</span>' +
      '</div>' +
      (STATE.inboxFilter ? '' : '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button class="btn btn-sm btn-primary" data-act="newTask">＋ 新建任务</button></div>') +
      '<div class="card"><div>' + rows + '</div></div>';
  }
  function bindTasks() {
    const c = $('#content');
    $$('#content [data-f]').forEach(el => el.addEventListener('change', e => {
      const f = el.dataset.f, v = el.value;
      STATE.filters[f] = v;
      render();
    }));
    $$('#content [data-f="status"]').forEach(el => el.addEventListener('click', e => { STATE.filters.status = el.dataset.v; STATE.inboxFilter = false; render(); }));
    const exit = $('#content [data-act="exitInbox"]');
    if (exit) exit.addEventListener('click', () => { STATE.inboxFilter = false; render(); });
    const nt = $('#content [data-act="newTask"]');
    if (nt) nt.addEventListener('click', () => openTaskModal(null));
    $$('#content [data-act]').forEach(el => {
      el.addEventListener('click', e => {
        const item = el.closest('.task-item');
        if (!item) return;
        const id = item.dataset.task, act = el.dataset.act;
        if (act === 'toggle') toggleTask(id);
        else if (act === 'edit') openTaskModal(id);
        else if (act === 'del') confirmDeleteTask(id);
        else if (act === 'timer' || act === 'timer-pause') handleTimerToggle(id);
        else if (act === 'timer-stop') handleTimerStop(id);
      });
    });
  }

  /* ================= 看板 ================= */
  function renderBoard() {
    const projects = S.getProjects().filter(p => p.status !== 'archived');
    const sel = '<select id="boardProject" style="padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font-family:inherit;outline:none;">' +
      '<option value="all">全部项目</option>' + projects.map(p => '<option value="' + p.id + '" ' + (STATE.boardProject === p.id ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>';
    const tasks = S.getTasks().filter(t => STATE.boardProject === 'all' ? true : t.project_id === STATE.boardProject);
    const cols = [
      ['todo', '📥 待办'], ['in_progress', '⚡ 进行中'], ['blocked', '⛔ 阻塞'], ['done', '✅ 已完成']
    ];
    const colsHtml = cols.map(([st, label]) => {
      const items = tasks.filter(t => t.status === st).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
      return '<div class="board-col" data-col="' + st + '"><header>' + label + '<span class="cnt">' + items.length + '</span></header>' +
        '<div class="board-cards" data-dropcol="' + st + '">' +
        items.map(t => {
          const bInfo = t.status === 'blocked' && t.blocked_reason ? '<div class="small" style="color:var(--danger);">⚠ ' + esc(t.blocked_reason) + '</div>' : '';
          return '<div class="board-card" draggable="true" data-task="' + t.id + '" style="--proj-c:' + projectColor(t.project_id) + '">' +
            '<div class="bc-title">' + esc(t.title) + '</div>' +
            '<div class="bc-meta"><span class="tag ' + t.priority.toLowerCase() + '">' + t.priority + '</span>' +
            (t.due_date ? '<span class="small" style="color:var(--ink-3);">⏱ ' + U.fmtDate(t.due_date) + '</span>' : '') +
            (t.tags || []).slice(0, 2).map(tg => '<span class="tag tl">' + esc(tg) + '</span>').join('') + '</div>' + bInfo +
            '<div class="bc-meta"><span class="small" style="color:var(--ink-3);">' + esc(projectName(t.project_id)) + '</span></div>' +
            '<div class="bc-meta" style="justify-content:flex-end;">' + timerMiniBtn(t) + '</div>' +
            '</div>';
        }).join('') + '</div></div>';
    }).join('');

    return '<div class="hero"><div><h2>看板</h2><div class="date">拖拽卡片在列间流转状态 · 支持全部项目或单项目</div></div>' + sel + '</div>' +
      '<div class="board-wrap">' + colsHtml + '</div>';
  }
  function bindBoard() {
    $('#boardProject').addEventListener('change', e => { STATE.boardProject = e.target.value; render(); });
    // 卡片拖拽
    $$('#content .board-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        // 点击计时按钮不触发拖拽
        if (e.target.closest('[data-act="timer"]')) { e.preventDefault(); return; }
        STATE.dragTaskId = card.dataset.task;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.task);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        $$('.board-col').forEach(c => c.classList.remove('drop-hint'));
        STATE.dragTaskId = null;
      });
    });
    // 看板卡片计时按钮（stopPropagation 防拖拽）
    $$('#content .board-card [data-act="timer"]').forEach(btn => {
      btn.addEventListener('mousedown', e => e.stopPropagation());
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const c = btn.closest('.board-card');
        if (c) handleTimerToggle(c.dataset.task);
      });
    });
    $$('#content [data-dropcol]').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.closest('.board-col').classList.add('drop-hint'); });
      col.addEventListener('dragleave', () => col.closest('.board-col').classList.remove('drop-hint'));
      col.addEventListener('drop', e => {
        e.preventDefault();
        const colEl = col.closest('.board-col');
        colEl.classList.remove('drop-hint');
        const taskId = STATE.dragTaskId || e.dataTransfer.getData('text/plain');
        if (taskId) {
          const newStatus = col.dataset.dropcol;
          const t = S.getTask(taskId);
          if (t && t.status !== newStatus) {
            S.updateTaskStatus(taskId, newStatus);
            if (newStatus === 'blocked') {
              closeModal();
              openModal('<h3>阻塞任务</h3>', '<p class="small">为「' + esc(t.title) + '」填写阻塞原因：</p>' +
                '<div class="form-row" style="margin-top:8px;"><textarea id="blockReason" placeholder="例如：等待客户提供 API Key…"></textarea></div>' +
                '<div class="form-actions"><button class="btn" data-close>跳过</button><button class="btn btn-primary" data-act="okBlock">确定</button></div>');
              $('#modalBox [data-act="okBlock"]').addEventListener('click', () => {
                S.setTaskBlocked(taskId, $('#blockReason').value.trim());
                closeModal(); render(); toast('已标记阻塞', 'ok');
              });
            } else {
              toast('已移动至「' + STATUS_LABEL[newStatus] + '」', 'ok');
              render();
            }
          }
        }
      });
    });
  }

  /* ================= 统计图表辅助 (F14) ================= */
  // SVG 折线面积趋势图
  function trendChart(items, color, opts) {
    opts = opts || {};
    const W = 620, H = opts.height || 120, PAD = 8;
    const vals = items.map(it => it.value);
    const max = Math.max.apply(null, vals.concat([1]));
    const stepX = (W - PAD * 2) / Math.max(items.length - 1, 1);
    const pts = vals.map((v, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - (v / max) * (H - PAD * 2 - 10);
      return [x, y];
    });
    const line = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = PAD + ',' + (H - PAD) + ' ' + line + ' ' + (W - PAD) + ',' + (H - PAD);
    // 标签：首/中/尾
    const labelIdx = items.length > 14 ? [0, Math.floor(items.length / 2), items.length - 1] : [0, items.length - 1];
    const labels = labelIdx.map(i =>
      '<text x="' + (PAD + i * stepX) + '" y="' + (H - 2) + '" font-size="10" fill="var(--ink-3)" text-anchor="middle">' + esc(items[i].label) + '</text>').join('');
    const dots = pts.map((p, i) =>
      '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (vals[i] > 0 ? 2.5 : 0) + '" fill="' + color + '"/>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;" role="img">' +
      '<polygon points="' + area + '" fill="' + color + '" opacity=".12"/>' +
      '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + labels + '</svg>';
  }
  // conic-gradient 占比饼图
  function donutChart(items, total) {
    if (!total) return '<div class="empty" style="padding:20px;">该时间段暂无数据</div>';
    let acc = 0;
    const segs = items.map(it => {
      const from = acc / total * 360;
      acc += it.value;
      const to = acc / total * 360;
      return it.color + ' ' + from.toFixed(1) + 'deg ' + to.toFixed(1) + 'deg';
    });
    const legend = items.map(it =>
      '<div class="pie-legend"><span class="pie-dot" style="background:' + it.color + '"></span>' + esc(it.name) +
      '<span class="muted">' + U.fmtMinutes(it.value) + ' · ' + Math.round(it.value / total * 100) + '%</span></div>').join('');
    return '<div class="pie-wrap"><div class="donut" style="background:conic-gradient(' + segs.join(',') + ');"><div class="donut-hole"><b>' + U.fmtMinutes(total).replace(' 分钟', 'm').replace(' 小时', 'h') + '</b><span>总计</span></div></div><div class="pie-legend-wrap">' + legend + '</div></div>';
  }

  /* ================= 统计 ================= */
  function renderStats() {
    const range = STATE.statsRange;
    const w = S.statsRange(range);
    const rangeLabel = range === 'month' ? '近 30 天' : '近 7 天';
    const totalMins = w.timeByProject.reduce((a, x) => a + x.minutes, 0);
    const maxMins = Math.max(...w.timeByProject.map(x => x.minutes), 1);
    const trend = w.timeTrend.map(d => ({ label: d.label, value: d.minutes }));
    const dTrend = w.doneTrend.map(d => ({ label: d.label, value: d.count }));
    const maxD = Math.max(...dTrend.map(x => x.value), 1);
    const evMax = Math.max(...w.estimateVsActual.map(x => Math.max(x.estimate, x.actual)), 1);
    const pieTotal = w.timeByProject.reduce((a, x) => a + x.minutes, 0);
    const pieItems = w.timeByProject.map(x => ({ name: x.project.name, value: x.minutes, color: x.project.color }));
    return '<div class="hero"><div><h2>统计与周报</h2><div class="date">' + rangeLabel + '概览 · 时间趋势 / 完成趋势 / 投入占比 / 预估对比</div></div>' +
      '<button class="btn btn-primary" data-act="genReport">📄 生成周报</button></div>' +
      '<div class="seg" style="margin-bottom:14px;">' +
      [['week', '近 7 天'], ['month', '近 30 天']].map(([k, v]) =>
        '<button class="' + (range === k ? 'active' : '') + '" data-f="range" data-v="' + k + '">' + v + '</button>').join('') + '</div>' +
      '<div class="stat-cards">' +
      '<div class="stat-big"><b>' + w.doneCount + '</b><span>' + rangeLabel + '完成任务</span></div>' +
      '<div class="stat-big"><b>' + U.fmtMinutes(w.totalTime).replace(' 分钟', 'm').replace(' 小时', 'h') + '</b><span>' + rangeLabel + '投入</span></div>' +
      '<div class="stat-big"><b style="color:var(--danger);">' + w.blocked + '</b><span>阻塞</span></div>' +
      '<div class="stat-big"><b>' + U.fmtMinutes(w.totalEstimate).replace(' 分钟', 'm').replace(' 小时', 'h') + '</b><span>剩余预估</span></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
      '<div class="card"><h3>📈 时间投入趋势 <span class="muted small">(每日 ' + rangeLabel + ')</span></h3>' +
      (w.totalTime ? trendChart(trend, 'var(--accent)') + '<div class="muted" style="margin-top:6px;">合计 ' + U.fmtMinutes(w.totalTime) + '</div>'
        : '<div class="empty">该时间段暂无计时记录<br><span class="small">在任务上开始计时后这里会出现数据</span></div>') + '</div>' +
      '<div class="card"><h3>✅ 完成任务趋势 <span class="muted small">(每日)</span></h3>' +
      (w.doneCount ? '<div class="mini-bars">' + dTrend.map(d =>
        '<div class="mini-bar" title="' + d.label + '：' + d.value + ' 个"><i style="height:' + Math.max(3, Math.round(d.value / maxD * 100)) + '%;background:var(--ok);"></i><span>' + d.label + '</span></div>').join('') + '</div>'
        : '<div class="empty">该时间段暂无完成任务</div>') + '</div>' +
      '</div>' +
      '<div class="grid grid-2" style="margin-top:14px;">' +
      '<div class="card"><h3>🥧 项目投入占比 <span class="muted small">(' + rangeLabel + ')</span></h3>' +
      donutChart(pieItems, pieTotal) + '</div>' +
      '<div class="card"><h3>⚖ 预估 vs 实际 <span class="muted small">(累计)</span></h3>' +
      w.estimateVsActual.map(x => {
        const est = Math.round(x.estimate / evMax * 100), act = Math.round(x.actual / evMax * 100);
        return '<div class="bar-row"><span class="bar-label" style="color:' + x.project.color + ';">● ' + esc(x.project.name) + '</span>' +
          '<div class="bar-track-dup">' +
          '<i class="ev-est" style="width:' + est + '%;" title="预估 ' + U.fmtMinutes(x.estimate) + '"></i>' +
          '<i class="ev-act" style="width:' + act + '%;background:' + x.project.color + ';" title="实际 ' + U.fmtMinutes(x.actual) + '"></i></div>' +
          '<span class="bar-val">' + U.fmtMinutes(x.actual) + ' / ' + U.fmtMinutes(x.estimate) + '</span></div>';
      }).join('') + '</div>' +
      '</div>' +
      '<div class="grid grid-2" style="margin-top:14px;">' +
      '<div class="card"><h3>⏱ 各项目投入时间 <span class="muted small">(' + rangeLabel + ')</span></h3>' +
      (w.timeByProject.length ? w.timeByProject.map(x =>
        '<div class="bar-row"><span class="bar-label" style="color:' + x.project.color + ';">● ' + esc(x.project.name) + '</span>' +
        '<div class="bar-track"><i style="width:' + Math.round(x.minutes / maxMins * 100) + '%;background:' + x.project.color + '"></i></div>' +
        '<span class="bar-val">' + U.fmtMinutes(x.minutes) + '</span></div>').join('') +
        '<div class="muted" style="margin-top:8px;">合计 ' + U.fmtMinutes(totalMins) + '</div>'
        : '<div class="empty">该时间段暂无计时记录</div>') + '</div>' +
      '<div class="card"><h3>✅ 各项目完成情况 <span class="muted small">(累计)</span></h3>' +
      w.perProject.map(x =>
        '<div class="bar-row"><span class="bar-label">' + esc(x.project.name) + '</span>' +
        '<div class="bar-track"><i style="width:' + (x.total ? Math.round(x.done / x.total * 100) : 0) + '%;background:var(--ok);"></i></div>' +
        '<span class="bar-val">' + x.done + '/' + x.total + '</span></div>').join('') + '</div>' +
      '</div>';
  }

  function bindStats() {
    $$('#content [data-f="range"]').forEach(el => el.addEventListener('click', e => {
      STATE.statsRange = el.dataset.v;
      render();
    }));
    const btn = $('#content [data-act="genReport"]');
    if (btn) btn.addEventListener('click', () => {
      const md = generateWeeklyReport();
      downloadFile('周报-' + U.todayStr() + '.md', md, 'text/markdown');
      toast('周报已生成并下载', 'ok');
    });
  }
  function generateWeeklyReport() {
    const range = STATE.statsRange;
    const w = S.statsRange(range);
    const rangeLabel = range === 'month' ? '近 30 天' : '本周（近 7 天）';
    const totalMins = w.timeByProject.reduce((a, x) => a + x.minutes, 0);
    let md = '# 工作周报（' + rangeLabel + ' · ' + U.todayStr() + '）\n\n';
    md += '## 概览\n\n- 完成任务：' + w.doneCount + '\n- 投入时间：' + U.fmtMinutes(w.totalTime) + '\n- 当前进行中：' + w.inProgress + '\n- 当前阻塞：' + w.blocked + '\n- 剩余预估耗时：' + U.fmtMinutes(w.totalEstimate) + '\n\n';
    md += '## 各项目时间投入\n\n| 项目 | 投入时间 |\n|---|---|\n';
    if (w.timeByProject.length) w.timeByProject.forEach(x => { md += '| ' + x.project.name + ' | ' + U.fmtMinutes(x.minutes) + ' |\n'; });
    else md += '| （该时间段暂无计时） | — |\n';
    md += '| **合计** | **' + U.fmtMinutes(totalMins) + '** |\n\n';
    md += '## 各项目完成情况\n\n| 项目 | 完成 | 全部 |\n|---|---|---|\n';
    w.perProject.forEach(x => { md += '| ' + x.project.name + ' | ' + x.done + ' | ' + x.total + ' |\n'; });
    md += '\n## 未完成任务（自动带入下周）\n\n';
    const undone = S.getTasks().filter(t => t.status !== 'done');
    undone.forEach(t => { md += '- [ ] [' + t.priority + '] ' + t.title + (t.project_id ? '（' + projectName(t.project_id) + '）' : '（收集箱）') + '\n'; });
    return md;
  }

  /* ================= 设置 ================= */  function renderSettings() {
    const s = S.data.settings;
    const backups = S.getBackups();
    return '<div class="hero"><div><h2>设置</h2><div class="date">数据与备份 · 对应 PRD F18 / F19</div></div></div>' +
      '<div class="grid grid-2">' +
      '<div class="card"><h3>💾 数据</h3>' +
      '<div class="set-row"><div><div class="sr-label">导出数据</div><div class="sr-desc">全量导出为 JSON 或 Markdown 摘要</div></div>' +
      '<div style="display:flex;gap:8px;"><button class="btn btn-sm" data-act="exportJSON">JSON</button><button class="btn btn-sm" data-act="exportMD">Markdown</button></div></div>' +
      '<div class="set-row"><div><div class="sr-label">导入数据</div><div class="sr-desc">从 JSON 文件恢复（会覆盖当前数据）</div></div>' +
      '<button class="btn btn-sm" data-act="importJSON">选择文件</button><input type="file" id="importFile" accept=".json" hidden></div>' +
      '<div class="set-row"><div><div class="sr-label">恢复种子示例数据</div><div class="sr-desc">重置为演示数据（当前数据将被覆盖）</div></div>' +
      '<button class="btn btn-sm btn-danger" data-act="reset">重置</button></div>' +
      '</div>' +
      '<div class="card"><h3>🛟 自动备份 <span class="muted small">(每日一次 · 保留最近 ' + s.backupKeep + ' 份)</span></h3>' +
      '<div class="set-row"><div><div class="sr-label">手动备份</div><div class="sr-desc">立即生成一份备份记录</div></div>' +
      '<button class="btn btn-sm" data-act="backup">立即备份</button></div>' +
      (backups.length ? '<div style="margin-top:6px;max-height:220px;overflow-y:auto;">' + backups.slice().reverse().map(b =>
        '<div class="backup-item"><span>🗂</span><b>' + U.fmtDateTime(b.created_at) + '</b><span class="grow">' + esc(b.file_path) + '</span><span>' + U.fmtBackupSize(b.size) + '</span></div>').join('') + '</div>'
        : '<div class="empty" style="padding:20px;">暂无备份记录</div>') +
      '</div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px;"><h3>🤖 WorkBuddy 工作空间 <span class="muted small">(扫描含 workbench.json 对接文档的项目)</span></h3>' +
      (S.getWorkspaces().length ? S.getWorkspaces().map(ws =>
        '<div class="ws-card" style="flex-direction:column;align-items:stretch;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
        '<div><b>📁 ' + esc(ws.name) + '</b><div class="muted small" style="margin-top:2px;">' + esc(ws.path) + '</div></div>' +
        '<div style="display:flex;gap:8px;"><button class="btn btn-sm" data-act="scanWs" data-dir="' + esc(ws.path) + '">扫描</button>' +
        '<button class="btn btn-sm btn-danger" data-act="removeWs" data-id="' + ws.id + '">移除</button></div></div>' +
        '<div class="ws-integ" style="margin-top:8px;" data-wsdir="' + esc(ws.path) + '">' +
        '<div style="display:flex;align-items:center;gap:8px;"><span class="ws-integ-dot" data-dot></span>' +
        '<b data-title>检查集成状态…</b></div>' +
        '<div class="muted small" data-detail style="margin:4px 0 0 20px;"></div>' +
        '<div style="margin-top:8px;display:flex;gap:8px;">' +
        '<button class="btn btn-sm btn-primary" data-act="installWb" data-dir="' + esc(ws.path) + '" disabled>导入技能</button>' +
        '<button class="btn btn-sm" data-act="checkWb" data-dir="' + esc(ws.path) + '">重新检查</button></div></div>' +
        '</div>').join('')
        : '<div class="muted" style="margin:8px 0;">尚未添加工作空间。添加后应用会扫描其中的项目（需每个项目目录含 <code>workbench.json</code> 对接文档）。</div>') +
      '<div class="set-row" style="margin-top:8px;"><div><div class="sr-label">添加工作空间目录</div><div class="sr-desc">选择存放项目的根目录，自动导入集成技能并扫描其中的 workbench.json</div></div>' +
      '<button class="btn btn-sm btn-primary" data-act="addWs">＋ 添加</button></div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px;"><h3>⚙ 偏好</h3>' +
      '<div class="set-row"><div><div class="sr-label">截止日期提醒</div><div class="sr-desc">当天上午系统通知（P1 功能，原型为占位开关）</div></div>' +
      '<label class="switch-wrap"><input type="checkbox" id="setDue" ' + (s.remindDue ? 'checked' : '') + '><span>开</span></label></div>' +
      '<div class="set-row"><div><div class="sr-label">每日计划提醒</div><div class="sr-desc">默认 09:00 提醒生成今日计划</div></div>' +
      '<label class="switch-wrap"><input type="checkbox" id="setPlan" ' + (s.remindPlan ? 'checked' : '') + '><span>开</span></label></div>' +
      '</div>';
  }
  function bindSettings() {
    const c = $('#content');
    $$('#content [data-act]').forEach(el => el.addEventListener('click', () => {
      const act = el.dataset.act;
      if (act === 'exportJSON') { doExport('workbench-data-' + U.todayStr() + '.json', S.exportJSON(), 'application/json'); toast('已导出 JSON', 'ok'); }
      else if (act === 'exportMD') { doExport('workbench-report-' + U.todayStr() + '.md', exportMarkdown(), 'text/markdown'); toast('已导出 Markdown', 'ok'); }
      else if (act === 'importJSON') { doImport(); }
      else if (act === 'reset') { confirmReset(); }
      else if (act === 'backup') { const b = S.createBackup(); toast('备份已创建：' + b.file_path, 'ok'); render(); }
      else if (act === 'addWs') { openAddWorkspaceModal(); }
      else if (act === 'scanWs') { scanWorkspaceAndImport(el.dataset.dir, false); }
      else if (act === 'removeWs') {
        S.saveWorkspaces(S.getWorkspaces().filter(w => w.id !== el.dataset.id));
        toast('工作空间已移除', 'ok'); render();
      }
      else if (act === 'checkWb') { refreshWbInteg(el.dataset.dir); }
      else if (act === 'installWb') { installWbInteg(el.dataset.dir); }
    }));
    // 进入设置页时为每个工作空间自动检查集成状态
    $$('#content .ws-integ[data-wsdir]').forEach(el => refreshWbInteg(el.dataset.wsdir));
    $('#importFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          S.importJSON(ev.target.result);
          toast('导入成功', 'ok');
          render();
        } catch (err) { toast('导入失败：' + err.message, 'err'); }
      };
      reader.readAsText(f);
      e.target.value = '';
    });
    $('#setDue').addEventListener('change', e => { S.data.settings.remindDue = e.target.checked; S.save(); });
    $('#setPlan').addEventListener('change', e => { S.data.settings.remindPlan = e.target.checked; S.save(); });
  }

  // ============ WorkBuddy 工作空间（对接文档集成） ============
  // 添加工作空间：Tauri 走原生目录选择，浏览器回退 prompt
  async function openAddWorkspaceModal() {
    if (window.__TAURI__ && window.__TAURI__.dialog) {
      try {
        const { open } = window.__TAURI__.dialog;
        const path = await open({ directory: true, multiple: false, title: '选择工作空间根目录' });
        if (!path) return;
        addWorkspacePath(path);
      } catch (e) { toast('选择目录失败：' + e.message, 'err'); }
    } else {
      const path = prompt('输入工作空间根目录路径（含 workbench.json 对接文档的项目将被扫描）：');
      if (path) addWorkspacePath(path);
    }
  }
  function addWorkspacePath(path) {
    const list = S.getWorkspaces();
    if (list.some(w => w.path === path)) { toast('该目录已在工作空间中', 'err'); return; }
    list.push({ id: 'ws_' + Date.now().toString(36), path, name: path.split(/[\\/]/).pop() || '工作空间', added_at: Date.now() });
    S.saveWorkspaces(list);
    toast('已添加工作空间', 'ok');
    // 自动导入集成技能到工作空间（项目级 .workbuddy/skills），然后扫描
    S.installWbIntegration(path).then(r => {
      if (r && r.installed) toast('已导入集成技能到工作空间', 'ok');
      else if (r) toast('技能导入未完全成功', 'err');
    });
    scanWorkspaceAndImport(path, false);
  }
  // 扫描工作空间并导入（confirm 为 true 时扫描后直接全选导入，否则扫描后弹确认）
  async function scanWorkspaceAndImport(dir, autoImport) {
    const btn = $('#content [data-act="scanWs"][data-dir="' + esc(dir) + '"]');
    if (btn) { btn.disabled = true; btn.textContent = '扫描中…'; }
    const res = await S.scanWorkspace(dir);
    if (btn) { btn.disabled = false; btn.textContent = '扫描'; }
    if (!res) { toast('扫描失败（桌面端需在应用内使用）', 'err'); return; }
    const projects = res.projects || [];
    if (!projects.length) { toast('未找到含 workbench.json 的项目', 'err'); return; }
    if (autoImport) {
      projects.forEach(p => S.importFromWorkbench(p));
      toast('已导入 ' + projects.length + ' 个项目', 'ok'); render();
      return;
    }
    // 确认弹窗：多选导入
    openModal('<h3>扫描结果 · 发现 ' + projects.length + ' 个对接项目</h3>', '<div class="muted" style="margin-bottom:10px;">勾选要导入的项目（已导入的将更新）</div>' +
      '<div style="max-height:46vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">' + projects.map(p => {
        const existing = S.getProjects().find(x => x.source_dir === p.path);
        return '<label class="task-item" style="cursor:pointer;margin:0;"><input type="checkbox" class="ws-cand" value="' + esc(p.path) + '" checked style="width:16px;height:16px;accent-color:var(--accent);">' +
          '<div class="t-main"><div class="t-title">' + esc(p.name) + (existing ? ' <span class="tag st-active">已导入</span>' : ' <span class="tag tl">新增</span>') + '</div>' +
          '<div class="t-sub">' + (p.tech_stack ? esc(p.tech_stack) + ' · ' : '') + p.tasks_count + ' 个任务' + (p.desc ? ' · ' + esc(p.desc.slice(0, 40)) : '') + '</div></div></label>';
      }).join('') + '</div>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn btn-primary" data-act="confirmWsImport">导入选中</button></div>');
    $('#modalBox [data-act="confirmWsImport"]').addEventListener('click', () => {
      const checked = $$('.ws-cand:checked').map(i => i.value);
      if (!checked.length) { toast('请至少选择一个项目', 'err'); return; }
      projects.filter(p => checked.includes(p.path)).forEach(p => S.importFromWorkbench(p));
      closeModal();
      toast('已导入 ' + checked.length + ' 个项目', 'ok');
      render();
    });
  }

  // 刷新指定工作空间的 WorkBuddy 集成状态（项目级技能是否已导入）
  async function refreshWbInteg(dir) {
    const box = dir ? $('#content .ws-integ[data-wsdir="' + esc(dir) + '"]') : null;
    if (!box) return;
    const dot = box.querySelector('[data-dot]'), title = box.querySelector('[data-title]'), detail = box.querySelector('[data-detail]');
    const installBtn = box.querySelector('[data-act="installWb"]');
    const st = await S.checkWbIntegration(dir);
    if (!st) { // 浏览器模式或无响应
      title.textContent = '集成状态：浏览器模式不可用';
      if (dot) dot.className = 'ws-integ-dot warn';
      if (detail) detail.textContent = '在桌面端应用内使用技能导入功能';
      if (installBtn) installBtn.disabled = true;
      return;
    }
    if (st.installed) {
      title.textContent = '✅ 集成技能已导入';
      if (dot) dot.className = 'ws-integ-dot ok';
      if (detail) detail.textContent = '.workbuddy/skills/workbench-json-sync 已就绪，AI 对话可自动同步项目任务';
      if (installBtn) { installBtn.disabled = false; installBtn.textContent = '更新技能'; }
    } else {
      title.textContent = '⚠ 未导入集成技能';
      if (dot) dot.className = 'ws-integ-dot warn';
      if (detail) detail.textContent = '导入后 WorkBuddy 可维护此工作空间下各项目的 workbench.json（只写本项目级，不影响全局）';
      if (installBtn) { installBtn.disabled = false; installBtn.textContent = '导入技能'; }
    }
  }
  // 导入 WorkBuddy 集成技能到指定工作空间（项目级）
  async function installWbInteg(dir) {
    const box = dir ? $('#content .ws-integ[data-wsdir="' + esc(dir) + '"]') : null;
    if (!box) return;
    const btn = box.querySelector('[data-act="installWb"]');
    if (btn) { btn.disabled = true; btn.textContent = '导入中…'; }
    const r = await S.installWbIntegration(dir);
    if (btn) { btn.disabled = false; btn.textContent = '更新技能'; }
    if (!r) { toast('导入失败（需桌面端）', 'err'); return; }
    toast(r.installed ? '集成技能已导入工作空间' : '导入未完全成功', r.installed ? 'ok' : 'err');
    refreshWbInteg(dir);
  }

  // 导出：Tauri 环境走原生保存对话框，浏览器回退为下载
  async function doExport(defaultName, content, mime) {    if (window.__TAURI__ && window.__TAURI__.dialog) {
      try {
        const { save } = window.__TAURI__.dialog;
        const { writeTextFile } = window.__TAURI__.fs;
        const path = await save({ defaultPath: defaultName, filters: [{ name: '导出文件', extensions: [defaultName.split('.').pop()] }] });
        if (path) { await writeTextFile(path, content); toast('已保存到 ' + path, 'ok'); }
      } catch (e) { toast('导出失败：' + e.message, 'err'); }
    } else {
      downloadFile(defaultName, content, mime);
    }
  }

  // 导入：Tauri 环境走原生打开对话框，浏览器回退为 file input
  async function doImport() {
    if (window.__TAURI__ && window.__TAURI__.dialog) {
      try {
        const { open } = window.__TAURI__.dialog;
        const { readTextFile } = window.__TAURI__.fs;
        const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!path) return;
        const text = await readTextFile(path);
        S.importJSON(text);
        toast('导入成功', 'ok');
        render();
      } catch (e) { toast('导入失败：' + e.message, 'err'); }
    } else {
      $('#importFile').click();
    }
  }
  function confirmReset() {
    openModal('<h3>重置数据</h3>', '<p style="color:var(--danger);">⚠ 将清空当前所有数据并恢复示例数据，不可撤销。建议先导出备份。</p>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn btn-danger" data-act="ok">确认重置</button></div>');
    $('#modalBox [data-act="ok"]').addEventListener('click', () => { S.reset(); closeModal(); toast('已重置为示例数据', 'ok'); render(); });
  }
  function exportMarkdown() {
    let md = '# 并行工作台 · 数据摘要\n\n生成时间：' + new Date().toLocaleString() + '\n\n';
    S.getProjects().forEach(p => {
      md += '## ' + p.name + ' (' + ({ active: '进行中', paused: '暂停', archived: '归档' }[p.status]) + ')\n\n';
      md += '- 技术栈：' + (p.tech_stack || '—') + '\n- 本地路径：' + (p.local_path || '—') + '\n- 端口：' + (p.ports || '—') + '\n\n';
      const tasks = S.getProjectTasks(p.id);
      if (tasks.length) {
        md += '### 任务\n\n| 标题 | 状态 | 优先级 | 截止 |\n|---|---|---|---|\n';
        tasks.forEach(t => md += '| ' + t.title + ' | ' + STATUS_LABEL[t.status] + ' | ' + t.priority + ' | ' + U.fmtDate(t.due_date) + ' |\n');
      }
      md += '\n';
    });
    const inbox = S.getInboxTasks();
    if (inbox.length) {
      md += '## 收集箱\n\n';
      inbox.forEach(t => md += '- [ ] ' + t.title + ' (' + t.priority + ')\n');
    }
    return md;
  }
  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  /* ================= 模态框 ================= */
  function openModal(titleHtml, bodyHtml) {
    $('#modalBox').innerHTML = '<div class="modal-head">' + titleHtml + '<button class="icon-btn" data-close style="font-size:16px;">✕</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div>';
    $('#modalMask').hidden = false;
    $$('#modalBox [data-close]').forEach(b => b.addEventListener('click', closeModal));
    $('#modalMask').onmousedown = e => { if (e.target === $('#modalMask')) closeModal(); };
    const first = $('#modalBox input, #modalBox textarea');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() { $('#modalMask').hidden = true; $('#modalBox').innerHTML = ''; }

  function openTaskModal(taskId, presetProjectId) {
    const t = taskId ? S.getTask(taskId) : null;
    const isNew = !t;
    const projects = S.getProjects().filter(p => p.status !== 'archived');
    const projOpts = '<option value="">收集箱（不归入项目）</option>' +
      projects.map(p => '<option value="' + p.id + '" ' + ((t && t.project_id === p.id) || (!t && presetProjectId === p.id) ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('');
    const pSel = { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' };
    const prioChips = Object.keys(pSel).map(p => '<button type="button" class="chip ' + ((t ? t.priority : 'P2') === p ? 'active' : '') + '" data-prio="' + p + '">' + p + '</button>').join('');
    const stSel = ['todo', 'in_progress', 'blocked', 'done'].map(st =>
      '<option value="' + st + '" ' + (t && t.status === st ? 'selected' : '') + '>' + STATUS_LABEL[st] + '</option>').join('');
    const tagVal = t && t.tags ? t.tags.join(', ') : '';
    openModal('<h3>' + (isNew ? '新建任务' : '编辑任务') + '</h3>',
      '<div class="form-row"><label>标题 <span style="color:var(--danger);">*</span></label><input id="fTitle" value="' + esc(t ? t.title : '') + '" placeholder="要做什么？" data-save></div>' +
      '<div class="form-grid">' +
      '<div class="form-row"><label>所属项目</label><select id="fProject" data-save>' + projOpts + '</select></div>' +
      '<div class="form-row"><label>状态</label><select id="fStatus" data-save>' + stSel + '</select></div>' +
      '<div class="form-row"><label>优先级</label><div class="chip-row" id="prioRow">' + prioChips + '</div><input type="hidden" id="fPriority" value="' + (t ? t.priority : 'P2') + '"></div>' +
      '<div class="form-row"><label>截止日期</label><input type="date" id="fDue" value="' + (t && t.due_date ? t.due_date : '') + '" data-save></div>' +
      '<div class="form-row"><label>预估耗时（分钟）</label><input type="number" id="fEst" min="0" step="5" value="' + (t ? t.estimate_min || '' : '') + '" placeholder="如 120" data-save></div>' +
      '<div class="form-row"><label>标签（逗号分隔）</label><input id="fTags" value="' + esc(tagVal) + '" placeholder="如 前端, 客户" data-save></div>' +
      '</div>' +
      '<div class="form-row"><label>描述 / 上下文备注</label><textarea id="fDesc" placeholder="记录背景、卡点、下一步…" data-save>' + esc(t ? t.context_note : '') + '</textarea></div>' +
      (t && t.status === 'blocked' ? '<div class="form-row"><label>阻塞原因</label><input id="fBlock" value="' + esc(t.blocked_reason) + '" data-save></div>' : '') +
      '<div class="form-hint">快捷键：Enter 保存 · Esc 取消 · 任务仅标题为必填</div>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn btn-primary" data-act="save">保存</button></div>');
    $$('#prioRow .chip').forEach(ch => ch.addEventListener('click', () => {
      $$('#prioRow .chip').forEach(x => x.classList.remove('active'));
      ch.classList.add('active');
      $('#fPriority').value = ch.dataset.prio;
    }));
    $('#modalBox [data-act="save"]').addEventListener('click', () => saveTaskFromModal(taskId));
    $('#modalBox').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); saveTaskFromModal(taskId); }
    });
  }
  function saveTaskFromModal(taskId) {
    const title = $('#fTitle').value.trim();
    if (!title) { toast('任务标题不能为空', 'err'); $('#fTitle').focus(); return; }
    const t = taskId ? S.getTask(taskId) : {
      id: U.uid(), title: '', description: '', project_id: null, status: 'todo', priority: 'P2',
      due_date: null, estimate_min: 60, actual_min: 0, tags: [], context_note: '',
      blocked_reason: '', created_at: Date.now(), updated_at: Date.now(), completed_at: null
    };
    t.title = title;
    t.project_id = $('#fProject').value || null;
    t.status = $('#fStatus').value;
    t.priority = $('#fPriority').value;
    t.due_date = $('#fDue').value || null;
    t.estimate_min = $('#fEst').value ? parseInt($('#fEst').value) : null;
    t.tags = $('#fTags').value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
    t.context_note = $('#fDesc').value.trim();
    if (t.status === 'blocked') t.blocked_reason = $('#fBlock') ? $('#fBlock').value.trim() : t.blocked_reason;
    if (t.status !== 'blocked') t.blocked_reason = '';
    if (t.status === 'done' && !t.completed_at) t.completed_at = Date.now();
    if (t.status !== 'done') t.completed_at = null;
    S.saveTask(t);
    S.touchProject(t.project_id);
    if (t.project_id) S.saveSnapshot(t.project_id, null, t.id);
    closeModal();
    toast(taskId ? '任务已更新' : '任务已创建', 'ok');
    render();
  }

  function openProjectModal(projectId) {
    const p = projectId ? S.getProject(projectId) : null;
    const isNew = !p;
    openModal('<h3>' + (isNew ? '新建项目' : '编辑项目档案') + '</h3>',
      '<div class="form-row"><label>名称 <span style="color:var(--danger);">*</span></label><input id="fpName" value="' + esc(p ? p.name : '') + '" placeholder="项目名称"></div>' +
      '<div class="form-row"><label>描述</label><textarea id="fpDesc" placeholder="项目一句话说明">' + esc(p ? p.description : '') + '</textarea></div>' +
      '<div class="form-grid">' +
      '<div class="form-row"><label>技术栈</label><input id="fpStack" value="' + esc(p ? p.tech_stack : '') + '" placeholder="如 Vue3 + Vite"></div>' +
      '<div class="form-row"><label>状态</label><select id="fpStatus">' +
      [['active', '进行中'], ['paused', '暂停'], ['archived', '归档']].map(([k, v]) => '<option value="' + k + '" ' + (p && p.status === k ? 'selected' : '') + '>' + v + '</option>').join('') + '</select></div>' +
      '<div class="form-row"><label>代码仓库地址</label><input id="fpRepo" value="' + esc(p ? p.repo_url : '') + '" placeholder="github.com/user/repo"></div>' +
      '<div class="form-row"><label>本地路径</label><input id="fpPath" value="' + esc(p ? p.local_path : '') + '" placeholder="~/code/xxx"></div>' +
      '<div class="form-row"><label>端口</label><input id="fpPorts" value="' + esc(p ? p.ports : '') + '" placeholder="如 3000 (dev)"></div>' +
      '<div class="form-row"><label>部署地址</label><input id="fpDeploy" value="' + esc(p ? p.deploy_url : '') + '" placeholder="https://…"></div>' +
      '<div class="form-row"><label>文档链接</label><input id="fpDocs" value="' + esc(p ? p.docs_link : '') + '" placeholder="https://…"></div>' +
      '<div class="form-row"><label>环境变量备注</label><input id="fpEnv" value="' + esc(p ? p.env_notes : '') + '" placeholder=".env 关键项说明"></div>' +
      '</div>' +
      '<div class="form-row"><label>主题色</label><div class="color-pick" id="colorPick">' +
      S.COLORS.map(c => '<button type="button" class="color-dot ' + ((p && p.color === c) || (!p && c === S.COLORS[0]) ? 'active' : '') + '" style="background:' + c + '" data-color="' + c + '"></button>').join('') +
      '</div><input type="hidden" id="fpColor" value="' + (p ? p.color : S.COLORS[0]) + '"></div>' +
      '<div class="form-actions"><button class="btn" data-close>取消</button><button class="btn btn-primary" data-act="save">保存</button></div>');
    $$('#colorPick .color-dot').forEach(d => d.addEventListener('click', () => {
      $$('#colorPick .color-dot').forEach(x => x.classList.remove('active'));
      d.classList.add('active');
      $('#fpColor').value = d.dataset.color;
    }));
    $('#modalBox [data-act="save"]').addEventListener('click', () => saveProjectFromModal(projectId));
  }
  function saveProjectFromModal(projectId) {
    const name = $('#fpName').value.trim();
    if (!name) { toast('项目名称不能为空', 'err'); $('#fpName').focus(); return; }
    const p = projectId ? S.getProject(projectId) : { id: U.uid(), created_at: Date.now() };
    p.name = name;
    p.description = $('#fpDesc').value.trim();
    p.tech_stack = $('#fpStack').value.trim();
    p.status = $('#fpStatus').value;
    p.repo_url = $('#fpRepo').value.trim();
    p.local_path = $('#fpPath').value.trim();
    p.ports = $('#fpPorts').value.trim();
    p.deploy_url = $('#fpDeploy').value.trim();
    p.docs_link = $('#fpDocs').value.trim();
    p.env_notes = $('#fpEnv').value.trim();
    p.color = $('#fpColor').value;
    S.saveProject(p);
    closeModal();
    toast(projectId ? '项目档案已更新' : '项目已创建', 'ok');
    if (!projectId) switchView('projects', p.id); else render();
  }

  /* ================= 今日计划拖拽排序 ================= */
  function initDragSort(listId) {
    const list = document.getElementById(listId);
    if (!list) return;
    let dragEl = null;
    list.addEventListener('dragstart', e => {
      const item = e.target.closest('.task-item');
      if (!item) return;
      // 点击操作区按钮不触发拖拽
      if (e.target.closest('.t-actions')) { e.preventDefault(); return; }
      dragEl = item;
      item.style.opacity = '.4';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.task);
    });
    list.addEventListener('dragend', e => {
      const item = e.target.closest('.task-item');
      if (item) item.style.opacity = '';
      dragEl = null;
    });
    list.addEventListener('dragover', e => {
      e.preventDefault();
      const item = e.target.closest('.task-item');
      if (item && item !== dragEl) {
        const r = item.getBoundingClientRect();
        const after = (e.clientY - r.top) > r.height / 2;
        list.insertBefore(dragEl, after ? item.nextSibling : item);
      }
    });
    list.addEventListener('drop', e => {
      e.preventDefault();
      const order = $$('#' + listId + ' .task-item').map(el => el.dataset.task);
      const plan = S.getTodayPlan();
      plan.task_order = order;
      S.savePlan(plan);
      toast('已重新排序', 'ok');
    });
  }

  /* ================= 全局搜索 & 快捷键 ================= */
  function initGlobalSearch() {
    const input = $('#globalSearch');
    input.addEventListener('input', e => {
      STATE.filters.search = e.target.value;
      if (STATE.view === 'tasks') { render(); }
      else if (STATE.view === 'projects') { projSearch = e.target.value; render(); }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && STATE.filters.search) {
        STATE.filters.search = e.target.value;
        STATE.inboxFilter = false;
        switchView('tasks');
      }
    });
  }

  function initShortcuts() {
    document.addEventListener('keydown', e => {
      const modalOpen = !$('#modalMask').hidden;
      if (e.key === 'Escape' && modalOpen) { closeModal(); return; }
      if (modalOpen) return;
      // Ctrl+1..6 切换视图
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        const views = ['home', 'projects', 'tasks', 'board', 'stats', 'settings'];
        switchView(views[parseInt(e.key) - 1]);
        return;
      }
      // N 新建任务
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        if (STATE.view === 'projects' && STATE.projectId) openTaskModal(null, STATE.projectId);
        else openTaskModal(null);
      }
      // S 快速打开设置
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        switchView('settings');
      }
    });
  }

  function initTheme() {
    const s = S.data.settings;
    if (s.dark) document.body.classList.add('dark');
    $('#btnToggleDark').addEventListener('click', () => {
      document.body.classList.toggle('dark');
      S.data.settings.dark = document.body.classList.contains('dark');
      S.save();
    });
  }

  /* ================= 计时器实时刷新 ================= */
  function updateTimerChip() {
    const chip = $('#timerChip');
    if (!chip) return;
    const tm = S.getTimer();
    if (!tm) { chip.hidden = true; return; }
    const t = S.getTask(tm.task_id);
    if (!t) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.querySelector('.timer-chip-time').textContent = S.formatTimerMs(S.timerElapsedMs());
    chip.querySelector('.timer-chip-title').textContent = (tm.running ? '● ' : '‖ ') + t.title;
    chip.classList.toggle('paused', !tm.running);
  }
  function tickTimers() {
    const tm = S.getTimer();
    if (!tm) return;
    const txt = S.formatTimerMs(S.timerElapsedMs());
    $$('.timer-tick').forEach(el => { el.textContent = txt; });
    updateTimerChip();
  }

  /* ================= 启动 ================= */
  function init() {
    S.load();
    S.onExternalLoad = function () {
      // Tauri 文件加载完成后重渲染，避免种子数据闪现
      render();
      if (STATE.view === 'settings') render();
    };
    initTheme();
    initShortcuts();
    initGlobalSearch();
    $$('#nav .nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('#btnQuickNew').addEventListener('click', () => {
      if (STATE.view === 'projects' && STATE.projectId) openTaskModal(null, STATE.projectId);
      else openTaskModal(null);
    });
    // 顶栏计时 chip：点击跳转到计时任务所在视图
    const chip = $('#timerChip');
    if (chip) chip.addEventListener('click', () => {
      const tm = S.getTimer();
      if (!tm) return;
      const t = S.getTask(tm.task_id);
      if (!t) return;
      if (t.project_id) switchView('projects', t.project_id);
      else switchView('tasks');
    });
    // 秒级刷新计时显示
    setInterval(tickTimers, 1000);
    updateTimerChip();
    // 绑定全局任务行（在 render 后由各视图 bind 负责；此处兜底）
    switchView('home');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
