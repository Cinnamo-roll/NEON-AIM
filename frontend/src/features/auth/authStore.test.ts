import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  isServiceAvailable: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("./authApi", async () => {
  const actual = await vi.importActual<typeof import("./authApi")>("./authApi");
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      bootstrap: mocks.bootstrap,
      isServiceAvailable: mocks.isServiceAvailable,
      logout: mocks.logout,
    },
  };
});

import { useAuthStore } from "./authStore";

describe("auth store initialization", () => {
  beforeEach(() => {
    mocks.bootstrap.mockReset();
    mocks.isServiceAvailable.mockReset();
    mocks.logout.mockReset();
    useAuthStore.setState({
      status: "loading",
      user: null,
      busyAction: null,
      error: null,
      fieldErrors: {},
      notice: null,
    });
  });

  it("recovers after the backend becomes available", async () => {
    mocks.bootstrap
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(null);
    mocks.isServiceAvailable.mockResolvedValueOnce(false);

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe("offline");

    await useAuthStore.getState().initialize();
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().status).toBe("guest");
  });

  it("does not call a healthy backend offline when session restoration fails", async () => {
    mocks.bootstrap.mockRejectedValueOnce(new Error("Invalid session response"));
    mocks.isServiceAvailable.mockResolvedValueOnce(true);

    await useAuthStore.getState().initialize();

    expect(mocks.isServiceAvailable).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().status).toBe("guest");
  });

  it("does not carry a sign-out notice onto the guest screen", async () => {
    mocks.logout.mockResolvedValueOnce(true);
    useAuthStore.setState({ status: "authenticated", notice: "stale feedback" });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().notice).toBeNull();
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
});
