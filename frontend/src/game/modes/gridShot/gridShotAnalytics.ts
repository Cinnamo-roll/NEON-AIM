import { evaluateGridShotGrade, type GridShotGradeResult } from "./gridShotGrade";
import { comboBonus, isStable, speedBonus } from "../../scoring/gridShotScoreRules";

export type GridShotEventType = "hit" | "miss";

export interface GridShotEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  elapsedMs: number;
  type: GridShotEventType;
  targetId?: number;
  targetActivatedAt?: number;
  targetLifetimeMs?: number;
  previousHitAt?: number;
  hitIntervalMs?: number;
  comboBefore: number;
  comboAfter: number;
  baseScore: number;
  speedBonus: number;
  comboBonus: number;
  stabilityBonus: number;
  totalScore: number;
}

export interface GridShotAnalyticsOptions {
  sessionDurationMs: number;
  activeDurationMs?: number;
  sessionId?: string;
}

export interface GridShotScoreTotals {
  baseScoreTotal: number;
  speedBonusTotal: number;
  comboBonusTotal: number;
  stabilityBonusTotal: number;
  score: number;
}

export interface GridShotPhaseAnalytics extends GridShotScoreTotals {
  id: "phase1" | "phase2" | "phase3";
  label: string;
  startMs: number;
  endMs: number;
  endInclusive: boolean;
  shots: number;
  hits: number;
  misses: number;
  accuracy: number;
  targetsPerMinute: number;
}

export interface GridShotTimelinePoint {
  time: number;
  elapsedMs: number;
  score: number;
  shots: number;
  hits: number;
  misses: number;
  accuracy: number;
  targetsPerMinute: number;
  combo: number;
}

export interface GridShotIntegrityChecks {
  shotsMatch: boolean;
  scoreComponentsMatch: boolean;
  scoreRulesMatch: boolean;
  phaseScoreMatch: boolean;
  phaseHitsMatch: boolean;
  phaseMissesMatch: boolean;
  allEventsAssigned: boolean;
  missScoresZero: boolean;
  uniqueEventIds: boolean;
  singleSession: boolean;
  chronological: boolean;
  combosValid: boolean;
  hitIntervalsValid: boolean;
  targetLifetimesValid: boolean;
  finiteValues: boolean;
}

export interface GridShotIntegrityResult {
  passed: boolean;
  errors: string[];
  checks: GridShotIntegrityChecks;
}

export interface GridShotAnalytics extends GridShotScoreTotals {
  eventCount: number;
  shots: number;
  hits: number;
  misses: number;
  accuracy: number;
  targetsPerMinute: number;
  maxCombo: number;
  activeDurationMs: number;
  sessionDurationMs: number;
  averageHitInterval: number;
  medianHitInterval: number;
  fastestHitInterval: number;
  slowestHitInterval: number;
  averageTargetLifetime: number;
  consistencyScore: number;
  hitIntervals: number[];
  phases: [GridShotPhaseAnalytics, GridShotPhaseAnalytics, GridShotPhaseAnalytics];
  timeline: GridShotTimelinePoint[];
  grade: GridShotGradeResult;
  integrity: GridShotIntegrityResult;
}

const SCORE_EPSILON = 1e-9;
const ROBUST_SIGMA_FACTOR = 1.4826;
const ROBUST_CV_AT_ZERO_SCORE = 0.35;
const MISS_PENALTY_WEIGHT = 0.5;

