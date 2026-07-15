import type { TrainingCoachingTask } from "../../../../game/analysis/trainingCoachingTaskService";
import type { GridShotCareerSession } from "../../../../game/career/gridShotCareer";
import type { TrainingCareerProfile } from "../../../../game/career/trainingCareerProfileService";

export interface GridShotCareerProjectData {
  sessions: GridShotCareerSession[];
  profile: TrainingCareerProfile | null;
  coachingTask: TrainingCoachingTask | null;
  notice: string | null;
}
