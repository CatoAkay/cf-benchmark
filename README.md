
```md
# CF Benchmark

En MVP-app for å benchmarke seg mot **Top 40 CrossFit Games/Open-utøvere** per workout (menn/kvinner, per år), logge egne resultater, og se:
- hvem du “slår” per workout (X av 40)
- rank + poeng per workout
- total plassering basert på flere workouts
- globalt leaderboard blant app-brukere

> Status: MVP (API + web via Expo) med seed-data.

---

## Monorepo struktur

```

cf-benchmark/
apps/
api/       # Fastify + Prisma + Postgres
mobile/    # Expo (React Native). Kan kjøres som web for MVP

````

---

## Tech stack

- **API:** Fastify + TypeScript
- **DB:** PostgreSQL
- **ORM:** Prisma
- **Validering:** Zod
- **Frontend:** Expo (React Native) – kjøres i web under utvikling

---

## Kom i gang

### 1) Installer avhengigheter
Fra repo-root:

```bash
pnpm install
````

### 2) Sett opp environment

Lag `.env` i repo-root (eller der du har valgt å ha den) basert på `.env.example`.

```bash
cp .env.example .env
```

Eksempel:

```env
PORT=3000
DATABASE_URL="postgresql://USER@localhost:5432/cf?schema=public"
```

> Bytt `USER` til din lokale postgres-bruker.

### 3) Start Postgres

Du kan bruke:

* Homebrew Postgres
* Docker (hvis du har docker)

**Homebrew (eksempel):**

```bash
brew install postgresql@16
brew services start postgresql@16
```

Lag DB (hvis ikke finnes):

```bash
createdb cf
```

### 4) Prisma: generate + migrate + seed

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter api seed
```

### 5) Start API

```bash
pnpm dev:api
```

Test:

```bash
curl http://localhost:3000/health
```

### 6) Start Expo (frontend)

```bash
cd apps/mobile
pnpm start
```

* Trykk `w` for web
* Trykk `i` for iOS simulator (hvis du har den)

---

## API Endpoints (MVP)

### Health

```bash
GET /health
```

### Workouts

```bash
GET /workouts?season=2026&competition=OPEN&division=MEN
```

### Log result (auto-oppretter bruker på identifier)

`email` er en *identifier* (støtter æ/ø/å, kan være email eller brukernavn)

```bash
POST /results
Content-Type: application/json

{
  "email": "bjørnar@example.com",
  "workoutId": "seed-w1",
  "timeSeconds": 750
}
```

For reps:

```json
{ "email": "bjørnar", "workoutId": "seed-w2", "reps": 330 }
```

### Compare (slår X av 40)

```bash
GET /compare/workout/:workoutId?email=...
```

### Summary (totalpoeng + per workout)

```bash
GET /summary?email=...&season=2026&competition=OPEN&division=MEN
```

### Me (profil + siste resultater)

```bash
GET /me?email=...
```

### App leaderboard (brukere)

```bash
GET /leaderboard/workout/:workoutId?limit=50
```

### Benchmark leaderboard (Top 40)

```bash
GET /benchmark/workout/:workoutId
```

---

## Seed-data

Seed legger inn:

* Season 2026
* 2 test-workouts (`seed-w1`, `seed-w2`)
* Top 40 benchmark entries per workout
* test-user (`test@example.com`)

---

## Dev tips

### Kjør API + frontend i to terminaler

Terminal 1:

```bash
pnpm dev:api
```

Terminal 2:

```bash
cd apps/mobile && pnpm start
```

### Database i IntelliJ

Legg til datasource:

* Host: `localhost`
* Port: `5432`
* Database: `cf`
* Schema: `public`

---

## Roadmap

* Import ekte CrossFit Open/Games data per år (menn/kvinner)
* Season leaderboard (sum points) blant app-brukere
* Auth (Supabase/Firebase) + brukerprofiler
* Mobil-first UI (React Navigation)
* Admin/import UI (Next.js)

---

## Lisens

TBD

```


```
