# Artifacta - 产品定位与功能说明

## 产品定位

**Artifacta** 是面向 **AI 生成数据应用** 的**开放协议与托管平台**，帮助数据驱动团队在本地构建、发布并协作运行 HTML/JS 数据应用。

### 核心理念

在 AI 编程助手（Coding Agent）和本地脚本日益普及的今天，分析师和工程师可以在本地快速生成 HTML/JS 数据应用（看板、报告、轻量工具等）。然而，这些产物的**协议化发布、托管和协作**仍然是一个痛点：

- 生成的 HTML/JS 产物难以以稳定契约分享给团队和外部工具
- 数据绑定与更新需要手动重新打包和分发
- 缺乏统一的权限管理和访问控制
- 难以把本地工作流接入 CI、CLI 和自动化代理

**Artifacta 解决这些问题**，提供一个简单、安全、高效的平台，让团队可以：

1. **协议化发布** - 按 Artifacta 清单契约上传 HTML/JS 产物并绑定数据集
2. **即时分享** - 通过链接或权限配置把可更新的数据应用共享给团队
3. **自动更新** - 配置数据源，实现应用数据的定时自动刷新
4. **统一管理** - 集中管理所有数据应用、数据集和团队权限

### 目标用户

- **数据分析师** - 快速分享分析结果，无需依赖 IT 部署
- **业务运营人员** - 实时查看业务指标，支持决策
- **产品经理** - 追踪产品数据，分享给团队和利益相关者
- **工程师** - 通过 API/CLI 集成到自动化工作流

### 与传统 BI 工具的区别

Artifacta 不是要取代所有 BI 平台，而是补齐 AI 时代数据应用生产链中的托管与分发层。

| 特性 | 传统 BI 工具 | Artifacta |
|------|-------------|------------|
| 应用创建 | 在平台内拖拽创建 | 本地使用任意工具/AI 生成 HTML/JS 数据应用 |
| 契约 | 平台私有模型 | 开放的 Artifacta 清单与发布协议 |
| 灵活性 | 受限于平台组件 | 完全自定义 HTML/CSS/JS |
| 学习成本 | 需要学习平台操作 | 沿用本地工具链，上传即用 |
| 部署方式 | 需要平台账号 | 自托管或团队托管，支持企业身份集成 |
| 自动化 | 有限支持 | 完整 API/CLI，支持 CI/CD 与 coding agents |

---

## 核心功能

### 1. 项目管理

#### 1.1 创建项目

一个"项目"包含：
- **HTML 看板文件** - 数据可视化的展示层
- **数据集文件** - 支持 CSV、Excel、JSON 格式的数据文件
- **权限配置** - 定义谁可以查看和编辑

**上传方式：**
- **Web 界面** - 拖拽上传，可视化配置
- **CLI 工具** - 命令行一键上传
- **REST API** - 集成到自动化工作流

#### 1.2 全屏预览

- HTML 看板以全屏 iframe 方式展示
- 完美还原本地预览效果
- 支持响应式布局

#### 1.3 项目列表

- 网格/列表视图切换
- 按名称、创建时间、更新时间排序
- 支持搜索和筛选

### 2. 数据集管理

#### 2.1 数据集存储

- 支持 CSV、Excel (.xlsx)、JSON 格式
- 自动解析数据结构（行数、列数、字段类型）
- 版本历史记录

#### 2.2 数据更新方式

**方式一：手动上传**
- 通过 Web 界面或 API 上传新版本数据文件
- 适合不定期更新的数据

**方式二：COS 对象存储同步**
- 配置腾讯云 COS / AWS S3 等对象存储路径
- 定时从存储桶拉取最新数据
- 适合 ETL 流程产出的数据

**方式三：Presto SQL 查询**
- 配置 Presto/Trino 连接信息
- 定时执行 SQL 查询并更新数据
- 适合直接从数据仓库获取数据

#### 2.3 同步调度

- Cron 表达式配置更新频率
- 支持手动触发同步
- 同步状态监控和失败告警

### 3. 权限管理

#### 3.1 角色体系

**系统角色（全局）：**
- **管理员 (Admin)** - 管理所有项目、成员和系统设置
- **使用者 (Member)** - 创建项目，管理自己创建的项目

**项目权限（项目级别）：**
- **可编辑 (Edit)** - 可更新项目的 HTML、数据集，触发同步，管理项目成员
- **可查看 (View)** - 只能查看看板内容

#### 3.2 项目可见性

- **仅自己** - 只有创建者可以访问
- **团队可见** - 组织内所有成员可以访问
- **指定成员** - 只有被添加的成员可以访问
- **公开链接** - 任何拥有链接的人可以访问（可设置密码保护）

#### 3.3 SSO 单点登录

- 默认支持 SSO 登录，无需额外配置
- 支持 SAML 2.0 协议
- 兼容 Azure AD、Okta、Google Workspace 等主流身份提供商

### 4. 团队协作

#### 4.1 成员管理

