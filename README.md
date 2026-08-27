# Glide 个人导航

一个 HTML / CSS / JavaScript 个人导航页。前台托管在 GitHub Pages，管理员通过 Cloudflare Worker 将共享数据保存到 KV。

## 功能

- 分类新增、重命名、删除与拖拽排序
- 网站新增、编辑、删除、同分类排序及跨分类拖放
- 每次编辑和拖拽后自动保存
- 按名称或网址搜索，支持 `⌘/Ctrl + K` 聚焦搜索
- 深色 / 浅色模式、玻璃拟态界面
- 桌面端采用每行 8 个、62px 满幅圆角图标布局
- 全新部署默认仅包含一个空的“常用推荐”分类
- 访客模式隐藏全部修改操作；管理员账号固定为 `admin`，默认无密码
- 管理员可在管理模式中设置、修改或清空云端管理密码
- 顶部横向分类栏吸顶，并随页面滚动自动高亮当前分组
- 管理员可通过公开图片链接更换或恢复网页背景
- 手机端使用可横向滑动的顶部分类栏；长按卡片可快速编辑

## 本地运行

最简单的方式是直接双击 `index.html`。也可以在项目目录启动任意静态文件服务器，例如：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 部署到 GitHub Pages

1. 新建 GitHub 仓库，并上传本项目全部文件。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/ (root)`，保存后等待生成访问地址。

## 部署到 Cloudflare Pages

1. 在 Cloudflare 控制台进入 **Workers & Pages → Create → Pages**。
2. 连接包含本项目的 Git 仓库。
3. Framework preset 选择 `None`，Build command 留空，Build output directory 填 `/`。
4. 点击部署。

## 云端数据

分类、书签、背景与管理员密码摘要保存在 Cloudflare KV。管理员修改后由 Worker 写入云端，访客进入网站时读取同一份共享数据。默认管理员账号为 `admin`，初始密码为空；登录后可通过底部“密码”按钮设置、修改或清空密码。

Worker 位于 `worker/`，并通过 Cloudflare Git 集成从 GitHub 自动部署。KV 绑定变量名为 `GLIDE_KV`。

## Fork 隔离

Fork 只会复制代码，不会复制原站的 Cloudflare KV、管理员密码或登录状态。Fork 使用者需要在自己的 Cloudflare 账户创建 Worker 与 KV，并将 `app.js` 中的 `API_URL` 和 `worker/wrangler.jsonc` 中的 KV ID 替换为自己的资源；Worker 默认只允许原站域名访问。

仓库中的首次使用模板只有一个空的“常用推荐”分类。首页直接显示该书签分组，不再显示额外的大标题区域。原站已经保存到 KV 的分类与书签不会因模板精简而改变。

## 文件结构

```text
index.html   页面结构
styles.css   视觉、主题与响应式布局
app.js       数据、编辑、拖拽、搜索与备份逻辑
worker/      Cloudflare Worker 接口与 KV 配置
README.md    使用与部署说明
```
