# 小黄云 Cloudflare 部署教程

本教程用于将 Fork 后的 Glide 导航部署到自己的 GitHub 和 Cloudflare 账户。每个部署使用独立的 Worker、KV 和管理员密码，不会连接原站数据。

## 1. 复制 GitHub 仓库

1. 点击 [复制分支（Fork）](https://github.com/Maxzzj777/glide-personal-navigation/fork)。
2. Repository name 可保持 `glide-personal-navigation`。
3. 点击 **Create fork**。

GitHub 官方说明：[Fork a repository](https://docs.github.com/en/get-started/quickstart/fork-a-repo)。

## 2. 创建 Cloudflare KV

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 打开 **存储和数据库 → Workers KV**。
3. 点击 **Create Instance / 创建命名空间**。
4. 名称填写 `glide-navigation-data`。
5. 创建后进入该命名空间，在设置中复制 **Namespace ID**。

将 `worker/wrangler.jsonc` 中的 KV ID 替换为自己的 ID：

```jsonc
"kv_namespaces": [
  {
    "binding": "GLIDE_KV",
    "id": "粘贴你自己的 Namespace ID"
  }
]
```

Cloudflare 官方说明：[Workers KV Get started](https://developers.cloudflare.com/kv/get-started/)。

## 3. 连接 GitHub 并部署 Worker

1. 在 Cloudflare 打开 **Workers & Pages**。
2. 创建 Worker，并选择连接 GitHub 仓库。
3. 只授权自己刚刚 Fork 的仓库。
4. 生产分支选择 `main`。
5. 根目录填写 `/worker`。
6. 部署命令填写 `npx wrangler deploy`。
7. 保存并开始部署。

部署完成后会得到类似下面的地址：

```text
https://glide-navigation-api.你的子域.workers.dev
```

Cloudflare 官方说明：[Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)。

## 4. 填写自己的接口和网站域名

编辑根目录的 `app.js`：

```js
const API_URL='https://glide-navigation-api.你的子域.workers.dev';
```

编辑 `worker/src/index.js`，将允许访问的域名替换成自己的网站域名：

```js
const ALLOWED_ORIGINS = new Set([
  'https://你的域名.example',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
]);
```

提交以上修改后，Cloudflare 会从 GitHub 自动重新部署 Worker。

## 5. 发布网页

### 使用 GitHub Pages

1. 打开 Fork 仓库的 **Settings → Pages**。
2. Source 选择 **Deploy from a branch**。
3. Branch 选择 `main`，目录选择 `/ (root)`。
4. 保存并等待发布完成。

也可以使用 Cloudflare Pages 托管网页；此时仍需把 Pages 域名加入 Worker 的 `ALLOWED_ORIGINS`。

## 6. 首次登录

- 管理员账号：`admin`
- 初始密码：空
- 首次登录后，点击页面底部的 **密码** 设置自己的管理员密码。
- 新部署默认只有一个空的“常用推荐”分类。

之后在网页管理员界面新增、删除或排序书签时，只会更新自己的 Cloudflare KV，不会修改 GitHub 代码。