const finiteOrZero = (value: number) => Number.isFinite(value) ? value : 0;
const nonNegative = (value: number) => Math.max(0, finiteOrZero(value));
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, finiteOrZero(value)));
const approximatelyEqual = (left: number, right: number) => Math.abs(left - right) <= SCORE_EPSILON;
const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function median(values: readonly number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

/**
 * Consistency uses median absolute deviation (MAD), scaled to a robust standard
 * deviation estimate. A single extreme interval therefore cannot dominate the
 * result. Misses reduce the rhythm score without being inserted as fake long
 * hit intervals. Fewer than three intervals is not enough evidence and returns 0.
 */
export function calculateGridShotConsistency(intervals: readonly number[], hits: number, misses: number) {
  const valid = intervals.filter((value) => Number.isFinite(value) && value >= 0);
  if (valid.length < 3) return 0;
  const center = median(valid);
  if (center <= 0) return 0;
  const mad = median(valid.map((value) => Math.abs(value - center)));
  const robustCoefficientOfVariation = ROBUST_SIGMA_FACTOR * mad / center;
  const rhythmScore = 100 * clamp(1 - robustCoefficientOfVariation / ROBUST_CV_AT_ZERO_SCORE, 0, 1);
  const safeHits = nonNegative(hits);
  const safeMisses = nonNegative(misses);
  const shots = safeHits + safeMisses;
  const missRate = shots > 0 ? safeMisses / shots : 0;
  const missFactor = clamp(1 - missRate * MISS_PENALTY_WEIGHT, 0.5, 1);
  return Math.round(clamp(rhythmScore * missFactor, 0, 100));
}

function emptyScoreTotals(): GridShotScoreTotals {
  return { baseScoreTotal: 0, speedBonusTotal: 0, comboBonusTotal: 0, stabilityBonusTotal: 0, score: 0 };
}

function addScore(totals: GridShotScoreTotals, event: GridShotEvent) {
  totals.baseScoreTotal += finiteOrZero(event.baseScore);
  totals.speedBonusTotal += finiteOrZero(event.speedBonus);
  totals.comboBonusTotal += finiteOrZero(event.comboBonus);
  totals.stabilityBonusTotal += finiteOrZero(event.stabilityBonus);
  totals.score += finiteOrZero(event.totalScore);
}

function phaseBoundaries(sessionDurationMs: number) {
  return {
    firstEndMs: Math.round(sessionDurationMs / 3),
    secondEndMs: Math.round(sessionDurationMs * 2 / 3),
  };
}

function phaseIndex(elapsedMs: number, sessionDurationMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > sessionDurationMs) return -1;
  const { firstEndMs, secondEndMs } = phaseBoundaries(sessionDurationMs);
  if (elapsedMs < firstEndMs) return 0;
  if (elapsedMs < secondEndMs) return 1;
  return 2;
}

function createPhases(sessionDurationMs: number): [GridShotPhaseAnalytics, GridShotPhaseAnalytics, GridShotPhaseAnalytics] {
  const { firstEndMs, secondEndMs } = phaseBoundaries(sessionDurationMs);
  const seconds = (milliseconds: number) => Number((milliseconds / 1_000).toFixed(3));
  const definitions = [
    { id: "phase1", label: `前 ${seconds(firstEndMs)} 秒`, startMs: 0, endMs: firstEndMs, endInclusive: false },
    { id: "phase2", label: `${seconds(firstEndMs)}-${seconds(secondEndMs)} 秒`, startMs: firstEndMs, endMs: secondEndMs, endInclusive: false },
    { id: "phase3", label: `最后 ${seconds(sessionDurationMs - secondEndMs)} 秒`, startMs: secondEndMs, endMs: sessionDurationMs, endInclusive: true },
  ] as const;
  return definitions.map((phase) => ({
    ...phase,
    ...emptyScoreTotals(),
    shots: 0,
    hits: 0,
    misses: 0,
    accuracy: 0,
    targetsPerMinute: 0,
  })) as [GridShotPhaseAnalytics, GridShotPhaseAnalytics, GridShotPhaseAnalytics];
}

function phaseActiveDuration(phase: GridShotPhaseAnalytics, activeDurationMs: number) {
  const activeEnd = Math.min(activeDurationMs, phase.endMs);
  return Math.max(0, activeEnd - phase.startMs);
}

