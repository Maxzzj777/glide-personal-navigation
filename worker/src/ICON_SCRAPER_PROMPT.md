# AI 图标抓取提示词（ICON_SCRAPER_PROMPT）

> 本文件是「自动抓取网页高清图标」功能的需求规范。用户输入一个网址后，自动抓取该网站最适合作为书签图标的高清图片链接，最终只返回一个最优图标 URL。

## 抓取规则

### 1. 先读取网页 `<head>` 中的图标声明

- `<link rel="apple-touch-icon">`
- `<link rel="apple-touch-icon-precomposed">`
- `<link rel="icon">`
- `<link rel="shortcut icon">`
- `<link rel="mask-icon">`
- `<link rel="manifest">` 里的 icons

### 2. 如果有多个图标，自动选择最优图片

- 优先选择 SVG、PNG、WebP
- 优先选择 128x128、180x180、192x192、256x256、512x512 等高清尺寸
- 优先选择方形图标
- 避免选择 16x16、32x32 等低清 favicon，除非没有其他选择
- 如果图片 URL 是相对路径，转换成完整绝对 URL

### 3. 如果网页没有找到图标，依次尝试默认路径

- `/favicon.ico`
- `/favicon.svg`
- `/favicon.png`
- `/apple-touch-icon.png`
- `/apple-touch-icon-precomposed.png`
- `/logo.png`、`/logo.svg`、`/logo.ico`
- `/icon.png`、`/icon.svg`、`/icon.ico`

> 注意：请求默认路径时，必须校验返回内容确实是图片（PNG/JPEG/ICO/SVG/WebP 的 magic bytes），不能只看 HTTP 200——SPA 单页应用的路由兜底会把所有路径都返回 HTML，`/favicon.ico` 拿到 HTML 要跳过。

### 4. 如果默认路径失败，查历史快照找 favicon

这是最容易漏掉、但最有效的一步：

- **现象**：浏览器标签页（表头）明明有图标，但抓不到。多半是「favicon 文件还在服务器，但当前首页 HTML 漏了 `<link rel="icon">` 声明」——常见于 Vue/Vite/Webpack 构建的 SPA，重新构建时丢了图标声明，或 favicon 用了 hash 文件名（如 `/assets/logo-d35435a2.ico`）不在固定路径。
- **方法**：用 Wayback Machine CDX API 查该域名的历史文件列表，筛出历史 favicon 路径：

  ```
  https://web.archive.org/cdx/search/cdx?url=域名/*&output=json&limit=100&collapse=urlkey&fl=original
  ```

  从结果里挑路径含 `favicon` / `logo` / `icon` / `apple-touch`、扩展名是 `.ico` / `.png` / `.svg` / `.webp` 的 URL（排除 avatar/photo/banner/thumbnail 等大图）。找到的 URL 是原站地址，直接请求即可——文件通常仍部署在服务器上。
- **优先级**：favicon > apple-touch > logo > icon；格式 svg > png > webp > ico。

### 5. 如果仍然失败，使用 Google 兜底

- Google gstatic faviconV2：`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://目标域名&size=256`（Google 搜索缓存，跳过反爬）
- 或 Google s2：`https://www.google.com/s2/favicons?domain=目标域名&sz=256`

### 6. 最终输出

只提交一个最优图标链接，不需要储存，不需要返回候选列表，不需要生成复杂 JSON。

输出格式只需要：

```text
最优图标链接：图片URL
```

## 关键经验（排查「抓不到图标」时的判断顺序）

1. **看浏览器标签页有没有图标**：有 → 说明网站有 favicon，只是路径特殊 / 声明缺失 / JS 注入，优先走第 3、4 步；没有 → 网站确实没设 favicon，任何方案都抓不到真实图标，只能给首字母占位。
2. **文件在但声明缺**：查 Wayback Machine 历史（第 4 步）是最快解法。
3. **反爬**（如 Midjourney 官网 403）：抓首页失败 → 靠 gstatic（Googlebot 抓的缓存，天然免疫反爬）兜底。
4. **子域名**（chat/dash/app 等）抓不到 → 换主站域名重试。
5. **聚合源占位图**（icon.horse 的紫色渐变 SVG / 灰字 PNG）要识别并跳过，不能被当真实图标返回。
