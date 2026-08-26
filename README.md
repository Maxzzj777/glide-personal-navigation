# Glide 个人导航

一个纯 HTML / CSS / JavaScript 的个人导航页。无需账号、后端或构建工具，数据保存在当前浏览器的 `localStorage` 中。

## 功能

- 分类新增、重命名、删除与拖拽排序
- 网站新增、编辑、删除、同分类排序及跨分类拖放
- 每次编辑和拖拽后自动保存
- 按名称或网址搜索，支持 `⌘/Ctrl + K` 聚焦搜索
- 深色 / 浅色模式、玻璃拟态界面
- 图标固定为 56px，采用紧凑六列卡片布局
- 内置参考导航站点的 10 个分类与 72 个收藏链接
- 访客模式隐藏全部修改操作；管理员账号和密码均为 `admin`
- 桌面端采用每行 6 个的紧凑图标卡片布局
- 左侧分类随整页内容共同滚动
- 管理员可通过公开图片链接更换或恢复网页背景
- 手机抽屉式分类栏；长按卡片可快速编辑

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

## 数据与备份

数据只存储在访问该页面的浏览器中；清理网站数据会删除导航内容。建议定期点击侧栏底部的导出按钮保存 JSON。导入备份会在确认后覆盖当前数据。

## 文件结构

```text
index.html   页面结构
styles.css   视觉、主题与响应式布局
app.js       数据、编辑、拖拽、搜索与备份逻辑
README.md    使用与部署说明
```
