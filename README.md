# ☁️ Cloudflare Pages 域名管理工具

<div align="center">

![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)

一个基于 Cloudflare Pages 的自定义域名管理工具，支持一键添加/删除域名并自动创建/删除 DNS 记录。

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [部署指南](#-部署指南) • [使用说明](#-使用说明) • [常见问题](#-常见问题)

</div>

---

## 📖 项目简介

这是一个运行在 Cloudflare Pages 上的域名管理工具，**无需后端服务器**，利用 Cloudflare Pages Functions 和 KV 存储实现：

- ✅ 管理 Cloudflare Pages 项目的自定义域名
- ✅ 自动创建 CNAME DNS 记录（无需手动验证）
- ✅ 删除域名时同步删除 DNS 记录
- ✅ API 配置保存在 KV 中，无需重复输入
- ✅ 美观的 Cloudflare 官方配色界面

## ✨ 功能特性

### 🎯 核心功能

- **域名管理**
  - 查看 Pages 项目列表
  - 查看已绑定的自定义域名及状态（激活/验证中）
  - 一键添加自定义域名
  - 删除域名及关联 DNS 记录

- **自动 DNS 管理**
  - 添加域名时自动创建 CNAME 记录
  - 自动获取 Pages 项目的正确目标域名
  - 删除域名时自动清理 DNS 记录
  - 支持代理状态（橙色云朵）

- **配置持久化**
  - 使用 Cloudflare KV 存储配置
  - 首次配置后无需重复输入
  - 支持手动保存/加载配置

## 🚀 快速开始

### 前置要求

1. 一个 Cloudflare 账户
2. 至少一个 Cloudflare Pages 项目
3. 域名已添加到 Cloudflare 并激活

### 创建 API Token

#### 1. Pages API Token
用于管理 Pages 项目域名

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens
2. 点击 **"Create Token"** → **"Create Custom Token"**
3. 权限设置：
   - **Account** → **Cloudflare Pages** → **Edit**
4. 点击 **"Continue to summary"** → **"Create Token"**
5. 复制并保存 Token

#### 2. Zone API Token
用于创建/删除 DNS 记录

1. 同样创建自定义 Token
2. 权限设置：
   - **Zone** → **DNS** → **Edit**
3. **Account Resources** → **Include** → **Specific account** → 选择你的账户
4. **Zone Resources** → **Include** → **Specific zone** → 选择要管理的域名
5. 创建并保存 Token

> 💡 建议为每个 Token 设置最小权限原则，并定期轮换

## 📦 部署指南

### 方法：一键部署（推荐）

1. **Fork 本仓库**
   
   点击右上角 **Fork** 按钮，将项目复制到你的 GitHub 账户

2. **创建 KV 命名空间**
   
   - 进入 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → KV
   - 点击 **"Create a namespace"**
   - 命名为 `pages-domain-config`（或自定义名称）
   - 记录命名空间 ID

3. **连接到 Cloudflare Pages**
   
   - 进入 **Workers & Pages** → **Create application** → **Pages**
   - 选择 **"Connect to Git"**
   - 选择你 Fork 的仓库
   - **构建设置**：
     - Framework preset: `None`
     - Build command: 留空
     - Build output directory: `/`
   - 点击 **"Save and Deploy"**

4. **绑定 KV 命名空间**
   
   - 进入项目 **Settings** → **Functions**
   - 找到 **"KV namespace bindings"**
   - 点击 **"Add binding"**
   - 填写：
     - **Variable name**: `CONFIG_KV`
     - **KV namespace**: 选择刚创建的命名空间
   - 保存后，返回 **Deployments** 页面
   - 点击最新部署右侧的 **"..."** → **"Retry deployment"**

5. **访问你的应用**
   
   部署完成后访问 `你的项目名.pages.dev`
