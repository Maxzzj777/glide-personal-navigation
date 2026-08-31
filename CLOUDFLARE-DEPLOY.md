# Cloudflare 小白部署教程

Fork 后按下面步骤操作。每个 Fork 使用自己的 GitHub Pages、Cloudflare Worker、KV 和管理员密码，不会读取或修改原站数据。

> **先放心：** 仓库里的 KV ID 和域名只是配置值，不是访问密钥。其他用户没有原作者的 Cloudflare 账号或 API Token，就不能访问原站；配置没改对只会让自己的部署失败。API Token 才是密钥，绝对不要写进仓库、Issue 或教程截图。

## 0. 准备

需要两个免费账号：

- [GitHub](https://github.com/)：保存代码并发布网页
- [Cloudflare](https://cloudflare.com/)：运行 Worker、保存书签数据

先确定一种访问方式：

- **方式 A（推荐）：自己的域名**，例如 `nav.example.com`
- **方式 B：GitHub Pages + workers.dev 免费地址**

## 1. Fork 并发布网页

1. 点击 [复制仓库（Fork）](https://github.com/Maxzzj777/glide-personal-navigation/fork)。
2. 打开自己 Fork 后的仓库。
3. 处理根目录的 `CNAME`（二选一，不能跳过）：
   - 方式 A：把内容改成自己的完整域名，例如 `nav.example.com`
   - 方式 B：删除 `CNAME` 文件
4. 进入 **Settings → Pages**。
5. Source 选择 **Deploy from a branch**，Branch 选择 `main`，目录选择 `/ (root)`，点击 **Save**。
6. 等待 1–2 分钟，记下 Pages 显示的网站地址。

方式 A 还要在 Cloudflare DNS 中给子域名创建指向 `你的用户名.github.io` 的 CNAME 记录，并开启橙色云朵代理。

> 不要保留原仓库的 `shuqian.kdns.fr`。它属于原作者，其他用户无法绑定或控制。

## 2. 创建自己的 KV

1. 打开 Cloudflare 控制台。
2. 进入 **存储和数据库 → Workers KV**（英文界面通常是 **Storage & Databases → KV**）。
3. 点击 **Create a namespace**，名称可填 `glide-kv`。
4. 创建后复制 Namespace ID。

KV 是书签、背景、AI 配置和管理员密码的云端存储。Namespace ID 可以公开，但只有所属 Cloudflare 账号具有访问权限。

## 3. 替换仓库中的个人配置

### 3.1 替换 KV 和路由

编辑 `worker/wrangler.jsonc`，把 KV ID 换成第 2 步复制的 ID；`binding` 必须保持为 `GLIDE_KV`：

```jsonc
"kv_namespaces": [
  { "binding": "GLIDE_KV", "id": "你的 KV ID" }
]
```

方式 A 保留 `routes`，但必须改成自己的域名：

```jsonc
"routes": [
  {
    "pattern": "nav.example.com/api/*",
    "zone_name": "example.com"
  }
]
```

其中 `pattern` 使用网站完整域名，`zone_name` 使用 Cloudflare 中的根域名。

方式 B 删除整个 `routes` 数组，保留 `"workers_dev": true`。

### 3.2 替换允许访问的网页地址

编辑 `worker/src/index.js`，搜索 `https://shuqian.kdns.fr`，把找到的两处都替换成自己网站的来源：

- 方式 A：`https://nav.example.com`
- 方式 B：`https://你的用户名.github.io`

GitHub Pages 的来源只写协议和域名，不要带 `/glide-personal-navigation/` 路径。

### 3.3 仅方式 B：填写 Worker 地址

编辑 `app.js` 第一行：

```js
const API_URL='https://glide-navigation-api.你的子域名.workers.dev';
```

方式 A 保持 `const API_URL='';` 不变。

提交这些修改。确认 `CNAME`、`worker/wrangler.jsonc` 和 `worker/src/index.js` 中已经不再使用原站域名或原来的 KV ID（教程文字里的示例不算）。

## 4. 连接 GitHub 并部署 Worker

1. Cloudflare 控制台进入 **Workers & Pages**。
2. 创建 Worker，并选择连接 GitHub 仓库。
3. 授权 Cloudflare 访问自己 Fork 的仓库。
4. 生产分支选择 `main`。
5. Root directory 填 `worker`（如果界面自动加斜杠，显示为 `/worker` 也可以）。
6. Build command 留空。
7. Deploy command 填 `npx wrangler deploy`。
8. 保存并部署，等待日志显示成功。
9. 打开 Worker 的 Bindings，确认存在：
   - `GLIDE_KV`：指向自己的 KV
   - `AI`：Workers AI

这两个绑定已写在 `wrangler.jsonc` 中，正常部署后会自动创建。以后推送到 `main` 时 Cloudflare 会自动重新部署 Worker。

## 5. 首次登录和验证

1. 打开自己的导航站。
2. 点击右上角管理员图标。
3. 账号填写 `admin`，密码留空，登录。
4. 立即在底部点击 **密码**，设置自己的新密码。
5. 新增一个测试书签并刷新页面；刷新后仍然存在，说明 KV 保存成功。
6. 打开无痕窗口访问网站；看得到书签但没有编辑按钮，说明访客模式正常。

## 部署前检查表

- [ ] `CNAME` 已删除，或已改成自己的域名
- [ ] KV ID 已换成自己 Cloudflare 账号下的 ID
- [ ] 自定义域名模式的 `routes` 已换成自己的域名
- [ ] workers.dev 模式已删除 `routes`，并填写 `API_URL`
- [ ] `worker/src/index.js` 中两处网站来源已换成自己的
- [ ] `CNAME`、`worker/wrangler.jsonc` 和 `worker/src/index.js` 中已不再使用原站域名或原 KV ID
- [ ] Worker 部署成功，Bindings 中有 `GLIDE_KV` 和 `AI`
- [ ] 可以空密码首次登录，且已经设置新密码
- [ ] 新增测试书签后刷新仍然存在

## 常见问题

### 网页能打开，但登录、读取或保存失败

- `/api/state` 返回 404：Worker 路由没有生效，检查 `routes` 和 Cloudflare DNS
- 浏览器提示 CORS：检查 `worker/src/index.js` 中的网站来源；GitHub Pages 来源不要带仓库路径
- Worker 日志提示 KV 不存在：KV ID 不是当前 Cloudflare 账号下的 ID
- workers.dev 请求地址错误：检查 `app.js` 的 `API_URL`，末尾不要加 `/api`

### Fork 会复制什么

Fork 会复制代码、页面样式和仓库内置的初始分类；不会复制或持续同步原站 Cloudflare KV 中的实时书签、背景、AI 配置、管理员密码和会话。

只有原作者主动提供 Cloudflare 账号/API Token 或 GitHub 仓库写入权限，其他人才可能影响原站。正常 Fork 并绑定自己的 Cloudflare 与原站完全隔离。
