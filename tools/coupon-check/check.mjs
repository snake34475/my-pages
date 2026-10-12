#!/usr/bin/env node
/* ============================================================
   成都优惠日历 · 半自动巡检脚本（零依赖，Node ≥ 18）

   用法：node tools/coupon-check/check.mjs
   产出：tools/coupon-check/report.md（每次覆盖）

   做什么：
     读 coupon-calendar/data.json 的全部条目（37 条规则型优惠），
     按条目的 source 类型自动选择核验通道，收集「来源最近动静」：
       1. 官方微博（m.weibo.cn container 公开接口，按 uid 拉最近 ~20 条）
          ⚠ 微博访客接口需 JS 指纹，脚本无法匿名过。要启用此通道：
          浏览器登录微博 → F12 → Application → Cookies → m.weibo.cn →
          复制 SUB（必要时连 SUBP）的值，然后：
            WEIBO_SUB='v020...' node tools/coupon-check/check.mjs
          不设该环境变量时微博通道自动降级为「人工回访」。
       2. 品牌官网（抓首页文本，关键词定位）
       3. 什么值得买搜索（品牌 + 关键词，列最近爆料标题作旁证；
          smzdm 有反爬，被 202/验证页拦截时如实报告失败）
     与条目 desc 的关键词做匹配，生成逐条建议（✅/⚠️/❓）。

   不做什么：
     不改 data.json、不进 CI、不自动提交。报告是给人看的，
     人工确认活动仍有效后，手动把对应条目 checkedAt 改成当天再提交。

   建议每月跑一次（配合 META.staleDays=60 的页面「待核实」标记）。
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'coupon-calendar', 'data.json');
const OUT  = path.join(path.dirname(fileURLToPath(import.meta.url)), 'report.md');

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TIMEOUT = 12000;

async function get(url, ua = UA_DESKTOP) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: ctl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

/* ---------- 关键词：从 desc 里提炼可搜索的词 ---------- */
const STOP = new Set(['会员日', '小程序', '领券', '下单', '到店', '购买', '领取', '查看', '指定', '部分', '全场', '活动', '福利', '每周', '每月', '元', '送', '以', '为', '准', '可', '有', '等']);
function keywords(entry, brandName) {
  const words = entry.desc
    .replace(/[]【】「」『』！？。，、：;（）()/g, ' ')
    .split(/[\s\d.·-]+/)
    .filter(w => w.length >= 2 && !STOP.has(w));
  const uniq = [...new Set([brandName, ...words, entry.tag || ''])].filter(Boolean);
  return uniq.slice(0, 5);
}

/* ---------- 来源分类 ---------- */
function classify(src) {
  if (!src) return { kind: 'none' };
  let m;
  if ((m = src.match(/107603(\d{6,})/))) return { kind: 'weibo', uid: m[1] };
  if ((m = src.match(/100606(\d{6,})/))) return { kind: 'weibo', uid: m[1] };   // 桌面端 profile container
  if ((m = src.match(/weibo\.com\/u\/(\d{6,})/))) return { kind: 'weibo', uid: m[1] };
  if ((m = src.match(/weibo\.com\/\d?\/?detail\/(\d+)/))) return { kind: 'weibo_detail', id: m[1] };
  if (/weibo\.com/.test(src)) return { kind: 'weibo_vanity', url: src };          // 无数字 uid，抓不动
  if (/apps\.apple\.com/.test(src)) return { kind: 'appstore', url: src };
  if (/^https?:\/\//.test(src)) return { kind: 'site', url: src };
  return { kind: 'none' };
}

/* ---------- 各通道抓取 ---------- */
const WEIBO_SUB = process.env.WEIBO_SUB || '';   // 无 cookie 时微博接口匿名必挂（需 JS 指纹）
async function fetchWeiboRecent(uid) {
  if (!WEIBO_SUB) return null;
  const cookie = `SUB=${WEIBO_SUB}${process.env.WEIBO_SUBP ? `; SUBP=${process.env.WEIBO_SUBP}` : ''}`;
  // m 端公开 JSON 接口；返回 null 表示被登录墙/风控挡住
  const url = `https://m.weibo.cn/api/container/getIndex?containerid=107603${uid}&page_type=0`;
  try {
    const j = JSON.parse(await (await fetch(url, {
      headers: { 'User-Agent': UA_MOBILE, 'Accept': 'application/json, text/plain, */*',
                 'X-Requested-With': 'XMLHttpRequest', 'Referer': `https://m.weibo.cn/u/${uid}`, 'Cookie': cookie },
      signal: AbortSignal.timeout(TIMEOUT),
    })).text());
    if (j.ok !== 1) return null;
    return (j.data?.cards || [])
      .filter(c => c.card_type === 9)
      .slice(0, 20)
      .map(c => {
        const mb = c.mblog;
        const text = (mb.text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 120);
        return { date: mb.created_at, text };
      });
  } catch { return null; }
}

async function fetchSiteText(url) {
  try {
    const html = await get(url);
    return html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 60000);
  } catch (e) { return { error: e.message }; }
}

