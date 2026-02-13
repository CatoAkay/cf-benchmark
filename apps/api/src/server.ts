// File: apps/api/src/server.ts
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.ts";
import { prisma } from "./db.ts";
import { CompetitionSchema, DivisionSchema, LogResultSchema } from "./validators.ts";
import {
  assertScoreMatchesType,
  compareScores,
  computeBenchmarkBeatenCount,
  computeRankAmongBenchmarkPlusUser,
  pointsFromRank,
} from "./scoring.ts";

const app = Fastify({ logger: true });

type UserLookup = { userId?: string; email?: string };

function normalizeIdentifier(raw: string): string {
  return raw.trim().normalize("NFC").toLocaleLowerCase("nb-NO");
}

async function resolveUserIdOrThrow(lookup: UserLookup): Promise<string> {
  if (lookup.userId) return lookup.userId;

  const identifier = normalizeIdentifier(lookup.email ?? "");
  if (!identifier) throw new Error("Missing userId or email");

  const user = await prisma.user.findUnique({ where: { email: identifier } });
  if (!user) throw new Error("User not found for email/identifier");
  return user.id;
}

app.get("/health", async () => ({ ok: true }));

app.get("/workouts", async (req) => {
  const q = req.query as Partial<{ season: string; competition: string; division: string }>;
  const year = Number(q.season);
  const competition = CompetitionSchema.parse(q.competition);
  const division = DivisionSchema.parse(q.division);

  const season = await prisma.season.findUnique({ where: { year } });
  if (!season) return { workouts: [] };

  const workouts = await prisma.workout.findMany({
    where: { seasonId: season.id, competition, division },
    orderBy: { createdAt: "asc" },
  });

  return { workouts };
});

app.get("/me", async (req, reply) => {
  const q = req.query as Partial<{ email: string }>;
  const identifier = normalizeIdentifier(String(q.email ?? ""));
  if (!identifier) return reply.code(400).send({ error: "Missing email/identifier" });

  const user = await prisma.user.findUnique({
    where: { email: identifier },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  if (!user) return reply.code(404).send({ error: "User not found" });

  const results = await prisma.userResult.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      workout: {
        select: { id: true, name: true, competition: true, division: true, scoreType: true },
      },
    },
  });

  return { user, results };
});

app.post("/results", async (req, reply) => {
  const body = LogResultSchema.parse(req.body);

  const workout = await prisma.workout.findUnique({ where: { id: body.workoutId } });
  if (!workout) return reply.code(404).send({ error: "Workout not found" });

  const score = {
    timeSeconds: body.timeSeconds,
    reps: body.reps,
    loadKg: body.loadKg,
    tiebreakSecs: body.tiebreakSecs,
  };

  try {
    assertScoreMatchesType(workout.scoreType, score);
  } catch (e) {
    return reply.code(400).send({ error: (e as Error).message });
  }

  const identifier = body.email ? normalizeIdentifier(body.email) : undefined;

  const user =
    body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId } })
      : identifier
        ? await prisma.user.findUnique({ where: { email: identifier } })
        : null;

  const ensuredUser =
    user ??
    (identifier
      ? await prisma.user.create({
        data: { email: identifier, name: identifier.includes("@") ? identifier.split("@")[0] : identifier },
      })
      : null);

  if (!ensuredUser) return reply.code(400).send({ error: "Du må sende userId eller email/identifier" });

  const saved = await prisma.userResult.upsert({
    where: { userId_workoutId: { userId: ensuredUser.id, workoutId: body.workoutId } },
    update: score,
    create: { userId: ensuredUser.id, workoutId: body.workoutId, ...score },
  });

  return { user: { id: ensuredUser.id, email: ensuredUser.email }, result: saved };
});

app.get("/compare/workout/:workoutId", async (req, reply) => {
  const { workoutId } = req.params as { workoutId: string };
  const q = req.query as Partial<{ userId: string; email: string }>;

  let userId: string;
  try {
    userId = await resolveUserIdOrThrow({ userId: q.userId, email: q.email });
  } catch (e) {
    return reply.code(400).send({ error: (e as Error).message });
  }

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } });
  if (!workout) return reply.code(404).send({ error: "Workout not found" });

  const userResult = await prisma.userResult.findUnique({
    where: { userId_workoutId: { userId, workoutId } },
  });
  if (!userResult) return reply.code(404).send({ error: "No user result for workout" });

  const benchmark = await prisma.benchmarkResult.findMany({
    where: { workoutId },
    select: { timeSeconds: true, reps: true, loadKg: true, tiebreakSecs: true },
  });

  const userScore = {
    timeSeconds: userResult.timeSeconds,
    reps: userResult.reps,
    loadKg: userResult.loadKg,
    tiebreakSecs: userResult.tiebreakSecs,
  };

  const beaten = computeBenchmarkBeatenCount(workout.scoreType, userScore, benchmark);
  const rank = computeRankAmongBenchmarkPlusUser(workout.scoreType, userScore, benchmark);
  const points = pointsFromRank(rank);

  return {
    workout: { id: workout.id, name: workout.name, scoreType: workout.scoreType },
    userScore,
    benchmarkTotal: benchmark.length,
    beatenCount: beaten,
    rankAmongBenchmarkPlusUser: rank,
    pointsEarned: points,
  };
});

