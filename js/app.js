/**
 * 主应用（静态版）：导航、六个页面的渲染、三级结构 CRUD、方案管理、数据管理。
 *
 * 静态版没有服务端：读写全部走 js/api.js 的本地数据层，最终落到 localStorage。
 * 页面逻辑与线上版一致，依旧是「操作后重新取数再渲染」，只是取数不再经过网络。
 */

/* ==========================================================================
   导航配置
   ========================================================================== */
const NAV = [
  { key: 'overview', name: '概览', ic: '📊', title: '概览' },
  { key: 'charts', name: '图表', ic: '📈', title: '图表分析' },
  { key: 'records', name: '记录', ic: '📋', title: '资产记录' },
  { key: 'plan', name: '规划', ic: '🧭', title: '资产规划' },
  { key: 'rank', name: '排位', ic: '🏅', title: '净值排位' },
  { key: 'settings', name: '设置', ic: '⚙️', title: '设置' }
];
// 底部 Tab 只放五项：排位入口在概览页的快捷按钮里，避免主导航挤成六宫格
const TAB_KEYS = ['overview', 'charts', 'records', 'plan', 'settings'];

const ENT_PAGE_SIZE = 8;

/* 全局状态（纯 UI 状态，业务数据一律现取现用） */
const S = {
  tab: 'overview',
  cats: [],
  months: { list: [], current: '', latest: '' },
  recMonth: '', recCat: 'all',
  chMonth: '', diffA: '', diffB: '',
  rankMonth: '',
  planMonth: '', planBase: 'assets', planId: null,
  plans: [],
  settings: {},
  user: null,
  // 弹层内的临时状态
  editId: null, formCat: 'cash',
  entSubject: null, entSign: 1, entEditId: null, entPage: 0, entList: [],
  catEditKey: null, catDraft: { kind: 'asset', principal: 0, color: '#c8a45c' },
  planDraft: null,
};

/* ==========================================================================
   主应用
   ========================================================================== */