- 邀请成员（通过邮箱或邀请链接）
- 管理成员角色（管理员/使用者）
- 查看成员活动状态

#### 4.2 项目协作

- 在创建项目时直接添加协作者
- 项目所有者可以随时调整成员权限
- 支持转移项目所有权

### 5. API & CLI

#### 5.1 REST API

完整的 RESTful API，支持所有平台功能：
- 项目 CRUD 操作
- 数据集上传和同步配置
- 权限管理
- 团队管理

#### 5.2 CLI 工具

命令行工具 `artifacta` 现在同时支持仓库内调用和对外独立发布包：

- 仓库内：`pnpm cli -- ...`
- 对外发布后：`npx @artifacta/cli@latest ...`

支持项目创建、HTML 替换、数据集上传/替换、同步配置提交和同步触发。当前仓库内可通过 `pnpm cli -- ...` 调用：

```bash
# 上传项目
pnpm cli -- projects upload --file ./dashboard.zip --data-file ./sales.csv --name "销售看板"

# 替换 HTML
pnpm cli -- projects update-html --project-id proj_abc123 --file ./dashboard-v2.zip

# 触发同步
pnpm cli -- sync trigger --project-id proj_abc123 --dataset-id ds_001

# 列出项目
pnpm cli -- projects list
```

#### 5.3 Coding Agent 集成

专为 AI 编程助手设计的集成方式：

```bash
# AI Agent 工作流示例
1. 用户: "帮我分析销售数据并生成看板"
2. Agent: 分析 CSV，生成 HTML 看板
3. Agent: 执行 `pnpm cli -- projects upload --file ./dashboard.zip --data-file ./sales.csv`
4. Agent: 返回看板链接给用户
```

---

## 技术架构

### 前端

- **框架**: Next.js 16 (App Router)
- **UI 组件**: shadcn/ui + Tailwind CSS
- **设计风格**: 参考 NIO 蔚来设计语言，青绿色 (Teal) 为主色调

### 后端

- **API**: RESTful，支持 OpenAPI 规范
- **认证**: SSO (SAML 2.0) + API Key
- **存储**: 对象存储 (HTML/数据文件) + 关系型数据库 (元数据)

### 数据同步

- **调度器**: 分布式任务调度
- **数据源**: COS/S3、Presto/Trino、HTTP API
- **格式转换**: CSV、Excel、JSON 自动解析

---

## 使用场景

### 场景一：日报/周报自动化

1. 数据分析师使用 Python + AI 工具生成日报看板
2. 通过 CLI 自动上传到 Artifacta
3. 配置企业微信/钉钉 Webhook，自动推送链接到群组
4. 团队成员点击链接直接查看，无需下载文件

### 场景二：实时业务监控

1. 创建业务监控看板
2. 配置 Presto SQL 数据源，每小时自动刷新
3. 设置看板为"团队可见"
4. 业务人员随时访问查看最新数据

### 场景三：客户汇报

1. 为客户定制数据分析看板
2. 设置为"公开链接 + 密码保护"
3. 将链接和密码发送给客户
4. 客户无需注册即可查看

### 场景四：CI/CD 集成

```yaml
# GitHub Actions 示例
- name: Generate Dashboard
  run: python generate_dashboard.py

- name: Upload to Artifacta
  run: |
    pnpm cli -- projects upload \
      --file ./output/dashboard.zip \
      --data-file ./output/data.csv \
      --name "Build Report #${{ github.run_number }}" \
      --visibility team
```

---

## 产品路线图

### 当前开源 MVP (v0.1)

- [x] 本地开发登录（SSO-style，占位企业 SSO 接入点）
- [x] 项目上传和管理（HTML 直接预览，ZIP 解包与多资源托管）
- [x] 数据集存储与 CSV/JSON 基础元数据解析
- [x] 基础权限管理（私有、团队、公开链接、项目成员 view/edit）
- [x] REST API 与 API Key
- [x] CLI 首版和 API-driven 同步 Worker
- [x] JSON/SQLite 双持久化模式
- [x] 团队成员管理
- [x] 本地 JSON + 本地文件存储，便于零依赖启动

### 计划中 (v0.2)

- [ ] SAML/OIDC 企业 SSO
- [ ] Postgres/对象存储适配器
- [ ] COS/S3 与真实 Presto/Trino connector
- [ ] Webhook 通知
- [ ] 看板嵌入 (iframe embed)
- [ ] 访问统计分析

### 未来版本

- [ ] 看板版本历史和回滚
- [ ] 评论和标注功能
- [ ] 移动端适配
- [ ] 自定义域名

---

## 定价

### 免费版

- 最多 5 个项目
- 单文件最大 10 MB
- 社区支持

### 团队版

- 无限项目
- 单文件最大 100 MB
- 数据自动同步
- 优先支持

### 企业版

- 私有部署
- 自定义存储
- SLA 保障
- 专属客户成功经理

---

## 联系我们

- **产品反馈**: feedback@Artifacta.io
- **技术支持**: support@Artifacta.io
- **商务合作**: business@Artifacta.io