async function fetchSmzdm(brandName) {
  const url = `https://search.smzdm.com/?c=home&s=${encodeURIComponent(brandName)}&order=time`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA_DESKTOP }, signal: AbortSignal.timeout(TIMEOUT) });
    const html = await res.text();
    if (res.status !== 200 || html.length < 1000) return { error: `反爬拦截（HTTP ${res.status}）` };
    if (/验证码|滑动验证|安全验证/.test(html)) return { error: '反爬验证页' };
    const items = [];
    const re = /href="(https:\/\/www\.smzdm\.com\/p\/\d+\/)"[^>]*>([^<]{6,80})</g;
    let m;
    while ((m = re.exec(html)) && items.length < 6) items.push({ url: m[1], title: m[2].trim() });
    return { items };
  } catch (e) { return { error: e.message }; }
}

/* ---------- 主流程 ---------- */
const data = JSON.parse(readFileSync(DATA, 'utf8'));
const bmap = Object.fromEntries(data.BRANDS.map(b => [b.id, b]));
const staleDays = data.META?.staleDays || 60;

// 同一品牌只抓一次，缓存结果
const weiboCache = new Map(), siteCache = new Map();

async function collectEntry(entry, section) {
  const brand = bmap[entry.brand];
  const cls = classify(entry.source);
  const kws = keywords(entry, brand?.name || entry.brand);
  const ev = [];
  let verdict = '❓ 无可自动化的核验通道（App/小程序/无 uid 微博），人工按 source 回访后更新 checkedAt';

  if (cls.kind === 'weibo') {
    if (!weiboCache.has(cls.uid)) weiboCache.set(cls.uid, await fetchWeiboRecent(cls.uid));
    const posts = weiboCache.get(cls.uid);
    if (posts === null) {
      ev.push(`- 微博：通道未启用（未设 WEIBO_SUB）或 cookie 已失效（uid ${cls.uid}）`);
      verdict = '❓ 微博需浏览器回访 source 链接人工确认（或配 WEIBO_SUB 后重跑）';
    } else if (!posts.length) {
      ev.push(`- 微博：近期无公开微博可拉取（uid ${cls.uid}）`);
      verdict = '⚠️ 官号近况不明，建议人工确认活动是否停办';
    } else {
      const hits = posts.filter(p => kws.some(k => p.text.includes(k)));
      ev.push(`- 微博：拉到最近 ${posts.length} 条（最晚 ${posts[0].date}），关键词 ${kws.slice(0,3).join('/')} 命中 ${hits.length} 条`);
      hits.slice(0, 3).forEach(h => ev.push(`    - [${h.date.slice(0, 10)}] ${h.text}`));
      const staleFlag = Date.now() - new Date(entry.checkedAt + 'T00:00:00') > staleDays * 864e5;
      if (hits.length) verdict = '✅ 官号近期有相关活动声，确认后可续期 checkedAt';
      else if (staleFlag) verdict = '⚠️ 已过核查期且官号近期无相关声，疑似停办，重点人工确认';
      else verdict = '❓ 官号近期无相关新声，暂维持，到期前人工抽查';
    }
  } else if (cls.kind === 'site') {
    if (!siteCache.has(cls.url)) siteCache.set(cls.url, await fetchSiteText(cls.url));
    const text = siteCache.get(cls.url);
    if (text?.error) {
      ev.push(`- 官网：抓取失败（${text.error}），需人工`);
      verdict = '❓ 官网抓取失败，人工按 source 回访';
    } else {
      const hit = kws.find(k => text.includes(k));
      ev.push(hit ? `- 官网：首页文本命中关键词「${hit}」` : '- 官网：首页未直接命中活动关键词（官网少挂周活动，属正常）');
      verdict = '❓ 官网无定论，请结合微博/smzdm 旁证人工判断';
    }
  } else if (cls.kind === 'weibo_vanity' || cls.kind === 'weibo_detail' || cls.kind === 'appstore' || cls.kind === 'none') {
    ev.push(`- 来源类型「${cls.kind}」不适合自动抓取，跳过`);
  }

  // smzdm 旁证（品牌级缓存，一次即可）
  if (!siteCache.has('smzdm:' + entry.brand)) {
    siteCache.set('smzdm:' + entry.brand, await fetchSmzdm(brand?.name || entry.brand));
  }
  const sz = siteCache.get('smzdm:' + entry.brand);
  if (sz.error) ev.push(`- smzdm：搜索失败（${sz.error}）`);
  else if (!sz.items.length) ev.push('- smzdm：无近期爆料');
  else {
    ev.push(`- smzdm 旁证：${sz.items.slice(0, 3).map(i => i.title).join('；')}`);
    if (verdict.startsWith('❓')) verdict = '❓ 有 smzdm 旁证，人工扫一眼后定夺';
  }

  return { section, brand, entry, kws, ev, verdict };
}

