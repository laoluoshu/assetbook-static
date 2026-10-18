/**
 * UI 基础组件：Toast、确认框、输入框、加载态，以及金额/月份格式化。
 * 统一走 Promise，业务代码里就能用 await 顺序写，不用套回调。
 */

/* ---------------- 格式化 ---------------- */
const Fmt = {
  /** 1234567.5 → ¥1,234,567.50（整数时不带小数，账本里读起来更干净） */
  money(v) {
    const n = Number(v) || 0;
    const abs = Math.abs(n);
    const s = Number.isInteger(n) ? abs.toLocaleString('zh-CN') : abs.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '-¥' : '¥') + s;
  },
  /** 带符号金额，用于「本月变动」「两月差额」 */
  signed(v) {
    const n = Number(v) || 0;
    return (n > 0 ? '+' : (n < 0 ? '-' : '')) + this.money(Math.abs(n)).replace('-', '');
  },
  rate(v) {
    const n = Number(v) || 0;
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  },
  month(m) {
    if (!m) return '';
    const [y, mo] = String(m).split('-');
    return y + '年' + parseInt(mo, 10) + '月';
  },
  shortMonth(m) {
    if (!m) return '';
    const [y, mo] = String(m).split('-');
    return parseInt(mo, 10) + '月';
  },
  nowMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};

/* ---------------- 加载态 ---------------- */
const Loading = {
  depth: 0,
  show() { this.depth++; document.getElementById('loading').classList.add('show'); },
  hide() {
    this.depth = Math.max(0, this.depth - 1);
    if (!this.depth) document.getElementById('loading').classList.remove('show');
  },
  /** 包一层异步调用：自动显示/隐藏加载态，异常向上抛 */
  async wrap(p) {
    this.show();
    try { return await p; } finally { this.hide(); }
  }
};

/* ---------------- Toast ---------------- */
function toast(msg, type, ms) {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s ease, transform .25s ease';
    el.style.opacity = '0'; el.style.transform = 'translateY(-6px)';
    setTimeout(() => el.remove(), 260);
  }, ms || 2200);
}

/* ---------------- 通用对话框 ---------------- */
const Dlg = {
  _resolve: null,

  /**
   * 打开对话框。
   * @param {object} o { title, msg, input:{label,value,placeholder,password}, okText, cancelText, danger, validator }
   * @returns {Promise<string|boolean|null>} 有 input 时返回字符串，否则返回布尔；取消返回 null
   */
  open(o) {
    const mask = document.getElementById('dlgMask');
    const title = document.getElementById('dlgTitle');
    const msg = document.getElementById('dlgMsg');
    const field = document.getElementById('dlgField');
    const label = document.getElementById('dlgLabel');
    const input = document.getElementById('dlgInput');
    const err = document.getElementById('dlgErr');
    const okBtn = document.getElementById('dlgOk');
    const cancelBtn = document.getElementById('dlgCancel');

    title.textContent = o.title || '提示';
    msg.textContent = o.msg || '';
    err.textContent = '';
    okBtn.textContent = o.okText || '确定';
    cancelBtn.textContent = o.cancelText || '取消';
    okBtn.className = 'btn ' + (o.danger ? 'danger' : 'primary');

    const hasInput = !!o.input;
    field.style.display = hasInput ? 'block' : 'none';
    field.querySelector('input').className = '';
    if (hasInput) {
      label.textContent = o.input.label || '请输入';
      input.value = o.input.value || '';
      input.placeholder = o.input.placeholder || '';
      input.type = o.input.password ? 'password' : 'text';
    }
    cancelBtn.style.display = o.hideCancel ? 'none' : '';

    mask.classList.add('show');
    if (hasInput) setTimeout(() => input.focus(), 60);

    return new Promise((resolve) => {
      const done = (v) => {
        mask.classList.remove('show');
        cleanup();
        resolve(v);
      };
      const commit = () => {
        if (hasInput) {
          const v = input.value.trim();
          if (o.validator) {
            const e = o.validator(v);
            if (e) { err.textContent = e; return; }
          }
          if (o.required !== false && !v) { err.textContent = '请输入内容'; return; }
          done(v);
        } else done(true);
      };
      const cancel = () => done(hasInput ? null : false);

      const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } };
      const cleanup = () => {
        okBtn.removeEventListener('click', commit);
        cancelBtn.removeEventListener('click', cancel);
        mask.removeEventListener('click', onMask);
        input.removeEventListener('keydown', onKey);
        document.removeEventListener('keydown', onKey);
      };
      const onMask = (e) => { if (e.target === mask) cancel(); };

      okBtn.addEventListener('click', commit);
      cancelBtn.addEventListener('click', cancel);
      mask.addEventListener('click', onMask);
      input.addEventListener('keydown', onKey);
      document.addEventListener('keydown', onKey);
    });
  },

  alert: (msg, title) => Dlg.open({ title: title || '提示', msg, hideCancel: true, okText: '知道了' }),
  confirm: (msg, o) => Dlg.open(Object.assign({ title: '确认', msg, danger: true, okText: '确定' }, o || {})),
  prompt: (msg, o) => Dlg.open(Object.assign({ title: '请输入', msg, input: {} }, o || {}))
};

/* ---------------- 全局错误兜底 ---------------- */
async function guard(p, tip) {
  try {
    return await p;
  } catch (e) {
    toast(e.message || (tip || '操作失败'), 'err', 3000);
    return null;
  }
}
