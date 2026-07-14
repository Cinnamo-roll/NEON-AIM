export type ProfileVisibility = "PUBLIC" | "FRIENDS" | "PRIVATE";
export type AvatarPreset = "pulse" | "vanguard" | "orbit" | "nova";
export type AccentColor = "cyan" | "violet" | "amber" | "emerald";

export type UserProfile = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarPreset: AvatarPreset;
  accentColor: AccentColor;
  preferredGame: string | null;
  regionCode: string | null;
  profileVisibility: ProfileVisibility;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AuthSession = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: UserProfile;
};

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
  displayName?: string;
};

export type UpdateProfileInput = Partial<Pick<UserProfile,
  "displayName" | "bio" | "avatarPreset" | "accentColor" | "preferredGame" | "regionCode" | "profileVisibility"
>>;

type ApiResponse<T> = { data: T; message: string | null };
type ProblemResponse = {
  status?: number;
  detail?: string;
  title?: string;
  message?: string;
  error?: string;
  code?: string;
  fields?: Record<string, string>;
};

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const SPA_HEADERS = { "X-Requested-With": "NEON-AIM" };
let accessToken: string | null = null;
let refreshInFlight: Promise<AuthSession | null> | null = null;

function fallbackMessage(status: number, path: string) {
  if (path === "/api/auth/register") {
    if (status === 400) return "注册信息不符合要求，请检查后重试";
    if (status === 409) return "该用户名或邮箱已被使用";
    if (status >= 500) return `注册服务暂时不可用（HTTP ${status}）`;
    return `注册请求失败（HTTP ${status}）`;
  }
  if (path === "/api/auth/login" && status === 401) {
    return "用户名、邮箱或密码不正确";
  }
  if (status >= 500) return `身份服务暂时不可用（HTTP ${status}）`;
  return `请求未完成（HTTP ${status}）`;
}

async function parse<T>(response: Response, path: string): Promise<ApiResponse<T>> {
  const rawBody = await response.text();
  let body: ApiResponse<T> | ProblemResponse | null = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as ApiResponse<T> | ProblemResponse;
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const problem = (body ?? {}) as ProblemResponse;
    throw new AuthApiError(
      response.status,
      problem.code ?? `HTTP_${response.status}`,
      problem.detail ?? problem.message ?? problem.title ?? problem.error ?? fallbackMessage(response.status, path),
      problem.fields ?? {},
    );
  }
  if (!body) {
    throw new AuthApiError(response.status, "INVALID_RESPONSE", "身份服务返回了无效响应，请重试");
  }
  return body as ApiResponse<T>;
}

async function publicRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...SPA_HEADERS,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  return parse<T>(response, path);
}

async function refreshSession(): Promise<AuthSession | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await publicRequest<AuthSession>("/api/auth/refresh", { method: "POST" });
      accessToken = response.data.accessToken;
      return response.data;
    } catch (error) {
      accessToken = null;
      if (error instanceof AuthApiError && error.status === 401) return null;
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function authenticatedRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<ApiResponse<T>> {
  if (!accessToken) {
    const session = await refreshSession();
    if (!session) throw new AuthApiError(401, "UNAUTHENTICATED", "请先登录后继续");
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...SPA_HEADERS,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
  if (response.status === 401 && retry) {
    accessToken = null;
    const session = await refreshSession();
    if (session) return authenticatedRequest<T>(path, init, false);
  }
  return parse<T>(response, path);
}

export const authApi = {
  async bootstrap() {
    return refreshSession();
  },

  async isServiceAvailable() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        credentials: "include",
        headers: SPA_HEADERS,
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async register(input: RegisterInput) {
    const response = await publicRequest<AuthSession>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    accessToken = response.data.accessToken;
    return response;
  },

  async login(identifier: string, password: string) {
    const response = await publicRequest<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    accessToken = response.data.accessToken;
    return response;
  },

  async logout() {
    try {
      return await publicRequest<boolean>("/api/auth/logout", { method: "POST" });
    } finally {
      accessToken = null;
    }
  },

  async logoutAll() {
    const response = await authenticatedRequest<boolean>("/api/auth/logout-all", { method: "POST" });
    accessToken = null;
    return response;
  },

  async updateProfile(input: UpdateProfileInput) {
    return authenticatedRequest<UserProfile>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await authenticatedRequest<AuthSession>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    accessToken = response.data.accessToken;
    return response;
  },

  async deleteAccount(password: string) {
    const response = await authenticatedRequest<boolean>("/api/users/me", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });
    accessToken = null;
    return response;
  },
};
