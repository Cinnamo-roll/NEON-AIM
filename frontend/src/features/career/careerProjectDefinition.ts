export type LocalizedCareerText = readonly [zh: string, en: string];

export type CareerCapabilityCode =
  | "click-precision"
  | "micro-correction"
  | "target-switching"
  | "tracking-precision"
  | "tracking-reactivity"
  | "reaction-confirmation"
  | "movement-coordination"
  | "rhythm-control"
  | "sustained-control";

export interface CareerCapabilityContribution {
  code: CareerCapabilityCode;
  label: LocalizedCareerText;
  weight: number;
}

export interface CareerMetricDefinition {
  code: string;
  label: LocalizedCareerText;
  unit: string;
  direction: "higher-is-better" | "lower-is-better";
}

export interface CareerProjectDefinition {
  id: string;
  engineId: string;
  name: LocalizedCareerText;
  eyebrow: LocalizedCareerText;
  description: LocalizedCareerText;
  capabilities: readonly CareerCapabilityContribution[];
  metrics: readonly CareerMetricDefinition[];
  benchmark: {
    configurationKey: string;
    minimumSamples: number;
    stableSamples: number;
  };
}
