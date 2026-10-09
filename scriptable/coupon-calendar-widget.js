// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: calendar-alt;

/* ============================================================
   成都薅羊毛 · 今日优惠（Scriptable 版）
   - 数据来源：my-pages 仓库 coupon-calendar/data.json
     （页面与小组件共用同一份 JSON，仓库改了优惠，小组件跟着变，
     不需要改这个脚本。）
   - 只展示「今天」命中的优惠（WEEKLY 按星期 + MONTHLY 按日期）。
   - 点击任意位置 → 打开 GitHub Pages 日历页，并定位到今天。
   - 小组件参数（可选）：填品牌 id（如 kfc）或品类（如 coffee），只看这一家。
   ============================================================ */

const CONFIG = {
  pageUrl: "https://snake34475.github.io/my-pages/coupon-calendar/",
  dataUrl: "https://snake34475.github.io/my-pages/coupon-calendar/data.json",
  cacheHours: 6,
  showDailyPerks: true,
  maxRowsLarge: 8,
};

const CAT_META = {
  fastfood: { label: "快餐披萨", emoji: "🍔", color: "#E24B4A" },
  tea:      { label: "茶饮",     emoji: "🧋", color: "#1D9E75" },
  coffee:   { label: "咖啡",     emoji: "☕", color: "#BA7517" },
  snack:    { label: "零食零售", emoji: "🍿", color: "#7F77DD" },
  other:    { label: "其他",     emoji: "🎁", color: "#888780" },
};

const DOW_CN = ["日", "一", "二", "三", "四", "五", "六"];

/* ---------------- 工具 ---------------- */

const pad2 = n => String(n).padStart(2, "0");
const ymd  = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayLink = (y, m, d) => `${CONFIG.pageUrl}#${y}-${pad2(m)}/d${d}`;

function theme() {
  const dark = Device.isUsingDarkAppearance();
  return {
    dark,
    bg:    dark ? new Color("#141A22") : new Color("#FFFFFF"),
    text:  dark ? Color.white()        : new Color("#111827"),
    dim:   dark ? new Color("#9BA6B4") : new Color("#4B5563"),
    faint: dark ? new Color("#6B7787") : new Color("#9CA3AF"),
  };
}

async function fetchJson(url) {
  const req = new Request(url);
  req.timeoutInterval = 20;
  req.headers = { "Cache-Control": "no-cache" };
  const text = await req.loadString();
  return JSON.parse(text);
}

async function loadData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), "coupon-calendar-cache.json");

  let cache = null;
  if (fm.fileExists(cachePath)) {
    try { cache = JSON.parse(fm.readString(cachePath)); } catch (e) { cache = null; }
  }
  const fresh = cache && (Date.now() - cache.fetchedAt) < CONFIG.cacheHours * 3600 * 1000;
  if (fresh) return cache.data;

  try {
    const data = await fetchJson(`${CONFIG.dataUrl}?d=${ymd(new Date())}`);
    if (!data || !data.WEEKLY || !data.MONTHLY) throw new Error("data.json 结构不完整");
    fm.writeString(cachePath, JSON.stringify({ fetchedAt: Date.now(), data }));
    return data;
  } catch (e) {
    if (cache) return cache.data;
    throw e;
  }
}

/* 当天命中的优惠：WEEKLY 按星期命中 + MONTHLY 按日期命中 */
function eventsFor(data, y, m, d) {
  const dow = new Date(y, m - 1, d).getDay();
  const bmap = Object.fromEntries(data.BRANDS.map(b => [b.id, b]));

  const hits = []
    .concat(data.WEEKLY.filter(w => w.dow.includes(dow)).map(w => ({ ...w, member: false })))
    .concat(data.MONTHLY.filter(x => x.date === d).map(x => ({ ...x, member: true })));

  return hits.map(e => ({ ...bmap[e.brand], ...e }));
}

/* ---------------- 渲染 ---------------- */

/* 注：Scriptable 只支持整个小组件统一的点击跳转（ListWidget.url），
   行级 url 不生效，所以点击任意位置都跳同一个链接。 */
function addRow(w, e, th, showWarn) {
  const meta = CAT_META[e.cat] || CAT_META.other;
  const twoLine = !!(showWarn && e.warn);

  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = 9;
  row.size = new Size(0, twoLine ? 42 : 32);

  const bar = row.addStack();
  bar.size = new Size(3, twoLine ? 30 : 22);
  bar.cornerRadius = 2;
  bar.backgroundColor = new Color(meta.color);

  const col = row.addStack();
  col.layoutVertically();
  col.spacing = 1;

  const name = col.addText(`${meta.emoji} ${e.name}${e.member ? "  ★会员日" : ""}`);
  name.font = Font.semiboldSystemFont(12.5);
  name.textColor = th.text;
  name.lineLimit = 1;
  name.minimumScaleFactor = 0.8;

  const desc = col.addText(e.desc);
  desc.font = Font.systemFont(11);
  desc.textColor = th.dim;
  desc.lineLimit = 1;
  desc.minimumScaleFactor = 0.75;

  if (twoLine) {
    const warn = col.addText(e.warn.replace(/^[⚠✅🔥]\s*/, ""));
    warn.font = Font.systemFont(10);
    warn.textColor = th.faint;
    warn.lineLimit = 1;
  }
}

