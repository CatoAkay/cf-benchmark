import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const year = 2026;

  const season = await prisma.season.upsert({
    where: { year },
    update: {},
    create: { year },
  });

  // 2 test-workouts (Open MEN)
  const w1 = await prisma.workout.upsert({
    where: {
      // no unique constraint; use findFirst+create pattern
      id: "seed-w1",
    } as any,
    update: {},
    create: {
      id: "seed-w1",
      seasonId: season.id,
      competition: "OPEN",
      division: "MEN",
      name: "Open 26.1 (TEST) - For time",
      description: "For time: 50-40-30-20-10 reps of burpees (TEST DATA)",
      scoreType: "TIME",
    },
  });

  const w2 = await prisma.workout.upsert({
    where: { id: "seed-w2" } as any,
    update: {},
    create: {
      id: "seed-w2",
      seasonId: season.id,
      competition: "OPEN",
      division: "MEN",
      name: "Open 26.2 (TEST) - AMRAP",
      description: "12-min AMRAP: 10 pull-ups, 20 box jumps, 30 air squats (TEST DATA)",
      scoreType: "REPS",
    },
  });

  // Create 40 benchmark athletes (MEN)
  const athletes = [];
  for (let i = 1; i <= 40; i++) {
    const a = await prisma.benchmarkAthlete.upsert({
      where: {
        seasonId_competition_division_rank: {
          seasonId: season.id,
          competition: "OPEN",
          division: "MEN",
          rank: i,
        },
      },
      update: {},
      create: {
        seasonId: season.id,
        competition: "OPEN",
        division: "MEN",
        rank: i,
        name: `Benchmark Athlete #${i}`,
      },
    });
    athletes.push(a);
  }

  // Benchmark results:
  // - For TIME: rank 1 fastest => 600s, rank 40 => 1000s
  // - For REPS: rank 1 highest => 420 reps, rank 40 => 260 reps
  for (const a of athletes) {
    const rank = a.rank;

    const timeSeconds = 600 + Math.round(((rank - 1) / 39) * 400); // 600..1000
    const reps = 420 - Math.round(((rank - 1) / 39) * 160); // 420..260

    await prisma.benchmarkResult.upsert({
      where: { workoutId_athleteId: { workoutId: w1.id, athleteId: a.id } },
      update: { timeSeconds },
      create: { workoutId: w1.id, athleteId: a.id, timeSeconds },
    });

    await prisma.benchmarkResult.upsert({
      where: { workoutId_athleteId: { workoutId: w2.id, athleteId: a.id } },
      update: { reps },
      create: { workoutId: w2.id, athleteId: a.id, reps },
    });
  }

  // Create a test user
  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: { email: "test@example.com", name: "Test User" },
  });

  console.log("Seed complete:", {
    season: { year: season.year, id: season.id },
    workouts: [
      { id: w1.id, name: w1.name, scoreType: w1.scoreType },
      { id: w2.id, name: w2.name, scoreType: w2.scoreType },
    ],
    user: { id: user.id, email: user.email },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
