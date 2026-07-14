import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest } from "../../features/auth/authApi";
import { testModelProviderConnection } from "./modelProviderConnectionService";

vi.mock("../../features/auth/authApi", () => ({ authenticatedRequest: vi.fn() }));

const requestMock = vi.mocked(authenticatedRequest);

describe("model provider connection service", () => {
  beforeEach(() => requestMock.mockReset());

  it("sends the selected provider, key, and custom model to the admin probe", async () => {
    requestMock.mockResolvedValue({
      data: {
        success: true,
        provider: "deepseek",
        requestedModel: "deepseek-v4-pro",
        resolvedModel: "deepseek-v4-pro",
        durationMs: 128,
        inputTokens: 9,
        outputTokens: 4,
        failureCode: null,
        message: null,
      },
      message: null,
    });

    const result = await testModelProviderConnection("deepseek", "sk-deepseek-test-key", "deepseek-v4-pro");

    expect(result.success).toBe(true);
    expect(requestMock).toHaveBeenCalledWith("/api/admin/ai/providers/test", {
      method: "POST",
      body: JSON.stringify({
        provider: "deepseek",
        apiKey: "sk-deepseek-test-key",
        model: "deepseek-v4-pro",
      }),
    });
  });
});
