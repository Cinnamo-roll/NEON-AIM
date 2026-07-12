import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppEnvironment } from "./config/env.js";
import { systemRoutes } from "./modules/system/system.routes.js";

export async function buildApp(environment: AppEnvironment): Promise<FastifyInstance> {
  const app = Fastify({
    logger: environment.NODE_ENV !== "test",
  });

  await app.register(cors, {
    origin: environment.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "neon-aim-backend",
    timestamp: new Date().toISOString(),
  }));

  await app.register(systemRoutes, { prefix: "/api/v1/system" });

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({
      error: { code: "NOT_FOUND", message: "请求的接口不存在" },
    });
  });

  app.setErrorHandler(async (error, _request, reply) => {
    app.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理该请求" },
    });
  });

  return app;
}
