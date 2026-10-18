/**
 * 静态版数据层：全部数据保存在浏览器 localStorage，接口与线上版 /api/* 一一对齐，
 * 这样上层的页面逻辑（app.js）不必知道数据是从服务端来还是从本地来。
 *
 * 与线上版的两点差异：
 * 1. 金额直接以「元」存储（线上版库内以「分」存，接口边界转元），省掉换算；
 * 2. 没有账号，数据只有一份，归属逻辑（user_id）全部去掉。
 */

const LS_KEY = 'assetbook_static_v1';

/* ==========================================================================
   默认种子数据
   ========================================================================== */

const DEFAULT_CATEGORIES = [
  { key: 'cash', name: '现金', color: '#c8a45c', kind: 'asset', trackPrincipal: 0 },
  { key: 'fixed', name: '固定资产', color: '#7a8450', kind: 'asset', trackPrincipal: 0 },
  { key: 'invest', name: '投资', color: '#b5654d', kind: 'asset', trackPrincipal: 1 },
  { key: 'insure', name: '保险', color: '#5f7161', kind: 'asset', trackPrincipal: 0 },
  { key: 'credit', name: '债权', color: '#6a7b8c', kind: 'asset', trackPrincipal: 0 },
  { key: 'liability', name: '负债', color: '#9d4238', kind: 'liability', trackPrincipal: 0 }
];

const DEFAULT_PLANS = [
  {
    id: 'sp1234',
    name: '标普家庭资产象限',
    desc: '标准普尔「1234」法则：10% 要花的钱 + 20% 保命的钱 + 30% 生钱的钱 + 40% 保本的钱。国际流传最广的家庭资产配置参考。',
    items: [
      { name: '要花的钱·现金', ratio: 10, color: '#c8a45c', cats: ['cash'], note: '3–6 个月生活费，活期 / 货币基金' },
      { name: '保命的钱·保险', ratio: 20, color: '#7a8450', cats: ['insure'], note: '重疾、医疗、意外，以杠杆换保障' },
      { name: '生钱的钱·投资', ratio: 30, color: '#b5654d', cats: ['invest'], note: '股票、基金、投资性房产，追求收益' },
      { name: '保本的钱·固收', ratio: 40, color: '#9d4238', cats: ['fixed'], note: '存款、国债、年金，稳健保值增值' }
    ]
  },
  {
    id: 'rule4321',
    name: '4321 法则',
    desc: '40% 投资创收 + 30% 生活开支 + 20% 储蓄备用 + 10% 保险保障，偏重财富积累的常用分法。',
    items: [
      { name: '投资创收', ratio: 40, color: '#b5654d', cats: ['invest'], note: '股票、基金、债券等增值类资产' },
      { name: '生活开支', ratio: 30, color: '#c8a45c', cats: ['cash'], note: '日常消费与流动性储备' },
      { name: '储蓄备用', ratio: 20, color: '#9d4238', cats: ['fixed'], note: '定期存款、货币基金等' },
      { name: '保险保障', ratio: 10, color: '#7a8450', cats: ['insure'], note: '家庭保障型保险' }
    ]
  },
  {
    id: 'conservative',
    name: '保守型',
    desc: '以本金安全为先：固收与现金占大头，权益类控制在两成以内，适合临近退休或风险承受力较低。',
    items: [
      { name: '现金及等价物', ratio: 20, color: '#c8a45c', cats: ['cash'], note: '活期、货币基金' },
      { name: '固定收益', ratio: 50, color: '#9d4238', cats: ['fixed'], note: '存款、国债、银行理财' },
      { name: '权益类', ratio: 20, color: '#b5654d', cats: ['invest'], note: '股票基金、指数基金' },
      { name: '保险保障', ratio: 10, color: '#7a8450', cats: ['insure'], note: '保障型保险' }
    ]
  },
  {
    id: 'balanced',
    name: '平衡型',
    desc: '兼顾增长与稳健：权益类约四成五，固收三成五，现金与保险各一成，适合中长期财富积累。',
    items: [
      { name: '现金及等价物', ratio: 10, color: '#c8a45c', cats: ['cash'], note: '活期、货币基金' },
      { name: '固定收益', ratio: 35, color: '#9d4238', cats: ['fixed'], note: '存款、债券、固收+' },
      { name: '权益类', ratio: 45, color: '#b5654d', cats: ['invest'], note: '股票、基金、权益资产' },
      { name: '保险保障', ratio: 10, color: '#7a8450', cats: ['insure'], note: '保障型保险' }
    ]
  },
  {
    id: 'aggressive',
    name: '激进型',
    desc: '以增值为主要目标：权益类占七成，波动大，适合年轻、收入稳定且风险承受力高的人群。',
    items: [
      { name: '现金及等价物', ratio: 5, color: '#c8a45c', cats: ['cash'], note: '应急备用金' },
      { name: '固定收益', ratio: 15, color: '#9d4238', cats: ['fixed'], note: '短债、固收类' },
      { name: '权益类', ratio: 70, color: '#b5654d', cats: ['invest'], note: '股票、基金、股权' },
      { name: '保险保障', ratio: 10, color: '#7a8450', cats: ['insure'], note: '保障型保险' }
    ]
  }
];

/* 净值分位基准（与线上版一致，线性插值） */
const NETWORTH_BENCHMARK = [
  { p: 1, v: 0 }, { p: 10, v: 10000 }, { p: 20, v: 30000 }, { p: 30, v: 50000 },
  { p: 40, v: 80000 }, { p: 50, v: 120000 }, { p: 60, v: 200000 }, { p: 70, v: 350000 },
  { p: 80, v: 600000 }, { p: 90, v: 1200000 }, { p: 95, v: 2000000 },
  { p: 99, v: 5000000 }, { p: 100, v: 10000000 }
];

