/**
 * Canvas 2D 图表：折线、饼图、对比条形。
 * 不引入图表库 —— 全站只有这三种图，自己画省掉 200KB 依赖，也更好控制手账风的配色与留白。
 * 所有绘制都按 devicePixelRatio 缩放，避免高分屏发虚。
 */

const Charts = {
  /**
   * 取画布的「逻辑高度」并缓存。
   * canvas.height 在 prep() 里会被改写成 h×DPR，直接读它做下一轮绘制的高度，
   * 会导致每次重绘都放大一倍（高分屏上尤其明显）。所以首帧把 HTML 属性记下来复用。
   */
  heightOf(canvas, fallback) {
    if (!canvas._h) canvas._h = Number(canvas.getAttribute('height')) || canvas.height || fallback;
    return canvas._h;
  },

  /** 按 DPR 重置画布尺寸并返回 2D 上下文 */
  prep(canvas, h) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 320;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  },

  /** 金额缩写：1.2万 / 3.5亿，坐标轴标签用 */
  short(v) {
    const a = Math.abs(v);
    if (a >= 1e8) return (v / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
    if (a >= 1e4) return (v / 1e4).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '') + '万';
    return String(Math.round(v));
  },

  /** 折线图：用于净值趋势。带网格线、端点圆点、末点数值标注 */
  line(canvas, points, color, h) {
    h = h || 180;
    const { ctx, w } = this.prep(canvas, h);
    const padL = 46, padR = 12, padT = 14, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;

    if (!points || !points.length) {
      ctx.fillStyle = '#a4907a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('暂无数据', w / 2, h / 2);
      return;
    }

    const vals = points.map((p) => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min = min - Math.abs(min || 1) * 0.1; max = max + Math.abs(max || 1) * 0.1; }
    if (min > 0) min = 0;                       // 净资产曲线从 0 起更直观
    const pad = (max - min) * 0.1;
    min -= pad; max += pad;

    const X = (i) => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const Y = (v) => padT + ih - ((v - min) / (max - min)) * ih;

    // 横向网格 + 左侧刻度
    ctx.strokeStyle = '#e4d7c2'; ctx.lineWidth = 1;
    ctx.fillStyle = '#a4907a'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 3; g++) {
      const y = padT + (ih / 3) * g;
      const v = max - ((max - min) / 3) * g;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(this.short(v), padL - 6, y);
    }

    // 面积填充
    const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
    grad.addColorStop(0, color + '38');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    points.forEach((p, i) => { const x = X(i), y = Y(p.v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.lineTo(X(points.length - 1), padT + ih);
    ctx.lineTo(X(0), padT + ih);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // 折线
    ctx.beginPath();
    points.forEach((p, i) => { const x = X(i), y = Y(p.v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();

    // 端点
    points.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(X(i), Y(p.v), i === points.length - 1 ? 4 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#fdf8ef'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    });

    // 末点数值 + X 轴月份
    const last = points[points.length - 1];
    ctx.fillStyle = color; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(this.short(last.v), Math.min(X(points.length - 1) + 4, w - padR), Y(last.v) - 8);

    ctx.fillStyle = '#a4907a'; ctx.font = '10px sans-serif'; ctx.textBaseline = 'top';
    const step = Math.ceil(points.length / 6);
    points.forEach((p, i) => {
      if (i % step !== 0 && i !== points.length - 1) return;
      ctx.textAlign = i === 0 ? 'left' : (i === points.length - 1 ? 'right' : 'center');
      ctx.fillText(String(p.label || ''), X(i), padT + ih + 7);
    });
  },

  /** 饼图（环形）：用于资产构成与规划占比 */
  pie(canvas, data, centerLabel) {
    const h = this.heightOf(canvas, 220);
    const { ctx, w } = this.prep(canvas, h);
    const total = data.reduce((a, d) => a + Math.abs(d.value), 0);

    if (!total) {
      ctx.fillStyle = '#a4907a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('该月暂无资产数据', w / 2, h / 2);
      return;
    }

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 10, r = R * 0.58;
    let start = -Math.PI / 2;

    data.forEach((d) => {
      const ang = (Math.abs(d.value) / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, start, start + ang);
      ctx.arc(cx, cy, r, start + ang, start, true);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      // 描边留白，让相邻扇区有纸质分割感
      ctx.strokeStyle = '#fdf8ef'; ctx.lineWidth = 2; ctx.stroke();
      start += ang;
    });

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (centerLabel) {
      ctx.fillStyle = '#a4907a'; ctx.font = '11px sans-serif';
      ctx.fillText(centerLabel.label || '', cx, cy - 11);
      ctx.fillStyle = '#4a3728'; ctx.font = 'bold 15px "Noto Serif SC", serif';
      ctx.fillText(centerLabel.value || '', cx, cy + 8);
    }
  },

  /**
   * 双向对比条形：规划目标 vs 实际持有。
   * 目标与实际各占半行高度，同刻度对齐，一眼看出超出/不足。
   */
  planBars(canvas, rows) {
    const h = this.heightOf(canvas, 220);
    const { ctx, w } = this.prep(canvas, h);
    if (!rows || !rows.length) {
      ctx.fillStyle = '#a4907a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('暂无数据', w / 2, h / 2);
      return;
    }

    const padL = 66, padR = 14, padT = 20, padB = 24;
    const iw = w - padL - padR, ih = h - padT - padB;
    const rowH = ih / rows.length;
    const max = Math.max(...rows.map((r) => Math.max(r.target, r.actual)), 1);

    // 纵向网格
    ctx.strokeStyle = '#ede2cf'; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const x = padL + (iw / 4) * g;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke();
    }

    ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
    rows.forEach((r, i) => {
      const y = padT + rowH * i + rowH / 2;

      ctx.fillStyle = '#7a6a58'; ctx.textAlign = 'right';
      ctx.fillText(r.name.length > 5 ? r.name.slice(0, 5) : r.name, padL - 6, y);

      const bh = Math.min(9, rowH / 3.2);
      // 规划目标（浅色，在上）
      ctx.fillStyle = '#e0d0b4';
      const tw = (r.target / max) * iw;
      roundRect(ctx, padL, y - bh - 1.5, Math.max(tw, 1), bh, bh / 2); ctx.fill();
      // 实际持有（主色，在下）
      ctx.fillStyle = r.color || '#9d4238';
      const aw = (r.actual / max) * iw;
      roundRect(ctx, padL, y + 1.5, Math.max(aw, 1), bh, bh / 2); ctx.fill();
    });

    // X 轴刻度
    ctx.fillStyle = '#a4907a'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let g = 0; g <= 4; g++) {
      const x = padL + (iw / 4) * g;
      ctx.fillText(this.short((max / 4) * g), x, padT + ih + 6);
    }
  },

  /** 正负对比条形：各分类两月之间的增减 */
  diffBars(canvas, rows) {
    const h = this.heightOf(canvas, 200);
    const { ctx, w } = this.prep(canvas, h);
    if (!rows || !rows.length) {
      ctx.fillStyle = '#a4907a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('暂无数据', w / 2, h / 2);
      return;
    }

    const padL = 58, padR = 56, padT = 16, padB = 22;
    const iw = w - padL - padR, ih = h - padT - padB;
    const rowH = ih / rows.length;
    const max = Math.max(...rows.map((r) => Math.abs(r.diff)), 1);
    const zeroX = padL + iw / 2;

    ctx.strokeStyle = '#e4d7c2'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(zeroX, padT); ctx.lineTo(zeroX, padT + ih); ctx.stroke();

    ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
    rows.forEach((r, i) => {
      const y = padT + rowH * i + rowH / 2;
      const bh = Math.min(14, rowH * 0.5);
      const len = (Math.abs(r.diff) / max) * (iw / 2);

      ctx.fillStyle = '#7a6a58'; ctx.textAlign = 'right';
      ctx.fillText(r.name.length > 4 ? r.name.slice(0, 4) : r.name, padL - 6, y);

      ctx.fillStyle = r.diff >= 0 ? '#a63d2f' : '#7a8450';
      if (r.diff >= 0) roundRect(ctx, zeroX, y - bh / 2, Math.max(len, 1), bh, 2);
      else roundRect(ctx, zeroX - Math.max(len, 1), y - bh / 2, Math.max(len, 1), bh, 2);
      ctx.fill();

      ctx.fillStyle = r.diff >= 0 ? '#a63d2f' : '#7a8450';
      ctx.font = '10px sans-serif';
      ctx.textAlign = r.diff >= 0 ? 'left' : 'right';
      ctx.fillText((r.diff >= 0 ? '+' : '') + this.short(r.diff), r.diff >= 0 ? zeroX + Math.max(len, 1) + 4 : zeroX - Math.max(len, 1) - 4, y);
      ctx.font = '11px sans-serif';
    });
  }
};

/** 圆角矩形路径（部分老浏览器没有 ctx.roundRect） */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
