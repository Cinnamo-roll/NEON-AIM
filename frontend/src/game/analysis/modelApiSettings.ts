const MODEL_API_SETTINGS_KEY = "neon-model-api-v2";
const LEGACY_MODEL_API_SETTINGS_KEY = "neon-model-api-v1";

export type ModelProviderId = "openai" | "deepseek" | "bailian";

export interface ModelProviderConfig {
  apiKey: string;
  model: string;
}

export interface ModelApiSettings {
  activeProvider: ModelProviderId;
  providers: Record<ModelProviderId, ModelProviderConfig>;
}

export interface ModelOption {
  id: string;
  label: string;
}

export const MODEL_PROVIDERS: ReadonlyArray<{ id: ModelProviderId; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "bailian", label: "阿里百炼" },
];

export const MODEL_OPTIONS: Record<ModelProviderId, readonly ModelOption[]> = {
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 nano" },
  ],
  deepseek: [
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  ],
  bailian: [
    { id: "qwen3.6-flash", label: "Qwen 3.6 Flash" },
    { id: "qwen3.7-plus", label: "Qwen 3.7 Plus" },
    { id: "qwen3.7-max", label: "Qwen 3.7 Max" },
  ],
};

export const DEFAULT_MODEL_API_SETTINGS: ModelApiSettings = {
  activeProvider: "openai",
  providers: {
    openai: { apiKey: "", model: "gpt-4o-mini" },
    deepseek: { apiKey: "", model: "deepseek-v4-flash" },
    bailian: { apiKey: "", model: "qwen3.6-flash" },
  },
};

function defaults(): ModelApiSettings {
  return {
    activeProvider: DEFAULT_MODEL_API_SETTINGS.activeProvider,
    providers: {
      openai: { ...DEFAULT_MODEL_API_SETTINGS.providers.openai },
      deepseek: { ...DEFAULT_MODEL_API_SETTINGS.providers.deepseek },
      bailian: { ...DEFAULT_MODEL_API_SETTINGS.providers.bailian },
    },
  };
}

function isProvider(value: unknown): value is ModelProviderId {
  return value === "openai" || value === "deepseek" || value === "bailian";
}

function sanitizeProvider(value: unknown, fallback: ModelProviderConfig): ModelProviderConfig {
  const candidate = value && typeof value === "object" ? value as Partial<ModelProviderConfig> : {};
  return {
    apiKey: typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "",
    model: typeof candidate.model === "string" && candidate.model.trim() ? candidate.model.trim() : fallback.model,
  };
}

function sanitize(value: unknown): ModelApiSettings {
  const fallback = defaults();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<ModelApiSettings>;
  return {
    activeProvider: isProvider(candidate.activeProvider) ? candidate.activeProvider : fallback.activeProvider,
    providers: {
      openai: sanitizeProvider(candidate.providers?.openai, fallback.providers.openai),
      deepseek: sanitizeProvider(candidate.providers?.deepseek, fallback.providers.deepseek),
      bailian: sanitizeProvider(candidate.providers?.bailian, fallback.providers.bailian),
    },
  };
}

export function readModelApiSettings(): ModelApiSettings {
  try {
    const current = localStorage.getItem(MODEL_API_SETTINGS_KEY);
    if (current) return sanitize(JSON.parse(current));
    const legacy = JSON.parse(localStorage.getItem(LEGACY_MODEL_API_SETTINGS_KEY) || "null") as Partial<ModelProviderConfig> | null;
    const migrated = defaults();
    if (legacy) migrated.providers.openai = sanitizeProvider(legacy, migrated.providers.openai);
    return migrated;
  } catch {
    return defaults();
  }
}

export function activeModelProvider(settings: ModelApiSettings) {
  return settings.providers[settings.activeProvider];
}

export function saveModelApiSettings(settings: ModelApiSettings) {
  const value = sanitize(settings);
  localStorage.setItem(MODEL_API_SETTINGS_KEY, JSON.stringify(value));
}

export function clearModelApiSettings() {
  localStorage.removeItem(MODEL_API_SETTINGS_KEY);
  localStorage.removeItem(LEGACY_MODEL_API_SETTINGS_KEY);
}