/* ==========================================================================
   月份工具
   ========================================================================== */

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function parseMonth(m) {
  const s = String(m || currentMonth());
  const parts = s.split('-').map(Number);
  return new Date(parts[0] || new Date().getFullYear(), (parts[1] || 1) - 1, 1);
}

function fmtMonth(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function recentMonths(n, from) {
  const base = from ? parseMonth(from) : new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(fmtMonth(new Date(base.getFullYear(), base.getMonth() - i, 1)));
  }
  return out;
}

const MONTH_RE = /^\d{4}-\d{2}$/;
function monthOf(v, fallback) {
  const s = String(v || '').trim();
  return MONTH_RE.test(s) ? s : fallback;
}

function normColor(c) {
  const s = String(c || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  return '#c8a45c';
}

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/* ==========================================================================
   存储
   ========================================================================== */

const Store = {
  db: null,

  /** 读：没有就播种一份全新的；解析失败则重建，避免页面白屏 */
  load() {
    let raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.cats) && Array.isArray(parsed.subs)
          && Array.isArray(parsed.entries) && Array.isArray(parsed.plans)) {
          this.db = parsed;
          this.db.settings = this.db.settings || { fontScale: 1, headerBg: '' };
          return;
        }
      } catch (e) { /* 数据损坏，落到下面重建 */ }
    }
    this.db = this.seed();
    this.save();
  },

  seed() {
    const now = Date.now();
    const cats = DEFAULT_CATEGORIES.map((c, i) => ({
      id: i + 1, key: c.key, name: c.name, color: c.color,
      kind: c.kind, trackPrincipal: c.trackPrincipal, sortOrder: i
    }));

    const plans = DEFAULT_PLANS.map((p, i) => ({
      id: i + 1,
      name: p.name,
      desc: p.desc,
      isCurrent: i === 1 ? 1 : 0,
      builtin: p.id,
      sortOrder: i,
      items: p.items.map((it, j) => ({
        id: j + 1, name: it.name, ratio: it.ratio,
        color: it.color, note: it.note, cats: (it.cats || []).slice(), recIds: []
      }))
    }));

    return {
      v: 1,
      cats,
      subs: [],
      entries: [],
      plans,
      settings: { fontScale: 1, headerBg: '' },
      seq: { cat: cats.length + 1, sub: 1, ent: 1, plan: plans.length + 1, item: 20 }
    };
  },

  save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.db));
    } catch (e) {
      // 容量写满（多半是背景图太大）时给出明确提示，而不是静默失败
      throw new Error('本地存储写入失败（可能已超出浏览器 5MB 上限），请在设置里移除背景图或清理数据后重试');
    }
  },

  nextId(kind) {
    const id = this.db.seq[kind] || 1;
    this.db.seq[kind] = id + 1;
    return id;
  },

  cat(id) { return this.db.cats.find((c) => c.id === Number(id)) || null; },
  catByKey(k) { return this.db.cats.find((c) => c.key === k) || null; },
  sub(id) { return this.db.subs.find((s) => s.id === Number(id)) || null; },
  entry(id) { return this.db.entries.find((e) => e.id === Number(id)) || null; },
  plan(id) { return this.db.plans.find((p) => p.id === Number(id)) || null; },

  /** 全部有数据的月份（升序）。没数据时给当月，避免页面上到处判空 */
  allMonths() {
    const set = new Set(this.db.entries.map((e) => e.month));
    const list = [...set].sort();
    return list.length ? list : [currentMonth()];
  },

  /** 某小类截至 month 的累计值 / 该月当月变动 */
  subValues(month) {
    const m = new Map();
    for (const e of this.db.entries) {
      let v = m.get(e.subjectId);
      if (!v) { v = { value: 0, delta: 0 }; m.set(e.subjectId, v); }
      if (e.month <= month) v.value += num(e.delta);
      if (e.month === month) v.delta += num(e.delta);
    }
    return m;
  },

  /** 按月份汇总：小类累计值 → 分类 → 总资产 / 负债 / 净资产 */
  summarize(months) {
    const sorted = months.slice().sort();
    const bySub = new Map();
    for (const e of this.db.entries) {
      if (!bySub.has(e.subjectId)) bySub.set(e.subjectId, []);
      bySub.get(e.subjectId).push(e);
    }

    return sorted.map((month) => {
      const sums = {};
      this.db.cats.forEach((c) => { sums[c.key] = 0; });
      for (const s of this.db.subs) {
        const c = this.cat(s.categoryId);
        if (!c) continue;
        const list = bySub.get(s.id);
        if (!list) continue;
        let v = 0;
        for (const e of list) if (e.month <= month) v += num(e.delta);
        sums[c.key] = (sums[c.key] || 0) + v;
      }
      let totalAssets = 0, liability = 0;
      this.db.cats.forEach((c) => {
        if (c.kind === 'liability') liability += sums[c.key];
        else totalAssets += sums[c.key];
      });
      return { month, sums, totalAssets, liability, netWorth: totalAssets - liability };
    });
  },

  /** 最近一个有实际金额的月份 */
  latestMonth(months) {
    const list = this.summarize(months || this.allMonths());
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].totalAssets !== 0 || list[i].liability !== 0) return list[i].month;
    }
    return currentMonth();
  }
};

/* ==========================================================================
   本地接口（签名和返回结构与线上 /api/* 一致）
   ========================================================================== */

function ok(v) { return v === undefined ? { ok: true } : v; }

