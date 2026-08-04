/* ============================================================
 * 并行工作台 · 数据层 (store.js)
 * 对应 PRD §9 数据模型：Project / Task / Plan / TimeEntry /
 * ContextSnapshot / Backup。localStorage 持久化，接口对齐
 * Tauri 后可直接替换为 Rust/SQLite 实现。
 * ============================================================ */
(function (global) {
  'use strict';

  const LS_KEY = 'parallel-workbench-v1';
  const COLORS = ['#3b5bdb', '#e8590c', '#2f9e44', '#e03131', '#7048e8', '#0c8599', '#f08c00', '#5c7cfa'];
  const STALE_TIMER_MS = 12 * 3600 * 1000; // 计时超过 12h 视为陈旧（应用曾被关闭）

  /* ---------- 工具函数 ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function todayStr(d) {
    const x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  function addDays(base, n) {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const t = new Date(todayStr());
    const d = new Date(dateStr);
    t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function fmtMinutes(m) {
    if (m == null) return '—';
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60), min = m % 60;
    return min ? h + ' 小时 ' + min + ' 分' : h + ' 小时';
  }

  function fmtBackupSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /* ---------- 种子数据 ---------- */
  // 精简版：单个示例项目，引导用户理解产品用法
  function seed() {
    const now = Date.now();
    const p1 = { id: uid(), name: '示例项目：客户官网改版', description: '这是引导示例：一个进行中的客户项目，含技术栈、代码仓库、本地路径与端口信息。你可以点开项目看详情、加任务，或新建自己的项目。',
      status: 'active', tech_stack: 'Next.js + Tailwind + Vercel', repo_url: 'github.com/qifan/site-v3',
      local_path: '~/code/qifan-site', ports: '3000 (dev) / 443 (prod)', env_notes: '.env.local：DATABASE_URL、SENDGRID_API_KEY',
      docs_link: 'https://docs.google.com/drawings/...', deploy_url: 'https://www.qifan-tech.com',
      color: COLORS[0], created_at: now - 86400000 * 20, updated_at: now - 3600000 * 2 };

    const mk = (p, title, extra) => {
      const t = Object.assign({
        id: uid(), project_id: p ? p.id : null, title, description: '',
        status: 'todo', priority: 'P2', due_date: null, estimate_min: 60,
        actual_min: 0, tags: [], context_note: '', blocked_reason: '',
        created_at: now, updated_at: now, completed_at: null
      }, extra || {});
      return t;
    };

    // 4 个任务覆盖 4 种状态，便于演示看板与健康度
    const tasks = [
      mk(p1, '完成首页 Hero 区块响应式', { status: 'in_progress', priority: 'P0', due_date: todayStr(), estimate_min: 120, actual_min: 45, tags: ['前端', '客户'], context_note: '视觉稿见 Figma v3' }),
      mk(p1, '产品页接入 CMS 数据', { status: 'todo', priority: 'P1', due_date: todayStr(addDays(new Date(), 2)), estimate_min: 180, tags: ['前端', 'CMS'] }),
      mk(p1, '联系表单接入 SendGrid', { status: 'blocked', priority: 'P0', due_date: todayStr(addDays(new Date(), 3)), estimate_min: 90, tags: ['后端'], blocked_reason: '等客户提供 API Key' }),
      mk(p1, '验收走查：全站链接与 404', { status: 'done', priority: 'P2', due_date: todayStr(addDays(new Date(), -1)), estimate_min: 60, actual_min: 55, tags: ['QA'], completed_at: now - 3600000 * 24 }),
    ];

    // 收集箱：1 个未归类任务，演示收集箱用法
    const inbox = [
      mk(null, '调研「本地优先同步」方案（CRDT vs OT）', { priority: 'P1', due_date: todayStr(addDays(new Date(), 7)), estimate_min: 180, tags: ['调研'], context_note: '给后续产品迭代做技术储备' }),
    ];

    // 今日计划：预置 2 个进行中的任务
    const planTaskIds = [tasks[0].id, tasks[1].id];
    const plan = { id: uid(), date: todayStr(), task_order: planTaskIds, daily_note: '' };

    // 上下文快照
    const snapshots = {
      [p1.id]: { id: uid(), project_id: p1.id, last_task_id: tasks[0].id, work_note: '首页 Hero 响应式基本完成，剩余 768px 断点的导航折叠未调。', last_active_at: now - 3600000 * 2 },
    };

    // 时间记录
    const timeEntries = [
      { id: uid(), task_id: tasks[0].id, start_at: now - 86400000, end_at: now - 86400000 + 2700000, minutes: 45, note: 'Hero 区块初版' },
      { id: uid(), task_id: tasks[3].id, start_at: now - 3600000 * 24, end_at: now - 3600000 * 24 + 3300000, minutes: 55, note: '全站链接走查' },
    ];

    return {
      projects: [p1],
      tasks: tasks.concat(inbox),
      plans: { [plan.date]: plan },
      timeEntries,
      snapshots,
      backups: [],
      timer: null,
      workspaces: [],
      settings: { dark: false, remindDue: true, remindPlan: true, remindTime: '09:00', backupKeep: 7 }
    };
  }

  /* ---------- Store 主体 ---------- */
  /* ---------- Tauri 桥接（桌面端） ---------- */
  // 检测是否运行在 Tauri WebView 中
  function isTauri() {
    return !!(window.__TAURI__ && window.__TAURI__.core);
  }
  // 从 Rust 侧读取文件数据（启动时调用，文件为最终权威）
  async function tauriLoadData() {
    if (!isTauri()) return null;
    try {
      const data = await window.__TAURI__.core.invoke('load_data');
      return data && data.projects ? data : null;
    } catch (e) { console.warn('[Tauri] load_data 失败:', e); return null; }
  }
  // 写数据到 Rust 侧文件
  function tauriSaveData(data) {
    if (!isTauri()) return;
    window.__TAURI__.core.invoke('save_data', { json: data }).catch(e => console.warn('[Tauri] save_data 失败:', e));
  }
  // 打开本地目录/文件（F16）
  async function tauriOpenPath(path) {
    if (!isTauri()) throw new Error('浏览器模式不支持打开本地目录');
    await window.__TAURI__.core.invoke('open_path', { path });
  }
  // 扫描工作空间根目录，查找含 workbench.json 对接文档的项目（WorkBuddy 集成）
  async function tauriScanWorkbench(dir) {
    if (!isTauri()) return null;
    try {
      return await window.__TAURI__.core.invoke('scan_workbench_files', { dir });
    } catch (e) { console.warn('[Tauri] scan_workbench_files 失败:', e); return null; }
  }

  const Store = {
    data: null,
    COLORS,
    onExternalLoad: null,   // Tauri 异步加载完成后回调（用于重渲染）

    load() {
      let loadedFromLS = false;
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) { this.data = JSON.parse(raw); loadedFromLS = true; }
      } catch (e) { console.warn('读取本地缓存失败，重置为种子数据', e); }
      if (!this.data) { this.data = seed(); this.save(); }
      else if (this._normalizeTimer()) this.save();
      // Tauri：异步从文件加载，文件优先（桌面端数据权威来源）
      if (isTauri()) {
        tauriLoadData().then(d => {
          if (d) {
            this.data = d;
            if (this._normalizeTimer()) this.save();
            try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch (e) {}
            if (this.onExternalLoad) this.onExternalLoad();
          } else if (!loadedFromLS) {
            // 首次启动且无文件 → 把种子数据写入文件
            tauriSaveData(this.data);
          }
        }).catch(e => console.warn('[Tauri] 文件加载失败:', e));
      }
    },
    save() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch (e) {}
      tauriSaveData(this.data);
    },
    reset() {
      this.data = seed();
      this.save();
    },
    exportJSON() { return JSON.stringify(this.data, null, 2); },
    importJSON(text) {
      const d = JSON.parse(text);
      if (!d || !Array.isArray(d.projects) || !Array.isArray(d.tasks)) throw new Error('文件格式不正确');
      if (!Array.isArray(d.workspaces)) d.workspaces = [];
      this.data = d;
      this._normalizeTimer();
      this.save();
    },
    /* 打开本地路径（F16 桌面能力） */
    openLocalPath(path) { return tauriOpenPath(path); },
    /* 扫描工作空间（WorkBuddy 集成：读 workbench.json 对接文档） */
    scanWorkspace(dir) { return tauriScanWorkbench(dir); },
    getWorkspaces() { return Array.isArray(this.data.workspaces) ? this.data.workspaces : []; },
    saveWorkspaces(list) { this.data.workspaces = list; this.save(); },
    // 按对接文档导入项目+任务（doc 来自 scan_workbench_files 返回的候选）
    importFromWorkbench(candidate) {
      const doc = candidate.doc || {};
      const pj = doc.project || {};
      const dir = candidate.path;
      let proj = this.data.projects.find(p => p.source_dir === dir);
      if (!proj) {
        proj = {
          id: uid(), name: candidate.name, description: candidate.desc || '来自 WorkBuddy 对接文档',
          status: pj.status === 'paused' || pj.status === 'archived' ? pj.status : 'active',
          tech_stack: candidate.tech_stack || '', repo_url: pj.repo_url || '',
          local_path: dir, ports: '', env_notes: '',
          docs_link: '', deploy_url: '', color: COLORS[4],
          source_dir: dir, workspace: true,
          created_at: Date.now(), updated_at: Date.now()
        };
        this.data.projects.push(proj);
      } else {
        // 已存在：同步技术栈/描述/状态（不覆盖用户改过的 name）
        proj.tech_stack = candidate.tech_stack || proj.tech_stack;
        proj.description = candidate.desc || proj.description;
        if (pj.status && pj.status !== 'active') proj.status = pj.status;
        proj.local_path = dir;
        proj.updated_at = Date.now();
      }
      // 导入任务（对接文档为权威，标题相同的更新，不删除应用内已有任务）
      const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
      tasks.forEach(tt => {
        const title = tt.title || '';
        if (!title) return;
        let t = this.data.tasks.find(x => x.project_id === proj.id && x.title === title);
        const st = tt.status === 'in_progress' || tt.status === 'blocked' || tt.status === 'done' || tt.status === 'todo' ? tt.status : 'todo';
        if (!t) {
          t = { id: uid(), project_id: proj.id, title, description: tt.note || '', status: st, priority: tt.priority || 'P2',
            due_date: tt.due_date || null, estimate_min: tt.estimate_min || 60, actual_min: 0, tags: tt.tags || [],
            context_note: '', blocked_reason: '', created_at: Date.now(), updated_at: Date.now(), completed_at: st === 'done' ? Date.now() : null };
          this.data.tasks.push(t);
        } else {
          t.status = st; t.priority = tt.priority || t.priority;
          if (tt.due_date != null) t.due_date = tt.due_date;
          if (tt.estimate_min != null) t.estimate_min = tt.estimate_min;
          if (tt.tags) t.tags = tt.tags;
          if (tt.note) t.description = tt.note;
          t.completed_at = st === 'done' ? (t.completed_at || Date.now()) : null;
          t.updated_at = Date.now();
        }
      });
      this.save();
      return proj;
    },

    /* ----- Project ----- */
    getProjects() { return this.data.projects; },
    getActiveProjects() { return this.data.projects.filter(p => p.status === 'active'); },
    getProject(id) { return this.data.projects.find(p => p.id === id) || null; },
    saveProject(p) {
      const i = this.data.projects.findIndex(x => x.id === p.id);
      p.updated_at = Date.now();
      if (i >= 0) this.data.projects[i] = p; else this.data.projects.push(p);
      this.save();
    },
    deleteProject(id) {
      this.data.projects = this.data.projects.filter(p => p.id !== id);
      this.data.tasks.forEach(t => { if (t.project_id === id) t.project_id = null; });
      delete this.data.snapshots[id];
      this.save();
    },

    /* ----- Task ----- */
    getTasks() { return this.data.tasks; },
    getTask(id) { return this.data.tasks.find(t => t.id === id) || null; },
    getProjectTasks(projectId) { return this.data.tasks.filter(t => t.project_id === projectId); },
    getInboxTasks() { return this.data.tasks.filter(t => !t.project_id); },
    saveTask(t) {
      const i = this.data.tasks.findIndex(x => x.id === t.id);
      t.updated_at = Date.now();
      if (i >= 0) this.data.tasks[i] = t; else this.data.tasks.push(t);
      // 保存为 done 且该任务在计时 → 自动结算
      if (t.status === 'done' && this.data.timer && this.data.timer.task_id === t.id) this.settleTimer();
      this.save();
    },
    deleteTask(id) {
      this.data.tasks = this.data.tasks.filter(t => t.id !== id);
      Object.keys(this.data.plans).forEach(k => {
        this.data.plans[k].task_order = this.data.plans[k].task_order.filter(x => x !== id);
      });
      this.data.timeEntries = this.data.timeEntries.filter(e => e.task_id !== id);
      if (this.data.timer && this.data.timer.task_id === id) this.data.timer = null;
      this.save();
    },
    updateTaskStatus(id, status) {
      const t = this.getTask(id);
      if (!t) return;
      t.status = status;
      if (status === 'done') t.completed_at = t.completed_at || Date.now();
      if (status !== 'done') t.completed_at = null;
      if (status !== 'blocked') t.blocked_reason = '';
      t.updated_at = Date.now();
      // 标记完成且该任务在计时 → 自动结算
      if (status === 'done' && this.data.timer && this.data.timer.task_id === id) this.settleTimer();
      this.save();
    },
    setTaskBlocked(id, reason) {
      const t = this.getTask(id);
      if (!t) return;
      t.status = 'blocked';
      t.blocked_reason = reason;
      t.updated_at = Date.now();
      this.save();
    },

    /* ----- Plan (今日计划) ----- */
    getTodayPlan() {
      const d = todayStr();
      if (!this.data.plans[d]) {
        this.data.plans[d] = { id: uid(), date: d, task_order: [], daily_note: '' };
        this.save();
      }
      return this.data.plans[d];
    },
    savePlan(plan) {
      this.data.plans[plan.date] = plan;
      this.save();
    },
    planTasks() {
      const plan = this.getTodayPlan();
      const map = {};
      this.data.tasks.forEach(t => map[t.id] = t);
      return plan.task_order.map(id => map[id]).filter(Boolean);
    },

    /* ----- TimeEntry ----- */
    getTimeEntries(taskId) { return this.data.timeEntries.filter(e => e.task_id === taskId); },
    addTimeEntry(taskId, minutes, note) {
      this.pushTimeEntry(taskId, minutes, note, Date.now(), Date.now());
      this.save();
    },
    // 内部写入一条时间记录并累加 actual_min，不 save（供计时结算复用，避免双写）
    pushTimeEntry(taskId, minutes, note, startAt, endAt) {
      const e = { id: uid(), task_id: taskId, start_at: startAt, end_at: endAt, minutes, note: note || '' };
      this.data.timeEntries.push(e);
      const t = this.getTask(taskId);
      if (t) { t.actual_min = (t.actual_min || 0) + minutes; t.updated_at = Date.now(); }
    },

    /* ----- 计时器 (F11) ----- */
    getTimer() { return this.data.timer || null; },
    // 当前累计毫秒：running 时含正在进行的分段
    timerElapsedMs() {
      const tm = this.data.timer;
      if (!tm) return 0;
      let ms = tm.accumulated_ms || 0;
      if (tm.running && tm.started_at) ms += Date.now() - tm.started_at;
      return Math.max(0, ms);
    },
    // mm:ss 显示（分钟可超过 59）
    formatTimerMs(ms) {
      const totalSec = Math.max(0, Math.floor(ms / 1000));
      const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      return mm + ':' + ss;
    },
    timerToMinutes(ms) { return Math.max(1, Math.round(ms / 60000)); },
    // 开始计时：单计时器模式，切换任务自动结算上一个
    startTimer(taskId) {
      const t = this.getTask(taskId);
      if (!t || t.status === 'done') return null;
      if (this.data.timer && this.data.timer.task_id === taskId) {
        if (!this.data.timer.running) this.resumeTimer();
        return { startedTaskId: taskId, settled: null };
      }
      const settled = this.data.timer ? this.settleTimer() : null;
      this.data.timer = { task_id: taskId, started_at: Date.now(), accumulated_ms: 0, running: true };
      this.save();
      return { startedTaskId: taskId, settled };
    },
    pauseTimer() {
      const tm = this.data.timer;
      if (!tm || !tm.running) return;
      tm.accumulated_ms = (tm.accumulated_ms || 0) + Math.max(0, Date.now() - (tm.started_at || Date.now()));
      tm.started_at = null; tm.running = false;
      this.save();
    },
    resumeTimer() {
      const tm = this.data.timer;
      if (!tm || tm.running) return;
      tm.started_at = Date.now(); tm.running = true;
      this.save();
    },
    // 结算当前计时：写入时间记录并清空 timer
    settleTimer() {
      const tm = this.data.timer;
      if (!tm) return null;
      const endAt = Date.now();
      const ms = this.timerElapsedMs();
      if (ms < 5000) { // 误触不落账
        this.data.timer = null; this.save();
        return { task_id: tm.task_id, minutes: 0, start_at: endAt, end_at: endAt, discarded: true };
      }
      const minutes = this.timerToMinutes(ms);
      const startAt = endAt - ms;
      this.pushTimeEntry(tm.task_id, minutes, '', startAt, endAt);
      const t = this.getTask(tm.task_id);
      if (t && t.project_id) this.saveSnapshot(t.project_id, null, t.id);
      this.data.timer = null; this.save();
      return { task_id: tm.task_id, minutes, start_at: startAt, end_at: endAt };
    },
    stopTimer(taskId) {
      const tm = this.data.timer;
      if (!tm) return null;
      if (taskId && tm.task_id !== taskId) return null;
      return this.settleTimer();
    },
    // 单按钮切换：无计时→开始；计时中→暂停；已暂停→继续
    toggleTimer(taskId) {
      const t = this.getTask(taskId);
      if (!t || t.status === 'done') return null;
      const tm = this.data.timer;
      if (!tm || tm.task_id !== taskId) {
        const r = this.startTimer(taskId);
        return { action: 'start', settled: r ? r.settled : null };
      }
      if (tm.running) { this.pauseTimer(); return { action: 'pause' }; }
      this.resumeTimer(); return { action: 'resume' };
    },
    // 旧数据容错 + 陈旧保护（返回是否发生变更）
    _normalizeTimer() {
      const d = this.data; let changed = false;
      if (d.timer === undefined) { d.timer = null; changed = true; }
      const tm = d.timer; if (!tm) return changed;
      if (typeof tm.task_id !== 'string' || !this.getTask(tm.task_id)) { d.timer = null; return true; }
      if (typeof tm.accumulated_ms !== 'number' || !Number.isFinite(tm.accumulated_ms)) { tm.accumulated_ms = 0; changed = true; }
      if (typeof tm.started_at !== 'number' || !Number.isFinite(tm.started_at)) { tm.started_at = null; changed = true; }
      if (typeof tm.running !== 'boolean') { tm.running = false; changed = true; }
      if (tm.running && !tm.started_at) { tm.running = false; changed = true; }
      if (tm.running && tm.started_at && Date.now() - tm.started_at > STALE_TIMER_MS) {
        tm.accumulated_ms = this.timerElapsedMs(); tm.started_at = null; tm.running = false; changed = true;
      }
      return changed;
    },

    /* ----- ContextSnapshot ----- */
    getSnapshot(projectId) { return this.data.snapshots[projectId] || null; },
    saveSnapshot(projectId, workNote, lastTaskId) {
      const s = this.data.snapshots[projectId] || { id: uid(), project_id: projectId };
      s.work_note = workNote != null ? workNote : (s.work_note || '');
      if (lastTaskId) s.last_task_id = lastTaskId;
      s.last_active_at = Date.now();
      this.data.snapshots[projectId] = s;
      this.save();
    },
    touchProject(projectId) {
      const p = this.getProject(projectId);
      if (p) { p.updated_at = Date.now(); this.save(); }
    },

    /* ----- 健康度：阻塞×2 + 今日到期×3 + 进行中 (F04) ----- */
    projectHealth(projectId) {
      const tasks = this.getProjectTasks(projectId);
      const blocked = tasks.filter(t => t.status === 'blocked').length;
      const today = todayStr();
      const dueToday = tasks.filter(t => t.status !== 'done' && t.due_date === today).length;
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      return { blocked, dueToday, inProgress, done: tasks.filter(t => t.status === 'done').length, total: tasks.length,
        score: blocked * 2 + dueToday * 3 + inProgress };
    },
    nextDueDate(projectId) {
      const tasks = this.getProjectTasks(projectId)
        .filter(t => t.status !== 'done' && t.due_date)
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      return tasks.length ? tasks[0].due_date : null;
    },

    /* ----- 统计 ----- */
    statsWeek() {
      const s = new Date(); s.setDate(s.getDate() - 6);
      const start = todayStr(s);
      const tasks = this.data.tasks;
      const done = tasks.filter(t => t.completed_at && new Date(t.completed_at) >= new Date(start + 'T00:00:00'));
      const perProject = this.getProjects().map(p => {
        const pt = tasks.filter(t => t.project_id === p.id);
        return { project: p, total: pt.length, done: pt.filter(t => t.status === 'done').length };
      });
      const timeByProject = this.getProjects().map(p => {
        const ids = new Set(this.getProjectTasks(p.id).map(t => t.id));
        const mins = this.data.timeEntries.filter(e => ids.has(e.task_id)).reduce((a, e) => a + e.minutes, 0);
        return { project: p, minutes: mins };
      }).filter(x => x.minutes > 0);
      return {
        doneCount: done.length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        blocked: tasks.filter(t => t.status === 'blocked').length,
        totalEstimate: tasks.filter(t => t.status !== 'done').reduce((a, t) => a + (t.estimate_min || 0), 0),
        perProject, timeByProject
      };
    },

    /* ----- 统计面板增强 (F14) ----- */
    // range: 'week'（近7天）| 'month'（近30天）
    statsRange(range) {
      const days = range === 'month' ? 30 : 7;
      const tasks = this.data.tasks;
      const now = new Date();
      // 构造 days 个日期（今天在前）
      const daysList = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        daysList.push({ key: todayStr(d), label: (d.getMonth() + 1) + '/' + d.getDate() });
      }
      const startKey = daysList[0].key;
      const startTs = new Date(startKey + 'T00:00:00').getTime();

      const done = tasks.filter(t => t.completed_at && t.completed_at >= startTs);
      const perProject = this.getProjects().map(p => {
        const pt = tasks.filter(t => t.project_id === p.id);
        return { project: p, total: pt.length, done: pt.filter(t => t.status === 'done').length };
      });
      const timeByProject = this.getProjects().map(p => {
        const ids = new Set(this.getProjectTasks(p.id).map(t => t.id));
        const mins = this.data.timeEntries
          .filter(e => ids.has(e.task_id) && e.end_at >= startTs)
          .reduce((a, e) => a + e.minutes, 0);
        return { project: p, minutes: mins };
      }).filter(x => x.minutes > 0);

      // 每日时间投入趋势
      const timeTrend = daysList.map(d => {
        const s = new Date(d.key + 'T00:00:00').getTime();
        const e = s + 86400000;
        const mins = this.data.timeEntries
          .filter(te => te.end_at >= s && te.end_at < e)
          .reduce((a, te) => a + te.minutes, 0);
        return { date: d.key, label: d.label, minutes: mins };
      });
      // 每日完成任务趋势
      const doneTrend = daysList.map(d => {
        const s = new Date(d.key + 'T00:00:00').getTime();
        const e = s + 86400000;
        const n = tasks.filter(t => t.completed_at && t.completed_at >= s && t.completed_at < e).length;
        return { date: d.key, label: d.label, count: n };
      });
      // 预估 vs 实际（按项目累计）
      const estimateVsActual = this.getProjects().map(p => {
        const pt = tasks.filter(t => t.project_id === p.id);
        return {
          project: p,
          estimate: pt.reduce((a, t) => a + (t.estimate_min || 0), 0),
          actual: pt.reduce((a, t) => a + (t.actual_min || 0), 0)
        };
      });

      return {
        range, days, startKey,
        doneCount: done.length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        blocked: tasks.filter(t => t.status === 'blocked').length,
        totalEstimate: tasks.filter(t => t.status !== 'done').reduce((a, t) => a + (t.estimate_min || 0), 0),
        totalTime: this.data.timeEntries.filter(e => e.end_at >= startTs).reduce((a, e) => a + e.minutes, 0),
        perProject, timeByProject, timeTrend, doneTrend, estimateVsActual
      };
    },

    /* ----- Backup (F19) ----- */
    createBackup() {
      const json = this.exportJSON();
      const b = {
        id: uid(),
        file_path: 'backups/workbench-' + todayStr() + '-' + String(Date.now()).slice(-4) + '.json',
        created_at: Date.now(),
        size: new Blob([json]).size
      };
      this.data.backups.push(b);
      this.data.backups.sort((a, b) => a.created_at - b.created_at);
      const keep = this.data.settings.backupKeep || 7;
      if (this.data.backups.length > keep) this.data.backups = this.data.backups.slice(-keep);
      this.save();
      return b;
    },
    restoreBackup(id) {
      // 原型中备份内容为元数据；真实实现为读取备份文件还原。此处用当前数据的快照模拟。
      const b = this.data.backups.find(x => x.id === id);
      return !!b;
    },
    getBackups() { return this.data.backups; },

    /* ----- 工具 ----- */
    utils: { uid, todayStr, addDays, daysUntil, fmtDate, fmtDateTime, fmtMinutes, fmtBackupSize }
  };

  global.Store = Store;
})(window);
