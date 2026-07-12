import { buildApp } from "./app.js";
import { readEnvironment } from "./config/env.js";

const environment = readEnvironment();
const app = await buildApp(environment);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "正在关闭服务");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: environment.HOST, port: environment.PORT });
