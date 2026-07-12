import type { TrainingState } from "../types/training";

export type PauseReason = "pointer-lock" | "fullscreen" | "hidden" | "blur" | "escape";

export interface TrainingSessionMachine {
  state: TrainingState;
  sessionId: string;
  finishStarted: boolean;
  resultSaved: boolean;
  resultNavigated: boolean;
}

export interface TransitionResult {
  machine: TrainingSessionMachine;
  changed: boolean;
}

const result = (machine: TrainingSessionMachine, next: Partial<TrainingSessionMachine>): TransitionResult => {
  const updated = { ...machine, ...next };
  return { machine: updated, changed: Object.keys(next).some((key) => updated[key as keyof TrainingSessionMachine] !== machine[key as keyof TrainingSessionMachine]) };
};

export const createTrainingSessionMachine = (sessionId: string): TrainingSessionMachine => ({ state: "ready", sessionId, finishStarted: false, resultSaved: false, resultNavigated: false });
export const startCountdown = (machine: TrainingSessionMachine) => machine.state === "ready" ? result(machine, { state: "countdown" }) : result(machine, {});
export const startSession = (machine: TrainingSessionMachine) => ["countdown", "paused", "ready"].includes(machine.state) ? result(machine, { state: "playing" }) : result(machine, {});
export const pauseSession = (machine: TrainingSessionMachine, _reason: PauseReason) => machine.state === "playing" || machine.state === "countdown" ? result(machine, { state: "paused" }) : result(machine, {});
export const resumeSession = (machine: TrainingSessionMachine) => machine.state === "paused" ? result(machine, { state: "playing" }) : result(machine, {});
export const beginFinish = (machine: TrainingSessionMachine) => machine.state === "playing" && !machine.finishStarted ? result(machine, { state: "finishing", finishStarted: true }) : result(machine, {});
export const completeFinish = (machine: TrainingSessionMachine) => machine.state === "finishing" ? result(machine, { state: "finished" }) : result(machine, {});
export const claimResultSave = (machine: TrainingSessionMachine) => machine.state === "finished" && !machine.resultSaved ? result(machine, { resultSaved: true }) : result(machine, {});
export const claimResultNavigation = (machine: TrainingSessionMachine) => machine.state === "finished" && !machine.resultNavigated ? result(machine, { resultNavigated: true }) : result(machine, {});
export const resetSession = (_machine: TrainingSessionMachine, sessionId: string) => result(_machine, createTrainingSessionMachine(sessionId));
