import type { CareerPrimaryView } from "./CareerPageCarousel";

const PRIMARY_VIEW_STORAGE_KEY = "neon-aim:career-primary-view";

export function careerPrimaryViewStorageKey(userId: string | undefined) {
  return userId ? `${PRIMARY_VIEW_STORAGE_KEY}:${userId}` : PRIMARY_VIEW_STORAGE_KEY;
}

export function readCareerPrimaryView(userId: string | undefined): CareerPrimaryView {
  if (typeof window === "undefined") return "overview";
  const stored = window.sessionStorage.getItem(careerPrimaryViewStorageKey(userId));
  return stored === "projects" || stored === "game-plan" ? stored : "overview";
}
