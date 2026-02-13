// File: apps/mobile/App.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";

type ScoreType = "TIME" | "REPS" | "LOAD" | "TIME_REPS";

type Workout = {
  id: string;
  name: string;
  description: string;
  scoreType: ScoreType;
};

type LeaderboardEntry = {
  rank: number;
  user: { id: string; name: string | null; email: string };
  score: { timeSeconds: number | null; reps: number | null; loadKg: number | null; tiebreakSecs: number | null };
  updatedAt: string;
};

type BenchmarkRow = {
  rank: number;
  name: string;
  score: { timeSeconds: number | null; reps: number | null; loadKg: number | null; tiebreakSecs: number | null };
};

type MeResponse = {
  user: { id: string; email: string; name: string | null };
  results: Array<{
    id: string;
    createdAt: string;
    timeSeconds: number | null;
    reps: number | null;
    loadKg: number | null;
    workout: { id: string; name: string; scoreType: ScoreType };
  }>;
};

type CompareResponse = { beatenCount: number; rankAmongBenchmarkPlusUser: number; pointsEarned: number };

type SummaryResponse = {
  completedWorkouts: number;
  totalPoints: number;
  perWorkout?: Array<{ workoutId: string; points: number; beatenCount: number; rank: number }>;
};

const API_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_CTX = { season: 2026, competition: "OPEN", division: "MEN" as const };
const STORAGE_KEY = "cf_benchmark_identifier_v1";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  return (await res.json()) as T;
}

function parseTimeToSeconds(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);

  const parts = s.split(":").map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  if (parts.length < 2 || parts.length > 3) return null;

  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) return null;

  if (parts.length === 2) {
    const [mm, ss] = nums;
    return mm * 60 + ss;
  }
  const [hh, mm, ss] = nums;
  return hh * 3600 + mm * 60 + ss;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function prettyScore(
  scoreType: ScoreType,
  score: { timeSeconds: number | null; reps: number | null; loadKg: number | null }
) {
  if (scoreType === "TIME")
    return score.timeSeconds == null ? "-" : `${formatTime(score.timeSeconds)} (${score.timeSeconds}s)`;
  if (scoreType === "REPS") return score.reps == null ? "-" : `${score.reps} reps`;
  if (scoreType === "LOAD") return score.loadKg == null ? "-" : `${score.loadKg} kg`;
  return score.reps == null ? "-" : `${score.reps} reps`;
}

/** UI primitives (mini design system) */
function GlowBg() {
  // “Fake” gradient/glow: layered circles + subtle border
  return (
    <View className="absolute inset-0">
      <View className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-zinc-900 opacity-70" />
      <View className="absolute top-24 -right-24 h-72 w-72 rounded-full bg-zinc-900 opacity-60" />
      <View className="absolute bottom-0 left-1/2 -ml-40 h-80 w-80 rounded-full bg-zinc-950 opacity-90" />
      <View className="absolute inset-0 border-t border-zinc-900/80" />
    </View>
  );
}

function Card({
                title,
                subtitle,
                children,
                right,
              }: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-zinc-950/70 border border-zinc-800/80 rounded-3xl p-4">
      {(title || right) && (
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            {title ? <Text className="text-white text-base font-semibold">{title}</Text> : null}
            {subtitle ? <Text className="text-zinc-400 text-xs mt-1">{subtitle}</Text> : null}
          </View>
          {right ? <View className="items-end">{right}</View> : null}
        </View>
      )}
      <View className={cn(title || right ? "mt-4" : "")}>{children}</View>
    </View>
  );
}

function Pill({
                active,
                label,
                onPress,
              }: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "px-3 py-2 rounded-full border",
        active ? "bg-white border-white" : "bg-zinc-950 border-zinc-800"
      )}
    >
      <Text className={cn("text-xs font-semibold", active ? "text-black" : "text-zinc-300")}>{label}</Text>
    </Pressable>
  );
}

