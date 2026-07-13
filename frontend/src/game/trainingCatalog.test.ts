import { describe, expect, it } from "vitest";
import { profiles } from "./sensitivity/sensitivity";
import {
  filterTrainingCatalog,
  getTrainingGameFitReason,
  groupTrainingCatalogByDifficulty,
  rankTrainingCatalogForGame,
  trainingCatalogEntries,
  trainingDifficulties,
  trainingGames,
  trainingGameProfiles,
} from "./trainingCatalog";

describe("training catalog", () => {
  it("provides thirty-one distinct training plans with only Grid Shot playable", () => {
    expect(trainingCatalogEntries).toHaveLength(31);
    expect(new Set(trainingCatalogEntries.map((entry) => entry.id)).size).toBe(31);
    expect(new Set(trainingCatalogEntries.map((entry) => entry.name)).size).toBe(31);
    expect(trainingCatalogEntries.filter((entry) => entry.available).map((entry) => entry.name)).toEqual(["GRID SHOT"]);
  });

  it("gives every card a concrete method and measurable outcome", () => {
    trainingCatalogEntries.forEach((entry) => {
      expect(entry.description.length).toBeGreaterThan(20);
      expect(entry.method.length).toBeGreaterThan(20);
      expect(entry.coachCue.length).toBeGreaterThan(20);
      expect(entry.primaryMetric.length).toBeGreaterThan(2);
      expect(entry.durationSec).toBeGreaterThanOrEqual(60);
      expect(entry.targetForm.length).toBeGreaterThan(2);
      expect(entry.trainingBasis.length).toBeGreaterThan(5);
      expect(entry.skills.length).toBeGreaterThan(0);
    });
  });

  it("covers every external game in sensitivity conversion without listing NEON AIM", () => {
    profiles.filter((profile) => profile.id !== "neon").forEach((profile) => {
      expect(trainingCatalogEntries.some((entry) => entry.games.includes(profile.id)), profile.name).toBe(true);
    });
    expect(trainingCatalogEntries.some((entry) => entry.games.includes("neon"))).toBe(false);
  });

  it("sorts the game directory alphabetically", () => {
    const labels = trainingGames.map((game) => game.label);
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" })));
  });

  it("explains every game recommendation instead of exposing an unexplained tag", () => {
    trainingCatalogEntries.forEach((entry) => {
      entry.games.forEach((game) => {
        expect(getTrainingGameFitReason(entry, game).length).toBeGreaterThan(20);
      });
    });
  });

  it("keeps the audited difficulty ladder without padding it to an arbitrary count", () => {
    const groups = groupTrainingCatalogByDifficulty(trainingCatalogEntries);
    expect(groups.map((group) => group.id)).toEqual(trainingDifficulties.map((difficulty) => difficulty.id));
    expect(groups.map((group) => group.entries.length)).toEqual([7, 8, 9, 7]);
  });

  it("uses one consistent card color per difficulty instead of unexplained category colors", () => {
    trainingDifficulties.forEach((difficulty) => {
      const entries = trainingCatalogEntries.filter((entry) => entry.difficulty === difficulty.id);
      expect(new Set(entries.map((entry) => entry.color))).toEqual(new Set([difficulty.color]));
    });
  });

  it("keeps fundamentals separate from the smaller game-transfer layer", () => {
    const transferEntries = trainingCatalogEntries.filter((entry) => entry.trainingBasis.startsWith("实战迁移"));
    expect(transferEntries).toHaveLength(11);
    expect(trainingCatalogEntries.length - transferEntries.length).toBe(20);
  });

  it("covers the declared skill taxonomy for each game without claiming full simulation", () => {
    Object.entries(trainingGameProfiles).forEach(([gameId, profile]) => {
      const recommended = trainingCatalogEntries.filter((entry) => entry.games.includes(gameId));
      const coveredSkills = new Set(recommended.flatMap((entry) => entry.skills));
      profile.requiredSkills.forEach((skill) => {
        expect(coveredSkills.has(skill), `${gameId} is missing ${skill}`).toBe(true);
      });
      expect(profile.ttkLabel.length).toBeGreaterThan(4);
    });
  });

  it("only recommends entries that share a declared need with the selected game", () => {
    trainingCatalogEntries.forEach((entry) => {
      entry.games.forEach((gameId) => {
        const profile = trainingGameProfiles[gameId];
        expect(entry.skills.some((skill) => profile.requiredSkills.includes(skill)), `${entry.id} -> ${gameId}`).toBe(true);
      });
    });
  });

  it("covers the game-specific gaps found during the catalog audit", () => {
    const recommendedFor = (gameId: string) => trainingCatalogEntries.filter((entry) => entry.games.includes(gameId));
    expect(recommendedFor("delta-force").some((entry) => entry.skills.includes("projectile-lead"))).toBe(true);
    expect(recommendedFor("fortnite").some((entry) => entry.id === "peek-confirm")).toBe(true);
    expect(recommendedFor("crossfire").some((entry) => entry.skills.includes("switching"))).toBe(true);
    expect(recommendedFor("pubg").some((entry) => entry.skills.includes("projectile-lead"))).toBe(true);
    expect(recommendedFor("pubg").some((entry) => entry.skills.includes("recoil-control"))).toBe(true);
    expect(recommendedFor("pubg").some((entry) => entry.skills.includes("ads-acquisition"))).toBe(true);
  });

  it("filters recommendations by one game and difficulty", () => {
    const valorantFoundation = filterTrainingCatalog(trainingCatalogEntries, { game: "valorant", difficulty: "foundation" });
    expect(valorantFoundation.length).toBeGreaterThan(0);
    expect(valorantFoundation.every((entry) => entry.games.includes("valorant") && entry.difficulty === "foundation")).toBe(true);
  });

  it("ranks game-specific recommendations ahead of broad fundamentals", () => {
    const cs2Foundation = filterTrainingCatalog(trainingCatalogEntries, { game: "cs2", difficulty: "foundation" });
    expect(rankTrainingCatalogForGame(cs2Foundation, "cs2")[0]?.id).toBe("headline-basics");
    expect(rankTrainingCatalogForGame(cs2Foundation, "all")).toBe(cs2Foundation);
  });

  it("describes recoil reset as a transferable foundation instead of a weapon simulation", () => {
    const recoilReset = trainingCatalogEntries.find((entry) => entry.id === "recoil-reset");
    expect(recoilReset?.method).toContain("基础后坐曲线");
  });
});
