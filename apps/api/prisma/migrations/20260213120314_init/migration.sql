-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('OPEN', 'GAMES');

-- CreateEnum
CREATE TYPE "DivisionType" AS ENUM ('MEN', 'WOMEN');

-- CreateEnum
CREATE TYPE "ScoreType" AS ENUM ('TIME', 'REPS', 'LOAD', 'TIME_REPS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "competition" "CompetitionType" NOT NULL,
    "division" "DivisionType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scoreType" "ScoreType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkAthlete" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "competition" "CompetitionType" NOT NULL,
    "division" "DivisionType" NOT NULL,
    "rank" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "BenchmarkAthlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkResult" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "timeSeconds" INTEGER,
    "reps" INTEGER,
    "loadKg" DOUBLE PRECISION,
    "tiebreakSecs" INTEGER,

    CONSTRAINT "BenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeSeconds" INTEGER,
    "reps" INTEGER,
    "loadKg" DOUBLE PRECISION,
    "tiebreakSecs" INTEGER,

    CONSTRAINT "UserResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Season_year_key" ON "Season"("year");

-- CreateIndex
CREATE INDEX "Workout_seasonId_competition_division_idx" ON "Workout"("seasonId", "competition", "division");

-- CreateIndex
CREATE INDEX "BenchmarkAthlete_seasonId_competition_division_idx" ON "BenchmarkAthlete"("seasonId", "competition", "division");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkAthlete_seasonId_competition_division_rank_key" ON "BenchmarkAthlete"("seasonId", "competition", "division", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkResult_workoutId_athleteId_key" ON "BenchmarkResult"("workoutId", "athleteId");

-- CreateIndex
CREATE INDEX "UserResult_workoutId_idx" ON "UserResult"("workoutId");

-- CreateIndex
CREATE INDEX "UserResult_userId_idx" ON "UserResult"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserResult_userId_workoutId_key" ON "UserResult"("userId", "workoutId");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkAthlete" ADD CONSTRAINT "BenchmarkAthlete_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "BenchmarkAthlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResult" ADD CONSTRAINT "UserResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResult" ADD CONSTRAINT "UserResult_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
