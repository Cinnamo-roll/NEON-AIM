import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import {
  formatCoachingValue,
  type TrainingCoachingEvaluationStatus,
  type TrainingCoachingTargetEvaluation,
  type TrainingCoachingTargetProgress,
} from "../../game/analysis/trainingCoachingTaskService";
import { tx } from "../../i18n";
import "./trainingGoalProgressPanel.css";

interface TrainingGoalProgressPanelProps {
  status: TrainingCoachingEvaluationStatus;
  eyebrow: string;
  title: string;
  targets: TrainingCoachingTargetEvaluation[];
  progressTargets: TrainingCoachingTargetProgress[];
  requiredPasses: number;
}

export function TrainingGoalProgressPanel({
  status,
  eyebrow,
  title,
  targets,
  progressTargets,
  requiredPasses,
}: TrainingGoalProgressPanelProps) {
  const passedCount = targets.filter((target) => target.passed).length;
  const StatusIcon = status === "ACHIEVED" ? CheckCircle2 : status === "PARTIAL" ? CircleDashed : XCircle;

  return <section className="training-goal-progress" data-state={status}>
    <header className="training-goal-progress__header">
      <span className="training-goal-progress__status-icon"><StatusIcon /></span>
      <div>
        <small>{eyebrow}</small>
        <h2>{title}</h2>
      </div>
      <div className="training-goal-progress__summary">
        <strong>{passedCount}<i>/</i>{targets.length}</strong>
        <small>{tx("本局达标", "passed this run")}</small>
      </div>
    </header>

    <div className="training-goal-progress__targets">
      {targets.map((target) => {
        const progress = progressTargets.find((item) => item.metric === target.metric);
        const passCount = progress?.passCount ?? 0;
        const targetPasses = progress?.requiredPasses ?? requiredPasses;
        const progressPercent = targetPasses > 0 ? Math.min(100, passCount / targetPasses * 100) : 0;

        return <article key={target.metric} data-passed={target.passed}>
          <header>
            <span>{target.label}</span>
            <em>{target.passed ? tx("达标", "Passed") : tx("未达标", "Not passed")}</em>
          </header>
          <div className="training-goal-progress__value">
            <strong>{formatCoachingValue(target.actualValue, target.unit)}</strong>
            <small>{tx("目标", "Target")} {target.operator === "AT_LEAST" ? "≥" : "≤"} {formatCoachingValue(target.targetValue, target.unit)}</small>
          </div>
          <div className="training-goal-progress__bar" aria-hidden="true"><i style={{ width: `${progressPercent}%` }} /></div>
          <footer>
            <span>{tx("累计通过", "Passed")}</span>
            <b>{passCount} / {targetPasses} {tx("次", "runs")}</b>
          </footer>
        </article>;
      })}
    </div>
  </section>;
}
