export function canUseGridShotAiAnalysis(authStatus: string, serverSessionId?: string, pending = false) {
  return authStatus === "authenticated" && Boolean(serverSessionId) && !pending;
}

