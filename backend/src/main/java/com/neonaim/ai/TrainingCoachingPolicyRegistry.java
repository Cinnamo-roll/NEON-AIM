package com.neonaim.ai;

import com.neonaim.common.error.ApiException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
class TrainingCoachingPolicyRegistry {

	private final Map<String, TrainingCoachingPolicy> policies;

	TrainingCoachingPolicyRegistry(List<TrainingCoachingPolicy> policies) {
		Map<String, TrainingCoachingPolicy> indexed = new HashMap<>();
		for (TrainingCoachingPolicy policy : policies) {
			TrainingCoachingPolicy duplicate = indexed.put(policy.trainingId(), policy);
			if (duplicate != null) {
				throw new IllegalStateException("duplicate training coaching policy: " + policy.trainingId());
			}
		}
		this.policies = Map.copyOf(indexed);
	}

	TrainingCoachingPolicy require(String trainingId) {
		TrainingCoachingPolicy policy = policies.get(trainingId);
		if (policy == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TRAINING_NOT_SUPPORTED",
					"This training does not provide coaching tasks yet");
		}
		return policy;
	}
}
