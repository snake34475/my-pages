# AGENTS.md — my-pages

给 AI 编码代理的操作约定。改本仓库前先读完。

## 仓库定位

纯静态 HTML 页面集合（无构建、无框架），GitHub Pages 从 main 分支直接发布。
线上地址：`https://snake34475.github.io/my-pages/`

## 与姊妹仓库 nav 的关系（重要）

本仓库与 `snake34475/nav`（本地克隆通常位于 `../nav`）构成一对：

- **本仓库 = 内容源**：HTML 功能页 + 收录清单 `nav.json`（仓库根目录）
- **nav = 导航站**：其前端运行时 fetch 本仓库的
  `https://raw.githubusercontent.com/snake34475/my-pages/main/nav.json`，
  渲染出「我的页面」分类（实现见 nav 仓库的 `src/remote-pages.ts`）

因此：**在本仓库收录/更新页面清单，nav 站自动生效，永远不要去 nav 仓库改收录数据。**

## 新增功能页的标准流程

1. 新 HTML 放仓库根目录（未来按文件夹拆分小项目时再调整）
2. 更新 `index.html` 目录页，加入新页面入口
3. 若该页需要出现在 nav 导航站：在 `nav.json` 数组追加一条记录
4. 一次 commit 覆盖以上全部改动，push 到 main

## nav.json 规范

```json
[
  {
    "title": "页面标题",
    "desc": "一句话描述",
    "url": "https://snake34475.github.io/my-pages/<file>.html",
    "logo": "🧩"
  }
]
```

- `url`：**必须绝对地址**（`https://snake34475.github.io/my-pages/...`），nav 站跨仓库引用
- `logo`：单个 emoji（≤4 码点）或 `https://` 开头的图片 URL；**禁止相对路径**（nav 站解析不了）
- `desc`：可省略，省略后 nav 卡片不显示描述行
- 数组顺序即 nav 站卡片展示顺序
- 新增条目后 push 即生效；raw.githubusercontent.com 有约 5 分钟 CDN 缓存，属正常现象

## 其他约定

- 页面均为自包含单文件（内联 CSS/JS），不引入构建步骤
- `index.html` / `archive.html` / `about.html` 是站点结构页，功能页不要反向依赖它们
- 中文内容为主，提交信息用中文 conventional commits（`feat:` / `fix:` / `blog:` 等）
