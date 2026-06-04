# Deployment Runbook — Vercel + Vercel Postgres

**Target:** the Next.js app live at a public `*.vercel.app` URL, backed by managed Postgres,
running the **deterministic mock editor** (no AI spend) for a public demo.

**Path chosen:** Vercel CLI deploy from local (no Git connection required). A GitHub-connected
deploy is documented at the end as an alternative.

> **Mental model — three machines wired by strings, nothing magic:**
> ```
>   Browser ──HTTPS──▶ [ Vercel: Next.js app ]
>                            │  reads process.env.DATABASE_URL
>                            ▼
>                      [ Postgres ]   ← separate managed DB, not inside Vercel
>                            ▲  reads process.env.BUOYANT_PROXY_TOKEN (only if USE_REAL_AI)
>                      [ Buoyant proxy ]
> ```
> The app "finds" the DB for exactly one reason: a connection string sits in an env var.

---

## 0. What's already in the repo (one-time prep — done)

These are committed; you don't redo them. Listed so the runbook is self-explaining.

| Change | File | Why |
|---|---|---|
| `directUrl = env("DIRECT_URL")` | `prisma/schema.prisma` | Pooled URL for the app, **direct** URL for migrations (a pgbouncer pooler can't run DDL). |
| `vercel-build` script | `package.json` | Vercel prefers a `vercel-build` script over the default `next build`. Ours runs `prisma generate && prisma migrate deploy && next build` — so **migrations apply during the build**. |
| `postinstall: prisma generate` | `package.json` | Vercel installs into a fresh `node_modules`; the typed Prisma client must be generated in CI. |
| `runtime='nodejs'`, `maxDuration=60` | `src/app/api/proposals/route.ts`, `…/sample/route.ts` | pdfjs needs the Node runtime + time; these tell Vercel's adapter how to package those functions. |
| `.env.example` | repo root | Documents required vars. |
| gitignore audit | `.gitignore` | `.env*` and all take-home materials (`docs/ExampleProposals/`, etc.) are untracked → never uploaded. |

---

## 1. Prerequisites

- Node 24, pnpm, repo cloned, **local `.env` working** (Docker Postgres up, app runs on :3005).
- A Vercel account (free Hobby tier is enough).
- Vercel CLI:
  ```bash
  npm i -g vercel        # or: pnpm add -g vercel
  vercel --version
  ```

---

## 2. Log in & link the project

```bash
vercel login            # opens browser / emails a code — run via `! vercel login` in Claude Code
cd /path/to/buoyant_ai
vercel link             # creates the Vercel project; pick scope + name. Does NOT deploy yet.
```

`vercel link` writes a `.vercel/` folder (already gitignored by Vercel's defaults) holding the
project id. No deploy happens — we set up the database first so the first build can migrate it.

---

## 3. Create the Postgres store (dashboard)

1. Vercel dashboard → your project → **Storage** tab → **Create Database** → **Postgres**.
2. Name it, pick a region near you, create.
3. Click **Connect Project** → connect it to this project. Vercel now auto-injects
   `POSTGRES_URL`, `POSTGRES_PRISMA_URL` (pooled), `POSTGRES_URL_NON_POOLING` (direct), etc.
4. Open the store's **.env.local / connection details** panel and copy two strings:
   - the **pooled** connection string (the `…PRISMA_URL`, has `pgbouncer=true`)
   - the **direct / non-pooling** connection string

> Why two: serverless spins up many function instances, each opening DB connections; the
> **pooler** multiplexes them so Postgres' connection cap isn't exhausted. Migrations need one
> real session, so they use the **direct** URL instead.

---

## 4. Set environment variables

The app reads `DATABASE_URL` and `DIRECT_URL` (not the `POSTGRES_*` names), so set those explicitly.

```bash
# pooled string from step 3 → DATABASE_URL
vercel env add DATABASE_URL production
# direct string from step 3 → DIRECT_URL
vercel env add DIRECT_URL production

# session-cookie signing secret — generate a fresh one for prod
openssl rand -base64 32           # copy the output...
vercel env add AUTH_SECRET production   # ...paste when prompted

# leave the AI OFF for the public demo (mock editor = no spend).
# Only if you want real AI:
#   vercel env add USE_REAL_AI production        # value: true
#   vercel env add BUOYANT_PROXY_TOKEN production # value: <token>
```

(Dashboard equivalent: **Settings → Environment Variables**.) Set them for the **Production**
environment at minimum.

**Env var reference**

| Var | Value | Used at | Notes |
|---|---|---|---|
| `DATABASE_URL` | pooled Postgres URL | runtime | app queries go through the pooler |
| `DIRECT_URL` | direct Postgres URL | build (migrate) | bypasses the pooler for DDL |
| `AUTH_SECRET` | `openssl rand -base64 32` | runtime | signs the auth cookie |
| `USE_REAL_AI` | unset / `false` | runtime | off → deterministic mock editor |
| `BUOYANT_PROXY_TOKEN` | (only if real AI) | runtime | Buoyant hiring proxy token |

---

## 5. First deploy

```bash
vercel deploy --prod
```

What happens in the build container (watch the streamed log — every concept above appears):

1. `pnpm install` → fires `postinstall` → **`prisma generate`** (typed client).
2. **`vercel-build`** runs:
   - `prisma generate` (idempotent)
   - **`prisma migrate deploy`** → connects via `DIRECT_URL` → applies `prisma/migrations/*`
     → **creates the tables in the cloud DB**.
   - `next build` → emits `.next`; Vercel slices routes into serverless functions + CDN assets.
3. App goes live at `https://<project>.vercel.app`.

At this point the schema exists but the DB is **empty**.

---

## 6. Seed the cloud DB (from local — required)

The PDF fixtures live only on your laptop (gitignored), so they're **not** on Vercel. The parser
can't run there for the demo data. So seed the cloud DB **from local**, pointed at the cloud URL.

Pull the prod env into a local, gitignored file, then run the three seeds against it:

```bash
vercel env pull .env.production.local      # writes DATABASE_URL/DIRECT_URL/etc. (gitignored by .env*)

# users (demo accounts incl. darwin@mecoengineering.com)
node --env-file=.env.production.local --import tsx prisma/seed.ts
# 5-doc knowledge base (past MECO projects)
node --env-file=.env.production.local --import tsx scripts/seed-kb.ts
# the active Dixon proposal (easy.pdf, pre-parsed)
node --env-file=.env.production.local --import tsx scripts/seed-proposals.ts
```

> These scripts parse the local PDFs and write the resulting **JSON blocks** into Postgres. The
> deployed app then only ever reads JSON from the DB — it only needs pdfjs when a grader uploads a
> *new* PDF live.

---

## 7. Smoke test the live app

1. Open `https://<project>.vercel.app` → redirected to `/login`.
2. Sign in as a demo account → home shows the **Dixon** proposal under Proposals.
3. **Knowledge base** tab → 5 past projects render.
4. Open Dixon → select a paragraph → ✨ → an instruction (e.g. *"change Dixon to Walia"*) → diff
   appears → **Apply** → text updates, locked-facts rail reflects the change.
5. Upload `easy.pdf` fresh → confirm it parses live (this exercises the Node function + 60s budget).

If all five pass, the **core edit loop is closed on the deployed app** (the grading bar).

---

## 8. Redeploy after changes

```bash
# code-only change:
vercel deploy --prod              # rebuild; migrate deploy is a no-op if no new migration

# schema change:
#   1) locally: edit schema.prisma → `prisma migrate dev --name <change>` (writes a migration)
#   2) commit, then `vercel deploy --prod` → build runs `migrate deploy` → applies it to cloud DB
```

Never run `prisma migrate dev` or `migrate reset` against the **production** URL — `dev`/`reset`
can drop data. Production only ever gets `migrate deploy` (forward-only, via the build).

---

## 9. Rollback

- **Instant:** Vercel dashboard → Deployments → pick the previous good one → **Promote to
  Production** (re-points the alias; no rebuild).
- **DB:** migrations are forward-only. To undo a schema change, write a new migration that reverses
  it and deploy that. Don't hand-edit the cloud DB.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails: `Environment variable not found: DIRECT_URL` | env vars not set before deploy | set `DATABASE_URL` + `DIRECT_URL` (step 4), redeploy |
| Build fails in `migrate deploy`: can't reach DB / auth | wrong/rotated connection string | re-copy strings from Storage panel; re-add env vars |
| Runtime: `Can't reach database` / connection limit | app using the **direct** URL, or pooler limit | ensure `DATABASE_URL` = **pooled** string |
| Upload route times out | large PDF > 60s | demo data is pre-seeded; for live uploads keep to `easy.pdf`-sized files |
| `prisma generate` errors in build | stale client / engine | confirm `postinstall` present; redeploy (clears cache) |
| Live app has no proposals/KB | cloud DB not seeded | run step 6 against `.env.production.local` |
| 500 on every page after deploy | `AUTH_SECRET` missing | add it (step 4), redeploy |

---

## 11. Security checklist (before sharing the URL / making the repo public)

- [ ] `.env` and `.env.production.local` are **untracked** (`git ls-files | grep -E '^\.env'` shows only `.env.example`).
- [ ] No take-home materials tracked (`git ls-files | grep -iE 'ExampleProposals|take-home|\.pdf$'` is empty).
- [ ] `USE_REAL_AI` is unset/false in prod → public demo can't spend Buoyant's budget.
- [ ] `AUTH_SECRET` in prod is a fresh value, not the local one.
- [ ] Vercel deployment **Protection** is off (or graders can't reach it) if a public URL is required.

---

## Appendix — GitHub-connected deploy (alternative to the CLI path)

Gives auto-deploy on push and yields the public repo the take-home wants:

```bash
gh repo create buoyant-soq-editor --public --source=. --push
```

Then dashboard → **Add New… → Project → Import** the repo. Steps 3–7 (Postgres, env vars, seed,
smoke test) are identical; deploys then trigger on every push to `main` instead of `vercel deploy`.
