# 试用期考核自动化工具（HRBP 操作台）

纯静态网页：HTML + CSS + JavaScript，**无后端**。员工在浏览器中打开部署后的网址即可使用；Excel 在本地解析，**数据不上传服务器**（需能访问外网以加载 [SheetJS](https://sheetjs.com/) CDN）。

## 给其他 BP 使用

将本项目部署到任意静态网站托管后，把**公开访问链接**发给同事即可，无需每人安装环境。

### 方式一：Vercel（推荐，免费）

1. 将 `probation-hrbp-console` 文件夹推送到 GitHub/GitLab/Bitbucket，或使用 Vercel 控制台 **Import** 上传该文件夹。
2. Framework Preset 选 **Other**，Root Directory 选项目根目录，**Build Command 留空**，**Output** 为根目录 `.`。
3. 部署完成后得到 `https://xxx.vercel.app` 类地址，发给 BP 使用。

### 方式二：Netlify

1. 登录 [Netlify](https://www.netlify.com/) → **Add new site** → **Deploy manually**，把包含 `index.html` 的整个文件夹拖入。
2. 或使用 Git 连接仓库，**Publish directory** 填 `.`，**Build command** 留空。

### 方式三：GitHub Pages

1. 新建仓库，将本目录文件推送到默认分支（如 `main`）。
2. 仓库 **Settings → Pages**，**Source** 选 **Deploy from a branch**，Branch 选 `main` / `(root)`。
3. 约 1 分钟后访问：`https://<用户名>.github.io/<仓库名>/`（注意子路径；本项目资源均为相对路径，可直接使用）。

### 方式四：公司内部静态服务器 / OSS

将目录内 `index.html`、`styles.css`、`logic.js`、`app.js`（及可选 `netlify.toml` 不需要）整包上传到：

- Nginx / IIS 的网站根目录，或
- 阿里云 OSS / 腾讯云 COS 的**静态网站托管**（开启「默认首页」为 `index.html`）。

---

## 网络与安全说明

- 页面会从 `https://cdn.sheetjs.com/` 加载 Excel 解析脚本。若公司网络拦截外网 CDN，需在防火墙或代理中放行该域名，或改为将 `xlsx.full.min.js` 下载到同目录并修改 `index.html` 中的 `<script src="...">` 为本地路径。
- 本工具不收集、不存储用户上传的表格内容。

## 本地预览（维护者）

```bash
cd probation-hrbp-console
npm run start
```

浏览器打开提示的地址（默认 `http://localhost:5173`）即可调试。