function deriveHitIntervals(events: readonly GridShotEvent[]) {
  const intervals: number[] = [];
  let previousHitElapsed: number | undefined;
  for (const event of events) {
    if (event.type !== "hit") continue;
    if (previousHitElapsed !== undefined) intervals.push(Math.max(0, event.elapsedMs - previousHitElapsed));
    previousHitElapsed = event.elapsedMs;
  }
  return intervals;
}

function createTimeline(events: readonly GridShotEvent[], activeDurationMs: number): GridShotTimelinePoint[] {
  const points: GridShotTimelinePoint[] = [];
  const totals = emptyScoreTotals();
  let cursor = 0;
  let hits = 0;
  let misses = 0;
  let combo = 0;
  const finalSecond = Math.ceil(activeDurationMs / 1000);
  for (let second = 0; second <= finalSecond; second += 1) {
    const elapsedMs = Math.min(activeDurationMs, second * 1000);
    while (cursor < events.length && events[cursor].elapsedMs <= elapsedMs) {
      const event = events[cursor];
      addScore(totals, event);
      if (event.type === "hit") hits += 1;
      else if (event.type === "miss") misses += 1;
      combo = event.comboAfter;
      cursor += 1;
    }
    const shots = hits + misses;
    points.push({
      time: elapsedMs / 1000,
      elapsedMs,
      score: totals.score,
      shots,
      hits,
      misses,
      accuracy: shots ? hits / shots * 100 : 0,
      targetsPerMinute: elapsedMs > 0 ? hits / (elapsedMs / 60_000) : 0,
      combo,
    });
  }
  return points;
}

function numericFieldsAreFinite(event: GridShotEvent) {
  const required = [
    event.timestamp,
    event.elapsedMs,
    event.comboBefore,
    event.comboAfter,
    event.baseScore,
    event.speedBonus,
    event.comboBonus,
    event.stabilityBonus,
    event.totalScore,
  ];
  const optional = [event.targetId, event.targetActivatedAt, event.targetLifetimeMs, event.previousHitAt, event.hitIntervalMs];
  return required.every(Number.isFinite) && optional.every((value) => value === undefined || Number.isFinite(value));
}

function validateEventSequence(events: readonly GridShotEvent[]) {
  let combo = 0;
  let previousHitElapsed: number | undefined;
  let combosValid = true;
  let hitIntervalsValid = true;
  let scoreRulesValid = true;
  let targetLifetimesValid = true;
  const intervals: number[] = [];
  for (const event of events) {
    const expectedAfter = event.type === "hit" ? combo + 1 : 0;
    if (event.comboBefore !== combo || event.comboAfter !== expectedAfter) combosValid = false;
    combo = event.comboAfter;
    if (event.type === "miss") {
      if (![event.baseScore, event.speedBonus, event.comboBonus, event.stabilityBonus, event.totalScore]
        .every((value) => value === 0)) scoreRulesValid = false;
      continue;
    }
    if (event.type !== "hit") {
      scoreRulesValid = false;
      continue;
    }
    if (event.targetLifetimeMs !== undefined && (
      !Number.isFinite(event.targetLifetimeMs)
      || event.targetLifetimeMs < 0
      || event.targetActivatedAt !== undefined && (
        !Number.isFinite(event.targetActivatedAt)
        || event.targetActivatedAt > event.timestamp
        || !approximatelyEqual(event.targetLifetimeMs, event.timestamp - event.targetActivatedAt)
      )
    )) targetLifetimesValid = false;
    if (event.targetActivatedAt !== undefined && event.targetLifetimeMs === undefined) targetLifetimesValid = false;
    const interval = previousHitElapsed === undefined ? null : Math.max(0, event.elapsedMs - previousHitElapsed);
    const scoringIntervals = interval === null ? intervals : [...intervals, interval];
    const expectedSpeed = speedBonus(interval).bonus;
    const expectedCombo = comboBonus(expectedAfter);
    const expectedStability = isStable(scoringIntervals) ? 5 : 0;
    if (
      !approximatelyEqual(event.baseScore, 100)
      || !approximatelyEqual(event.speedBonus, expectedSpeed)
      || !approximatelyEqual(event.comboBonus, expectedCombo)
      || !approximatelyEqual(event.stabilityBonus, expectedStability)
    ) scoreRulesValid = false;
    if (previousHitElapsed === undefined) {
      if (event.previousHitAt !== undefined || event.hitIntervalMs !== undefined) hitIntervalsValid = false;
    } else {
      const expectedInterval = event.elapsedMs - previousHitElapsed;
      if (
        event.previousHitAt === undefined
        || event.hitIntervalMs === undefined
        || !approximatelyEqual(event.previousHitAt, previousHitElapsed)
        || !approximatelyEqual(event.hitIntervalMs, expectedInterval)
      ) hitIntervalsValid = false;
      intervals.push(expectedInterval);
    }
    previousHitElapsed = event.elapsedMs;
  }
  return { combosValid, hitIntervalsValid, scoreRulesValid, targetLifetimesValid };
}