const App = {

  /* ---------------- 启动 ---------------- */
  async boot() {
    document.getElementById('appShell').style.display = 'flex';
    this.buildNav();

    // 基础数据：分类 / 月份 / 设置（含背景图后台加载）
    await this.loadBaseData();
    const months = S.months;

    S.recMonth = months.latest;
    S.chMonth = months.latest;
    S.rankMonth = months.latest;
    S.planMonth = months.latest;
    S.diffA = months.list.length > 1 ? months.list[months.list.length - 2] : months.latest;
    S.diffB = months.latest;

    this.syncMonthInputs();

    this.go('overview');
  },

  /**
   * 基础数据一次性重载：分类 / 月份 / 设置 / 背景图。
   * boot 和右上角「刷新数据」共用 —— 刷新功能必须真的把基数据拉一遍，
   * 否则像背景图这种后台加载的内容，点了刷新也不会恢复。
   */
  async loadBaseData() {
    const [cats, months, settings] = await Promise.all([Api.categories(), Api.months(), Api.settings()]);
    S.cats = cats.categories;
    S.months = months;
    S.settings = settings;

    this.applyFontScale(settings.fontScale || 1);
    this.applyHeaderBg();

    this.buildRecTabs();
    this.buildChartTabs();
  },

  buildNav() {
    document.getElementById('sideNav').innerHTML = NAV.map((n) =>
      `<div class="nav-item" data-k="${n.key}" onclick="App.go('${n.key}')"><span class="ic">${n.ic}</span>${n.name}</div>`
    ).join('');
    document.getElementById('tabbar').innerHTML = NAV.filter((n) => TAB_KEYS.includes(n.key)).map((n) =>
      `<div class="t" data-k="${n.key}" onclick="App.go('${n.key}')"><span class="ic">${n.ic}</span>${n.name}</div>`
    ).join('');
  },

  /* ---------------- 导航 ---------------- */
  go(tab) {
    S.tab = tab;
    document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === 'sec-' + tab));
    document.querySelectorAll('.nav-item, .tabbar .t').forEach((el) => el.classList.toggle('active', el.dataset.k === tab));

    const nav = NAV.find((n) => n.key === tab) || NAV[0];
    document.getElementById('pageTitle').textContent = nav.title;
    document.getElementById('topMonth').textContent = Fmt.month(S.months.current);

    // FAB（新增二级小类）只在「记录」页显示，其余页面隐藏
    const fab = document.getElementById('fabAdd');
    if (fab) fab.style.display = tab === 'records' ? '' : 'none';

    document.getElementById('content').scrollTop = 0;
    this.refresh();
  },

  /** 按当前页重新拉数据 */
  refresh() {
    const t = S.tab;
    if (t === 'overview') this.renderOverview();
    else if (t === 'records') this.renderRecords();
    else if (t === 'charts') this.renderCharts();
    else if (t === 'rank') this.renderRank();
    else if (t === 'plan') this.renderPlan();
    else if (t === 'settings') this.renderSettings();
  },

  /** 顶栏菜单：PC 上侧边栏已有入口，这里主要给手机用 */
  quickMenu() {
    Dlg.open({
      title: '更多操作',
      msg: '数据保存在本浏览器，换设备不会自动同步。\n定期导出备份，清理浏览器数据时才不会丢。',
      okText: '刷新数据',
      cancelText: '导出备份'
    }).then(async (ok) => {
      if (!ok) { this.exportJSON(); return; }
      // 完整重载基数据（分类/月份/设置/背景图），再刷新当前页
      await guard(this.loadBaseData());
      this.syncMonthInputs();
      this.refresh();
      toast('已刷新', 'ok');
    });
  },

  syncMonthInputs() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('recMonth', S.recMonth); set('chMonth', S.chMonth);
    set('diffMonthA', S.diffA); set('diffMonthB', S.diffB);
    set('rkMonth', S.rankMonth); set('planMonth', S.planMonth);
  },

  catOf(k) { return S.cats.find((c) => c.key === k) || S.cats[0]; },

  /* ==========================================================================
     概览
     ========================================================================== */
  async renderOverview() {
    const d = await guard(Api.overview(6));
    if (!d) return;

    document.getElementById('ovMonthLabel').textContent = Fmt.month(d.month);
    document.getElementById('ovNet').textContent = Fmt.money(d.netWorth);
    document.getElementById('ovAsset').textContent = Fmt.money(d.totalAssets);
    document.getElementById('ovLia').textContent = Fmt.money(d.liability);
    document.getElementById('ovDiff').textContent = Fmt.signed(d.monthDiff);
    document.getElementById('ovDiff').style.color = d.monthDiff > 0 ? 'var(--red)' : (d.monthDiff < 0 ? 'var(--olive)' : 'var(--muted)');

    Charts.line(document.getElementById('ovChart'),
      d.trend.map((t) => ({ v: t.netWorth, label: Fmt.shortMonth(t.month) })), '#9d4238', 180);

    // 分类进度条
    const max = Math.max(...d.byCategory.map((c) => Math.abs(c.value)), 1);
    document.getElementById('ovCatBars').innerHTML = d.byCategory.length
      ? d.byCategory.map((c) => {
          const pct = (Math.abs(c.value) / max) * 100;
          const all = d.totalAssets || 1;
          return `<div class="bar">
            <div class="top"><span class="r">${Fmt.esc(c.name)}</span><span>${Fmt.money(c.value)} · ${((c.value / all) * 100).toFixed(1)}%</span></div>
            <div class="track"><div class="fill" style="width:${Math.max(pct, 0.6)}%;background:${c.color}"></div></div>
          </div>`;
        }).join('')
      : '<div class="empty">还没有分类数据</div>';
  },

  /* ==========================================================================
     记录
     ========================================================================== */
  buildRecTabs() {
    const el = document.getElementById('recTabs');
    el.innerHTML = `<div class="tab ${S.recCat === 'all' ? 'active' : ''}" onclick="App.setRecCat('all')">全部</div>` +
      S.cats.map((c) => `<div class="tab ${S.recCat === c.key ? 'active' : ''}" onclick="App.setRecCat('${c.key}')">${Fmt.esc(c.name)}</div>`).join('');
  },

  setRecCat(k) { S.recCat = k; this.buildRecTabs(); this.renderRecords(); },
  onRecMonth(v) { S.recMonth = v; this.renderRecords(); },

  async renderRecords() {
    const d = await guard(Api.records(S.recMonth, S.recCat));
    if (!d) return;

    if (!d.groups.length) {
      document.getElementById('recList').innerHTML =
        `<div class="card"><div class="empty">本月还没有记录<br/>点右下角「＋」新增一个小类开始记账</div></div>`;
      return;
    }

    // 建索引：编辑 / 明细弹窗直接取用，省掉一次额外请求
    const idx = {};
    d.groups.forEach((g) => g.items.forEach((i) => { idx[i.id] = i; }));
    this._recIndex = idx;
    this._totalSubjects = d.total;

    document.getElementById('recList').innerHTML = d.groups.map((g) => {
      const sum = g.items.reduce((a, i) => a + i.value, 0);
      // 金额绝对值大的排前面：同一分类里先看到"大头"，与原版一致
      const items = g.items.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).map((i) => {
        const dcls = i.delta > 0 ? 'd-up' : (i.delta < 0 ? 'd-down' : 'd-flat');
        const dsign = i.delta > 0 ? '+' : (i.delta < 0 ? '-' : '');
        const dtxt = i.delta === 0 ? '本月无变动' : dsign + Fmt.money(Math.abs(i.delta)).replace('-', '');
        const profit = i.profit !== null
          ? `<div class="profit ${i.profit < 0 ? 'loss' : ''}">回报 ${Fmt.signed(i.profit)}${i.profitRate !== null ? ' · ' + i.profitRate.toFixed(1) + '%' : ''}</div>` : '';
        return `<div class="item" onclick="App.openEntries(${i.id})">
          <span class="dot" style="background:${g.color}"></span>
          <div class="info">
            <div class="name">${Fmt.esc(i.name)}</div>
            <div class="meta">${Fmt.esc(i.note || g.name)}${i.entryCount ? ' · ' + i.entryCount + ' 条变动' : ''}</div>
            <div class="${dcls}">${dtxt}</div>
            ${profit}
          </div>
          <div class="amt ${i.value < 0 ? 'neg' : ''}">${Fmt.money(i.value)}</div>
          <div class="ops">
            <button onclick="event.stopPropagation();App.openForm(${i.id})">编辑</button>
            <button onclick="event.stopPropagation();App.delSubject(${i.id},'${Fmt.esc(i.name)}')">删除</button>
          </div>
        </div>`;
      }).join('');

      return `<div class="card">
        <div class="group-title" style="margin-top:0">
          <span class="dot" style="background:${g.color}"></span>${Fmt.esc(g.name)}
          <span class="sum">${Fmt.money(sum)}</span>
        </div>
        <div class="list">${items}</div>
      </div>`;
    }).join('');
  },

  /* ---------------- 新增 / 编辑二级小类 ---------------- */
  openForm(id) {
    S.editId = id || null;
    document.getElementById('formTitle').textContent = id ? '编辑二级小类' : '新增二级小类';

    // 表单里的分类选择器
    document.getElementById('catSeg').innerHTML = S.cats.map((c) =>
      `<div class="opt" data-k="${c.key}" onclick="App.setFormCat('${c.key}')">${Fmt.esc(c.name)}</div>`).join('');

    if (id) {
      // 编辑：从当前列表缓存里取回该小类，省一次请求
      const item = (this._recIndex || {})[id];
      if (!item) { toast('数据已刷新，请重新打开', 'err'); return; }
      S.formCat = item.catKey;
      document.getElementById('fName').value = item.name;
      document.getElementById('fNote').value = item.note || '';
      document.getElementById('fAmount').value = item.seedDelta !== undefined ? item.seedDelta : '';
      document.getElementById('fCurVal').value = Fmt.money(item.value);
      this._editBase = item.value;
      this._editSeedDelta = item.seedDelta !== undefined ? Number(item.seedDelta) : 0;
    } else {
      S.formCat = S.recCat !== 'all' ? S.recCat : (S.cats[0] || {}).key;
      document.getElementById('fName').value = '';
      document.getElementById('fNote').value = '';
      document.getElementById('fAmount').value = '';
      document.getElementById('fPrincipal').value = '';
      this._editBase = 0; this._editSeedDelta = 0;
      document.getElementById('fMonth').value = S.recMonth;
    }

    this.applyFormCat();
    document.getElementById('initField').style.display = 'block';
    document.getElementById('fMonthField').style.display = id ? 'none' : 'block';
    document.getElementById('curValField').style.display = id ? 'block' : 'none';
    document.getElementById('curValMonth').textContent = Fmt.month(S.recMonth);
    document.getElementById('mask').classList.add('show');
  },

  closeForm() { document.getElementById('mask').classList.remove('show'); S.editId = null; },

  setFormCat(k) { S.formCat = k; this.applyFormCat(); },

  applyFormCat() {
    const c = this.catOf(S.formCat);
    document.querySelectorAll('#catSeg .opt').forEach((o) => o.classList.toggle('active', o.dataset.k === S.formCat));
    document.getElementById('principalField').style.display = c && c.trackPrincipal ? 'block' : 'none';

    const hint = {
      cash: '现金账户或者银行卡等', fixed: '自住房产、自用汽车、设备等',
      invest: '股票、基金、数字货币、公寓房、商铺等等', insure: '重疾险、储蓄险等',
      credit: '谁欠你钱，记他名字', liability: '房贷、车贷、信用卡等'
    };
    document.getElementById('nameHint').textContent = hint[S.formCat] || '如：招商银行储蓄卡 / 自住房产';
  },

  /** 编辑态：改「初始金额」实时预览当前值 */
  onFormAmtInput() {
    if (!S.editId) return;
    const raw = document.getElementById('fAmount').value.trim();
    const nv = parseFloat(raw);
    const cur = isNaN(nv) ? this._editBase : this._editBase - this._editSeedDelta + nv;
    document.getElementById('fCurVal').value = Fmt.money(cur);
  },

  async saveForm() {
    const name = document.getElementById('fName').value.trim();
    if (!name) { toast('请输入名称', 'err'); return; }
    const note = document.getElementById('fNote').value.trim();
    const fc = this.catOf(S.formCat);
    const principal = fc && fc.trackPrincipal ? (parseFloat(document.getElementById('fPrincipal').value) || 0) : 0;

    try {
      if (S.editId) {
        const raw = document.getElementById('fAmount').value.trim();
        await Api.updateSubject(S.editId, {
          categoryId: fc.id, name, principal, note,
          initialAmount: raw === '' ? undefined : parseFloat(raw)
        });
      } else {
        const amount = parseFloat(document.getElementById('fAmount').value);
        if (isNaN(amount)) { toast('请输入有效初始金额', 'err'); return; }
        const month = document.getElementById('fMonth').value || S.recMonth;
        await Api.addSubject({ categoryId: fc.id, name, initialAmount: amount, month, principal, note });
        S.recMonth = month;
      }
      this.closeForm();
      toast('已保存', 'ok');
      this.afterDataChange();
    } catch (e) { toast(e.message, 'err'); }
  },

  async delSubject(id, name) {
    const ok = await Dlg.confirm(`确定删除「${name}」吗？\n其名下的全部变动记录会一并删除，且无法恢复。`, { okText: '删除' });
    if (!ok) return;
    try { await Api.deleteSubject(id); toast('已删除', 'ok'); this.afterDataChange(); }
    catch (e) { toast(e.message, 'err'); }
  },

  /* ---------------- 变动记录明细 ---------------- */
  async openEntries(sid) {
    S.entSubject = sid;
    S.entEditId = null; S.entPage = 0; S.entSign = 1;
    document.querySelectorAll('#entSignSeg .opt').forEach((o) => o.classList.toggle('active', o.dataset.v === '1'));

    const item = (this._recIndex || {})[sid];
    document.getElementById('entTitle').textContent = (item ? item.name : '变动记录') + ' · 变动记录';
    document.getElementById('entMonth').value = S.recMonth;
    document.getElementById('entAmt').value = '';
    document.getElementById('entNote').value = '';
    document.getElementById('entSave').textContent = '添加';
    document.getElementById('entCancelEdit').style.display = 'none';

    await this.loadEntries();
    document.getElementById('entryMask').classList.add('show');
  },

  /**
   * 关变动记录弹层。
   * 之前这里只把 _dirtyRecords 置了 true 却没人消费，导致「在小类里改完余额，
   * 关掉弹层后记录页和概览还显示旧值」。现在改成关掉时统一刷新一次。
   */
  async closeEntries() {
    document.getElementById('entryMask').classList.remove('show');
    S.entSubject = null;
    if (!this._dirtyRecords) return;
    this._dirtyRecords = false;

    // 新增记录可能落在一个全新的月份，月份列表要重拉，否则下拉里选不到
    const months = await guard(Api.months());
    if (months) {
      S.months = months;
      if (!months.list.includes(S.recMonth)) S.recMonth = months.latest;
      this.syncMonthInputs();
      this.buildRecTabs();
    }
    this.refresh();
  },

  async loadEntries() {
    if (!S.entSubject) return;
    const d = await guard(Api.entries('subjectId=' + S.entSubject));
    if (!d) return;
    S.entList = d.entries.slice().reverse();   // 展示：月份倒序，新的在上
    this.renderEntries();
  },

  renderEntries() {
    const list = S.entList;
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / ENT_PAGE_SIZE));
    if (S.entPage >= pages) S.entPage = pages - 1;
    const slice = list.slice(S.entPage * ENT_PAGE_SIZE, S.entPage * ENT_PAGE_SIZE + ENT_PAGE_SIZE);

    document.getElementById('entSub').innerHTML = total
      ? `共 ${total} 条记录，累计当前值 <b>${Fmt.money(list[0].balance)}</b>（截至最新月份）`
      : '还没有变动记录，在上方添加第一条。';

    document.getElementById('entList').innerHTML = slice.length ? slice.map((e) => {
      const cls = e.delta > 0 ? 'up' : (e.delta < 0 ? 'down' : '');
      const sign = e.delta > 0 ? '+' : (e.delta < 0 ? '-' : '');
      return `<div class="ent-row-item">
        <span class="e-m">${Fmt.esc(e.month)}</span>
        <span class="e-d ${cls}">${sign}${Fmt.money(Math.abs(e.delta)).replace('-', '')}</span>
        <span class="e-n">${Fmt.esc(e.note || '')}</span>
        <span class="e-b">余 ${Fmt.money(e.balance)}</span>
        <span class="e-ops">
          <button onclick="App.editEntry(${e.id})">编辑</button>
          <button onclick="App.delEntry(${e.id})">删除</button>
        </span>
      </div>`;
    }).join('') + (pages > 1 ? `<div class="pager">
        <button onclick="App.entGoPage(-1)" ${S.entPage === 0 ? 'disabled' : ''}>上一页</button>
        <span>${S.entPage + 1} / ${pages}</span>
        <button onclick="App.entGoPage(1)" ${S.entPage >= pages - 1 ? 'disabled' : ''}>下一页</button>
      </div>` : '')
      : '<div class="empty" style="padding:24px 0">暂无变动记录</div>';
  },

  entGoPage(d) { S.entPage += d; this.renderEntries(); },

  setEntSign(v) {
    S.entSign = v;
    document.querySelectorAll('#entSignSeg .opt').forEach((o) => o.classList.toggle('active', Number(o.dataset.v) === v));
  },

  /** 有人习惯直接打 -500 表示支出：自动切到「减少」并把负号去掉，避免和分段控件打架 */
  onEntAmtInput(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s.startsWith('-')) return;
    this.setEntSign(-1);
    const el = document.getElementById('entAmt');
    el.value = s.replace(/^-+/, '');
  },

  async saveEntry() {
    const amt = parseFloat(document.getElementById('entAmt').value);
    if (isNaN(amt) || amt === 0) { toast('请输入有效金额', 'err'); return; }
    const month = document.getElementById('entMonth').value || S.recMonth;
    const note = document.getElementById('entNote').value.trim();
    const delta = Math.abs(amt) * S.entSign;

    try {
      if (S.entEditId) {
        await Api.updateEntry(S.entEditId, { month, delta, note });
        S.entEditId = null;
        document.getElementById('entSave').textContent = '添加';
        document.getElementById('entCancelEdit').style.display = 'none';
        toast('已更新', 'ok');
      } else {
        await Api.addEntry({ subjectId: S.entSubject, month, delta, note });
        toast('已添加', 'ok');
      }
      document.getElementById('entAmt').value = '';
      document.getElementById('entNote').value = '';
      await this.loadEntries();
      this._dirtyRecords = true;
    } catch (e) { toast(e.message, 'err'); }
  },

  editEntry(id) {
    const e = S.entList.find((x) => x.id === id);
    if (!e) return;
    S.entEditId = id;
    this.setEntSign(e.delta >= 0 ? 1 : -1);
    document.getElementById('entAmt').value = Math.abs(e.delta);
    document.getElementById('entMonth').value = e.month;
    document.getElementById('entNote').value = e.note || '';
    document.getElementById('entSave').textContent = '保存';
    document.getElementById('entCancelEdit').style.display = '';
    document.getElementById('entAmt').focus();
  },

  cancelEntryEdit() {
    S.entEditId = null;
    document.getElementById('entAmt').value = '';
    document.getElementById('entNote').value = '';
    document.getElementById('entSave').textContent = '添加';
    document.getElementById('entCancelEdit').style.display = 'none';
  },

  async delEntry(id) {
    const ok = await Dlg.confirm('确定删除这条变动记录吗？删除后该小类当前值会自动重算。', { okText: '删除' });
    if (!ok) return;
    try {
      await Api.deleteEntry(id);
      toast('已删除', 'ok');
      await this.loadEntries();
      this._dirtyRecords = true;
    } catch (e) { toast(e.message, 'err'); }
  },

  /* ==========================================================================
     图表
     ========================================================================== */
  buildChartTabs() {
    document.getElementById('chartTabs').innerHTML =
      `<div class="tab active" data-p="composition" onclick="App.setChartPane('composition')">资产构成</div>
       <div class="tab" data-p="change" onclick="App.setChartPane('change')">资产变化</div>`;
  },

  setChartPane(p) {
    document.querySelectorAll('#chartTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.p === p));
    document.getElementById('pane-composition').classList.toggle('active', p === 'composition');
    document.getElementById('pane-change').classList.toggle('active', p === 'change');
    this.renderCharts();
  },

  onChMonth(v) { S.chMonth = v; this.renderCharts(); },
  onDiffA(v) { S.diffA = v; this.renderCharts(); },
  onDiffB(v) { S.diffB = v; this.renderCharts(); },
  swapDiff() { const a = S.diffA; S.diffA = S.diffB; S.diffB = a; this.syncMonthInputs(); this.renderCharts(); },

  async renderCharts() {
    const compActive = document.getElementById('pane-composition').classList.contains('active');

    if (compActive) {
      const d = await guard(Api.composition(S.chMonth));
      if (!d) return;
      document.getElementById('chMonthLabel').textContent = Fmt.month(d.month);
      document.getElementById('cAsset').textContent = Fmt.money(d.totalAssets);
      document.getElementById('cLia').textContent = Fmt.money(d.liability);
      document.getElementById('cNet').textContent = Fmt.money(d.netWorth);

      Charts.pie(document.getElementById('pieChart'), d.slices, { label: '总资产', value: Fmt.money(d.totalAssets) });
      document.getElementById('pieLegend').innerHTML = d.slices.map((s) =>
        `<div class="li"><span class="d" style="background:${s.color}"></span>${Fmt.esc(s.name)} ${s.rate.toFixed(1)}%</div>`).join('');

      const max = Math.max(...d.slices.map((s) => s.value), 1);
      document.getElementById('bars').innerHTML = d.slices.length ? d.slices.map((s) =>
        `<div class="bar">
          <div class="top"><span class="r">${Fmt.esc(s.name)}</span><span>${Fmt.money(s.value)} · ${s.rate.toFixed(1)}%</span></div>
          <div class="track"><div class="fill" style="width:${Math.max((s.value / max) * 100, 0.6)}%;background:${s.color}"></div></div>
        </div>`).join('') : '<div class="empty">该月暂无资产数据</div>';

      Charts.line(document.getElementById('trendChart'),
        d.trend.map((t) => ({ v: t.netWorth, label: Fmt.shortMonth(t.month) })), '#9d4238', 240);
    } else {
      const d = await guard(Api.diff(S.diffA, S.diffB));
      if (!d) return;
      document.getElementById('diffRangeLabel').textContent = Fmt.month(d.from) + ' → ' + Fmt.month(d.to);
      const big = document.getElementById('diffNet');
      big.textContent = Fmt.signed(d.netDiff);
      big.className = 'big ' + (d.netDiff > 0 ? 'up' : (d.netDiff < 0 ? 'down' : 'flat'));
      document.getElementById('diffRate').textContent = '变化幅度 ' + Fmt.rate(d.netRate);
      document.getElementById('diffPrev').textContent = Fmt.money(d.prevNet);
      document.getElementById('diffCur').textContent = Fmt.money(d.curNet);

      // 按变动绝对值降序：真正动了大钱的分类排在最前面，一眼看到"钱去哪了"
      const rows = d.rows.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      Charts.diffBars(document.getElementById('diffChart'), rows.filter((r) => r.diff !== 0));

      document.getElementById('diffList').innerHTML = rows.length ? rows.map((r) => {
        const cls = r.diff > 0 ? 'up' : (r.diff < 0 ? 'down' : 'flat');
        return `<div class="diff-row">
          <span class="dot" style="background:${r.color}"></span>
          <span class="dn">${Fmt.esc(r.name)}</span>
          <span class="dm">
            <div class="flow">${Fmt.money(r.prev)} → ${Fmt.money(r.cur)}</div>
            <div class="delta ${cls}">${Fmt.signed(r.diff)}</div>
          </span>
        </div>`;
      }).join('') : '<div class="diff-empty">暂无数据</div>';
    }
  },

  /* ==========================================================================
     净值排位
     ========================================================================== */
  onRkMonth(v) { S.rankMonth = v; this.renderRank(); },

  async renderRank() {
    const d = await guard(Api.rank(S.rankMonth));
    if (!d) return;

    // 先按内置基准填一遍。这里必须 await —— AI 结果要覆盖它，
    // 不等的话两者并发，内置值反而可能后写覆盖掉 AI 值
    document.getElementById('rkNum').textContent = d.percentile.toFixed(1) + '%';
    document.getElementById('rkDesc').textContent = `你的净资产超过全国约 ${d.percentile.toFixed(1)}% 的人群（${d.label}）`;
    document.getElementById('rkNet').textContent = Fmt.money(d.netWorth);
    document.getElementById('rkAsset').textContent = Fmt.money(d.totalAssets);
    document.getElementById('rkLia').textContent = Fmt.money(d.liability);
    document.getElementById('rkDisc').innerHTML =
      `口径：净资产 ${Fmt.money(d.netWorth)}（统计月 ${Fmt.month(d.month)}）<br/>` +
      `分位由<b>内置示例基准</b>线性插值估算，非权威统计数据，仅供娱乐参考，不构成任何结论。`;
  },

  /* ==========================================================================
     规划
     ========================================================================== */
  async renderPlan() {
    // 方案列表（首次或数据变更后拉取）
    if (!S.plans.length || this._plansDirty) {
      const p = await guard(Api.plans());
      if (!p) return;
      S.plans = p.plans;
      S.planId = p.currentId;
      this._plansDirty = false;
    }
    if (!S.planId) S.planId = S.plans[0]?.id;

    document.getElementById('planTabs').innerHTML = S.plans.map((p) =>
      `<div class="tab ${p.id === S.planId ? 'active' : ''}" onclick="App.setPlan(${p.id})">${Fmt.esc(p.name)}</div>`).join('');
    const cur = S.plans.find((p) => p.id === S.planId);
    document.getElementById('planDesc').textContent = cur ? (cur.desc || '') : '';

    document.getElementById('planMonthLabel').textContent = Fmt.month(S.planMonth);
    document.querySelectorAll('#planBaseSeg .opt').forEach((o) => o.classList.toggle('active', o.dataset.v === S.planBase));

    const d = await guard(Api.planCompare(S.planMonth, S.planBase, S.planId));
    if (!d) return;

    document.getElementById('planBaseVal').textContent = Fmt.money(d.base);
    Charts.pie(document.getElementById('planPie'),
      d.rows.map((r) => ({ value: Math.abs(r.target), color: r.color })),
      { label: '配置基数', value: Fmt.money(d.base) });
    document.getElementById('planLegend').innerHTML = d.rows.map((r) =>
      `<div class="li"><span class="d" style="background:${r.color}"></span>${Fmt.esc(r.name)} ${r.ratio}%</div>`).join('');

    Charts.planBars(document.getElementById('planBars'),
      d.rows.map((r) => ({ name: r.name, target: r.target, actual: r.actual, color: r.color })));

    document.getElementById('planRows').innerHTML = d.rows.length ? d.rows.map((r) => {
      const st = this.planRowStatus(r);
      const cls = r.gap === 0 ? '' : (r.gap > 0 ? 'over' : 'under');
      const link = [].concat(
        (r.linkedCats || []).length ? '分类：' + r.linkedCats.join('、') : [],
        (r.linkedRecs || []).length ? '细选：' + r.linkedRecs.join('、') : []
      ).join(' · ');
      return `<div class="plan-row">
        <span class="pn">${Fmt.esc(r.name)} <span class="muted fs-11">${r.ratio}%</span>
          ${link ? `<div class="pn-sub">${Fmt.esc(link)}</div>` : ''}
        </span>
        <span class="pv">
          目标 ${Fmt.money(r.target)} · 实际 ${Fmt.money(r.actual)}
          <div class="gap ${cls}">${Fmt.signed(r.gap)}<span class="st-tag ${st.cls}">${st.label}</span></div>
        </span>
      </div>`;
    }).join('') : '<div class="empty">该方案还没有配置项目</div>';

    const ic = { ok: '✅', warn: '⚠️', danger: '🔴' };
    document.getElementById('planTips').innerHTML = d.tips.map((t) =>
      `<div class="tip ${t.level}"><span class="ic">${ic[t.level] || '•'}</span><span>${Fmt.esc(t.text)}</span></div>`).join('');
  },

  /**
   * 规划行的达标状态。用「差额 ÷ 目标」而不是绝对金额：
   * 100 万的 5% 和 1 万的 5% 完全不是一个量级，按相对偏差判断才有可比性。
   */
  planRowStatus(r) {
    if (!r.ratio) return { label: '未设目标', cls: '' };
    const g = Number(r.gapRate) || 0;
    if (Math.abs(g) <= 5) return { label: '达标', cls: 'ok' };
    if (g < -20) return { label: '明显偏低', cls: 'under' };
    if (g < -5) return { label: '略低', cls: 'under' };
    if (g > 20) return { label: '明显超配', cls: 'over' };
    return { label: '略高', cls: 'over' };
  },

  setPlan(id) {
    S.planId = id;
    document.querySelectorAll('#planTabs .tab').forEach((t) => t.classList.remove('active'));
    this.renderPlan();
    Api.setCurrentPlan(id).catch(() => {});
  },

  onPlanMonth(v) { S.planMonth = v; this.renderPlan(); },

  /* ==========================================================================
     设置
     ========================================================================== */
  async renderSettings() {
    const st = await guard(Api.settings());
    if (st) S.settings = st;
    document.getElementById('bgStatus').textContent = (S.settings.headerBg || S.settings.hasHeaderBg) ? '（已设置）' : '（未设置）';
  },

  /* ---------------- 全局字号缩放 ---------------- */
  _fontRules: null,
  collectFontRules() {
    const list = [];
    /** 输入类选择器跳过：字号必须固定 ≥16px，否则 iOS 聚焦会放大页面（见 initInputFocusGuard） */
    const isInputRule = (sel) => {
      const s = String(sel || '').toLowerCase();
      if (!s) return false;
      // 明确命中 input / select / textarea 的选择器一律排除
      return /(^|[\s,>+~])(input|select|textarea)([\s,{.:[\]>+~#]|$)/.test(s);
    };
    const walk = (rules) => {
      for (const r of rules) {
        try {
          if (r.cssRules && r.cssRules.length) walk(r.cssRules);
          if (r.style && !isInputRule(r.selectorText)) {
            const v = r.style.getPropertyValue('font-size');
            if (v) { const m = /^([\d.]+)px$/.exec(v.trim()); if (m) list.push({ r, px: parseFloat(m[1]) }); }
          }
        } catch (e) { /* 跨域样式表读不到，忽略 */ }
      }
    };
    try {
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) {} }
    } catch (e) {}
    return list;
  },
  /**
   * 全站字号都是 px，没法靠 html{font-size} 缩放，
   * 所以遍历样式表把每条 font-size 的原始值记下来，切档时统一改写为 N×倍数。
   */
  applyFontScale(s) {
    if (!this._fontRules) this._fontRules = this.collectFontRules();
    const k = isFinite(s) && s > 0 ? s : 1;
    for (const o of this._fontRules) {
      try { o.r.style.setProperty('font-size', (o.px * k).toFixed(2) + 'px'); } catch (e) {}
    }
    document.querySelectorAll('#fsSeg .opt').forEach((op) => op.classList.toggle('active', parseFloat(op.dataset.fs) === k));
  },
  setFontScale(v) {
    this.applyFontScale(v);
    Api.saveSettings({ fontScale: v }).catch(() => {});
  },

  /* ---------------- 概览背景图 ---------------- */
  applyHeaderBg() {
    const hero = document.getElementById('hero');
    const bg = document.getElementById('heroBg');
    const url = S.settings.headerBg || '';
    if (url) { bg.src = url; hero.classList.add('has-bg'); }
    else { bg.removeAttribute('src'); hero.classList.remove('has-bg'); }
    // 封面右上角的「自定义封面」提示已按要求移除，始终留空
    const tip = document.getElementById('bgTip');
    if (tip) tip.textContent = '';
  },

  pickHeaderBg() {
    const inp = document.getElementById('hiddenFile');
    inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.value = '';
      if (!f) return;
      this.compressImage(f, 1080, async (dataUrl) => {
        try {
          await Api.saveSettings({ headerBg: dataUrl });
          S.settings.headerBg = dataUrl;
          S.settings.hasHeaderBg = !!dataUrl;
          this.applyHeaderBg();
          toast('背景已更新', 'ok');
        } catch (e) { toast(e.message || '保存失败，图片可能过大', 'err'); }
      });
    };
    inp.click();
  },

  async clearHeaderBg() {
    const ok = await Dlg.confirm('确定清除概览背景图吗？', { okText: '清除' });
    if (!ok) return;
    await Api.saveSettings({ headerBg: '' });
    S.settings.headerBg = '';
    S.settings.hasHeaderBg = false;
    this.applyHeaderBg();
    toast('已清除', 'ok');
  },

  /** 压缩到长边 maxEdge，转 dataURL（概览封面不需要原图分辨率，省存储也省流量） */
  compressImage(file, maxEdge, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => toast('图片读取失败', 'err');
      img.src = reader.result;
    };
    reader.onerror = () => toast('文件读取失败', 'err');
    reader.readAsDataURL(file);
  },

  /* ---------------- 分类管理 ---------------- */
  openCatMgr() { this.renderCatList(); document.getElementById('catMask').classList.add('show'); },
  closeCatMgr() { document.getElementById('catMask').classList.remove('show'); this.closeCatEditor(); },

  async renderCatList() {
    const d = await guard(Api.categories());
    if (!d) return;
    S.cats = d.categories;
    document.getElementById('catList').innerHTML = S.cats.map((c) => `
      <div class="mgr-row">
        <span class="m-sw" style="background:${c.color}"></span>
        <span class="m-name">${Fmt.esc(c.name)}</span>
        ${c.kind === 'liability' ? '<span class="m-cur">负债</span>' : ''}
        ${c.trackPrincipal ? '<span class="m-cur">记本金</span>' : ''}
        <span class="m-extra">${c.subjectCount} 项</span>
        <span class="m-ops">
          <button onclick="App.openCatEditor('${c.key}')">编辑</button>
          <button onclick="App.delCat('${c.key}','${Fmt.esc(c.name)}',${c.subjectCount})">删除</button>
        </span>
      </div>`).join('');
  },

  closeCatEditor() { document.getElementById('catEditor').style.display = 'none'; S.catEditKey = null; },

  openCatEditor(key) {
    const c = key ? S.cats.find((x) => x.key === key) : null;
    S.catEditKey = key || null;
    S.catDraft = { kind: c ? c.kind : 'asset', principal: c ? (c.trackPrincipal ? 1 : 0) : 0, color: c ? c.color : '#c8a45c' };

    document.getElementById('catName').value = c ? c.name : '';
    document.getElementById('catColor').value = S.catDraft.color;
    document.getElementById('catColorHex').textContent = S.catDraft.color;
    document.querySelectorAll('#catKindSeg .opt').forEach((o) => o.classList.toggle('active', o.dataset.k === S.catDraft.kind));
    document.querySelectorAll('#catPrincipalSeg .opt').forEach((o) => o.classList.toggle('active', Number(o.dataset.v) === S.catDraft.principal));
    document.getElementById('catErr').textContent = '';

    const palette = ['#9d4238', '#b5654d', '#c8a45c', '#7a8450', '#5f7161', '#8a6f5c', '#a98467', '#c97b63', '#d4a373', '#6b705c', '#ad6a4c', '#7f4f37'];
    document.getElementById('catColorQuick').innerHTML = palette.map((p) =>
      `<span style="background:${p}" onclick="App.onCatColor('${p}')"></span>`).join('');

    document.getElementById('catEditor').style.display = 'block';
  },

  setCatKind(k) {
    S.catDraft.kind = k;
    document.querySelectorAll('#catKindSeg .opt').forEach((o) => o.classList.toggle('active', o.dataset.k === k));
  },
  setCatPrincipal(v) {
    S.catDraft.principal = v;
    document.querySelectorAll('#catPrincipalSeg .opt').forEach((o) => o.classList.toggle('active', Number(o.dataset.v) === v));
  },
  onCatColor(v) {
    S.catDraft.color = v;
    document.getElementById('catColor').value = v;
    document.getElementById('catColorHex').textContent = v;
  },

  async saveCatEditor() {
    const name = document.getElementById('catName').value.trim();
    if (!name) { document.getElementById('catErr').textContent = '请输入分类名称'; return; }
    const payload = { name, color: S.catDraft.color, kind: S.catDraft.kind, trackPrincipal: S.catDraft.principal === 1 };
    try {
      if (S.catEditKey) {
        const c = S.cats.find((x) => x.key === S.catEditKey);
        await Api.updateCategory(c.id, payload);
      } else {
        await Api.addCategory(payload);
      }
      this.closeCatEditor();
      await this.renderCatList();
      this.buildRecTabs();
      toast('已保存', 'ok');
      this._dirtyRecords = true;
    } catch (e) { document.getElementById('catErr').textContent = e.message; }
  },

  async delCat(key, name, count) {
    const msg = count > 0
      ? `「${name}」下还有 ${count} 个小类，删除分类会一并删除这些小类及其全部变动记录，且无法恢复。确定删除吗？`
      : `确定删除分类「${name}」吗？`;
    const ok = await Dlg.confirm(msg, { okText: '删除' });
    if (!ok) return;
    try {
      const c = S.cats.find((x) => x.key === key);
      await Api.deleteCategory(c.id);
      await this.renderCatList();
      this.buildRecTabs();
      toast('已删除', 'ok');
      this.afterDataChange();
    } catch (e) { toast(e.message, 'err'); }
  },

  /* ---------------- 配置方案管理 ---------------- */
  openPlanMgr() { this.renderPlanMgrList(); document.getElementById('planMask').classList.add('show'); },
  closePlanMgr() { document.getElementById('planMask').classList.remove('show'); this.closePlanEditor(); },

  async renderPlanMgrList() {
    const d = await guard(Api.plans());
    if (!d) return;
    S.plans = d.plans;
    document.getElementById('planMgrList').innerHTML = S.plans.map((p) => {
      const sum = p.items.reduce((a, b) => a + (Number(b.ratio) || 0), 0);
      return `<div class="mgr-row">
        <span class="m-name">${Fmt.esc(p.name)}${p.id === d.currentId ? ' <span class="m-cur">当前</span>' : ''}</span>
        <span class="m-extra">${p.items.length} 项 · 合计 ${sum.toFixed(0)}%</span>
        <span class="m-ops">
          ${p.id !== d.currentId ? `<button onclick="App.usePlan(${p.id})">启用</button>` : ''}
          <button onclick="App.copyPlan(${p.id})">复制</button>
          <button onclick="App.openPlanEditor(${p.id})">编辑</button>
          <button onclick="App.delPlan(${p.id},'${Fmt.esc(p.name)}')">删除</button>
        </span>
      </div>`;
    }).join('');
  },

  async usePlan(id) { try { await Api.setCurrentPlan(id); this._plansDirty = true; await this.renderPlanMgrList(); toast('已切换方案', 'ok'); } catch (e) { toast(e.message, 'err'); } },

  /** 复制完直接进编辑器：复制方案通常就是为了改名改比例，少一步点击 */
  async copyPlan(id) {
    try {
      const r = await Api.copyPlan(id);
      this._plansDirty = true;
      await this.renderPlanMgrList();
      this.openPlanEditor(r.id);
      toast('已复制，可直接修改', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  },

  async delPlan(id, name) {
    // 后端也会拦，但前端先拦一次能给更清楚的提示，不必等一次往返
    if (S.plans.length <= 1) { toast('至少需要保留一个方案', 'err'); return; }
    const ok = await Dlg.confirm(`确定删除方案「${name}」吗？`, { okText: '删除' });
    if (!ok) return;
    try { await Api.deletePlan(id); this._plansDirty = true; await this.renderPlanMgrList(); toast('已删除', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  },

  closePlanEditor() { document.getElementById('planEditor').style.display = 'none'; S.planDraft = null; },

  openPlanEditor(id) {
    const p = id ? S.plans.find((x) => x.id === id) : null;
    S.planDraft = {
      id: id || null,
      name: p ? p.name : '',
      desc: p ? (p.desc || '') : '',
      openRec: -1,   // 当前展开「细选小类」的项目下标
      items: p ? p.items.map((i) => ({ name: i.name, ratio: i.ratio, color: i.color, note: i.note, cats: i.cats.slice(), recIds: (i.recIds || []).slice() }))
                 : [{ name: '', ratio: 0, color: '#c8a45c', note: '', cats: [], recIds: [] }]
    };
    document.getElementById('planName').value = S.planDraft.name;
    document.getElementById('planDescIn').value = S.planDraft.desc;
    document.getElementById('planErr').textContent = '';

    // 「细选小类」要列全量小类，第一次打开时拉一次（数据量小，一次拉完比按分类懒加载省事）
    if (!S._subjects) {
      Api.subjects().then((d) => { S._subjects = d.subjects || []; this.renderPlanItems(); })
        .catch(() => { S._subjects = []; });
    }
    this.renderPlanItems();
    document.getElementById('planEditor').style.display = 'block';
  },

  addPlanItem() {
    S.planDraft.items.push({ name: '', ratio: 0, color: '#c8a45c', note: '', cats: [], recIds: [] });
    this.renderPlanItems();
  },

  renderPlanItems() {
    const subs = S._subjects || [];
    document.getElementById('planItems').innerHTML = S.planDraft.items.map((it, i) => {
      const catTags = S.cats.map((c) => {
        const on = it.cats.includes(c.key);
        return `<span class="tab" style="${on ? 'background:var(--brand);color:#fdf8ef;border-color:var(--brand)' : ''}" onclick="App.togglePlanCat(${i},'${c.key}')">${Fmt.esc(c.name)}</span>`;
      }).join('');

      const open = S.planDraft.openRec === i;
      const nSel = (it.recIds || []).length;
      const recBox = open ? `<div class="rec-box">
        ${subs.length ? subs.map((s) => {
          const on = (it.recIds || []).includes(s.id);
          return `<label class="chk-row" style="padding:3px 0"><input type="checkbox" ${on ? 'checked' : ''} onchange="App.togglePlanRec(${i},${s.id},this.checked)" /><span class="chk-name">${Fmt.esc(s.name)}</span><span class="chk-extra">${Fmt.esc(s.catName || '')}</span></label>`;
        }).join('') : '<div class="fs-12 muted">还没有任何小类，先去记录页添加</div>'}
      </div>` : '';

      return `<div class="cat-item" style="padding:10px 0;border-bottom:1px dashed var(--line)">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input type="color" value="${Fmt.esc(it.color)}" title="图表颜色" aria-label="图表颜色"
                 style="width:34px;height:34px;padding:2px;border:1px solid var(--line);border-radius:9px;background:#fff;flex:0 0 auto"
                 oninput="App.setPlanItem(${i},'color',this.value)" />
          <input type="text" value="${Fmt.esc(it.name)}" placeholder="项目名称" maxlength="12"
                 style="flex:1;min-width:0;border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:14px;background:#fffdf8;color:var(--text)"
                 oninput="App.setPlanItem(${i},'name',this.value)" />
          <input type="number" value="${it.ratio}" placeholder="%" min="0" max="100" step="1"
                 style="width:66px;border:1px solid var(--line);border-radius:9px;padding:8px 8px;font-size:14px;background:#fffdf8;color:var(--text)"
                 oninput="App.setPlanItem(${i},'ratio',this.value)" />
          <span style="font-size:12px;color:var(--muted)">%</span>
          <button class="btn ghost sm" onclick="App.removePlanItem(${i})">✕</button>
        </div>
        <div class="ci-cats">${catTags}</div>
        <div style="margin-top:7px">
          <span class="act fs-12" onclick="App.togglePlanRecBox(${i})">${open ? '▾' : '▸'} 细选小类${nSel ? `（已选 ${nSel}）` : ''}</span>
          <span class="fs-11 muted" style="margin-left:6px">不选就按上面的分类整体计入</span>
        </div>
        ${recBox}
        <input type="text" value="${Fmt.esc(it.note)}" placeholder="备注说明（可选）" maxlength="30"
               style="width:100%;margin-top:7px;border:1px solid var(--line);border-radius:9px;padding:7px 10px;font-size:12.5px;background:#fffdf8;color:var(--text)"
               oninput="App.setPlanItem(${i},'note',this.value)" />
      </div>`;
    }).join('');
    this.updatePlanRatioSum();
    this.renderPlanDupHint();
  },

  /** 重复关联检测：同一个小类被多个项目同时圈中时提示（后端按优先级只算一次，配错了很难发现） */
  renderPlanDupHint() {
    const el = document.getElementById('planDupHint');
    if (!el) return;
    const subs = S._subjects || [];
    const claims = new Map();   // subjectId -> [项目下标]
    S.planDraft.items.forEach((it, i) => {
      const recs = it.recIds || [];
      recs.forEach((sid) => {
        if (!claims.has(sid)) claims.set(sid, []);
        const a = claims.get(sid);
        if (!a.includes(i)) a.push(i);
      });
      (it.cats || []).forEach((k) => {
        subs.forEach((s) => {
          if (s.catKey !== k || recs.includes(s.id)) return;
          if (!claims.has(s.id)) claims.set(s.id, []);
          const a = claims.get(s.id);
          if (!a.includes(i)) a.push(i);
        });
      });
    });
    const dups = [...claims.entries()].filter(([, v]) => v.length > 1);
    if (!dups.length) { el.innerHTML = ''; return; }
    const names = dups.slice(0, 3).map(([sid]) => {
      const s = subs.find((x) => x.id === sid);
      return s ? s.name : '#' + sid;
    }).join('、');
    el.innerHTML = `<div class="tip warn" style="margin-top:8px"><span class="ic">⚠️</span><span>` +
      `${dups.length} 个小类被多个项目同时关联（${Fmt.esc(names)}${dups.length > 3 ? ' 等' : ''}）。` +
      `同一笔资产只会计入<b>排序靠前</b>的那一项，请确认是否配错。</span></div>`;
  },

  togglePlanRecBox(i) {
    S.planDraft.openRec = S.planDraft.openRec === i ? -1 : i;
    this.renderPlanItems();
  },

  togglePlanRec(i, sid, on) {
    const it = S.planDraft.items[i];
    if (!it) return;
    it.recIds = it.recIds || [];
    const at = it.recIds.indexOf(sid);
    if (on && at < 0) it.recIds.push(sid);
    else if (!on && at >= 0) it.recIds.splice(at, 1);
    this.renderPlanItems();
  },

  setPlanItem(i, k, v) {
    const it = S.planDraft.items[i];
    if (!it) return;
    it[k] = k === 'ratio' ? (parseFloat(v) || 0) : v;
    if (k === 'ratio') this.updatePlanRatioSum();
  },
  togglePlanCat(i, key) {
    const it = S.planDraft.items[i];
    if (!it) return;
    const at = it.cats.indexOf(key);
    if (at >= 0) it.cats.splice(at, 1); else it.cats.push(key);
    this.renderPlanItems();
  },
  removePlanItem(i) {
    S.planDraft.items.splice(i, 1);
    if (!S.planDraft.items.length) S.planDraft.items.push({ name: '', ratio: 0, color: '#c8a45c', note: '', cats: [], recIds: [] });
    if (S.planDraft.openRec === i) S.planDraft.openRec = -1;
    this.renderPlanItems();
  },
  updatePlanRatioSum() {
    const sum = S.planDraft.items.reduce((a, b) => a + (Number(b.ratio) || 0), 0);
    const el = document.getElementById('planRatioSum');
    el.textContent = sum.toFixed(0);
    el.style.color = Math.abs(sum - 100) < 0.5 ? 'var(--olive)' : 'var(--red)';
  },

  async savePlanEditor() {
    const name = document.getElementById('planName').value.trim();
    const desc = document.getElementById('planDescIn').value.trim();
    if (!name) { document.getElementById('planErr').textContent = '请输入方案名称'; return; }
    const items = S.planDraft.items.filter((i) => i.name.trim());
    if (!items.length) { document.getElementById('planErr').textContent = '至少需要一个配置项目'; return; }
    if (!items.some((i) => i.cats.length || (i.recIds || []).length)) {
      document.getElementById('planErr').textContent = '还没有任何项目关联分类或小类，无法与实际资产对照';
      return;
    }
    document.getElementById('planErr').textContent = '';

    // 占比不等于 100% 时提醒一次：目标金额是按占比乘出来的，合计失衡会让对照失真
    const sum = items.reduce((a, b) => a + (Number(b.ratio) || 0), 0);
    if (Math.abs(sum - 100) > 0.5) {
      const ok = await Dlg.confirm(
        `各项目占比合计为 ${sum.toFixed(1)}%，与目标 100% 不一致。\n\n保存后目标金额仍按各自占比计算，可能导致对照失真。确定保存吗？`,
        { okText: '仍然保存', danger: false }
      );
      if (!ok) return;
    }

    try {
      if (S.planDraft.id) await Api.updatePlan(S.planDraft.id, { name, desc, items });
      else await Api.addPlan({ name, desc: desc || '自定义配置方案', items });
      this.closePlanEditor();
      this._plansDirty = true;
      await this.renderPlanMgrList();
      toast('已保存', 'ok');
    } catch (e) { document.getElementById('planErr').textContent = e.message; }
  },

  /* ---------------- 数据管理 ---------------- */
  /** 静态版没有后端，导出直接在浏览器里生成文件并触发下载 */
  download(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  exportCSV() {
    this.download('资产簿_变动明细_' + Fmt.nowMonth() + '.csv', Api.backupCSV(), 'text/csv;charset=utf-8');
    toast('已导出 CSV', 'ok');
  },
  exportJSON() {
    this.download('资产簿_备份_' + Fmt.nowMonth() + '.json', JSON.stringify(Api.backup(), null, 2), 'application/json;charset=utf-8');
    toast('已导出备份', 'ok');
  },

  importJSON() {
    const inp = document.getElementById('hiddenFile');
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      inp.value = '';
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let data;
        try { data = JSON.parse(String(reader.result || '').replace(/^\uFEFF/, '')); }
        catch (e) { toast('解析失败，文件不是有效的 JSON', 'err', 3200); return; }

        const subs = Array.isArray(data.subjects) ? data.subjects.length : 0;
        const ents = Array.isArray(data.entries) ? data.entries.length : 0;
        const ok = await Dlg.confirm(
          `即将导入备份：\n· 二级小类 ${subs} 个\n· 变动记录 ${ents} 条\n· 分类 ${Array.isArray(data.categories) ? data.categories.length + ' 个' : '沿用当前'}\n· 方案 ${Array.isArray(data.plans) ? data.plans.length + ' 个' : '沿用当前'}\n\n当前浏览器里的数据将被覆盖，确定导入吗？`,
          { title: '导入备份', danger: true, okText: '覆盖导入' });
        if (!ok) return;

        Loading.show();
        try {
          const r = await Api.importJSON(data);
          toast(`导入完成：${r.subjects} 个小类、${r.entries} 条记录`, 'ok', 3200);
          this.afterDataChange(true);
        } catch (e) { toast(e.message, 'err', 3500); }
        finally { Loading.hide(); }
      };
      reader.onerror = () => toast('文件读取失败', 'err');
      reader.readAsText(f);
    };
    inp.click();
  },

  async restoreDemo() {
    const ok = await Dlg.confirm('恢复示例数据会清空当前所有小类与变动记录，并写入 6 个月的演示账。\n\n建议先导出备份。确定继续吗？', { danger: true, okText: '恢复示例' });
    if (!ok) return;
    try { await Api.restoreDemo(); toast('已恢复示例数据', 'ok'); this.afterDataChange(true); }
    catch (e) { toast(e.message, 'err'); }
  },

  async openClear() {
    document.getElementById('clrWord').value = '';
    document.getElementById('clrBackedUp').checked = false;
    document.getElementById('clrErr').textContent = '';
    document.getElementById('clrAssetsInfo').textContent = '统计中…';
    this.clearFormSync();
    document.getElementById('clearMask').classList.add('show');

    // 实时统计一下有多少小类，让用户清楚要删掉多少
    try {
      const d = await Api.subjects();
      this._totalSubjects = d.subjects.length;
    } catch (e) { this._totalSubjects = 0; }
    document.getElementById('clrAssetsInfo').textContent = `共 ${this._totalSubjects || 0} 个小类`;
  },
  closeClear() { document.getElementById('clearMask').classList.remove('show'); },

  clearFormSync() {
    const scope = ['clrAssets', 'clrBg', 'clrCats', 'clrPlans'].some((id) => document.getElementById(id).checked);
    const word = (document.getElementById('clrWord').value || '').trim();
    const backed = document.getElementById('clrBackedUp').checked;
    document.getElementById('clrConfirm').disabled = !(scope && word === '清空' && backed);
  },

  async doClear() {
    const scope = {
      assets: document.getElementById('clrAssets').checked,
      bg: document.getElementById('clrBg').checked,
      categories: document.getElementById('clrCats').checked,
      plans: document.getElementById('clrPlans').checked
    };
    try {
      await Api.clearData(scope);
      this.closeClear();
      toast('已清空', 'ok');
      this.afterDataChange(true);
    } catch (e) { document.getElementById('clrErr').textContent = e.message; }
  },

  /** 数据发生变更后统一刷新：分类、月份、当前页，并按需重拉方案 */
  async afterDataChange(hard) {
    const [cats, months] = await Promise.all([Api.categories(), Api.months()]);
    S.cats = cats.categories;
    S.months = months;
    S._subjects = null;   // 小类列表作废，方案编辑器下次打开时重新拉
    if (hard) {
      S.recMonth = months.latest; S.chMonth = months.latest;
      S.planMonth = months.latest; S.rankMonth = months.latest;
      S.diffA = months.list.length > 1 ? months.list[months.list.length - 2] : months.latest;
      S.diffB = months.latest;
      this._plansDirty = true;
      this.syncMonthInputs();
    }
    this.buildRecTabs();
    this.refresh();
  }
};

/* ==========================================================================
   事件绑定与启动
   ========================================================================== */

// 点击遮罩空白处关闭对应弹层
document.querySelectorAll('#entryMask, #mask, #catMask, #planMask, #clearMask').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target !== m) return;
    if (m.id === 'mask') App.closeForm();
    else if (m.id === 'entryMask') App.closeEntries();
    else if (m.id === 'catMask') App.closeCatMgr();
    else if (m.id === 'planMask') App.closePlanMgr();
    else if (m.id === 'clearMask') App.closeClear();
  });
});

