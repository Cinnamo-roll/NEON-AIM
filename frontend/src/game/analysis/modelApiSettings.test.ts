import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeModelProvider,
  readModelApiSettings,
  saveModelApiSettings,
} from "./modelApiSettings";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("model API settings", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));

  it("keeps each provider key and model independent", () => {
    saveModelApiSettings({
      activeProvider: "deepseek",
      providers: {
        openai: { apiKey: "openai-key-value", model: "gpt-4o-mini" },
        deepseek: { apiKey: "deepseek-key-value", model: "deepseek-v4-pro" },
        bailian: { apiKey: "bailian-key-value", model: "qwen-plus" },
      },
    });

    const settings = readModelApiSettings();
    expect(settings.activeProvider).toBe("deepseek");
    expect(activeModelProvider(settings)).toEqual({ apiKey: "deepseek-key-value", model: "deepseek-v4-pro" });
    expect(settings.providers.bailian.apiKey).toBe("bailian-key-value");
  });

  it("migrates the previous OpenAI-only browser setting", () => {
    localStorage.setItem("neon-model-api-v1", JSON.stringify({ apiKey: "legacy-key-value", model: "gpt-4.1-mini" }));

    const settings = readModelApiSettings();
    expect(settings.providers.openai).toEqual({ apiKey: "legacy-key-value", model: "gpt-4.1-mini" });
    expect(settings.providers.deepseek.model).toBe("deepseek-v4-flash");
    expect(settings.providers.bailian.model).toBe("qwen3.6-flash");
  });
});