app.get("/summary", async (req, reply) => {
  const q = req.query as Partial<{
    userId: string;
    email: string;
    season: string;
    competition: string;
    division: string;
  }>;

  const year = Number(q.season);
  const competition = CompetitionSchema.parse(q.competition);
  const division = DivisionSchema.parse(q.division);

  let userId: string;
  try {
    userId = await resolveUserIdOrThrow({ userId: q.userId, email: q.email });
  } catch (e) {
    return reply.code(400).send({ error: (e as Error).message });
  }

  const season = await prisma.season.findUnique({ where: { year } });
  if (!season) return { totalPoints: 0, completedWorkouts: 0, perWorkout: [] };

  const workouts = await prisma.workout.findMany({
    where: { seasonId: season.id, competition, division },
    select: { id: true, scoreType: true },
  });

  const userResults = await prisma.userResult.findMany({
    where: { userId, workoutId: { in: workouts.map((w) => w.id) } },
  });

  let totalPoints = 0;
  const perWorkout: Array<{ workoutId: string; points: number; beatenCount: number; rank: number }> = [];

  for (const w of workouts) {
    const ur = userResults.find((r) => r.workoutId === w.id);
    if (!ur) continue;

    const benchmark = await prisma.benchmarkResult.findMany({
      where: { workoutId: w.id },
      select: { timeSeconds: true, reps: true, loadKg: true, tiebreakSecs: true },
    });

    const userScore = {
      timeSeconds: ur.timeSeconds,
      reps: ur.reps,
      loadKg: ur.loadKg,
      tiebreakSecs: ur.tiebreakSecs,
    };

    const beaten = computeBenchmarkBeatenCount(w.scoreType, userScore, benchmark);
    const rank = computeRankAmongBenchmarkPlusUser(w.scoreType, userScore, benchmark);
    const points = pointsFromRank(rank);

    totalPoints += points;
    perWorkout.push({ workoutId: w.id, points, beatenCount: beaten, rank });
  }

  return {
    season: year,
    competition,
    division,
    completedWorkouts: perWorkout.length,
    totalPoints,
    perWorkout,
  };
});

app.get("/leaderboard/workout/:workoutId", async (req, reply) => {
  const { workoutId } = req.params as { workoutId: string };
  const q = req.query as Partial<{ limit: string }>;
  const limit = Math.max(1, Math.min(200, Number(q.limit ?? 50)));

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } });
  if (!workout) return reply.code(404).send({ error: "Workout not found" });

  const results = await prisma.userResult.findMany({
    where: { workoutId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  results.sort((a, b) =>
    compareScores(
      workout.scoreType,
      { timeSeconds: a.timeSeconds, reps: a.reps, loadKg: a.loadKg, tiebreakSecs: a.tiebreakSecs },
      { timeSeconds: b.timeSeconds, reps: b.reps, loadKg: b.loadKg, tiebreakSecs: b.tiebreakSecs },
    ),
  );

  return {
    workout: { id: workout.id, name: workout.name, scoreType: workout.scoreType },
    leaderboard: results.slice(0, limit).map((r, idx) => ({
      rank: idx + 1,
      user: r.user,
      score: { timeSeconds: r.timeSeconds, reps: r.reps, loadKg: r.loadKg, tiebreakSecs: r.tiebreakSecs },
      updatedAt: r.createdAt,
    })),
  };
});

app.get("/benchmark/workout/:workoutId", async (req, reply) => {
  const { workoutId } = req.params as { workoutId: string };

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } });
  if (!workout) return reply.code(404).send({ error: "Workout not found" });

  const rows = await prisma.benchmarkResult.findMany({
    where: { workoutId },
    include: { athlete: { select: { rank: true, name: true } } },
  });

  rows.sort((a, b) => a.athlete.rank - b.athlete.rank);

  return {
    workout: { id: workout.id, name: workout.name, scoreType: workout.scoreType },
    benchmark: rows.map((r) => ({
      rank: r.athlete.rank,
      name: r.athlete.name,
      score: {
        timeSeconds: r.timeSeconds ?? null,
        reps: r.reps ?? null,
        loadKg: r.loadKg ?? null,
        tiebreakSecs: r.tiebreakSecs ?? null,
      },
    })),
  };
});

async function main() {
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((e) => {
  app.log.error(e);
  process.exit(1);
});
