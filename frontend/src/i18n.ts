export type AppLanguage = "zh-CN" | "en-US";

let activeLanguage: AppLanguage = "zh-CN";

export function setAppLanguage(language: AppLanguage) {
  activeLanguage = language;
}

export function getAppLanguage() {
  return activeLanguage;
}

export function tx(chinese: string, english: string) {
  return activeLanguage === "en-US" ? english : chinese;
}

export function isEnglish() {
  return activeLanguage === "en-US";
}
