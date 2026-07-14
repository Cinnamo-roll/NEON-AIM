import { afterEach, describe, expect, it } from "vitest";
import { getAppLanguage, setAppLanguage, tx } from "./i18n";

describe("app language", () => {
  afterEach(() => setAppLanguage("zh-CN"));

  it("switches user-facing copy between Chinese and English", () => {
    setAppLanguage("en-US");
    expect(getAppLanguage()).toBe("en-US");
    expect(tx("大厅", "Lobby")).toBe("Lobby");

    setAppLanguage("zh-CN");
    expect(tx("大厅", "Lobby")).toBe("大厅");
  });
});