const Api = {
  /* ---- 通用动词：静态版没有网络请求，留着做签名兼容 ---- */
  get: (p) => Promise.reject(new Error('静态版不支持该接口：' + p)),
  post: (p) => Promise.reject(new Error('静态版不支持该接口：' + p)),
  put: (p) => Promise.reject(new Error('静态版不支持该接口：' + p)),
  del: (p) => Promise.reject(new Error('静态版不支持该接口：' + p)),

  /* ---- 一级分类 ---- */
  categories() {
    const counts = new Map();
    for (const s of Store.db.subs) counts.set(s.categoryId, (counts.get(s.categoryId) || 0) + 1);
    return Promise.resolve({
      categories: Store.db.cats.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({
        id: c.id, key: c.key, name: c.name, color: c.color, kind: c.kind,
        trackPrincipal: c.trackPrincipal ? 1 : 0, subjectCount: counts.get(c.id) || 0
      }))
    });
  },

  addCategory(d) {
    const name = String((d && d.name) || '').trim();
    if (!name) return Promise.reject(new Error('请输入分类名称'));
    if (Store.db.cats.some((c) => c.name === name)) return Promise.reject(new Error('已存在同名分类'));

    const key = 'c' + Date.now().toString(36);
    const maxOrder = Store.db.cats.reduce((a, c) => Math.max(a, c.sortOrder || 0), 0);
    const cat = {
      id: Store.nextId('cat'),
      key,
      name,
      color: normColor(d && d.color),
      kind: (d && d.kind) === 'liability' ? 'liability' : 'asset',
      trackPrincipal: (d && d.trackPrincipal) ? 1 : 0,
      sortOrder: maxOrder + 1
    };
    Store.db.cats.push(cat);
    Store.save();
    return Promise.resolve(ok(cat));
  },

  updateCategory(id, d) {
    const c = Store.cat(id);
    if (!c) return Promise.reject(new Error('分类不存在'));
    const name = String((d && d.name) || '').trim();
    if (!name) return Promise.reject(new Error('名称不能为空'));
    if (Store.db.cats.some((x) => x.id !== c.id && x.name === name)) {
      return Promise.reject(new Error('已存在同名分类'));
    }

    c.name = name;
    c.color = normColor(d && d.color);
    c.kind = (d && d.kind) === 'liability' ? 'liability' : 'asset';
    c.trackPrincipal = (d && d.trackPrincipal) ? 1 : 0;
    // 关掉本金记录时清掉残留，否则账面会留着一笔没人看的成本
    if (!c.trackPrincipal) {
      for (const s of Store.db.subs) if (s.categoryId === c.id) s.principal = 0;
    }
    Store.save();
    return Promise.resolve(ok());
  },

  deleteCategory(id) {
    const c = Store.cat(id);
    if (!c) return Promise.reject(new Error('分类不存在'));
    const removedSubjects = Store.db.subs.filter((s) => s.categoryId === c.id).length;

    const subIds = new Set(Store.db.subs.filter((s) => s.categoryId === c.id).map((s) => s.id));
    Store.db.entries = Store.db.entries.filter((e) => !subIds.has(e.subjectId));
    Store.db.subs = Store.db.subs.filter((s) => s.categoryId !== c.id);
    Store.db.cats = Store.db.cats.filter((x) => x.id !== c.id);
    // 分类被删光了就补回默认六个，否则界面会变成「无处可记」的空态
    if (!Store.db.cats.length) {
      const seed = Store.seed().cats;
      Store.db.cats = seed;
    }
    // 方案里指向它的关联也要跟着清掉
    for (const p of Store.db.plans) {
      for (const it of p.items) it.cats = it.cats.filter((k) => k !== c.key);
    }
    Store.save();
    return Promise.resolve({ ok: true, removedSubjects });
  },

  /* ---- 二级小类 ---- */
  subjects(q) {
    const vals = Store.subValues('9999-12');
    const catKey = q ? String(q).replace(/^category=/, '') : '';
    const cat = catKey && catKey !== 'all' ? Store.catByKey(catKey) : null;

    const list = Store.db.subs
      .filter((s) => !cat || s.categoryId === cat.id)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => {
        const c = Store.cat(s.categoryId);
        const v = vals.get(s.id) || { value: 0, delta: 0 };
        return {
          id: s.id,
          name: s.name,
          note: s.note,
          principal: num(s.principal),
          categoryId: s.categoryId,
          catKey: c ? c.key : '',
          catName: c ? c.name : '',
          catColor: c ? c.color : '#c8a45c',
          catKind: c ? c.kind : 'asset',
          entryCount: Store.db.entries.filter((e) => e.subjectId === s.id).length,
          value: v.value
        };
      });
    return Promise.resolve({ subjects: list });
  },

  addSubject(d) {
    const name = String((d && d.name) || '').trim();
    const cat = Store.cat(d && d.categoryId);
    if (!name) return Promise.reject(new Error('请输入名称'));
    if (!cat) return Promise.reject(new Error('请选择分类'));

    const month = monthOf(d && d.month, currentMonth());
    const maxOrder = Store.db.subs.reduce((a, s) => Math.max(a, s.sortOrder || 0), 0);
    const now = Date.now();

    const sub = {
      id: Store.nextId('sub'),
      categoryId: cat.id,
      name,
      principal: cat.trackPrincipal ? num(d && d.principal) : 0,
      note: String((d && d.note) || ''),
      sortOrder: maxOrder + 1,
      createdAt: now
    };
    Store.db.subs.push(sub);

    // 建档时顺手写一条「初始记录」，之后改初始金额就是改这条
    const ent = {
      id: Store.nextId('ent'),
      subjectId: sub.id,
      month,
      delta: num(d && d.initialAmount),
      note: '初始记录',
      createdAt: now,
      updatedAt: now
    };
    Store.db.entries.push(ent);
    Store.save();
    return Promise.resolve({ id: sub.id, name, categoryId: cat.id, month });
  },

  updateSubject(id, d) {
    const s = Store.sub(id);
    if (!s) return Promise.reject(new Error('小类不存在'));
    const cat = Store.cat((d && d.categoryId) || s.categoryId);
    if (!cat) return Promise.reject(new Error('分类不存在'));

    const name = String((d && d.name) || '').trim();
    if (!name) return Promise.reject(new Error('名称不能为空'));

    s.categoryId = cat.id;
    s.name = name;
    s.principal = cat.trackPrincipal ? num(d && d.principal) : 0;
    if (d && d.note !== undefined) s.note = String(d.note || '');

    // 改「初始金额」→ 同步改建档那条 note='初始记录' 的变动额。
    // 不能直接取最早一条：用户补录了更早月份后，最早那条会变成补录记录。
    if (d && d.initialAmount !== undefined && d.initialAmount !== '') {
      const nv = num(d.initialAmount);
      const own = Store.db.entries.filter((e) => e.subjectId === s.id)
        .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.id - b.id));
      let seed = own.find((e) => e.note === '初始记录');
      if (!seed && own.length) seed = own[0];
      if (seed) {
        seed.delta = nv;
        seed.updatedAt = Date.now();
      } else {
        Store.db.entries.push({
          id: Store.nextId('ent'),
          subjectId: s.id,
          month: monthOf(d.month, currentMonth()),
          delta: nv,
          note: '初始记录',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    }
    Store.save();
    return Promise.resolve(ok());
  },

  deleteSubject(id) {
    const s = Store.sub(id);
    if (!s) return Promise.reject(new Error('小类不存在'));
    const removed = Store.db.entries.filter((e) => e.subjectId === s.id).length;
    Store.db.entries = Store.db.entries.filter((e) => e.subjectId !== s.id);
    Store.db.subs = Store.db.subs.filter((x) => x.id !== s.id);
    for (const p of Store.db.plans) {
      for (const it of p.items) it.recIds = it.recIds.filter((rid) => rid !== s.id);
    }
    Store.save();
    return Promise.resolve({ ok: true, removedEntries: removed });
  },

  /* ---- 变动记录 ---- */
  entries(q) {
    const params = {};
    String(q || '').split('&').forEach((kv) => {
      if (!kv) return;
      const [k, v] = kv.split('=');
      params[k] = v;
    });

    let list = Store.db.entries.slice();
    if (params.subjectId) list = list.filter((e) => e.subjectId === Number(params.subjectId));
    if (params.month) list = list.filter((e) => e.month === params.month);
    if (params.from) list = list.filter((e) => e.month >= params.from);
    if (params.to) list = list.filter((e) => e.month <= params.to);

    // 累计余额按「月份先后 → 同月按添加先后」升序累加，展示顺序与之解耦
    list.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.createdAt - b.createdAt || a.id - b.id));
    let running = 0;
    return Promise.resolve({
      entries: list.map((e) => {
        running += num(e.delta);
        return {
          id: e.id, subjectId: e.subjectId, month: e.month, delta: num(e.delta),
          note: e.note, createdAt: e.createdAt, updatedAt: e.updatedAt, balance: running
        };
      })
    });
  },

  addEntry(d) {
    const s = Store.sub(d && d.subjectId);
    if (!s) return Promise.reject(new Error('小类不存在'));
    const month = monthOf(d && d.month, currentMonth());
    if (!MONTH_RE.test(String((d && d.month) || ''))) return Promise.reject(new Error('月份格式应为 YYYY-MM'));

    const now = Date.now();
    const e = {
      id: Store.nextId('ent'),
      subjectId: s.id,
      month,
      delta: num(d && d.delta),
      note: String((d && d.note) || ''),
      createdAt: now,
      updatedAt: now
    };
    Store.db.entries.push(e);
    Store.save();
    return Promise.resolve({ id: e.id, balance: (Store.subValues('9999-12').get(s.id) || { value: 0 }).value });
  },

  updateEntry(id, d) {
    const e = Store.entry(id);
    if (!e) return Promise.reject(new Error('记录不存在'));
    if (d && d.month !== undefined) {
      if (!MONTH_RE.test(String(d.month))) return Promise.reject(new Error('月份格式应为 YYYY-MM'));
      e.month = String(d.month);
    }
    if (d && d.delta !== undefined) e.delta = num(d.delta);
    if (d && d.note !== undefined) e.note = String(d.note || '');
    e.updatedAt = Date.now();
    Store.save();
    return Promise.resolve(ok());
  },

  deleteEntry(id) {
    const e = Store.entry(id);
    if (!e) return Promise.reject(new Error('记录不存在'));
    Store.db.entries = Store.db.entries.filter((x) => x.id !== e.id);
    Store.save();
    return Promise.resolve({
      ok: true,
      balance: (Store.subValues('9999-12').get(e.subjectId) || { value: 0 }).value
    });
  },

  /* ---- 汇总 ---- */
  overview(n) {
    const months = recentMonths(Math.min(24, Math.max(1, parseInt(n, 10) || 6)));
    const list = Store.summarize(months);
    const latest = list[list.length - 1];
    const prev = list.length > 1 ? list[list.length - 2] : null;

    return Promise.resolve({
      month: latest.month,
      netWorth: latest.netWorth,
      totalAssets: latest.totalAssets,
      liability: latest.liability,
      monthDiff: prev ? latest.netWorth - prev.netWorth : 0,
      monthRate: prev && prev.netWorth !== 0
        ? ((latest.netWorth - prev.netWorth) / Math.abs(prev.netWorth)) * 100 : 0,
      trend: list.map((m) => ({ month: m.month, netWorth: m.netWorth, assets: m.totalAssets, liability: m.liability })),
      byCategory: Store.db.cats.map((c) => ({
        key: c.key, name: c.name, color: c.color, kind: c.kind, value: latest.sums[c.key] || 0
      }))
    });
  },

  months() {
    const list = Store.allMonths();
    return Promise.resolve({ list, current: currentMonth(), latest: Store.latestMonth(list) });
  },

  records(month, catKey) {
    const m = monthOf(month, currentMonth());
    const vals = Store.subValues(m);

    // 每个小类「初始记录」的金额，编辑表单要回填
    const seedMap = new Map();
    for (const e of Store.db.entries) {
      if (e.note !== '初始记录') continue;
      if (!seedMap.has(e.subjectId)) seedMap.set(e.subjectId, e.delta);
    }
    for (const e of Store.db.entries) {
      if (seedMap.has(e.subjectId)) continue;
      const cur = Store.db.entries.filter((x) => x.subjectId === e.subjectId)
        .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.id - b.id))[0];
      if (cur) seedMap.set(e.subjectId, cur.delta);
    }

    const cntMap = new Map();
    for (const e of Store.db.entries) cntMap.set(e.subjectId, (cntMap.get(e.subjectId) || 0) + 1);

    const rows = Store.db.subs.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((s) => {
      const c = Store.cat(s.categoryId);
      const v = vals.get(s.id) || { value: 0, delta: 0 };
      const principal = num(s.principal);
      const profit = c && c.trackPrincipal ? v.value - principal : null;
      return {
        id: s.id,
        name: s.name,
        note: s.note,
        categoryId: s.categoryId,
        catKey: c ? c.key : '',
        catName: c ? c.name : '',
        color: c ? c.color : '#c8a45c',
        value: v.value,
        delta: v.delta,
        seedDelta: seedMap.has(s.id) ? num(seedMap.get(s.id)) : 0,
        entryCount: cntMap.get(s.id) || 0,
        principal,
        profit,
        profitRate: profit === null || principal === 0 ? null : (profit / principal) * 100
      };
    });

    const groups = Store.db.cats.slice().sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((c) => !catKey || catKey === 'all' || c.key === catKey)
      .map((c) => ({
        key: c.key, name: c.name, color: c.color, kind: c.kind,
        items: rows.filter((r) => r.catKey === c.key)
      }))
      .filter((g) => g.items.length);

    return Promise.resolve({ month: m, groups, total: rows.length });
  },

  composition(month) {
    const m = monthOf(month, Store.latestMonth());
    const s = Store.summarize([m])[0];
    const all = Store.allMonths();
    const assets = Store.db.cats.filter((x) => x.kind === 'asset');
    const totalAssets = assets.reduce((a, x) => a + (s.sums[x.key] || 0), 0);

    const slices = assets.map((x) => {
      const v = s.sums[x.key] || 0;
      return { key: x.key, name: x.name, color: x.color, value: v, rate: totalAssets !== 0 ? (v / totalAssets) * 100 : 0 };
    }).filter((x) => x.value !== 0);

    return Promise.resolve({
      month: m,
      totalAssets: s.totalAssets,
      liability: s.liability,
      netWorth: s.netWorth,
      slices,
      bars: Store.db.cats.map((x) => {
        const v = s.sums[x.key] || 0;
        return { key: x.key, name: x.name, color: x.color, kind: x.kind, value: v, rate: totalAssets !== 0 ? (Math.abs(v) / totalAssets) * 100 : 0 };
      }).filter((x) => x.value !== 0),
      trend: Store.summarize(all).map((r) => ({ month: r.month, netWorth: r.netWorth }))
    });
  },

  diff(from, to) {
    const f = monthOf(from, currentMonth());
    const t = monthOf(to, currentMonth());
    const pair = Store.summarize([f, t]);
    const asc = String(f) <= String(t);
    const A = asc ? pair[0] : pair[1];
    const B = asc ? pair[1] : pair[0];

    const rows = Store.db.cats.map((c) => {
      const prev = A.sums[c.key] || 0;
      const cur = B.sums[c.key] || 0;
      const d = cur - prev;
      return {
        key: c.key, name: c.name, color: c.color, kind: c.kind,
        prev, cur, diff: d,
        rate: prev !== 0 ? (d / Math.abs(prev)) * 100 : (cur !== 0 ? 100 : 0)
      };
    });

    const prevNet = A.netWorth, curNet = B.netWorth, netDiff = curNet - prevNet;
    return Promise.resolve({
      from: asc ? f : t,
      to: asc ? t : f,
      prevNet,
      curNet,
      netDiff,
      netRate: prevNet !== 0 ? (netDiff / Math.abs(prevNet)) * 100 : (curNet !== 0 ? 100 : 0),
      rows
    });
  },

  rank(month) {
    const list = Store.allMonths();
    const m = monthOf(month, Store.latestMonth(list));
    const s = Store.summarize([m])[0];
    const r = calcPercentile(s.netWorth);
    return Promise.resolve({
      month: m,
      netWorth: s.netWorth,
      totalAssets: s.totalAssets,
      liability: s.liability,
      percentile: r.percentile,
      label: r.label,
      source: '内置示例分位基准（占位，非权威统计）'
    });
  },

  /* ---- 配置方案 ---- */
  plans() {
    const list = Store.db.plans.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({
      id: p.id, name: p.name, desc: p.desc, isCurrent: p.isCurrent, builtin: p.builtin,
      items: p.items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((it) => ({
        id: it.id, name: it.name, ratio: it.ratio, color: it.color, note: it.note,
        cats: it.cats.slice(), recIds: it.recIds.slice()
      }))
    }));
    const cur = Store.db.plans.find((p) => p.isCurrent) || Store.db.plans[0] || null;
    return Promise.resolve({ plans: list, currentId: cur ? cur.id : null });
  },

  addPlan(d) {
    const name = String((d && d.name) || '').trim() || '自定义方案';
    const maxOrder = Store.db.plans.reduce((a, p) => Math.max(a, p.sortOrder || 0), 0);
    const p = {
      id: Store.nextId('plan'),
      name,
      desc: String((d && d.desc) || ''),
      isCurrent: 0,
      builtin: '',
      sortOrder: maxOrder + 1,
      items: (d && d.items ? d.items : []).map((it, i) => ({
        id: Store.nextId('item'),
        name: String(it.name || ('配置项 ' + (i + 1))),
        ratio: num(it.ratio),
        color: normColor(it.color),
        note: String(it.note || ''),
        sortOrder: i,
        cats: (it.cats || []).slice(),
        recIds: (it.recIds || []).map(Number)
      }))
    };
    Store.db.plans.push(p);
    Store.save();
    return Promise.resolve({ id: p.id, name: p.name });
  },

  updatePlan(id, d) {
    const p = Store.plan(id);
    if (!p) return Promise.reject(new Error('方案不存在'));
    if (d && d.name !== undefined) {
      const name = String(d.name).trim();
      if (!name) return Promise.reject(new Error('请输入方案名称'));
      p.name = name;
    }
    if (d && d.desc !== undefined) p.desc = String(d.desc || '');
    if (d && d.items) {
      p.items = d.items.map((it, i) => ({
        id: it.id ? Number(it.id) : Store.nextId('item'),
        name: String(it.name || ('配置项 ' + (i + 1))),
        ratio: num(it.ratio),
        color: normColor(it.color),
        note: String(it.note || ''),
        sortOrder: i,
        cats: (it.cats || []).slice(),
        recIds: (it.recIds || []).map(Number)
      }));
    }
    Store.save();
    return Promise.resolve(ok());
  },

  deletePlan(id) {
    const p = Store.plan(id);
    if (!p) return Promise.reject(new Error('方案不存在'));
    Store.db.plans = Store.db.plans.filter((x) => x.id !== p.id);
    if (!Store.db.plans.some((x) => x.isCurrent) && Store.db.plans.length) Store.db.plans[0].isCurrent = 1;
    if (!Store.db.plans.length) {
      // 删空了就补一套空白方案，规划页不至于开天窗
      Store.db.plans.push({
        id: Store.nextId('plan'), name: '默认方案', desc: '自定义配置方案',
        isCurrent: 1, builtin: '', sortOrder: 0, items: []
      });
    }
    Store.save();
    return Promise.resolve(ok());
  },

  setCurrentPlan(id) {
    for (const p of Store.db.plans) p.isCurrent = p.id === Number(id) ? 1 : 0;
    Store.save();
    return Promise.resolve(ok());
  },

  copyPlan(id) {
    const p = Store.plan(id);
    if (!p) return Promise.reject(new Error('方案不存在'));
    const maxOrder = Store.db.plans.reduce((a, x) => Math.max(a, x.sortOrder || 0), 0);
    const copy = {
      id: Store.nextId('plan'),
      name: p.name + ' 副本',
      desc: p.desc,
      isCurrent: 0,
      builtin: '',
      sortOrder: maxOrder + 1,
      items: p.items.map((it) => ({
        id: Store.nextId('item'), name: it.name, ratio: it.ratio, color: it.color,
        note: it.note, sortOrder: it.sortOrder, cats: it.cats.slice(), recIds: it.recIds.slice()
      }))
    };
    Store.db.plans.push(copy);
    Store.save();
    return Promise.resolve({ id: copy.id, name: copy.name });
  },

  planCompare(month, baseMode, planId) {
    const m = monthOf(month, Store.latestMonth());
    const target = (planId && Store.plan(planId)) || Store.db.plans.find((p) => p.isCurrent) || Store.db.plans[0];
    if (!target) return Promise.resolve(null);

    const s0 = Store.summarize([m])[0];
    const base = baseMode === 'net' ? s0.netWorth : s0.totalAssets;

    // 每个小类唯一归属一个配置项，保证同一笔资产只被计入一次
    const owner = new Map();
    for (const it of target.items) for (const sid of it.recIds) owner.set(sid, it.id);
    for (const it of target.items) {
      for (const ck of it.cats) {
        const c = Store.catByKey(ck);
        if (!c) continue;
        for (const s of Store.db.subs) {
          if (s.categoryId !== c.id) continue;
          if (owner.has(s.id)) continue;
          owner.set(s.id, it.id);
        }
      }
    }

    const vals = Store.subValues(m);
    const actualMap = new Map(target.items.map((it) => [it.id, 0]));
    for (const s of Store.db.subs) {
      const itemId = owner.get(s.id);
      if (itemId === undefined) continue;
      const v = vals.get(s.id) || { value: 0 };
      actualMap.set(itemId, (actualMap.get(itemId) || 0) + v.value);
    }

    const rows = target.items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((it) => {
      const t = (base * num(it.ratio)) / 100;
      const actual = actualMap.get(it.id) || 0;
      const gap = actual - t;
      const linkedCats = it.cats.map((k) => (Store.catByKey(k) ? Store.catByKey(k).name : k));
      const linkedRecs = it.recIds.map((rid) => (Store.sub(rid) ? Store.sub(rid).name : '')).filter(Boolean);
      return {
        id: it.id, name: it.name, color: it.color, note: it.note, ratio: num(it.ratio),
        linkedCats, linkedRecs,
        target: t, actual, gap,
        targetRate: num(it.ratio),
        actualRate: base !== 0 ? (actual / base) * 100 : 0,
        gapRate: num(it.ratio) !== 0 ? (gap / Math.max(t, 1)) * 100 : 0
      };
    });

    const ratioSum = target.items.reduce((a, b) => a + num(b.ratio), 0);
    return Promise.resolve({
      planId: target.id,
      planName: target.name,
      planDesc: target.desc,
      month: m,
      baseMode,
      base,
      allocated: [...actualMap.values()].reduce((a, b) => a + b, 0),
      ratioSum,
      rows,
      tips: buildPlanTips(rows, ratioSum)
    });
  },

  /* ---- 偏好设置 ---- */
  settings() {
    const st = Store.db.settings;
    return Promise.resolve({
      fontScale: num(st.fontScale) || 1,
      headerBg: st.headerBg || '',
      hasHeaderBg: !!(st.headerBg)
    });
  },

  saveSettings(d) {
    if (!d) return Promise.resolve(ok());
    if (d.fontScale !== undefined) Store.db.settings.fontScale = num(d.fontScale) || 1;
    if (d.headerBg !== undefined) Store.db.settings.headerBg = String(d.headerBg || '');
    Store.save();
    return Promise.resolve(ok());
  },

  /* ---- 备份 / 恢复 / 清空 / 示例 ---- */
  backup() {
    const st = Store.db.settings || {};
    const cur = Store.db.plans.find((p) => p.isCurrent) || null;
    return {
      type: 'assetbook-backup',
      version: 6,
      exportedAt: new Date().toISOString(),
      fontScale: num(st.fontScale) || 1,
      categories: Store.db.cats.map((c) => ({
        key: c.key, name: c.name, color: c.color, kind: c.kind, trackPrincipal: c.trackPrincipal ? 1 : 0
      })),
      subjects: Store.db.subs.map((s) => {
        const c = Store.cat(s.categoryId);
        return {
          _id: String(s.id), category: c ? c.key : 'cash', name: s.name,
          principal: num(s.principal), note: s.note, createdAt: s.createdAt || Date.now()
        };
      }),
      entries: Store.db.entries.map((e) => ({
        _id: String(e.id), subjectId: String(e.subjectId), month: e.month,
        delta: num(e.delta), note: e.note, createdAt: e.createdAt || Date.now()
      })),
      headerBg: st.headerBg || '',
      plans: Store.db.plans.map((p) => ({
        id: String(p.id), name: p.name, desc: p.desc, builtin: p.builtin || '',
        items: p.items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((it) => ({
          name: it.name, ratio: it.ratio, color: it.color, note: it.note,
          cats: it.cats.slice(), recIds: it.recIds.map(String)
        }))
      })),
      planCurrentId: cur ? String(cur.id) : null
    };
  },

  /** 变动明细 CSV（Excel 打开带 BOM 不乱码） */
  backupCSV() {
    const rows = Store.db.entries.slice()
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.createdAt - b.createdAt));
    const esc = (v) => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
    const lines = ['月份,一级分类,二级小类,当月变动,备注'];
    for (const e of rows) {
      const s = Store.sub(e.subjectId);
      const c = s ? Store.cat(s.categoryId) : null;
      lines.push([e.month, c ? c.name : '', s ? s.name : '', num(e.delta), e.note]
        .map(esc).join(','));
    }
    return '\uFEFF' + lines.join('\r\n');
  },

  importJSON(data) {
    if (!data || typeof data !== 'object') return Promise.reject(new Error('文件内容不是有效的 JSON 对象'));
    if (data.type !== 'assetbook-backup') return Promise.reject(new Error('这不是资产簿的备份文件（缺少标识 type=assetbook-backup）'));
    const hasNew = Array.isArray(data.subjects) || Array.isArray(data.entries);
    if (!hasNew) return Promise.reject(new Error('备份内容不完整：缺少 subjects/entries'));

    // ① 分类：按 key 补齐缺失的，已有的不覆盖（名字可能被用户改过）
    if (Array.isArray(data.categories)) {
      for (const c of data.categories) {
        if (!c || !c.key) continue;
        if (Store.catByKey(c.key)) continue;
        Store.db.cats.push({
          id: Store.nextId('cat'),
          key: c.key,
          name: String(c.name || c.key),
          color: normColor(c.color),
          kind: c.kind === 'liability' ? 'liability' : 'asset',
          trackPrincipal: c.trackPrincipal ? 1 : 0,
          sortOrder: Store.db.cats.reduce((a, x) => Math.max(a, x.sortOrder || 0), 0) + 1
        });
      }
    }

    // ② 业务数据整体覆盖：导入是「以文件为准」，不做合并
    const idMap = new Map();
    const newSubs = [];
    for (const s of (data.subjects || [])) {
      if (!s || s.name === undefined) continue;
      const cat = Store.catByKey(String(s.category || 'cash')) || Store.db.cats[0];
      if (!cat) continue;
      const sid = Store.nextId('sub');
      if (s._id !== undefined) idMap.set(String(s._id), sid);
      newSubs.push({
        id: sid,
        categoryId: cat.id,
        name: String(s.name),
        principal: cat.trackPrincipal ? num(s.principal) : 0,
        note: String(s.note || ''),
        sortOrder: newSubs.length,
        createdAt: Number(s.createdAt) || Date.now()
      });
    }

    const newEntries = [];
    for (const e of (data.entries || [])) {
      if (!e) continue;
      const sid = idMap.get(String(e.subjectId));
      if (sid === undefined) continue;
      newEntries.push({
        id: Store.nextId('ent'),
        subjectId: sid,
        month: String(e.month || currentMonth()),
        delta: num(e.delta),
        note: String(e.note || ''),
        createdAt: Number(e.createdAt) || Date.now(),
        updatedAt: Date.now()
      });
    }

    Store.db.subs = newSubs;
    Store.db.entries = newEntries;

    // ③ 方案：文件里带就整体覆盖，小类 id 用新映射
    if (Array.isArray(data.plans) && data.plans.length) {
      Store.db.plans = data.plans.map((p, i) => ({
        id: Store.nextId('plan'),
        name: String(p.name || ('方案 ' + (i + 1))),
        desc: String(p.desc || ''),
        isCurrent: 0,
        builtin: String(p.builtin || ''),
        sortOrder: i,
        items: (p.items || []).map((it, j) => ({
          id: Store.nextId('item'),
          name: String(it.name || ('配置项 ' + (j + 1))),
          ratio: num(it.ratio),
          color: normColor(it.color),
          note: String(it.note || ''),
          sortOrder: j,
          cats: (it.cats || []).slice(),
          recIds: (it.recIds || []).map((r) => Number(idMap.get(String(r)))).filter((r) => !isNaN(r))
        }))
      }));
      const curId = Number(data.planCurrentId);
      const cur = Store.db.plans.find((p) => p.id === idMap.get(String(data.planCurrentId)))
        || (curId && Store.db.plans[0]) || Store.db.plans[0];
      if (cur) cur.isCurrent = 1;
    }

    if (data.headerBg !== undefined) Store.db.settings.headerBg = String(data.headerBg || '');
    if (data.fontScale !== undefined) Store.db.settings.fontScale = num(data.fontScale) || 1;

    Store.save();
    return Promise.resolve({ ok: true, subjects: newSubs.length, entries: newEntries.length });
  },

  clearData(scope) {
    const s = scope || { assets: true };
    if (s.assets) {
      Store.db.entries = [];
      Store.db.subs = [];
    }
    if (s.categories) {
      // 分类删光就补回默认六个，否则界面会出现「无处可记」的空态
      const subIds = new Set(Store.db.subs.map((x) => x.id));
      Store.db.entries = Store.db.entries.filter((e) => !subIds.has(e.subjectId));
      Store.db.subs = [];
      Store.db.cats = Store.seed().cats.map((c) => ({ ...c, id: Store.nextId('cat') }));
    }
    if (s.plans) {
      Store.db.plans = [{
        id: Store.nextId('plan'), name: '默认方案', desc: '自定义配置方案',
        isCurrent: 1, builtin: '', sortOrder: 0, items: []
      }];
    }
    if (s.bg) Store.db.settings.headerBg = '';
    Store.save();
    return Promise.resolve(ok());
  },

  restoreDemo() {
    const months = recentMonths(6);
    const m0 = months[0];

    Store.db.entries = [];
    Store.db.subs = [];

    let order = 0;
    const mk = (catKey, name, principal, note) => {
      const cat = Store.catByKey(catKey) || Store.db.cats[0];
      const sub = {
        id: Store.nextId('sub'),
        categoryId: cat.id,
        name,
        principal: cat.trackPrincipal ? principal : 0,
        note: note || '',
        sortOrder: order++,
        createdAt: Date.now()
      };
      Store.db.subs.push(sub);
      return sub;
    };
    const ent = (sid, month, delta, note) => Store.db.entries.push({
      id: Store.nextId('ent'), subjectId: sid, month, delta, note: note || '',
      createdAt: Date.now(), updatedAt: Date.now()
    });

    const s1 = mk('cash', '建行活期', 0, '工资卡');
    ent(s1.id, m0, 20000, '初始余额');
    months.slice(1).forEach((m, i) => ent(s1.id, m, 9000 - i * 400, '工资结余'));

    const s2 = mk('cash', '家里现金', 0, '备用金');
    ent(s2.id, m0, 5000, '初始备用金');
    ent(s2.id, months[3], -1200, '日常取用');

    const s3 = mk('fixed', '自住房产', 0, '');
    ent(s3.id, m0, 1500000, '购房入账');

    const s4 = mk('fixed', '家用汽车', 0, '');
    ent(s4.id, m0, 150000, '购车入账');
    ent(s4.id, months[4], -8000, '折旧调整');

    const s5 = mk('invest', '指数基金', 180000, '定投型');
    ent(s5.id, m0, 210000, '建仓');
    months.slice(1).forEach((m) => ent(s5.id, m, 18000, '定投+收益'));

    // 保险 / 债权：建档但金额留 0，由用户按自己的保单、外借情况填
    const s6 = mk('insure', '保险', 0, '保障型');
    ent(s6.id, m0, 0, '初始记录');
    const s7 = mk('credit', '债权', 0, '外部借款');
    ent(s7.id, m0, 0, '初始记录');

    const s8 = mk('liability', '房贷余额', 0, '');
    ent(s8.id, m0, 820000, '贷款入账');
    months.slice(1).forEach((m) => ent(s8.id, m, -13000, '月供还款'));

    Store.save();
    return Promise.resolve({ ok: true, months });
  }
};

