package com.neonaim.ai;

import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Reserves the maximum possible token cost before a provider call and settles
 * the reservation with actual provider usage afterwards.
 */
public final class TrainingAnalysisCostGuard {

	private final Clock clock;
	private final int dailyTokenLimit;
	private final Map<DailyKey, DailyUsage> usage = new HashMap<>();
	private final Map<UUID, Reservation> activeReservations = new HashMap<>();

	public TrainingAnalysisCostGuard(Clock clock, int dailyTokenLimit) {
		this.clock = Objects.requireNonNull(clock, "clock");
		if (dailyTokenLimit <= 0) {
			throw new IllegalArgumentException("dailyTokenLimit must be positive");
		}
		this.dailyTokenLimit = dailyTokenLimit;
	}

	public synchronized Optional<Reservation> tryReserve(String ownerKey, int maximumTokens) {
		if (ownerKey == null || ownerKey.isBlank()) {
			throw new IllegalArgumentException("ownerKey must not be blank");
		}
		if (maximumTokens <= 0) {
			throw new IllegalArgumentException("maximumTokens must be positive");
		}
		DailyKey key = new DailyKey(ownerKey, LocalDate.now(clock));
		DailyUsage current = usage.computeIfAbsent(key, ignored -> new DailyUsage());
		if (current.usedTokens + current.reservedTokens + maximumTokens > dailyTokenLimit) {
			return Optional.empty();
		}
		current.reservedTokens += maximumTokens;
		Reservation reservation = new Reservation(UUID.randomUUID(), key, maximumTokens);
		activeReservations.put(reservation.id, reservation);
		removeExpiredDays(key.date());
		return Optional.of(reservation);
	}

	public synchronized void settle(Reservation reservation, TrainingAnalysisProvider.TokenUsage actualUsage) {
		Objects.requireNonNull(actualUsage, "actualUsage");
		Reservation active = activeReservations.remove(Objects.requireNonNull(reservation, "reservation").id);
		if (active == null) {
			throw new IllegalStateException("token reservation is no longer active");
		}
		DailyUsage current = usage.get(active.key);
		current.reservedTokens -= active.maximumTokens;
		current.usedTokens = Math.addExact(current.usedTokens, actualUsage.totalTokens());
	}

	public synchronized void cancel(Reservation reservation) {
		Reservation active = activeReservations.remove(Objects.requireNonNull(reservation, "reservation").id);
		if (active == null) {
			return;
		}
		DailyUsage current = usage.get(active.key);
		current.reservedTokens -= active.maximumTokens;
	}

	public synchronized int remainingTokens(String ownerKey) {
		if (ownerKey == null || ownerKey.isBlank()) {
			throw new IllegalArgumentException("ownerKey must not be blank");
		}
		DailyUsage current = usage.get(new DailyKey(ownerKey, LocalDate.now(clock)));
		return current == null ? dailyTokenLimit
				: Math.max(0, dailyTokenLimit - current.usedTokens - current.reservedTokens);
	}

	private void removeExpiredDays(LocalDate currentDate) {
		usage.keySet().removeIf(key -> key.date().isBefore(currentDate)
				&& activeReservations.values().stream().noneMatch(reservation -> reservation.key.equals(key)));
	}

	private record DailyKey(String ownerKey, LocalDate date) {
	}

	private static final class DailyUsage {
		private int usedTokens;
		private int reservedTokens;
	}

	public static final class Reservation {

		private final UUID id;
		private final DailyKey key;
		private final int maximumTokens;

		private Reservation(UUID id, DailyKey key, int maximumTokens) {
			this.id = Objects.requireNonNull(id, "id");
			this.key = Objects.requireNonNull(key, "key");
			if (maximumTokens <= 0) {
				throw new IllegalArgumentException("maximumTokens must be positive");
			}
			this.maximumTokens = maximumTokens;
		}
	}
}
