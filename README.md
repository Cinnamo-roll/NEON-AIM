# NEON AIM

NEON AIM 是面向桌面浏览器的高刷新率 FPS 瞄准训练项目。当前正式训练模式为 GRID SHOT，已实现账户、服务端训练记录、生涯档案、单局复盘和可配置的 AI 训练分析，其余训练项目将按模块逐步开放。

完整的产品目标、功能现状、指标口径、系统架构、开发方式与已知限制见 [`PRODUCT.md`](PRODUCT.md)。

## 项目结构

```text
NEON-AIM/
├── frontend/   React + TypeScript + React Three Fiber（独立 npm 项目）
└── backend/    Java 21 + Spring Boot + Gradle Kotlin DSL（独立 Gradle 项目）
```

## 技术栈

### 前端

- React 19、TypeScript 6、Vite 8。
- Three.js、React Three Fiber、Drei：3D 训练场景与目标渲染。
- Zustand：应用、身份和性能状态。
- Recharts：生涯趋势图；Framer Motion：界面过渡。
- Vitest 与 Oxlint：测试和静态检查。

### 后端

- Java 21、Spring Boot 4.1、Gradle Kotlin DSL。
- Spring MVC、Bean Validation、Spring Security、OAuth2 Resource Server。
- Spring Data JPA/Hibernate、Flyway；本地使用文件型 H2，生产使用 PostgreSQL。
- Spring Cache；本地使用进程内缓存，生产使用 Redis 缓存生涯档案。
- Spring Modulith：模块边界；Springdoc OpenAPI 与 Actuator：接口文档和健康检查。

### AI 分析

- 不依赖 Spring AI、LangChain 或厂商 SDK；通过供应商无关的 `TrainingAnalysisProvider` 适配层接入模型。
- 使用 Java 21 `HttpClient` 与 Jackson 3 直接调用、序列化和解析模型 HTTP/JSON API。
- OpenAI 使用 Responses API 与 Strict JSON Schema；DeepSeek、阿里百炼使用 OpenAI-compatible Chat Completions 与 JSON Mode。
- 单局和生涯分析由有界 `ThreadPoolTaskExecutor` 异步执行；任务、Token 用量、结果和 AI 缓存通过 JPA 持久化到关系数据库。
- 输入使用有界结构化快照，并经过 Token 预算、确定性质量门槛、本地恢复和最多一次模型修复；API Key 使用 AES-GCM 加密保存。
- 当前没有 RAG、向量数据库、Embedding、微调、本地模型推理、流式生成或分布式任务队列。

## 环境要求

- Node.js 20.19 或更高的 Node 20 版本，或 Node.js 22.12 及以上
- Java 21
- 不需要全局安装 Gradle，仓库自带 Gradle Wrapper

## 启动前端

```bash
cd frontend
npm ci
npm run dev
```

Vite 通常使用 `http://localhost:5173`；端口被占用时可能变化，最终地址以终端输出为准。

Windows PowerShell 如果提示禁止运行 `npm.ps1`，请改用 `npm.cmd ci` 和 `npm.cmd run dev`，无需修改系统的全局执行策略。

## 启动后端

另开一个终端。Windows：

```powershell
cd backend
.\gradlew.bat bootRun
```

macOS / Linux：

```bash
cd backend
./gradlew bootRun
```

- 后端默认地址：`http://127.0.0.1:3100`
- 服务健康检查：`GET http://127.0.0.1:3100/api/health`
- Actuator 健康检查：`GET http://127.0.0.1:3100/actuator/health`
- 模块清单：`GET http://127.0.0.1:3100/api/v1/system/modules`
- OpenAPI：`http://127.0.0.1:3100/swagger-ui`

本地后端默认使用 PostgreSQL 兼容模式的文件型 H2 数据库，便于直接启动并保留开发数据。生产环境使用 `prod` Profile，并通过环境变量连接 PostgreSQL 与 Redis，配置示例见 `backend/.env.example`。

## 验证

前端：

```bash
cd frontend
npm run build
npm run lint
npm run test
```

后端（Windows）：

```powershell
cd backend
.\gradlew.bat build
.\gradlew.bat lint
.\gradlew.bat test
```

macOS / Linux 将 `.\gradlew.bat` 替换为 `./gradlew`。

## 后端边界

后端采用 Spring Modulith 管理模块边界，当前状态如下：

- 已实现：`auth`（认证与权限）、`user`（用户与档案）、`training`（训练与成绩）、`ai`（AI 训练分析）、`common`（响应与错误）、`system`（健康检查）。
- 领域骨架：`analytics`（长期统计）、`leaderboard`（排行榜）、`achievement`（成就系统）、`task`（通用训练任务）。

AI 模块的 Provider、异步任务、缓存、Token 边界和质量门槛详见 [`PRODUCT.md`](PRODUCT.md#ai-分析设计)。

## 许可证

NEON AIM 中由 CintaOvO 拥有权利的原创代码与文档采用 [PolyForm Noncommercial License 1.0.0](LICENSE) 提供。你可以在许可证规定的非商业用途下使用、修改和分发；该许可证不授予商业用途许可。任何分发都必须保留完整许可证条款和以下 Required Notice：

```text
Required Notice: Copyright 2026 CintaOvO (https://github.com/Cinnamo-roll)
```

第三方依赖、图标、字体和其他第三方内容仍适用各自的许可证。这里仅提供便于阅读的摘要，具体权利与义务以 [`LICENSE`](LICENSE) 英文原文为准；商业使用需另行取得 CintaOvO 的书面许可。本项目属于源码可用（source-available）项目，不是 OSI 定义下的开源软件。
