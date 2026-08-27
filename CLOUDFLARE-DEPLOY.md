# 小黄云部署教程

Fork 后只需完成下面 4 步。每个 Fork 使用自己的 Worker、KV 和管理员密码，不会读取原站数据。

## 1. Fork 并发布网页

1. 点击 [复制分支（Fork）](https://github.com/Maxzzj777/glide-personal-navigation/fork)。
2. 在仓库 **Settings → Pages** 中选择 `main` 和 `/ (root)`。
3. 配置自己的网页域名，并在 Cloudflare DNS 中打开橙色云朵代理。

## 2. 创建 KV

在 Cloudflare **存储和数据库 → Workers KV** 创建命名空间，复制 Namespace ID，填入 `worker/wrangler.jsonc`：

```jsonc
"kv_namespaces": [{ "binding": "GLIDE_KV", "id": "你的 KV ID" }]
```

同时把同一文件中的路由改成自己的域名：

```jsonc
"routes": [{ "pattern": "你的域名/api/*", "zone_name": "你的根域名" }]
```

例如网站是 `nav.example.com`，根域名就是 `example.com`。

## 3. 部署 Worker

1. 在 Cloudflare **Workers & Pages** 创建 Worker，并连接刚 Fork 的 GitHub 仓库。
2. 生产分支选择 `main`，根目录填写 `/worker`。
3. 部署命令填写 `npx wrangler deploy`，保存并部署。

Worker 会接管网站的 `/api/*`，书签、登录和图标都通过自己的域名访问，不依赖 `workers.dev`。

## 4. 首次登录

- 账号：`admin`
- 初始密码：空
- 登录后点击底部 **密码** 设置新密码。

以后在管理员界面新增、删除或排序书签，只更新自己的 Cloudflare KV，不会修改 GitHub 代码。
