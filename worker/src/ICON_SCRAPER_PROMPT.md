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

### 3. 如果网页没有找到图标，依次尝试

- `/apple-touch-icon.png`
- `/favicon.svg`
- `/favicon.png`
- `/favicon.ico`

### 4. 如果仍然失败，使用 Google favicon 兜底

- `https://www.google.com/s2/favicons?domain=目标域名&sz=256`

### 5. 最终输出

只提交一个最优图标链接，不需要储存，不需要返回候选列表，不需要生成复杂 JSON。

输出格式只需要：

```text
最优图标链接：图片URL
```
