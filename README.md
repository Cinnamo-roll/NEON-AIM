# NEON AIM

NEON AIM 是一个面向桌面浏览器的高刷新率 FPS 瞄准训练项目。当前已完整实现 Grid Shot，其他训练模式、云端用户系统和 AI 训练分析将按模块逐步开放。

## 目录结构

```text
NEON-AIM/
├─ frontend/   React + TypeScript + React Three Fiber
├─ backend/    Fastify + TypeScript 模块化 API
└─ package.json
```

## 本地开发

要求 Node.js 20 或更高版本。

```bash
npm install
npm run dev:frontend
npm run dev:backend
```

- 前端默认地址：`http://127.0.0.1:5173`
- 后端默认地址：`http://127.0.0.1:3100`
- 健康检查：`GET http://127.0.0.1:3100/api/health`
- 模块清单：`GET http://127.0.0.1:3100/api/v1/system/modules`

## 验证

```bash
npm run build
npm run lint
npm run test
```

## 当前状态

- Grid Shot：可训练
- Reflex Shot：功能仍在准备中
- Tracking：功能仍在准备中
- 用户与身份：后端模块边界已预留
- 长期统计：后端模块边界已预留
- AI 教练：已定义供应商无关的分析接口，尚未接入模型

## 后端扩展约定

后续业务按 `backend/src/modules/<module>` 拆分。AI SDK 只能通过 `TrainingAnalysisProvider` 适配层接入，避免训练数据领域逻辑依赖某个模型供应商。
