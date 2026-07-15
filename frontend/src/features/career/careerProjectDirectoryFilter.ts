import { tx } from "../../i18n";
import {
  getLocalizedTrainingCopy,
  type TrainingCatalogEntry,
  type TrainingDifficultyId,
} from "../../game/trainingCatalog";
import type { CareerOverviewProject } from "./careerOverviewModel";

export interface CareerDirectoryProject {
  id: string;
  code: string;
  difficulty: TrainingDifficultyId;
  name: string;
  coreMetrics: CareerOverviewProject["coreMetrics"];
  searchable: string;
  project: CareerOverviewProject | null;
}

export function buildCareerDirectoryProjects(
  projects: readonly CareerOverviewProject[],
  catalogEntries: readonly TrainingCatalogEntry[],
) {
  const projectsById = new Map(projects.map((project) => [project.definition.id, project]));
  const catalogIds = new Set(catalogEntries.map((entry) => entry.id));
  const catalogProjects: CareerDirectoryProject[] = catalogEntries.map((entry) => {
    const copy = getLocalizedTrainingCopy(entry);
    const project = projectsById.get(entry.id) ?? null;
    return {
      id: entry.id,
      code: entry.code,
      difficulty: entry.difficulty,
      name: entry.name,
      coreMetrics: project?.coreMetrics ?? [],
      searchable: [entry.name, copy.tag, copy.description, copy.trainingBasis, copy.inputStyle, copy.primaryMetric].join(" "),
      project,
    };
  });
  const registeredOnlyProjects: CareerDirectoryProject[] = projects
    .filter((project) => !catalogIds.has(project.definition.id))
    .map((project, index) => ({
      id: project.definition.id,
      code: `P${String(index + 1).padStart(2, "0")}`,
      difficulty: project.definition.difficulty,
      name: tx(...project.definition.name),
      coreMetrics: project.coreMetrics,
      searchable: [
        ...project.definition.name,
        ...project.definition.description,
        ...project.definition.capabilities.flatMap((capability) => capability.label),
      ].join(" "),
      project,
    }));
  return [...catalogProjects, ...registeredOnlyProjects];
}

export function filterCareerDirectoryProjects(
  projects: readonly CareerDirectoryProject[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...projects];
  return projects.filter((project) => `${project.name} ${project.searchable}`.toLocaleLowerCase().includes(normalizedQuery));
}
