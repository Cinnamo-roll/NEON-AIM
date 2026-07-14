import { authenticatedRequest } from "../../features/auth/authApi";
import type { ModelProviderId } from "./modelApiSettings";

export interface ModelProviderConnectionResult {
  success: boolean;
  provider: ModelProviderId;
  requestedModel: string;
  resolvedModel: string | null;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  failureCode: string | null;
  message: string | null;
}

export async function testModelProviderConnection(
  provider: ModelProviderId,
  apiKey: string,
  model: string,
) {
  const response = await authenticatedRequest<ModelProviderConnectionResult>("/api/admin/ai/providers/test", {
    method: "POST",
    body: JSON.stringify({ provider, apiKey, model }),
  });
  return response.data;
}
