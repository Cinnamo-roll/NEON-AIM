import { afterEach, describe, expect, it, vi } from "vitest";
import { authApi } from "./authApi";

describe("auth API error responses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves structured registration errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 409,
      code: "USERNAME_TAKEN",
      detail: "该用户名已被使用",
    }), {
      status: 409,
      headers: { "Content-Type": "application/problem+json" },
    })));

    await expect(authApi.register({
      username: "pilot_01",
      email: "pilot@example.com",
      password: "Pilot1234",
    })).rejects.toMatchObject({
      code: "USERNAME_TAKEN",
      message: "该用户名已被使用",
      status: 409,
    });
  });

  it("reports an HTTP status when the development proxy returns a non-JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 500 })));

    await expect(authApi.register({
      username: "pilot_02",
      email: "pilot2@example.com",
      password: "Pilot1234",
    })).rejects.toMatchObject({
      code: "HTTP_500",
      message: "注册服务暂时不可用（HTTP 500）",
      status: 500,
    });
  });
});
