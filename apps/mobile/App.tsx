// File: apps/mobile/App.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  FlatList,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type ScoreType = "TIME" | "REPS" | "LOAD" | "TIME_REPS";

type Workout = {
  id: string;
  name: string;
  description: string;
  scoreType: ScoreType;
};

type MeResponse = {
  user: { id: string; email: string; name: string | null; createdAt?: string };
  results: Array<{
    id: string;
    createdAt: string;
    timeSeconds: number | null;
    reps: number | null;
    loadKg: number | null;
    workout: { id: string; name: string; scoreType: ScoreType };
  }>;
};

type LeaderboardEntry = {
  rank: number;
  user: { id: string; name: string | null; email: string };
  score: {
    timeSeconds: number | null;
    reps: number | null;
    loadKg: number | null;
    tiebreakSecs: number | null;
  };
  updatedAt: string;
};

type LeaderboardResponse = {
  workout: { id: string; name: string; scoreType: ScoreType };
  leaderboard: LeaderboardEntry[];
};

type BenchmarkRow = {
  rank: number;
  name: string;
  score: {
    timeSeconds: number | null;
    reps: number | null;
    loadKg: number | null;
    tiebreakSecs: number | null;
  };
};

type BenchmarkResponse = {
  workout: { id: string; name: string; scoreType: ScoreType };
  benchmark: BenchmarkRow[];
};

type CompareResponse = {
  beatenCount: number;
  rankAmongBenchmarkPlusUser: number;
  pointsEarned: number;
};

type SummaryPerWorkout = { workoutId: string; points: number; beatenCount: number; rank: number };

type SummaryResponse = {
  completedWorkouts: number;
  totalPoints: number;
  perWorkout?: SummaryPerWorkout[];
};

const API_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_CTX = { season: 2026, competition: "OPEN", division: "MEN" as const };
const STORAGE_KEY = "cf_benchmark_identifier_v1";

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

function cardStyle() {
  return {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    gap: 8 as const,
  };
}

function prettyScore(
  scoreType: ScoreType,
  score: { timeSeconds: number | null; reps: number | null; loadKg: number | null }
) {
  if (scoreType === "TIME")
    return score.timeSeconds == null
      ? "-"
      : `${formatTime(score.timeSeconds)} (${score.timeSeconds}s)`;
  if (scoreType === "REPS") return score.reps == null ? "-" : `${score.reps} reps`;
  if (scoreType === "LOAD") return score.loadKg == null ? "-" : `${score.loadKg} kg`;
  return score.reps == null ? "-" : `${score.reps} reps`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  return (await res.json()) as T;
}