function addPerkRow(w, p, th, bmap) {
  const b = bmap[p.brand] || {};
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = 8;
  row.size = new Size(0, 28);

  const col = row.addStack();
  col.layoutVertically();
  col.spacing = 0;
  const t = col.addText(`· ${b.name || p.brand}｜${p.tag}`);
  t.font = Font.mediumSystemFont(11);
  t.textColor = th.dim;
  t.lineLimit = 1;
  const s = col.addText(p.desc);
  s.font = Font.systemFont(10);
  s.textColor = th.faint;
  s.lineLimit = 1;
  s.minimumScaleFactor = 0.75;
}

function buildWidget(data) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  const th = theme();
  const family = config.widgetFamily || "medium";
  const param = (args.widgetParameter || "").trim();

  let evs = eventsFor(data, y, m, d);
  if (param) {
    if (CAT_META[param])                            evs = evs.filter(e => e.cat === param);
    else if (data.BRANDS.some(b => b.id === param)) evs = evs.filter(e => e.id === param);
  }

  const link = todayLink(y, m, d);
  const bmap = Object.fromEntries(data.BRANDS.map(b => [b.id, b]));
  const perks = (CONFIG.showDailyPerks && !param) ? data.FLEXIBLE.slice(0, 2) : [];

  const w = new ListWidget();
  w.url = link;
  w.backgroundColor = th.bg;
  w.setPadding(13, 15, 13, 15);
  w.spacing = family === "small" ? 5 : 7;

  // 表头
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  const dateTxt = head.addText(`${m} 月 ${d} 日 · 周${DOW_CN[now.getDay()]}`);
  dateTxt.font = Font.semiboldSystemFont(13);
  dateTxt.textColor = th.text;
  head.addSpacer();
  const badge = head.addText(evs.length ? `今日 ${evs.length} 项` : "今日无收录");
  badge.font = Font.systemFont(11);
  badge.textColor = th.faint;

  // 空态
  if (!evs.length) {
    const tip = w.addStack();
    tip.layoutVertically();
    const t1 = tip.addText(param ? "该筛选今天没有优惠" : "今天没有收录的固定优惠");
    t1.font = Font.mediumSystemFont(12);
    t1.textColor = th.dim;
    const t2 = tip.addText("点开日历查看本月其他活动");
    t2.font = Font.systemFont(11);
    t2.textColor = th.faint;
  } else {
    const maxRows = family === "large" ? CONFIG.maxRowsLarge
                  : family === "small" ? 2 : 3;
    const shown = evs.slice(0, maxRows);
    shown.forEach(e => addRow(w, e, th, family !== "small"));

    if (evs.length > shown.length) {
      const more = w.addText(`还有 ${evs.length - shown.length} 项 → 点开查看`);
      more.font = Font.systemFont(10);
      more.textColor = th.faint;
    }
    if (family === "large" && perks.length) {
      w.addSpacer(2);
      perks.forEach(p => addPerkRow(w, p, th, bmap));
    }
  }

  // 页脚
  if (family !== "small") {
    w.addSpacer();
    const foot = w.addStack();
    foot.layoutHorizontally();
    const f = foot.addText("成都薅羊毛 · 查看完整日历");
    f.font = Font.systemFont(10);
    f.textColor = th.faint;
    foot.addSpacer();
    const arrow = foot.addText("→");
    arrow.font = Font.systemFont(10);
    arrow.textColor = th.faint;
  }

  return w;
}

/* ---------------- 入口 ---------------- */

async function main() {
  try {
    const data = await loadData();
    const widget = buildWidget(data);

    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      // 在 App 内直接运行时的预览
      const fam = config.widgetFamily || "medium";
      if (fam === "small")      await widget.presentSmall();
      else if (fam === "large") await widget.presentLarge();
      else                      await widget.presentMedium();
    }
  } catch (e) {
    const w = new ListWidget();
    w.backgroundColor = new Color("#141A22");
    w.setPadding(14, 16, 14, 16);
    const t = w.addText("💰 成都薅羊毛");
    t.font = Font.semiboldSystemFont(13);
    t.textColor = Color.white();
    const m = w.addText(`数据没拿到：${e.message}`);
    m.font = Font.systemFont(11);
    m.textColor = new Color("#9BA6B4");

    if (config.runsInWidget) Script.setWidget(w);
    else await w.presentMedium();
  }
  Script.complete();
}

await main();