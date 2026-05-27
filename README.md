# TS3 Web

TeamSpeak 3 服务器 Web 管理界面。

## 功能

- 服务器状态监控（在线人数、运行时间、版本等）
- 网络流量统计（上传/下载流量、数据包）
- 频道树形列表（支持展开/折叠）
- 在线用户列表（所在频道、延迟、客户端平台）
- 一键连接（复制地址 / 启动客户端）
- 客户端下载链接
- 备用语音方案（YY / KOOK）
- 自动主题切换（根据北京日出日落）
- 深色/浅色/自动三种主题模式
- 服务器端数据缓存（10秒刷新）
- 用户使用指南（含汉化教程）
- 前端代码混淆保护
- HMAC 动态 Token 认证

## 部署

### 前置要求

- Node.js 16+（https://nodejs.org）
- TeamSpeak 3 服务器已开启 Server Query

### 安装

```bash
git clone https://gitee.com/dalovemoli/ts3-web.git
cd ts3-web
npm install
```

### 配置

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 网站名称
SITE_NAME=TS3 Web

# 模拟模式（预览界面时设为 true）
MOCK=false

# TeamSpeak 3 Server Query
TS3_HOST=你的服务器IP
TS3_QUERY_PORT=10011
TS3_QUERY_USER=serveradmin
TS3_QUERY_PASS=你的密码

# 语音端口
TS3_SERVER_PORT=9987

# Web 端口
WEB_PORT=3000

# API 密钥（留空则不启用鉴权）
API_SECRET=你的密钥

# 客户端下载地址
DOWNLOAD_WINDOWS=https://www.teamspeak.com/downloads
DOWNLOAD_MACOS=https://www.teamspeak.com/downloads
DOWNLOAD_LINUX=https://www.teamspeak.com/downloads

# YY频道号（备用方案，留空则不显示）
YY_CHANNEL_ID=

# KOOK频道链接（备用方案，留空则不显示）
KOOK_URL=
```

### 运行

```bash
# 构建混淆版本
npm run build

# 启动服务
npm start
```

访问 `http://localhost:3000`

### 生产部署

```bash
# 安装 pm2
npm install -g pm2

# 构建并启动
npm run build
pm2 start server.js --name ts3-web

# 保存并设置开机自启
pm2 save
pm2 startup
```

### 模拟模式

如需预览界面效果，将 `.env` 中 `MOCK` 设为 `true`：

```env
MOCK=true
```

## API 鉴权

项目支持 HMAC 动态 Token 认证，每次请求生成唯一签名。

### 认证流程

1. 前端生成 `timestamp`（时间戳）和 `nonce`（随机字符串）
2. 使用 `HMAC-SHA256(secret, timestamp + nonce)` 生成签名
3. 将签名放入请求 Header

### 请求 Header

| Header | 说明 |
|--------|------|
| `X-Api-Timestamp` | 时间戳（秒级） |
| `X-Api-Nonce` | 随机字符串 |
| `X-Api-Sign` | HMAC-SHA256 签名 |

### 安全特性

- 密钥不传输，只传签名
- 每次请求签名不同（timestamp + nonce 变化）
- 时间戳验证防重放攻击（30秒有效期）

### 配置

在 `.env` 中设置 `API_SECRET`：

```env
API_SECRET=你的密钥
```

留空则不启用鉴权。

## 开发指南

### 项目结构

```
ts3-web/
├── server.js               # 后端 API
├── build.js                # 构建混淆脚本
├── public/
│   ├── index.src.html      # 前端源码（开发时编辑此文件）
│   ├── index.html          # 混淆后的文件（自动生成，勿手动编辑）
│   └── Chinese_Translation_zh-CN.ts3_translation  # 汉化包
├── package.json
├── .env.example            # 配置模板
├── .gitignore
└── README.md
```

### 本地开发

```bash
# 1. 编辑源码（不要直接编辑 index.html）
vi public/index.src.html

# 2. 本地测试（使用源码）
cp public/index.src.html public/index.html
npm start

# 3. 构建混淆版本
npm run build

# 4. 提交代码
git add .
git commit -m "更新说明"
git push
```

### 服务器更新

```bash
# SSH登录服务器
ssh user@your-server

# 拉取代码
cd /opt/ts3-web
git pull

# 安装依赖（如有新增）
npm install

# 构建混淆版本
npm run build

# 重启服务
pm2 restart ts3-web
```

## Server Query 配置

### 开启 Server Query

确保 TS3 服务器的 `ts3server.ini` 中包含：

```ini
query_port=10011
query_ip=0.0.0.0
```

### IP 白名单

如果连接失败，检查服务器上的 `query_ip_allowlist.txt`，添加你的 IP：

```bash
echo "你的IP" >> /path/to/teamspeak3-server/query_ip_allowlist.txt
```

## API

| 端点 | 说明 | 鉴权 |
|------|------|------|
| `GET /api/config` | 站点配置、下载地址、备用方案 | 否 |
| `GET /api/status` | 服务器状态 | 是 |
| `GET /api/channels` | 频道列表（树形） | 是 |
| `GET /api/clients` | 在线用户列表 | 是 |

## 开源仓库

https://gitee.com/dalovemoli/ts3-web
