export interface TrainingAnalysisInput {
  sessionId: string;
  score: number;
  accuracy: number;
  targetsPerMinute: number;
  consistency: number;
}

export interface TrainingAnalysisResult {
  summary: string;
  recommendations: string[];
}

/** Future AI vendors implement this boundary without leaking SDK types into domain modules. */
export interface TrainingAnalysisProvider {
  analyze(input: TrainingAnalysisInput): Promise<TrainingAnalysisResult>;
}