/* 脚本一加载就把数据读入内存：后面所有读写都在这个内存副本上进行，
   写操作再整体落盘，省掉每次读 JSON.parse 的开销 */
Store.load();

function calcPercentile(v) {
  const b = NETWORTH_BENCHMARK;
  if (v <= 0) return { percentile: 0, label: '后 1%' };
  if (v >= b[b.length - 1].v) return { percentile: 99, label: '前 1%' };
  for (let i = 0; i < b.length - 1; i++) {
    if (v >= b[i].v && v <= b[i + 1].v) {
      const t = (v - b[i].v) / (b[i + 1].v - b[i].v);
      const pct = b[i].p + (b[i + 1].p - b[i].p) * t;
      return {
        percentile: Math.round(pct * 10) / 10,
        label: pct >= 50 ? '前 ' + (100 - pct).toFixed(1) + '%' : '后 ' + pct.toFixed(1) + '%'
      };
    }
  }
  return { percentile: 50, label: '后 50%' };
}

function buildPlanTips(rows, ratioSum) {
  const tips = [];
  if (ratioSum > 0 && Math.abs(ratioSum - 100) > 0.5) {
    tips.push({
      level: 'warn',
      text: `方案占比合计为 ${ratioSum.toFixed(1)}%，与目标 100% 相差 ${(ratioSum - 100).toFixed(1)}%，建议先调整方案比例再对照。`
    });
  }
  rows.forEach((r) => {
    const gapRate = r.targetRate !== 0 ? ((r.actual - r.target) / Math.abs(r.target)) * 100 : 0;
    if (r.targetRate === 0 && r.actual === 0) return;
    if (Math.abs(gapRate) < 20) return;
    const over = gapRate > 0;
    tips.push({
      level: Math.abs(gapRate) >= 50 ? 'danger' : 'warn',
      text: `「${r.name}」规划 ${r.targetRate}%、实际 ${r.actualRate.toFixed(1)}%，${over ? '超出' : '低于'}目标 ${Math.abs(gapRate).toFixed(0)}%（${over ? '+' : '−'}${Math.abs(r.gap).toFixed(0)} 元）。`
    });
  });
  if (!tips.length) tips.push({ level: 'ok', text: '当前各配置项与规划目标的偏差均在 20% 以内，结构基本符合方案。' });
  return tips;
}
