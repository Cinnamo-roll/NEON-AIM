import { authenticatedRequest } from "../../features/auth/authApi";
import type { ModelProviderId } from "./modelApiSettings";

export interface AiProviderSettingsView {
  configured: boolean;
  provider: ModelProviderId | null;
  model: string | null;
  apiKeyHint: string | null;
  updatedAt: string | null;
}

export async function getAiProviderSettings() {
  const response = await authenticatedRequest<AiProviderSettingsView>("/api/admin/ai/providers");
  return response.data;
}

export async function saveAiProviderSettings(provider: ModelProviderId, model: string, apiKey?: string) {
  const response = await authenticatedRequest<AiProviderSettingsView>("/api/admin/ai/providers", {
    method: "PUT",
    body: JSON.stringify({ provider, model, apiKey: apiKey?.trim() || undefined }),
  });
  return response.data;
}

