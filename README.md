# my-pages

WorkBuddy 生成的 HTML 功能页集合，通过 GitHub Pages 部署：

**https://snake34475.github.io/my-pages/**

- `index.html` — 目录页（站点入口）
- `archive.html` — 归档页
- `about.html` — 关于页
- 其余 `*.html` — 独立功能页（洗衣指南、Mac 体检、视频码率、MBTI 解析等）
- `nav.json` — **收录清单**，供姊妹项目 [nav](https://github.com/snake34475/nav) 运行时动态拉取

## 收录新页面到 nav 导航站

在 `nav.json` 数组中追加一条并 push 即可，**nav 仓库无需任何改动、无需重新构建**：

```json
{
  "title": "页面标题",
  "desc": "一句话描述",
  "url": "https://snake34475.github.io/my-pages/xxx.html",
  "logo": "🧩"
}
```

注意：
- `url` 必须是绝对地址（nav 站跨仓库引用）
- `logo` 用 emoji 或 `https://` 图片地址，**不要用相对路径**（nav 站无法解析本仓库的相对资源）
- raw.githubusercontent.com 有约 5 分钟 CDN 缓存，推送后稍等片刻刷新即可
