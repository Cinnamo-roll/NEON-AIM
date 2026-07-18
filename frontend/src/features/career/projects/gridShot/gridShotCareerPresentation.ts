import type { GridShotCareerSession } from "../../../../game/career/gridShotCareer";

export type GridShotCareerRange = "7d" | "30d" | "all";

export interface GridShotScoreTrendPoint {
  key: string;
  completedAt: string;
  score: number;
}

export interface GridShotRangeValue {
  average: number;
  minimum: number;
  maximum: number;
}

export interface GridShotPresentationSummary {
  sessionCount: number;
  averageScore: number;
  bestScore: number;
}

export interface GridShotAbilitySummary {
  hitPace: GridShotRangeValue;
  accuracy: GridShotRangeValue;
  maxCombo: GridShotRangeValue;
  missesPerMinute: GridShotRangeValue;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function average(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + finite(value), 0) / values.length : 0;
}

function rangeValue(values: readonly number[]): GridShotRangeValue {
  if (!values.length) return { average: 0, minimum: 0, maximum: 0 };
  const safeValues = values.map(finite);
  return {
    average: average(safeValues),
    minimum: Math.min(...safeValues),
    maximum: Math.max(...safeValues),
  };
}

function completedTime(session: Pick<GridShotCareerSession, "completedAt">) {
  const time = new Date(session.completedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function filterGridShotSessionsByRange(
  sessions: readonly GridShotCareerSession[],
  range: GridShotCareerRange,
  now = Date.now(),
) {
  if (range === "all") return [...sessions];
  const days = range === "7d" ? 7 : 30;
  const threshold = now - days * DAY_MS;
  return sessions.filter((session) => completedTime(session) >= threshold);
}

export function buildGridShotSequenceTicks(count: number, maximumTicks = 6) {
  const safeCount = Math.max(0, Math.floor(finite(count)));
  const safeMaximumTicks = Math.max(2, Math.floor(finite(maximumTicks)));
  if (!safeCount) return [];
  if (safeCount <= safeMaximumTicks) {
    return Array.from({ length: safeCount }, (_, index) => index + 1);
  }

  const roughStep = (safeCount - 1) / (safeMaximumTicks - 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const multiplier = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;
  const step = multiplier * magnitude;
  const ticks = [1];
  for (let value = step; value < safeCount; value += step) {
    if (value > 1) ticks.push(value);
  }
  if (ticks.at(-1) !== safeCount) ticks.push(safeCount);
  return ticks;
}

export function buildGridShotScoreTrend(
  sessions: readonly GridShotCareerSession[],
): GridShotScoreTrendPoint[] {
  const ordered = [...sessions].sort((left, right) => completedTime(left) - completedTime(right));
  return ordered.map((session) => ({
    key: session.key,
    completedAt: session.completedAt,
    score: finite(session.score),
  }));
}

export function calculateGridShotTargetsPerMinute(
  session: Pick<GridShotCareerSession, "durationMs" | "hits" | "targetsPerMinute">,
) {
  if (session.durationMs <= 0) return finite(session.targetsPerMinute);
  return finite(session.hits) / (session.durationMs / 60_000);
}

export function summarizeGridShotPresentation(
  sessions: readonly GridShotCareerSession[],
): GridShotPresentationSummary {
  return {
    sessionCount: sessions.length,
    averageScore: average(sessions.map((session) => session.score)),
    bestScore: sessions.reduce((best, session) => Math.max(best, finite(session.score)), 0),
  };
}

export function summarizeGridShotAbility(
  sessions: readonly GridShotCareerSession[],
): GridShotAbilitySummary {
  const missesPerMinute = sessions
    .filter((session) => session.durationMs > 0)
    .map((session) => finite(session.misses) / (session.durationMs / 60_000));
  return {
    hitPace: rangeValue(sessions.map(calculateGridShotTargetsPerMinute)),
    accuracy: rangeValue(sessions.map((session) => session.accuracy)),
    maxCombo: rangeValue(sessions.map((session) => session.maxCombo)),
    missesPerMinute: rangeValue(missesPerMinute),
  };
}

export function listGridShotPracticeConfigurations(
  sessions: readonly GridShotCareerSession[],
) {
  const configurations = new Map<string, { key: string; count: number; latest: number }>();
  for (const session of sessions) {
    const current = configurations.get(session.configurationKey);
    configurations.set(session.configurationKey, {
      key: session.configurationKey,
      count: (current?.count ?? 0) + 1,
      latest: Math.max(current?.latest ?? 0, completedTime(session)),
    });
  }
  return [...configurations.values()].sort((left, right) => right.latest - left.latest || right.count - left.count);
}