// 字号档位
document.getElementById('fsSeg').addEventListener('click', (e) => {
  const o = e.target.closest('.opt');
  if (o) App.setFontScale(parseFloat(o.dataset.fs));
});
// 规划基数
document.getElementById('planBaseSeg').addEventListener('click', (e) => {
  const o = e.target.closest('.opt');
  if (!o) return;
  S.planBase = o.dataset.v;
  document.querySelectorAll('#planBaseSeg .opt').forEach((x) => x.classList.toggle('active', x === o));
  App.renderPlan();
});

// 窗口尺寸变化 → 重绘图表（防抖 180ms，避免拖拽时疯狂重排）
let _rz;
window.addEventListener('resize', () => {
  clearTimeout(_rz);
  _rz = setTimeout(() => {
    if (S.tab === 'overview') App.renderOverview();
    else if (S.tab === 'charts') App.renderCharts();
    else if (S.tab === 'plan') App.renderPlan();
  }, 180);
});

/* ---------------- 弹层通用行为 ---------------- */

// 只要有一个弹层打开就锁住底层滚动，手机上滑动不会"穿透"到背后的列表。
// 用 MutationObserver 统一观察，避免在每个开/关弹层的地方都写一遍。
(() => {
  const masks = [...document.querySelectorAll('.mask')];
  const sync = () => {
    const open = masks.some((m) => m.classList.contains('show'));
    document.body.classList.toggle('scroll-locked', open);
  };
  masks.forEach((m) => new MutationObserver(sync).observe(m, { attributes: true, attributeFilter: ['class'] }));
})();