const rows = [];
const sections = [['WEEKLY', w => `周${['日','一','二','三','四','五','六'][w.dow[0]]}等`],
                  ['MONTHLY', x => `每月 ${x.date} 号`],
                  ['FLEXIBLE', x => x.tag]];
const li = process.argv.indexOf('--limit');
const LIMIT = li > 0 && process.argv[li + 1] ? +process.argv[li + 1] : Infinity;
outer:
for (const [key, when] of sections) {
  for (const entry of data[key]) {
    if (rows.length >= LIMIT) break outer;
    process.stderr.write(`巡检 ${entry.brand} (${key}) ...\n`);
    const r = await collectEntry(entry, key);
    r.when = when(entry);
    rows.push(r);
    await new Promise(res => setTimeout(res, 400));  // 温柔一点，别把人家接口打炸
  }
}

/* ---------- 出报告 ---------- */
const now = new Date();
const cnt = { ok: 0, warn: 0, q: 0 };
rows.forEach(r => r.verdict.startsWith('✅') ? cnt.ok++ : r.verdict.startsWith('⚠️') ? cnt.warn++ : cnt.q++);

let md = `# 优惠日历巡检报告

- 生成时间：${now.toLocaleString('zh-CN')}
- 数据快照：${DATA}（META.staleDays=${staleDays}）
- 结果概览：✅ 建议续期 ${cnt.ok} ｜ ⚠️ 疑似过期需重点人工 ${cnt.warn} ｜ ❓ 需人工/维持 ${cnt.q}

> 处理约定：逐条看「建议」列。确认活动仍有效的，把 data.json 中该条目的
> checkedAt 改成今天并 commit；确认变更/停办的，改写 desc/warn 或删条目；
> 拿不准的留着，页面会自动置灰成「⏳ 待核实」。

| # | 品牌 | 节 | 时机 | 活动描述 | 上次核查 | 建议 |
|---|------|----|------|----------|----------|------|
`;
rows.forEach((r, i) => {
  const stale = now - new Date(r.entry.checkedAt + 'T00:00:00') > staleDays * 864e5;
  md += `| ${i + 1} | ${r.brand?.name || r.entry.brand} | ${r.section} | ${r.when} | ${r.entry.desc.replace(/\|/g, '\\|')} | ${r.entry.checkedAt}${stale ? ' ⏳' : ''} | ${r.verdict} |\n`;
});
md += `\n## 逐条证据\n\n`;
rows.forEach((r, i) => {
  md += `### ${i + 1}. ${r.brand?.name || r.entry.brand}｜${r.when}｜${r.entry.desc}\n来源：${r.entry.source}\n关键词：${r.kws.join(' / ')}\n\n${r.ev.join('\n')}\n\n建议：${r.verdict}\n\n`;
});

writeFileSync(OUT, md);
console.log(`\n报告已生成：${OUT}\n✅${cnt.ok} ⚠️${cnt.warn} ❓${cnt.q}（共 ${rows.length} 条）`);
