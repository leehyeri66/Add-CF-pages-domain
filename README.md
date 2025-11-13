# ☁️ Cloudflare Pages 域名管理工具

<div align="center">

![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)

一个 **完全基于 Cloudflare Pages + Functions** 的自定义域名管理工具，  
支持一键添加/删除 Pages 自定义域名，并自动同步 DNS 记录 — **无需 VPS，无需额外后端**。

[功能特性](#-功能特性) • [部署指南](#-部署指南) • [使用说明](#-使用说明) • [常见问题](#-常见问题)

</div>

---

## 📖 项目简介

本项目运行在 **Cloudflare Pages** 上，通过 **Pages Functions + KV 存储** 实现完整的后端逻辑：  

- 🧩 管理 Cloudflare Pages 项目的自定义域名  
- ⚡ 自动创建/删除 CNAME DNS 记录  
- 🔐 密码登录保护 + API Token 安全存储在 KV 中  
- 💡 全前端交互界面，现代化毛玻璃设计  

---

## ✨ 功能特性

### 🎯 核心功能
- 🔒 **密码保护**：设置访问密码，防止未授权访问
- 📋 查看账户下所有 Cloudflare Pages 项目  
- 🌐 查看、添加或删除项目的自定义域名  
- 🚀 自动为域名创建 CNAME DNS 记录（可开启橙云代理）  
- 🗑️ 删除域名时同步删除对应 DNS 记录  
- 💾 使用 Cloudflare KV 实现 API 信息持久化  
- 🎨 现代化毛玻璃界面，流畅交互体验  

---

## ⚙️ 准备工作

你需要准备：
1. ✅ 一个 Cloudflare 账户  
2. ✅ 至少一个已部署的 Pages 项目  
3. ✅ 已接入 Cloudflare 的域名  

---

## 🔑 创建所需 API Token

### 🔧 通用创建步骤

1. 打开 👉 [Cloudflare Dashboard - API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击「**Create Token**」
3. 选择「**Create Custom Token**」（自定义）

---

### 1️⃣ Pages 管理 Token
用于添加/删除 Pages 项目的自定义域名。

**📋 权限配置：**
- **Account** → **Cloudflare Pages** → **Edit** ✅
- **Account** → **Cloudflare Pages** → **Read** ✅

**🎯 Account Resources：**
- **Include** → **Specific accounts** → 选择你的账户名称

**✅ 完成：**
- 点击 **Continue to summary** → **Create Token**
- 复制生成的 Token（⚠️ **只显示一次，请妥善保存**）

---

### 2️⃣ DNS 管理 Token
用于自动添加/删除 DNS 记录。

**📋 权限配置：**
- **Zone** → **DNS** → **Edit** ✅
- **Zone** → **Zone** → **Read** ✅
- **Zone** → **Zone Settings** → **Read** ✅

**🎯 Zone Resources：**
- **Include** → **Specific zone** → 选择要管理的域名
- 或选择 **All zones** 管理所有域名

**✅ 完成：**
- 点击 **Continue to summary** → **Create Token**
- 复制生成的 Token（⚠️ **只显示一次，请妥善保存**）

---

## 🚀 部署指南（无 VPS，全 Pages 部署）

### 1. Fork 本项目
点击右上角 **Fork**，将仓库复制到你的 GitHub。

---

### 2. 创建 KV 命名空间
- 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
- 前往 **Workers & Pages → KV → Create a namespace**
- 命名为 `pages-domain-config`
- 记录 KV Namespace ID（后续绑定时需要）

---

### 3. 连接到 Cloudflare Pages
- 打开 **Workers & Pages → Create application → Pages**
- 选择 **"Connect to Git"**
- 选择刚 Fork 的仓库
- 设置：
  - Framework preset: `None`
  - Build command: *留空*
  - Build output directory: `/`

点击 **Save and Deploy**

---

### 4. 配置环境变量
部署完成后，设置必需的环境变量：

- 打开项目 → **Settings → Environment variables**
- 添加以下变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `PASSWORD` | 访问密码（登录时使用） | `mySecurePass123` |

---

### 5. 绑定 KV 命名空间
- 打开项目 → **Settings → Functions**
- 在 **KV namespace bindings** 中添加：
  - Variable name: `CONFIG_KV`（⚠️ **必须是这个名称**）
  - Namespace: 选择之前创建的命名空间
- 保存设置后，返回 **Deployments** 页面
- 点击最新部署的「**...**」→「**Retry deployment**」

---

### 6. 访问你的应用
部署完成后访问 `你的项目名.pages.dev`

---
