import { useEffect, useRef, useState } from "react";
import type { AccountPreferenceDocument } from "./accountPreferences";
import { getAccountPreferences, saveAccountPreferences } from "./accountPreferencesService";

type AccountPreferencesSyncOptions = {
  authenticated: boolean;
  userId?: string;
  document: AccountPreferenceDocument;
  applyRemote: (preferences: unknown) => void;
};

export function useAccountPreferencesSync({
  authenticated,
  userId,
  document,
  applyRemote,
}: AccountPreferencesSyncOptions) {
  const [readyUserId, setReadyUserId] = useState<string>();
  const latestDocument = useRef(document);
  const lastSynced = useRef<string | undefined>(undefined);
  latestDocument.current = document;
  const serialized = JSON.stringify(document);

  useEffect(() => {
    if (!authenticated || !userId) {
      setReadyUserId(undefined);
      lastSynced.current = undefined;
      return;
    }
    let cancelled = false;
    let retryTimer: number | undefined;
    setReadyUserId(undefined);
    lastSynced.current = undefined;
    const hydrate = async () => {
      try {
        const remote = await getAccountPreferences();
        if (cancelled) return;
        if (remote.configured && remote.preferences) {
          applyRemote(remote.preferences);
          lastSynced.current = JSON.stringify(remote.preferences);
        } else {
          const initial = latestDocument.current;
          await saveAccountPreferences(initial);
          if (cancelled) return;
          lastSynced.current = JSON.stringify(initial);
        }
        setReadyUserId(userId);
      } catch {
        if (!cancelled) retryTimer = window.setTimeout(() => void hydrate(), 3_000);
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [applyRemote, authenticated, userId]);

  useEffect(() => {
    if (!authenticated || !userId || readyUserId !== userId || serialized === lastSynced.current) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    const sync = async () => {
      try {
        await saveAccountPreferences(JSON.parse(serialized) as AccountPreferenceDocument);
        if (!cancelled) lastSynced.current = serialized;
      } catch {
        if (!cancelled) retryTimer = window.setTimeout(() => void sync(), 3_000);
      }
    };
    const timer = window.setTimeout(() => void sync(), 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [authenticated, readyUserId, serialized, userId]);
}
