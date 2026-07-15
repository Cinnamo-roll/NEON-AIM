import { authenticatedRequest } from "../../features/auth/authApi";
import type { AccountPreferenceDocument } from "./accountPreferences";

export type AccountPreferencesView = {
  configured: boolean;
  preferences: unknown | null;
  updatedAt: string | null;
};

export async function getAccountPreferences() {
  const response = await authenticatedRequest<AccountPreferencesView>("/api/users/me/training-preferences");
  return response.data;
}

export async function saveAccountPreferences(preferences: AccountPreferenceDocument) {
  const response = await authenticatedRequest<AccountPreferencesView>("/api/users/me/training-preferences", {
    method: "PUT",
    body: JSON.stringify({ preferences }),
  });
  return response.data;
}
