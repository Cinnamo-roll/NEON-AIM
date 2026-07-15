# NEON AIM

NEON AIM 是面向桌面浏览器的高刷新率 FPS 瞄准训练项目。当前正式训练模式为 Grid Shot，其余训练、云端用户体系和 AI 训练分析会按模块逐步开放。

## 项目结构

```text
NEON-AIM/
├── frontend/   React + TypeScript + React Three Fiber（独立 npm 项目）
└── backend/    Java 21 + Spring Boot + Gradle Kotlin DSL（独立 Gradle 项目）
```

## 环境要求

- Node.js 20 或更高版本
- Java 21
- 不需要全局安装 Gradle，仓库自带 Gradle Wrapper

## 启动前端

```bash
cd frontend
npm ci
npm run dev
```

前端默认地址：`http://127.0.0.1:5173`

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

后端采用 Spring Modulith 管理模块边界，当前预留：

- `auth`：认证与权限
- `user`：用户与档案
- `training`：训练与成绩
- `analytics`：长期统计
- `leaderboard`：排行榜
- `achievement`：成就系统
- `task`：训练任务
- `ai`：AI 训练分析
- `system`：健康检查与系统能力

AI 模块通过供应商无关的 `TrainingAnalysisProvider` 接口接入模型，领域代码不会直接依赖特定 AI SDK。