// Esc 逐层关闭：先关对话框，再关各弹层；方案编辑器嵌在方案管理里，先关它
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('dlgMask').classList.contains('show')) return;  // Dlg 自己处理了

  const planMask = document.getElementById('planMask');
  if (planMask.classList.contains('show') && document.getElementById('planEditor').style.display !== 'none') {
    App.closePlanEditor(); return;
  }
  const catEditor = document.getElementById('catEditor');
  if (document.getElementById('catMask').classList.contains('show') && catEditor.style.display !== 'none') {
    App.closeCatEditor(); return;
  }
  const layers = [
    ['entryMask', () => App.closeEntries()],
    ['mask', () => App.closeForm()],
    ['catMask', () => App.closeCatMgr()],
    ['planMask', () => App.closePlanMgr()],
    ['clearMask', () => App.closeClear()]
  ];
  for (const [id, close] of layers) {
    const el = document.getElementById(id);
    if (el && el.classList.contains('show')) { close(); return; }
  }
});

/* ---------------- 移动端视口锁定（禁止双指缩放） ---------------- */
/**
 * 目标：像单页 HTML 一样，手指双指捏合不能缩放整个应用页面。
 *
 * 为什么需要三层，缺一不可：
 *  1) viewport meta 的 user-scalable=no / maximum-scale=1 —— 新机型与安卓有效，
 *     但 iOS 10+ 的 Safari 会主动忽略它（出于无障碍考虑）；
 *  2) CSS touch-action 不含 pinch-zoom —— 现代浏览器直接不响应双指手势；
 *  3) JS 拦截 gesturestart / gesturechange / gestureend —— 专治 iOS Safari，
 *     这是唯一能在 iOS 上真正阻止双指缩放的手段。
 *
 * 同时兜底「输入框聚焦导致的页面放大」：虽然输入类字号已统一 16px，但个别机型
 * 或旧版 WebView 仍可能残留缩放，这里在失焦后主动把视觉视口拉回 1 倍。
 */
