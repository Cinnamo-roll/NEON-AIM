package com.neonaim.training;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
class TrainingSessionWriter {

	private final TrainingSessionRepository repository;
	private final TrainingSessionAnalysisRepository analysisRepository;

	TrainingSessionWriter(TrainingSessionRepository repository,
			TrainingSessionAnalysisRepository analysisRepository) {
		this.repository = repository;
		this.analysisRepository = analysisRepository;
	}

	@Transactional(propagation = Propagation.REQUIRES_NEW)
	TrainingSession insert(TrainingSession session, TrainingSessionAnalysis analysis) {
		TrainingSession saved = repository.saveAndFlush(session);
		analysisRepository.saveAndFlush(analysis);
		return saved;
	}
}