export function analyzeGridShotEvents(
  inputEvents: readonly GridShotEvent[],
  options: GridShotAnalyticsOptions,
): GridShotAnalytics {
  const sessionDurationMs = nonNegative(options.sessionDurationMs);
  const activeDurationMs = clamp(options.activeDurationMs ?? sessionDurationMs, 0, sessionDurationMs);
  const chronological = inputEvents.every((event, index) => index === 0 || event.elapsedMs >= inputEvents[index - 1].elapsedMs);
  const events = [...inputEvents].sort((left, right) => left.elapsedMs - right.elapsedMs || left.timestamp - right.timestamp);
  const totals = emptyScoreTotals();
  const phases = createPhases(sessionDurationMs);
  let hits = 0;
  let misses = 0;
  let assignedEvents = 0;
  let maxCombo = 0;
  let eventScoreComponentsValid = true;
  let missScoresZero = true;

  for (const event of events) {
    addScore(totals, event);
    if (event.type === "hit") hits += 1;
    else if (event.type === "miss") misses += 1;
    maxCombo = Math.max(maxCombo, nonNegative(event.comboAfter));
    const scoreComponents = finiteOrZero(event.baseScore) + finiteOrZero(event.speedBonus)
      + finiteOrZero(event.comboBonus) + finiteOrZero(event.stabilityBonus);
    if (!approximatelyEqual(finiteOrZero(event.totalScore), scoreComponents)) eventScoreComponentsValid = false;
    if (
      event.type === "miss"
      && ![event.baseScore, event.speedBonus, event.comboBonus, event.stabilityBonus, event.totalScore]
        .every((value) => value === 0)
    ) missScoresZero = false;
    const index = phaseIndex(event.elapsedMs, sessionDurationMs);
    if (index < 0) continue;
    assignedEvents += 1;
    const phase = phases[index as 0 | 1 | 2];
    addScore(phase, event);
    if (event.type === "hit") {
      phase.shots += 1;
      phase.hits += 1;
    } else if (event.type === "miss") {
      phase.shots += 1;
      phase.misses += 1;
    }
  }

  const shots = hits + misses;
  const accuracy = shots ? hits / shots * 100 : 0;
  const targetsPerMinute = activeDurationMs > 0 ? hits / (activeDurationMs / 60_000) : 0;
  for (const phase of phases) {
    phase.accuracy = phase.shots ? phase.hits / phase.shots * 100 : 0;
    const phaseDurationMs = phaseActiveDuration(phase, activeDurationMs);
    phase.targetsPerMinute = phaseDurationMs > 0 ? phase.hits / (phaseDurationMs / 60_000) : 0;
  }

  const hitIntervals = deriveHitIntervals(events);
  const targetLifetimes = events
    .filter((event) => event.type === "hit" && event.targetLifetimeMs !== undefined && Number.isFinite(event.targetLifetimeMs) && event.targetLifetimeMs >= 0)
    .map((event) => event.targetLifetimeMs as number);
  const consistencyScore = calculateGridShotConsistency(hitIntervals, hits, misses);
  const phaseScore = phases.reduce((sum, phase) => sum + phase.score, 0);
  const phaseHits = phases.reduce((sum, phase) => sum + phase.hits, 0);
  const phaseMisses = phases.reduce((sum, phase) => sum + phase.misses, 0);
  const aggregateComponents = totals.baseScoreTotal + totals.speedBonusTotal + totals.comboBonusTotal + totals.stabilityBonusTotal;
  const ids = new Set(events.map((event) => event.id));
  const sessionIds = new Set(events.map((event) => event.sessionId));
  const sequence = validateEventSequence(events);
  const checks: GridShotIntegrityChecks = {
    shotsMatch: shots === hits + misses && shots === events.length,
    scoreComponentsMatch: eventScoreComponentsValid && approximatelyEqual(totals.score, aggregateComponents),
    scoreRulesMatch: sequence.scoreRulesValid,
    phaseScoreMatch: approximatelyEqual(phaseScore, totals.score),
    phaseHitsMatch: phaseHits === hits,
    phaseMissesMatch: phaseMisses === misses,
    allEventsAssigned: assignedEvents === events.length,
    missScoresZero,
    uniqueEventIds: ids.size === events.length,
    singleSession: sessionIds.size <= 1
      && (!options.sessionId || sessionIds.size === 0 || sessionIds.has(options.sessionId)),
    chronological,
    combosValid: sequence.combosValid,
    hitIntervalsValid: sequence.hitIntervalsValid,
    targetLifetimesValid: sequence.targetLifetimesValid,
    finiteValues: events.every(numericFieldsAreFinite),
  };
  const errorLabels: Record<keyof GridShotIntegrityChecks, string> = {
    shotsMatch: "event count does not equal recognized hits + misses",
    scoreComponentsMatch: "total score does not equal the four score components",
    scoreRulesMatch: "one or more event score components violate Grid Shot scoring rules",
    phaseScoreMatch: "phase scores do not sum to total score",
    phaseHitsMatch: "phase hits do not sum to total hits",
    phaseMissesMatch: "phase misses do not sum to total misses",
    allEventsAssigned: "one or more events fall outside the session phase boundaries",
    missScoresZero: "a miss event contains non-zero score",
    uniqueEventIds: "event IDs are not unique",
    singleSession: "events do not belong to one expected session",
    chronological: "event log is not chronological",
    combosValid: "comboBefore/comboAfter does not form a valid event sequence",
    hitIntervalsValid: "stored previous-hit fields disagree with successful-hit elapsed times",
    targetLifetimesValid: "target lifetime does not match its activation and hit timestamps",
    finiteValues: "one or more event values are NaN or Infinity",
  };
  const errors = (Object.keys(checks) as Array<keyof GridShotIntegrityChecks>)
    .filter((key) => !checks[key])
    .map((key) => errorLabels[key]);
  const grade = evaluateGridShotGrade({ accuracy, targetsPerMinute, consistency: consistencyScore, maxCombo });

  return {
    ...totals,
    eventCount: events.length,
    shots,
    hits,
    misses,
    accuracy,
    targetsPerMinute,
    maxCombo,
    activeDurationMs,
    sessionDurationMs,
    averageHitInterval: average(hitIntervals),
    medianHitInterval: median(hitIntervals),
    fastestHitInterval: hitIntervals.length ? Math.min(...hitIntervals) : 0,
    slowestHitInterval: hitIntervals.length ? Math.max(...hitIntervals) : 0,
    averageTargetLifetime: average(targetLifetimes),
    consistencyScore,
    hitIntervals,
    phases,
    timeline: createTimeline(events, activeDurationMs),
    grade,
    integrity: { passed: errors.length === 0, errors, checks },
  };
}

export const deriveGridShotAnalytics = analyzeGridShotEvents;
