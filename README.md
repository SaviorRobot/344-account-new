# 清风公账

给宿舍或小团体使用的空调、水费共享账本。所有人访问同一个网址即可查看、添加、修改和删除账目；任何一台设备记账后，其他已打开的设备会实时更新。

## 已有功能

- 公账余额、累计进账和累计支出
- 买水、空调分类统计
- 成员缴费汇总
- 新增、修改、删除、搜索和筛选账目
- 多设备实时同步（Server-Sent Events）
- CSV 导出备份
- 手机与电脑响应式页面
- 访问密码保护（HTTP Only Cookie 会话）
- 首次启动自动加入 2026 年 7 月 13–18 日的初始账目

## 本地运行

需要 Node.js 22.5 或更高版本：

```powershell
# 无密码模式（开发测试用）
npm start

# 设置访问密码
set ACCESS_PASSWORD=your_password
npm start
```

然后打开 `http://localhost:3000`。不要直接双击 `index.html`，共享版需要服务器保存和同步数据。

## 访问保护

默认不设置访问密码。设置 `ACCESS_PASSWORD` 环境变量后，用户必须输入正确密码才能访问账目：

- 密码通过环境变量配置，不会写进代码
- 使用 HTTP Only Cookie 存储会话，7 天有效期
- 未登录用户无法查看或修改任何账目数据

## 数据保存

账目存放在 `data/ledger.db`。部署时必须为 `/app/data` 配置持久化磁盘，否则平台重启后数据会恢复为初始账目。Docker 镜像已把该目录声明为数据卷。

## 部署

项目包含 `Dockerfile`，可部署到支持持久化磁盘的 Railway、Render、Fly.io、Zeabur、云服务器或 NAS：

### 环境变量

- `PORT`：服务端口，默认 `3000`
- `LEDGER_DB_PATH`：数据库路径，默认 `data/ledger.db`
- `ACCESS_PASSWORD`：访问密码，不设置则无密码保护
- `SESSION_SECRET`：会话密钥，自动生成
- `NODE_ENV`：运行环境，设为 `production` 启用安全 Cookie

### 持久化

- 持久化目录：`/app/data`
- 健康检查：`/api/health`

### 部署步骤

1. 创建私有或公开 GitHub 仓库
2. 将代码推送到仓库
3. 在部署平台创建应用并连接仓库
4. 配置持久化磁盘映射到 `/app/data`
5. 设置环境变量（至少设置 `ACCESS_PASSWORD`）
6. 部署应用

这是有服务器和数据库的动态网站，不适合只托管静态文件的 GitHub Pages。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth` | 登录认证 |
| POST | `/api/logout` | 退出登录 |
| GET | `/api/records` | 获取所有账目 |
| POST | `/api/records` | 创建新账目 |
| PUT | `/api/records/:id` | 修改账目 |
| DELETE | `/api/records/:id` | 删除账目 |
| GET | `/api/events` | SSE 实时同步 |

## 技术栈

- Node.js 22+（内置 HTTP 服务器）
- SQLite（内置数据库）
- Server-Sent Events（实时同步）
- 原生 JavaScript（前端）

## 注意事项

- 代码中包含真实成员姓名和缴费记录，请谨慎管理仓库权限
- 部署时务必配置持久化磁盘，否则数据会丢失
- 生产环境请设置强密码保护访问