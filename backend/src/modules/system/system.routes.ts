import type { FastifyPluginAsync } from "fastify";

const modules = [
  { id: "training", name: "训练数据", status: "planned" },
  { id: "users", name: "用户与身份", status: "planned" },
  { id: "analytics", name: "长期统计", status: "planned" },
  { id: "ai-coach", name: "AI 训练分析", status: "planned" },
] as const;

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get("/modules", async () => ({
    data: modules,
    message: "功能仍在准备中",
  }));
};
