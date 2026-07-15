import type { CareerProjectModule } from "./careerProjectModule";
import { gridShotCareerModule } from "./projects/gridShot/gridShotCareerModule";

export type {
  CareerCapabilityCode,
  CareerCapabilityContribution,
  CareerMetricDefinition,
  CareerProjectDefinition,
  LocalizedCareerText,
} from "./careerProjectDefinition";

export class CareerProjectRegistry {
  private readonly modules: readonly CareerProjectModule[];
  private readonly modulesById: ReadonlyMap<string, CareerProjectModule>;

  constructor(modules: readonly CareerProjectModule[]) {
    const indexed = new Map<string, CareerProjectModule>();
    modules.forEach((module) => {
      if (indexed.has(module.definition.id)) {
        throw new Error(`Duplicate career project module: ${module.definition.id}`);
      }
      const totalWeight = module.definition.capabilities.reduce((sum, capability) => sum + capability.weight, 0);
      if (module.definition.capabilities.some((capability) => capability.weight <= 0)
        || Math.abs(totalWeight - 1) > 0.000001) {
        throw new Error(`Career capability weights must total 1: ${module.definition.id}`);
      }
      indexed.set(module.definition.id, module);
    });
    this.modules = Object.freeze([...modules]);
    this.modulesById = indexed;
  }

  listModules() {
    return this.modules;
  }

  getModule(projectId: string) {
    return this.modulesById.get(projectId);
  }
}

export const careerProjectRegistry = new CareerProjectRegistry([gridShotCareerModule]);

export function listCareerProjectModules() {
  return careerProjectRegistry.listModules();
}

export function getCareerProjectModule(projectId: string) {
  return careerProjectRegistry.getModule(projectId);
}

export function listCareerProjects() {
  return listCareerProjectModules().map((module) => module.definition);
}

export function getCareerProject(projectId: string) {
  return getCareerProjectModule(projectId)?.definition;
}