function initViewportLock() {
  if (window.__viewportLockBound) return;
  window.__viewportLockBound = true;

  const meta = () => document.querySelector('meta[name=viewport]');
  // 记录原始 content，做临时改写后要还原，避免影响软键盘行为
  const META_BASE = (meta() && meta().getAttribute('content')) || '';

  /* ---- 1) 临时锁定到 1 倍，随后还原（防止缩放残留） ---- */
  let unlockTimer = null;
  function clampToOne() {
    const m = meta();
    if (!m) return;
    if (!m.getAttribute('content').includes('maximum-scale=1, user-scalable=no')) {
      m.setAttribute('content', META_BASE + ', maximum-scale=1, user-scalable=no');
    }
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => {
      if (META_BASE) m.setAttribute('content', META_BASE);
    }, 300);
  }

  /* ---- 2) iOS Safari：拦截全部双指缩放手势 ---- */
  const blockGesture = (e) => { e.preventDefault(); };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
    document.addEventListener(ev, blockGesture, { passive: false })
  );

  /* ---- 3) 兜底：双指 touchmove 阻止缩放（部分安卓 WebView 不走 gesture*） ---- */
  document.addEventListener('touchmove', (e) => {
    // touch-action 已限制普通元素；这里只拦「多指」这一种情况
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  /* ---- 4) 双击缩放兜底（iOS 有时靠 dblclick 放大） ---- */
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    // 只针对非表单区域，避免影响输入框双击选词
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { lastTap = 0; return; }
    if (now - lastTap < 300) { clampToOne(); }
    lastTap = now;
  }, { passive: true });

  /* ---- 5) 输入框聚焦/失焦：位置还原 + 缩放归位 ---- */
  const isField = (el) => el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  let savedY = 0;
  let savedEl = null;

  document.addEventListener('focusin', (e) => {
    if (!isField(e.target)) return;
    savedEl = e.target;
    savedY = window.scrollY || document.documentElement.scrollTop || 0;
  });

  document.addEventListener('focusout', (e) => {
    if (!isField(e.target)) return;
    const el = savedEl || e.target;
    // 键盘收起需要一点时间，延迟后再校正布局
    setTimeout(() => {
      // 缩放残留时把视觉视口拉回 1 倍
      if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.01) clampToOne();
      // 还原被键盘顶起前的滚动位置（仅当当前没有滚动到别处时）
      if (el && document.activeElement !== el && savedY > 0) {
        const now = window.scrollY || document.documentElement.scrollTop || 0;
        if (Math.abs(now - savedY) > 4) window.scrollTo({ top: savedY, behavior: 'instant' });
      }
      savedEl = null;
    }, 260);
  });

  /* ---- 6) 键盘触发布局变化时，同样保证缩放为 1 ---- */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (Math.abs(window.visualViewport.scale - 1) > 0.01) clampToOne();
    });
  }
}

/* ---------------- 启动 ---------------- */
function startApp() {
  initViewportLock();
  App.boot().catch((e) => {
    // 本地存储不可用时（比如隐私模式），给出明确提示而不是空白屏
    toast('初始化失败：' + (e.message || '未知错误'), 'err', 4000);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp);
else startApp();