function FancyButton({
                       label,
                       onPress,
                       disabled,
                       variant = "primary",
                     }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const base = "rounded-2xl px-4 py-3 items-center";
  const cls =
    variant === "primary"
      ? cn(base, disabled ? "bg-zinc-800" : "bg-white")
      : cn(base, disabled ? "bg-zinc-950 border border-zinc-800" : "bg-zinc-950 border border-zinc-700");
  const textCls =
    variant === "primary"
      ? cn("font-semibold", disabled ? "text-zinc-400" : "text-black")
      : cn("font-semibold", disabled ? "text-zinc-500" : "text-white");
  return (
    <Pressable onPress={onPress} disabled={disabled} className={cls}>
      <Text className={textCls}>{label}</Text>
    </Pressable>
  );
}

function FancyInput({
                      value,
                      onChangeText,
                      placeholder,
                      helper,
                      autoCapitalize = "none",
                    }: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  helper?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
        className="text-white bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3"
      />
      {helper ? <Text className="text-zinc-500 text-xs mt-2">{helper}</Text> : null}
    </View>
  );
}

function Stat({
                label,
                value,
                sub,
              }: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View className="flex-1 bg-zinc-950 border border-zinc-900 rounded-2xl p-3">
      <Text className="text-zinc-400 text-xs">{label}</Text>
      <Text className="text-white text-lg font-bold mt-1">{value}</Text>
      {sub ? <Text className="text-zinc-500 text-xs mt-1">{sub}</Text> : null}
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<"workouts" | "result" | "leaderboard" | "me">("workouts");
  const [lbTab, setLbTab] = useState<"app" | "benchmark">("app");

  const [identifier, setIdentifier] = useState("bjørnar@example.com");
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("12:30");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const [appLeaderboard, setAppLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkRow[]>([]);
  const [lbBusy, setLbBusy] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);

  const selected = useMemo(
    () => workouts.find((w) => w.id === selectedWorkoutId) ?? null,
    [workouts, selectedWorkoutId]
  );

  const workoutById = useMemo(() => new Map(workouts.map((w) => [w.id, w])), [workouts]);

  function cleanIdentifier() {
    return identifier.trim();
  }

  async function loadIdentifier() {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v && v.trim()) setIdentifier(v);
  }

  async function saveIdentifier(v: string) {
    await AsyncStorage.setItem(STORAGE_KEY, v);
  }

  async function loadWorkouts() {
    const url = `${API_BASE_URL}/workouts?season=${DEFAULT_CTX.season}&competition=${DEFAULT_CTX.competition}&division=${DEFAULT_CTX.division}`;
    const data = await fetchJson<{ workouts: Workout[] }>(url);
    setWorkouts(data.workouts ?? []);
    if (!selectedWorkoutId && (data.workouts ?? []).length > 0) setSelectedWorkoutId(data.workouts[0].id);
  }

  async function loadMe() {
    const id = cleanIdentifier();
    if (!id) {
      setMe(null);
      return;
    }
    try {
      const data = await fetchJson<MeResponse>(`${API_BASE_URL}/me?email=${encodeURIComponent(id)}`);
      setMe(data);
    } catch {
      setMe(null);
    }
  }

  async function loadCompare(workoutId: string) {
    const id = cleanIdentifier();
    if (!id) {
      setCompare(null);
      return;
    }
    try {
      const c = await fetchJson<any>(`${API_BASE_URL}/compare/workout/${workoutId}?email=${encodeURIComponent(id)}`);
      setCompare({
        beatenCount: c.beatenCount,
        rankAmongBenchmarkPlusUser: c.rankAmongBenchmarkPlusUser,
        pointsEarned: c.pointsEarned,
      });
    } catch {
      setCompare(null);
    }
  }

  async function loadSummary() {
    const id = cleanIdentifier();
    if (!id) {
      setSummary(null);
      return;
    }
    try {
      const s = await fetchJson<any>(
        `${API_BASE_URL}/summary?email=${encodeURIComponent(id)}&season=${DEFAULT_CTX.season}&competition=${DEFAULT_CTX.competition}&division=${DEFAULT_CTX.division}`
      );
      setSummary({
        completedWorkouts: s.completedWorkouts,
        totalPoints: s.totalPoints,
        perWorkout: Array.isArray(s.perWorkout) ? s.perWorkout : [],
      });
    } catch {
      setSummary(null);
    }
  }

  async function loadLeaderboards(workoutId: string) {
    setLbBusy(true);
    setError("");
    try {
      const [app, bench] = await Promise.all([
        fetchJson<{ leaderboard: LeaderboardEntry[] }>(`${API_BASE_URL}/leaderboard/workout/${workoutId}?limit=50`),
        fetchJson<{ benchmark: BenchmarkRow[] }>(`${API_BASE_URL}/benchmark/workout/${workoutId}`),
      ]);
      setAppLeaderboard(app.leaderboard ?? []);
      setBenchmark(bench.benchmark ?? []);
    } catch (e) {
      setError((e as Error).message);
      setAppLeaderboard([]);
      setBenchmark([]);
    } finally {
      setLbBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await loadIdentifier();
      await loadWorkouts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void saveIdentifier(identifier);
    void loadMe();
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier]);

  useEffect(() => {
    if (!selectedWorkoutId) return;
    void loadCompare(selectedWorkoutId);
    void loadLeaderboards(selectedWorkoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkoutId]);

  async function submit() {
    if (!selected) return;

    setBusy(true);
    setError("");
    try {
      const id = cleanIdentifier();
      if (!id) throw new Error("Skriv inn email/brukernavn (æ/ø/å støttes)");

      const payload: any = { email: id, workoutId: selected.id };

      if (selected.scoreType === "TIME") {
        const seconds = parseTimeToSeconds(inputValue);
        if (seconds == null) throw new Error("Ugyldig tid. Bruk sekunder (750) eller mm:ss (12:30).");
        payload.timeSeconds = seconds;
      } else if (selected.scoreType === "REPS") {
        const v = Number(inputValue);
        if (!Number.isFinite(v) || v < 0) throw new Error("Ugyldig reps");
        payload.reps = Math.floor(v);
      } else if (selected.scoreType === "LOAD") {
        const v = Number(inputValue);
        if (!Number.isFinite(v) || v <= 0) throw new Error("Ugyldig kg");
        payload.loadKg = v;
      } else {
        const v = Number(inputValue);
        if (!Number.isFinite(v) || v < 0) throw new Error("Ugyldig reps");
        payload.reps = Math.floor(v);
      }

      await fetchJson(`${API_BASE_URL}/results`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      await Promise.all([loadCompare(selected.id), loadSummary(), loadMe(), loadLeaderboards(selected.id)]);
      setTab("result");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rootMinH = Platform.OS === "web" ? "min-h-screen" : "";
  const selectedLabel = selected ? `${selected.name} · ${selected.scoreType}` : "Velg en workout";

  return (
    <SafeAreaView className={cn("bg-black", rootMinH)} style={{ flex: 1 }}>
      <GlowBg />

      <View className="px-5 pt-5 pb-4">
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-white text-2xl font-extrabold tracking-tight">CF Benchmark</Text>
            <Text className="text-zinc-400 text-xs mt-1">dark • minimal • points-driven</Text>
          </View>

          <View className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl px-3 py-2">
            <Text className="text-zinc-300 text-xs">Season</Text>
            <Text className="text-white font-bold">{DEFAULT_CTX.season}</Text>
          </View>
        </View>

        <View className="mt-4 flex-row gap-2 flex-wrap">
          <Pill active={tab === "workouts"} label="Workouts" onPress={() => setTab("workouts")} />
          <Pill active={tab === "result"} label="Result" onPress={() => setTab("result")} />
          <Pill active={tab === "leaderboard"} label="Leaderboard" onPress={() => setTab("leaderboard")} />
          <Pill active={tab === "me"} label="Me" onPress={() => setTab("me")} />
        </View>

        <View className="mt-3">
          <Text className="text-zinc-400 text-xs">Selected</Text>
          <Text className="text-white font-semibold">{selectedLabel}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28, gap: 12 }}>
        <Card
          title="Profil"
          subtitle="Identifier støtter æ/ø/å. Kan være email eller brukernavn."
          right={<Text className="text-zinc-500 text-xs">local save</Text>}
        >
          <FancyInput
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="f.eks. bjørnar@example.com"
            helper="Tips: bruk samme identifier på alle enheter for samme bruker."
          />

          <View className="mt-3 flex-row gap-2">
            <View className="flex-1">
              <FancyButton
                label="Refresh"
                variant="ghost"
                onPress={() => {
                  void loadWorkouts();
                  void loadMe();
                  void loadSummary();
                  if (selectedWorkoutId) {
                    void loadCompare(selectedWorkoutId);
                    void loadLeaderboards(selectedWorkoutId);
                  }
                }}
              />
            </View>
            <View className="flex-1">
              <FancyButton
                label="Go Result"
                onPress={() => setTab("result")}
              />
            </View>
          </View>
        </Card>

        {tab === "workouts" && (
          <Card title="Workouts" subtitle="Velg en workout og logg resultat">
            {workouts.map((w) => {
              const active = w.id === selectedWorkoutId;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => {
                    setSelectedWorkoutId(w.id);
                    setInputValue(w.scoreType === "TIME" ? "12:30" : "100");
                  }}
                  className={cn(
                    "rounded-3xl border p-4 mb-3",
                    active ? "bg-zinc-900/70 border-zinc-700" : "bg-zinc-950 border-zinc-900"
                  )}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-white font-semibold">{w.name}</Text>
                    <View className="bg-black border border-zinc-800 rounded-full px-2 py-1">
                      <Text className="text-zinc-300 text-[10px] font-semibold">{w.scoreType}</Text>
                    </View>
                  </View>
                  <Text className="text-zinc-400 text-sm mt-2">{w.description}</Text>
                </Pressable>
              );
            })}

            {selected && (
              <View className="mt-2">
                <Text className="text-zinc-300 text-sm mb-2">
                  Logg{" "}
                  {selected.scoreType === "TIME"
                    ? "tid (sek eller mm:ss)"
                    : selected.scoreType === "REPS"
                      ? "reps"
                      : selected.scoreType === "LOAD"
                        ? "kg"
                        : "reps"}
                </Text>

                <FancyInput value={inputValue} onChangeText={setInputValue} placeholder="12:30" />

                <View className="mt-3">
                  <FancyButton label={busy ? "Sender..." : "Submit + Compare"} disabled={busy} onPress={() => void submit()} />
                  {!!error && <Text className="text-red-400 text-sm mt-3">{error}</Text>}
                </View>
              </View>
            )}
          </Card>
        )}

        {tab === "result" && (
          <Card title="Result" subtitle="Compare + points + total">
            <View className="flex-row gap-2">
              <Stat label="Beaten" value={compare ? `${compare.beatenCount}/40` : "-"} sub="top 40 benchmark" />
              <Stat label="Rank" value={compare ? `#${compare.rankAmongBenchmarkPlusUser}` : "-"} sub="among + you" />
              <Stat label="Points" value={compare ? `${compare.pointsEarned}` : "-"} sub="this workout" />
            </View>

            <View className="mt-3 flex-row gap-2">
              <Stat label="Completed" value={summary ? `${summary.completedWorkouts}` : "-"} sub="workouts" />
              <Stat label="Total Points" value={summary ? `${summary.totalPoints}` : "-"} sub="season" />
            </View>

            <View className="mt-4">
              <Text className="text-white font-semibold">Per workout</Text>
              {(summary?.perWorkout ?? []).length ? (
                (summary?.perWorkout ?? []).map((row) => {
                  const w = workoutById.get(row.workoutId);
                  return (
                    <View key={row.workoutId} className="mt-3 bg-zinc-950 border border-zinc-900 rounded-3xl p-4">
                      <Text className="text-white font-semibold">{w?.name ?? row.workoutId}</Text>
                      <Text className="text-zinc-300 text-sm mt-2">
                        Poeng <Text className="text-white font-bold">{row.points}</Text> · Rank{" "}
                        <Text className="text-white font-bold">#{row.rank}</Text> · Slår{" "}
                        <Text className="text-white font-bold">{row.beatenCount}/40</Text>
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text className="text-zinc-500 text-sm mt-2">Ingen summary-data ennå.</Text>
              )}
            </View>
          </Card>
        )}

        {tab === "leaderboard" && (
          <Card title="Leaderboard" subtitle="App users vs Benchmark Top 40">
            <View className="flex-row gap-2">
              <Pill active={lbTab === "app"} label="App users" onPress={() => setLbTab("app")} />
              <Pill active={lbTab === "benchmark"} label="Benchmark" onPress={() => setLbTab("benchmark")} />
            </View>

            <View className="mt-3">
              {lbBusy ? (
                <Text className="text-zinc-500">Henter...</Text>
              ) : !selected ? (
                <Text className="text-zinc-500">Velg en workout først.</Text>
              ) : lbTab === "app" ? (
                appLeaderboard.length ? (
                  appLeaderboard.map((row) => (
                    <View key={`${row.user.id}-${row.rank}`} className="py-3 border-t border-zinc-900">
                      <Text className="text-white font-semibold">
                        #{row.rank} — {row.user.name ? `${row.user.name} (${row.user.email})` : row.user.email}
                      </Text>
                      <Text className="text-zinc-300 text-sm mt-1">
                        Score: {prettyScore(selected.scoreType, row.score)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-zinc-500">Ingen app-resultater ennå.</Text>
                )
              ) : benchmark.length ? (
                benchmark.map((row) => (
                  <View key={`${row.rank}-${row.name}`} className="py-3 border-t border-zinc-900">
                    <Text className="text-white font-semibold">#{row.rank} — {row.name}</Text>
                    <Text className="text-zinc-300 text-sm mt-1">
                      Score: {prettyScore(selected.scoreType, row.score)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-zinc-500">Ingen benchmark-data.</Text>
              )}
            </View>

            <View className="mt-4">
              <FancyButton
                label="Refresh leaderboard"
                variant="ghost"
                onPress={() => selectedWorkoutId && void loadLeaderboards(selectedWorkoutId)}
                disabled={!selectedWorkoutId || lbBusy}
              />
            </View>
          </Card>
        )}

        {tab === "me" && (
          <Card title="Me" subtitle="Din profil og siste økter">
            {me ? (
              <>
                <View className="bg-zinc-950 border border-zinc-900 rounded-3xl p-4">
                  <Text className="text-white text-base font-semibold">{me.user.name ?? me.user.email}</Text>
                  <Text className="text-zinc-500 text-sm mt-1">{me.user.email}</Text>
                </View>

                <Text className="text-white font-semibold mt-4">Siste økter</Text>
                {me.results.length ? (
                  me.results.slice(0, 20).map((r) => (
                    <View key={r.id} className="mt-3 bg-zinc-950 border border-zinc-900 rounded-3xl p-4">
                      <Text className="text-white font-semibold">{r.workout.name}</Text>
                      <Text className="text-zinc-300 text-sm mt-2">
                        Score:{" "}
                        {r.workout.scoreType === "TIME"
                          ? r.timeSeconds == null
                            ? "-"
                            : `${formatTime(r.timeSeconds)} (${r.timeSeconds}s)`
                          : r.workout.scoreType === "REPS"
                            ? `${r.reps ?? "-"} reps`
                            : r.workout.scoreType === "LOAD"
                              ? `${r.loadKg ?? "-"} kg`
                              : `${r.reps ?? "-"} reps`}
                      </Text>
                      <Text className="text-zinc-600 text-xs mt-2">{new Date(r.createdAt).toLocaleString()}</Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-zinc-500 mt-2">Ingen resultater ennå.</Text>
                )}
              </>
            ) : (
              <Text className="text-zinc-500">Ingen bruker funnet ennå. Logg en workout først.</Text>
            )}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
