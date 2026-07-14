package com.neonaim.training;

import tools.jackson.databind.JsonNode;

record TrainingRuleAnalysisContext(String sourceId, String dataVersion,
		TrainingSessionSubmission.Summary summary, JsonNode snapshot, boolean integrityPassed) {
}
