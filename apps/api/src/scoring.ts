import type { ScoreType } from "@prisma/client";

export type NormalizedScore = {
  timeSeconds?: number | null;
  reps?: number | null;
  loadKg?: number | null;
  tiebreakSecs?: number | null;
};

export function assertScoreMatchesType(scoreType: ScoreType, s: NormalizedScore): void {
  const hasTime = typeof s.timeSeconds === "number";
  const hasReps = typeof s.reps === "number";
  const hasLoad = typeof s.loadKg === "number";

  switch (scoreType) {
    case "TIME":
      if (!hasTime) throw new Error("TIME krever timeSeconds");
      return;
    case "REPS":
      if (!hasReps) throw new Error("REPS krever reps");
      return;
    case "LOAD":
      if (!hasLoad) throw new Error("LOAD krever loadKg");
      return;
    case "TIME_REPS":
      if (!hasReps) throw new Error("TIME_REPS krever reps");
      return;
  }
}

export function compareScores(scoreType: ScoreType, a: NormalizedScore, b: NormalizedScore): number {
  const na = normalize(a);
  const nb = normalize(b);

  switch (scoreType) {
    case "TIME":
      return na.timeSeconds! - nb.timeSeconds!;
    case "REPS":
      return nb.reps! - na.reps!;
    case "LOAD":
      return (nb.loadKg! - na.loadKg!);
    case "TIME_REPS": {
      const repsDiff = nb.reps! - na.reps!;
      if (repsDiff !== 0) return repsDiff;
      const ta = na.timeSeconds ?? Number.MAX_SAFE_INTEGER;
      const tb = nb.timeSeconds ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    }
  }
}

function normalize(s: NormalizedScore): Required<NormalizedScore> {
  return {
    timeSeconds: s.timeSeconds ?? null,
    reps: s.reps ?? null,
    loadKg: s.loadKg ?? null,
    tiebreakSecs: s.tiebreakSecs ?? null
  };
}

export function computeBenchmarkBeatenCount(
  scoreType: ScoreType,
  userScore: NormalizedScore,
  benchmarkScores: NormalizedScore[]
): number {
  let beaten = 0;
  for (const bs of benchmarkScores) {
    if (compareScores(scoreType, userScore, bs) < 0) beaten += 1;
  }
  return beaten;
}

export function computeRankAmongBenchmarkPlusUser(
  scoreType: ScoreType,
  userScore: NormalizedScore,
  benchmarkScores: NormalizedScore[]
): number {
  const all = [...benchmarkScores, userScore];
  all.sort((x, y) => compareScores(scoreType, x, y));
  const idx = all.findIndex((s) => isSameScore(s, userScore));
  return idx === -1 ? all.length : idx + 1;
}

function isSameScore(a: NormalizedScore, b: NormalizedScore): boolean {
  return (
    (a.timeSeconds ?? null) === (b.timeSeconds ?? null) &&
    (a.reps ?? null) === (b.reps ?? null) &&
    (a.loadKg ?? null) === (b.loadKg ?? null) &&
    (a.tiebreakSecs ?? null) === (b.tiebreakSecs ?? null)
  );
}

export function pointsFromRank(rank: number): number {
  if (rank < 1) return 0;
  if (rank > 40) return 0;
  return 41 - rank;
}
