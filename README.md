# NEON AIM

NEON AIM 是面向桌面浏览器的高刷新率 FPS 瞄准训练项目。当前正式训练模式为 GRID SHOT，已实现账户、服务端训练记录、生涯档案、单局复盘和可配置的 AI 训练分析，其余训练项目将按模块逐步开放。

完整的产品目标、功能现状、指标口径、系统架构、开发方式与已知限制见 [`PRODUCT.md`](PRODUCT.md)。

## 项目结构

```text
NEON-AIM/
├── frontend/   React + TypeScript + React Three Fiber（独立 npm 项目）
└── backend/    Java 21 + Spring Boot + Gradle Kotlin DSL（独立 Gradle 项目）
```

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

AI 模块通过供应商无关的 `TrainingAnalysisProvider` 接口接入模型，领域代码不会直接依赖特定 AI SDK。
