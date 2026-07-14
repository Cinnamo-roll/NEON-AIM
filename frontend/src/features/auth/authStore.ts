import { create } from "zustand";
import {
  AuthApiError,
  authApi,
  type RegisterInput,
  type UpdateProfileInput,
  type UserProfile,
} from "./authApi";
import { tx } from "../../i18n";

type AuthStatus = "loading" | "guest" | "authenticated" | "offline";
type AuthAction = "login" | "register" | "profile" | "password" | "logout" | "delete" | null;

type AuthState = {
  status: AuthStatus;
  user: UserProfile | null;
  busyAction: AuthAction;
  error: string | null;
  fieldErrors: Record<string, string>;
  notice: string | null;
  initialize: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (input: RegisterInput) => Promise<boolean>;
  updateProfile: (input: UpdateProfileInput) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  deleteAccount: (password: string) => Promise<boolean>;
  clearFeedback: () => void;
};

let initialization: Promise<void> | null = null;

function feedback(error: unknown) {
  if (error instanceof AuthApiError) {
    return { error: error.message, fieldErrors: error.fields };
  }
  return { error: tx("无法连接身份服务，请检查后端服务后重试", "Unable to reach the identity service. Check the backend and try again."), fieldErrors: {} };
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  busyAction: null,
  error: null,
  fieldErrors: {},
  notice: null,

  initialize: async () => {
    if (initialization) return initialization;
    const run = (async () => {
      try {
        const session = await authApi.bootstrap();
        set({ status: session ? "authenticated" : "guest", user: session?.user ?? null, error: null, fieldErrors: {} });
      } catch {
        const available = await authApi.isServiceAvailable();
        set({ status: available ? "guest" : "offline", user: null, error: null, fieldErrors: {}, notice: null });
      }
    })();
    initialization = run;
    try {
      await run;
    } finally {
      if (initialization === run) initialization = null;
    }
  },

  login: async (identifier, password) => {
    set({ busyAction: "login", error: null, fieldErrors: {}, notice: null });
    try {
      const response = await authApi.login(identifier, password);
      set({ status: "authenticated", user: response.data.user, busyAction: null, notice: response.message });
      return true;
    } catch (error) {
      set({ busyAction: null, ...feedback(error) });
      return false;
    }
  },

  register: async (input) => {
    set({ busyAction: "register", error: null, fieldErrors: {}, notice: null });
    try {
      const response = await authApi.register(input);
      set({ status: "authenticated", user: response.data.user, busyAction: null, notice: response.message });
      return true;
    } catch (error) {
      set({ busyAction: null, ...feedback(error) });
      return false;
    }
  },

  updateProfile: async (input) => {
    set({ busyAction: "profile", error: null, fieldErrors: {}, notice: null });
    try {
      const response = await authApi.updateProfile(input);
      set({ user: response.data, busyAction: null, notice: response.message });
      return true;
    } catch (error) {
      const detail = feedback(error);
      set({
        busyAction: null,
        ...(error instanceof AuthApiError && error.status === 401 ? { status: "guest" as const, user: null } : {}),
        ...detail,
      });
      return false;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ busyAction: "password", error: null, fieldErrors: {}, notice: null });
    try {
      const response = await authApi.changePassword(currentPassword, newPassword);
      set({ user: response.data.user, busyAction: null, notice: response.message });
      return true;
    } catch (error) {
      set({ busyAction: null, ...feedback(error) });
      return false;
    }
  },

  logout: async () => {
    set({ busyAction: "logout", error: null, notice: null });
    try {
      await authApi.logout();
    } finally {
      set({ status: "guest", user: null, busyAction: null, error: null, fieldErrors: {}, notice: null });
    }
  },

  logoutAll: async () => {
    set({ busyAction: "logout", error: null, notice: null });
    try {
      await authApi.logoutAll();
      set({ status: "guest", user: null, busyAction: null, notice: null });
    } catch (error) {
      set({ busyAction: null, ...feedback(error) });
    }
  },

  deleteAccount: async (password) => {
    set({ busyAction: "delete", error: null, fieldErrors: {}, notice: null });
    try {
      const response = await authApi.deleteAccount(password);
      set({ status: "guest", user: null, busyAction: null, notice: response.message });
      return true;
    } catch (error) {
      set({ busyAction: null, ...feedback(error) });
      return false;
    }
  },

  clearFeedback: () => set({ error: null, fieldErrors: {}, notice: null }),
}));
