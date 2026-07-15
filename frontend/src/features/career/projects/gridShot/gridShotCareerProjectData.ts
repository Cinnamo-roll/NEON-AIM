import type { GridShotCareerSession } from "../../../../game/career/gridShotCareer";
import type { TrainingCareerProfile } from "../../../../game/career/trainingCareerProfileService";

export interface GridShotCareerProjectData {
  sessions: GridShotCareerSession[];
  profile: TrainingCareerProfile | null;
  notice: string | null;
}
