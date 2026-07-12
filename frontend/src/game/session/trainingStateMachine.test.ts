import { describe, expect, it } from "vitest";
import { beginFinish, claimResultNavigation, claimResultSave, completeFinish, createTrainingSessionMachine, pauseSession, resetSession, startSession } from "./trainingStateMachine";
import { applyGridShotHit, applyGridShotMiss, createEmptyGridShotStats, createGridShotRecord } from "../scoring/gridShotSession";

const playing = () => startSession(createTrainingSessionMachine("session-a")).machine;

describe("training finish state machine", () => {
  it("enters finishing when playing reaches zero", () => expect(beginFinish(playing()).machine.state).toBe("finishing"));
  it.each(["pointer-lock", "fullscreen", "blur", "hidden", "escape"] as const)("does not pause finishing on %s", (reason) => { const finishing = beginFinish(playing()).machine; expect(pauseSession(finishing, reason).machine.state).toBe("finishing"); });
  it("does not pause finished", () => { const finished = completeFinish(beginFinish(playing()).machine).machine; expect(pauseSession(finished, "escape").machine.state).toBe("finished"); });
  it("beginFinish is idempotent", () => { const first = beginFinish(playing()); const second = beginFinish(first.machine); expect(first.changed).toBe(true); expect(second.changed).toBe(false); expect(second.machine).toEqual(first.machine); });
  it("claims result saving only once", () => { const finished = completeFinish(beginFinish(playing()).machine).machine; const first = claimResultSave(finished); const second = claimResultSave(first.machine); expect(first.changed).toBe(true); expect(second.changed).toBe(false); });
  it("claims result navigation only once", () => { const finished = completeFinish(beginFinish(playing()).machine).machine; const first = claimResultNavigation(finished); const second = claimResultNavigation(first.machine); expect(first.changed).toBe(true); expect(second.changed).toBe(false); });
  it("allows escape to pause playing", () => expect(pauseSession(playing(), "escape").machine.state).toBe("paused"));
  it("allows page hiding to pause playing", () => expect(pauseSession(playing(), "hidden").machine.state).toBe("paused"));
  it("keeps finished above hidden pause events", () => { const finished = completeFinish(beginFinish(playing()).machine).machine; expect(pauseSession(finished, "hidden").machine.state).toBe("finished"); });
  it("resets all ending markers for another run", () => { let machine = completeFinish(beginFinish(playing()).machine).machine; machine = claimResultSave(machine).machine; machine = claimResultNavigation(machine).machine; const reset = resetSession(machine, "session-b").machine; expect(reset).toEqual(createTrainingSessionMachine("session-b")); });
  it("supports a complete session without pointer lock", () => { const machine = completeFinish(beginFinish(playing()).machine).machine; expect(machine.state).toBe("finished"); });
  it("preserves complete event-derived result data after a normal ending", () => { const stats = createEmptyGridShotStats(); stats.elapsedTime = 60; applyGridShotHit(stats, 220, 220, 60, 1000); applyGridShotMiss(stats); const record = createGridShotRecord(stats, 60); expect(record).toMatchObject({ score: stats.score, hits: 1, misses: 1, shots: 2, accuracy: 50, duration: 60 }); expect(record.timeline).toHaveLength(61); expect(record.events).toHaveLength(2); expect(record.integrity?.passed).toBe(true); });
});