export default function App() {
  const [identifier, setIdentifier] = useState("bjørnar@example.com");
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("12:30");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);

  const [activeTab, setActiveTab] = useState<"app" | "benchmark">("app");
  const [appLeaderboard, setAppLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [benchmarkLeaderboard, setBenchmarkLeaderboard] = useState<BenchmarkRow[]>([]);
  const [leaderboardBusy, setLeaderboardBusy] = useState(false);

  const selected = useMemo(
    () => workouts.find((w) => w.id === selectedWorkoutId) ?? null,
    [workouts, selectedWorkoutId]
  );

  const workoutNameById = useMemo(() => {
    const m = new Map<string, Workout>();
    for (const w of workouts) m.set(w.id, w);
    return m;
  }, [workouts]);

  function cleanIdentifier() {
    return identifier.trim();
  }

  async function loadIdentifierFromStorage() {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v && v.trim()) setIdentifier(v);
  }

  async function saveIdentifierToStorage(v: string) {
    await AsyncStorage.setItem(STORAGE_KEY, v);
  }

  async function fetchWorkouts() {
    const url = `${API_BASE_URL}/workouts?season=${DEFAULT_CTX.season}&competition=${DEFAULT_CTX.competition}&division=${DEFAULT_CTX.division}`;
    const data = await fetchJson<{ workouts: Workout[] }>(url);
    setWorkouts(data.workouts ?? []);
    if (!selectedWorkoutId && (data.workouts ?? []).length > 0) setSelectedWorkoutId(data.workouts[0].id);
  }

  async function fetchMe() {
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

  async function fetchCompare(workoutId: string) {
    const id = cleanIdentifier();
    if (!id) {
      setCompare(null);
      return;
    }
    try {
      const c = await fetchJson<any>(
        `${API_BASE_URL}/compare/workout/${workoutId}?email=${encodeURIComponent(id)}`
      );
      setCompare({
        beatenCount: c.beatenCount,
        rankAmongBenchmarkPlusUser: c.rankAmongBenchmarkPlusUser,
        pointsEarned: c.pointsEarned,
      });
    } catch {
      setCompare(null);
    }
  }

  async function fetchSummary() {
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

  async function fetchAppLeaderboard(workoutId: string) {
    const data = await fetchJson<LeaderboardResponse>(`${API_BASE_URL}/leaderboard/workout/${workoutId}?limit=50`);
    setAppLeaderboard(data.leaderboard ?? []);
  }

  async function fetchBenchmarkLeaderboard(workoutId: string) {
    const data = await fetchJson<BenchmarkResponse>(`${API_BASE_URL}/benchmark/workout/${workoutId}`);
    setBenchmarkLeaderboard(data.benchmark ?? []);
  }

  async function refreshLeaderboards(workoutId: string) {
    setLeaderboardBusy(true);
    setError("");
    try {
      await Promise.all([fetchAppLeaderboard(workoutId), fetchBenchmarkLeaderboard(workoutId)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeaderboardBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await loadIdentifierFromStorage();
      await fetchWorkouts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetchMe();
    void fetchSummary();
    void saveIdentifierToStorage(identifier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier]);

  useEffect(() => {
    if (!selectedWorkoutId) return;
    void refreshLeaderboards(selectedWorkoutId);
    void fetchCompare(selectedWorkoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkoutId]);

  async function submitResult() {
    if (!selected) return;

    setBusy(true);
    setError("");

    try {
      const id = cleanIdentifier();
      if (!id) throw new Error("Skriv inn email/brukernavn (kan inkludere æ/ø/å)");

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

      await fetchCompare(selected.id);
      await fetchSummary();
      await fetchMe();
      await refreshLeaderboards(selected.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function displayUser(user: { name: string | null; email: string }) {
    return user.name ? `${user.name} (${user.email})` : user.email;
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>CF Benchmark</Text>

        <View style={cardStyle()}>
          <Text style={{ fontWeight: "600" }}>Profil</Text>
          <Text>Identifier (email/brukernavn – støtter æ/ø/å)</Text>
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 8 }}
          />
          <Button
            title="Refresh"
            onPress={() => {
              void fetchWorkouts();
              void fetchMe();
              void fetchSummary();
              if (selectedWorkoutId) {
                void refreshLeaderboards(selectedWorkoutId);
                void fetchCompare(selectedWorkoutId);
              }
            }}
          />
        </View>

        <View style={cardStyle()}>
          <Text style={{ fontWeight: "600" }}>Workouts</Text>
          <FlatList
            data={workouts}
            keyExtractor={(w) => w.id}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const active = item.id === selectedWorkoutId;
              return (
                <View style={{ paddingVertical: 6 }}>
                  <Button
                    title={`${active ? "✅ " : ""}${item.name} (${item.scoreType})`}
                    onPress={() => {
                      setSelectedWorkoutId(item.id);
                      setError("");
                      setInputValue(item.scoreType === "TIME" ? "12:30" : "100");
                    }}
                  />
                </View>
              );
            }}
          />
        </View>

        {selected && (
          <View style={cardStyle()}>
            <Text style={{ fontWeight: "600" }}>Logg resultat</Text>
            <Text style={{ fontWeight: "600" }}>{selected.name}</Text>
            <Text>{selected.description}</Text>

            <Text>
              Input:{" "}
              {selected.scoreType === "TIME"
                ? "tid (sek eller mm:ss)"
                : selected.scoreType === "REPS"
                  ? "reps"
                  : selected.scoreType === "LOAD"
                    ? "kg"
                    : "reps (MVP)"}
            </Text>

            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="numeric"
              style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 8 }}
            />

            <Button
              title={busy ? "Jobber..." : "Submit + Compare + Summary"}
              onPress={submitResult}
              disabled={busy}
            />

            {error ? <Text style={{ color: "crimson" }}>{error}</Text> : null}
          </View>
        )}

        <View style={cardStyle()}>
          <Text style={{ fontWeight: "600" }}>Resultat</Text>

          {compare ? (
            <View style={{ gap: 4 }}>
              <Text>
                Du slår: <Text style={{ fontWeight: "700" }}>{compare.beatenCount}/40</Text>
              </Text>
              <Text>
                Benchmark-rank:{" "}
                <Text style={{ fontWeight: "700" }}>#{compare.rankAmongBenchmarkPlusUser}</Text>
              </Text>
              <Text>
                Poeng på økta: <Text style={{ fontWeight: "700" }}>{compare.pointsEarned}</Text>
              </Text>
            </View>
          ) : (
            <Text>Ingen compare (logg den valgte workouten først)</Text>
          )}

          {summary ? (
            <View style={{ gap: 8, marginTop: 10 }}>
              <Text>
                Fullførte økter: <Text style={{ fontWeight: "700" }}>{summary.completedWorkouts}</Text>
              </Text>
              <Text>
                Totalpoeng: <Text style={{ fontWeight: "700" }}>{summary.totalPoints}</Text>
              </Text>

              <View style={{ borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 8, gap: 6 }}>
                <Text style={{ fontWeight: "600" }}>Per workout</Text>

                {(summary.perWorkout ?? []).length ? (
                  (summary.perWorkout ?? [])
                    .slice()
                    .sort((a, b) => b.points - a.points)
                    .map((row) => {
                      const w = workoutNameById.get(row.workoutId);
                      const label = w ? w.name : row.workoutId;
                      return (
                        <View
                          key={row.workoutId}
                          style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#f1f1f1" }}
                        >
                          <Text style={{ fontWeight: "600" }}>{label}</Text>
                          <Text>
                            Poeng: <Text style={{ fontWeight: "700" }}>{row.points}</Text> · Rank:{" "}
                            <Text style={{ fontWeight: "700" }}>#{row.rank}</Text> · Slår:{" "}
                            <Text style={{ fontWeight: "700" }}>{row.beatenCount}/40</Text>
                          </Text>
                        </View>
                      );
                    })
                ) : (
                  <Text>Ingen workouts i summary ennå</Text>
                )}
              </View>
            </View>
          ) : (
            <Text style={{ marginTop: 8 }}>Ingen summary ennå</Text>
          )}
        </View>

        <View style={cardStyle()}>
          <Text style={{ fontWeight: "600" }}>Leaderboard</Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              title={activeTab === "app" ? "✅ App users" : "App users"}
              onPress={() => setActiveTab("app")}
            />
            <Button
              title={activeTab === "benchmark" ? "✅ Benchmark (Top 40)" : "Benchmark (Top 40)"}
              onPress={() => setActiveTab("benchmark")}
            />
          </View>

          {leaderboardBusy ? (
            <Text>Henter...</Text>
          ) : selected ? (
            activeTab === "app" ? (
              appLeaderboard.length ? (
                appLeaderboard.map((row) => (
                  <View
                    key={`${row.user.id}-${row.rank}`}
                    style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#eee" }}
                  >
                    <Text style={{ fontWeight: "600" }}>#{row.rank} — {displayUser(row.user)}</Text>
                    <Text>Score: {prettyScore(selected.scoreType, row.score)}</Text>
                    <Text style={{ fontSize: 12, opacity: 0.7 }}>
                      {new Date(row.updatedAt).toLocaleString()}
                    </Text>
                  </View>
                ))
              ) : (
                <Text>Ingen app-resultater ennå</Text>
              )
            ) : benchmarkLeaderboard.length ? (
              // A) VIS HELE TOPP 40 (ikke slice)
              benchmarkLeaderboard.map((row) => (
                <View
                  key={`${row.rank}-${row.name}`}
                  style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#eee" }}
                >
                  <Text style={{ fontWeight: "600" }}>#{row.rank} — {row.name}</Text>
                  <Text>Score: {prettyScore(selected.scoreType, row.score)}</Text>
                </View>
              ))
            ) : (
              <Text>Ingen benchmark-data</Text>
            )
          ) : (
            <Text>Velg en workout</Text>
          )}

          {selectedWorkoutId ? (
            <Button
              title="Refresh leaderboard"
              onPress={() => void refreshLeaderboards(selectedWorkoutId)}
            />
          ) : null}
        </View>

        <View style={cardStyle()}>
          <Text style={{ fontWeight: "600" }}>Mine siste økter</Text>
          {me?.results?.length ? (
            me.results.slice(0, 10).map((r) => (
              <View
                key={r.id}
                style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#eee" }}
              >
                <Text style={{ fontWeight: "600" }}>{r.workout.name}</Text>
                <Text>
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
                <Text style={{ fontSize: 12, opacity: 0.7 }}>
                  {new Date(r.createdAt).toLocaleString()}
                </Text>
              </View>
            ))
          ) : (
            <Text>Ingen resultater ennå</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
