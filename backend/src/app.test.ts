import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { AppEnvironment } from "./config/env.js";

const environment: AppEnvironment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3100,
  CORS_ORIGIN: "http://127.0.0.1:5173",
};

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("backend application", () => {
  it("exposes a healthy service endpoint", async () => {
    const app = await buildApp(environment);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "neon-aim-backend" });
  });

  it("publishes planned module boundaries without pretending they are complete", async () => {
    const app = await buildApp(environment);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/system/modules" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ message: "功能仍在准备中" });
    expect(response.json().data).toHaveLength(4);
  });

  it("returns a stable error envelope for unknown routes", async () => {
    const app = await buildApp(environment);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/missing" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: "NOT_FOUND", message: "请求的接口不存在" } });
  });
});
