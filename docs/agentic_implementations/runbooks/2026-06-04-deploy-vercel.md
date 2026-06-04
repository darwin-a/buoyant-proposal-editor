# Deployment Runbook — Vercel + Vercel Postgres (Neon)

Deploys the Next.js app to a public URL backed by managed Postgres. The public demo runs the
**deterministic mock editor** (`USE_REAL_AI` unset), so it incurs no AI spend and can be exercised
freely by reviewers.

- **Live URL:** https://buoyantai.vercel.app
- **Stack:** Next.js (App Router) on Vercel · Postgres (Neon, via Vercel Storage) · Prisma

## Architecture

Three components, connected only by environment variables:

```
   Browser ──HTTPS──▶ [ Vercel: Next.js app ]
                            │  reads DATABASE_URL  (pooled)
                            ▼
                      [ Postgres (Neon) ]   ← managed; separate from the app
                            ▲  reads BUOYANT_PROXY_TOKEN  (only when USE_REAL_AI=true)
                      [ AI proxy ]
```

The app reaches the database solely because a connection string is present in `DATABASE_URL`.
There is no service discovery; the wiring is the env var.

## Prerequisites

- Node 24, pnpm, and a working local `.env` (Docker Postgres up; `pnpm dev` runs on :3005).
- A Vercel account (Hobby/free tier is sufficient).
- Vercel CLI: `npm i -g vercel`.

## Repo prerequisites (already committed)

| Item | File | Purpose |
|---|---|---|
| `directUrl = env("DIRECT_URL")` | `prisma/schema.prisma` | Pooled URL for the app; **direct** URL for migrations (a connection pooler cannot run DDL). |
| `vercel-build` script | `package.json` | Vercel runs this in place of `next build`. It runs `prisma generate && prisma migrate deploy && next build`, so migrations apply during the build. |
| `postinstall: prisma generate` | `package.json` | Generates the typed Prisma client in the fresh CI `node_modules`. |
| `runtime='nodejs'`, `maxDuration=60` | `src/app/api/proposals/route.ts`, `.../sample/route.ts` | The PDF parser needs the Node runtime and headroom; these instruct Vercel's function packaging. |
| `.vercelignore` | repo root | See the note below — controls exactly what uploads. |
| `.env.example` | repo root | Documents required variables. |

---

## Procedure

### 1. Authenticate and link the project  *(CLI)*

```bash
vercel login            # interactive (browser/email)
cd <repo>
vercel link --yes       # links the folder to a Vercel project; no deploy yet
```

### 2. Provision Postgres  *(Dashboard → Storage)*

Project → **Storage** → **Create Database** → **Postgres** (Neon) → **Connect to project**.

The connect dialog has four settings; two are load-bearing:

- **Environments** — leave all checked (Production required).
- **Create database branch for deployment** — leave unchecked (per-deploy DB branching is not needed).
- **Custom Prefix = `DATABASE`** — makes the integration inject the pooled connection as
  `DATABASE_URL`, which the app already reads. Avoids a manual remap.
- **Sensitive = off** — sensitive variables are write-only and cannot be pulled to the local
  machine. Seeding (step 6) requires reading the connection string locally, so this must stay off.

Connecting injects the database variables into the project (`DATABASE_URL` pooled,
`DATABASE_URL_UNPOOLED` / `DATABASE_POSTGRES_URL_NON_POOLING` direct, plus `PG*` host/credential
parts).

### 3. Environment variables  *(CLI)*

```bash
vercel env pull .env.production.local   # gitignored; mirrors the project's prod vars

# DIRECT_URL = the NON-POOLING connection string (for migrations)
vercel env add DIRECT_URL production    # value: DATABASE_POSTGRES_URL_NON_POOLING

# AUTH_SECRET = fresh session-cookie secret
openssl rand -base64 32
vercel env add AUTH_SECRET production
```

`DATABASE_URL` is already present from step 2; leave `USE_REAL_AI` unset.

| Variable | Value | Used at | Notes |
|---|---|---|---|
| `DATABASE_URL` | pooled Neon URL | runtime | injected by the integration |
| `DIRECT_URL` | non-pooling Neon URL | build (migrate) | bypasses the pooler for DDL |
| `AUTH_SECRET` | `openssl rand -base64 32` | runtime | signs the auth cookie; use a fresh value, not the local one |
| `USE_REAL_AI` | unset / `false` | runtime | off → deterministic mock editor (no spend) |
| `BUOYANT_PROXY_TOKEN` | (only if real AI) | runtime | proxy token; not set for the public demo |

### 4. Pre-flight build check  *(Local)*

Run the production build locally **before** deploying:

```bash
pnpm build
```

Vercel's build runs a strict `tsc` type check that `next dev` does not. This catches type errors
that never appear in development — for example, an unsupported pdfjs option passed to `getDocument`
compiles fine under `dev` but fails the production type check. Catching it locally avoids a failed
remote build.

### 5. Deploy  *(CLI)*

```bash
vercel deploy --prod
```

Build sequence on Vercel:

1. `pnpm install` → `postinstall` → `prisma generate`.
2. `vercel-build`: `prisma generate` → **`prisma migrate deploy`** (connects via `DIRECT_URL`,
   applies `prisma/migrations/*`, creating the tables in Neon) → `next build`.
3. Deployment becomes READY at the production URL.

After this the schema exists but the database holds no rows.

### 6. Seed the cloud database  *(Local — required)*

The PDF fixtures live only on the local machine (gitignored and excluded by `.vercelignore`), so
seeding runs from local against the cloud database. Use the **direct** connection for the bulk
writes.

```bash
# write a seed env pointing DATABASE_URL at the direct (non-pooling) cloud connection,
# sourced from .env.production.local. This file is gitignored.
#   DATABASE_URL=<non-pooling cloud url>
#   DIRECT_URL=<non-pooling cloud url>

node --env-file=.env.seed --import tsx prisma/seed.ts            # demo users
node --env-file=.env.seed --import tsx scripts/seed-kb.ts        # knowledge base (5 past projects)
node --env-file=.env.seed --import tsx scripts/seed-proposals.ts # active proposal (easy.pdf)
```

These scripts parse the local PDFs and write the resulting JSON blocks to Postgres. The deployed
app reads that JSON; it only invokes the parser when a reviewer uploads a new PDF.

### 7. Disable Deployment Protection  *(Dashboard — required for a public URL)*

New projects gate deployments behind Vercel Authentication, which returns **HTTP 401** to anyone
not logged into the Vercel team. For a publicly reachable demo:

**Settings → Deployment Protection → Vercel Authentication → Disabled**
(or "Only Preview Deployments" to keep production public while protecting previews).

This is also settable via the Vercel REST API by patching the project with `ssoProtection: null`.

### 8. Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://buoyantai.vercel.app/login          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://buoyantai.vercel.app/icon.svg        # 200
curl -s -X POST https://buoyantai.vercel.app/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"darwin@mecoengineering.com"}'      # 200 + user
```

A successful login proves runtime database connectivity through the pooled URL (not just the
build-time migration). Then exercise the loop manually:

1. Sign in as a demo account → the **Dixon** proposal appears under Proposals.
2. **Knowledge base** tab → 5 past projects render.
3. Open Dixon → select a paragraph → request an edit → review the diff → **Apply** → text updates.

---

## `.vercelignore` note

When a `.vercelignore` exists, Vercel **ignores `.gitignore`** and uses only `.vercelignore`. It must
therefore list everything that should not upload — the rebuild-from-source artifacts
(`node_modules`, `.next`, `.git`), local env files, the proprietary `docs/` fixtures, and dev-only
tooling. This keeps source PDFs and secrets off the build and keeps the upload small.

## Redeploy and schema changes

```bash
# code-only change:
vercel deploy --prod              # migrate deploy is a no-op when there are no new migrations

# schema change:
#   1) local: edit schema.prisma → prisma migrate dev --name <change>
#   2) commit, then vercel deploy --prod → the build runs migrate deploy on the cloud DB
```

Production receives only `prisma migrate deploy` (forward-only). Never run `migrate dev` or
`migrate reset` against the production database.

## Rollback

- **App:** Dashboard → Deployments → select a previous READY build → **Promote to Production**
  (re-points the alias; no rebuild).
- **Schema:** migrations are forward-only; reverse a change with a new migration, then deploy.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails: `Type error … getDocument` | strict prod type check (not run by `next dev`) | run `pnpm build` locally, fix, redeploy |
| Build fails: `Environment variable not found: DIRECT_URL` | env var missing before deploy | set `DATABASE_URL` + `DIRECT_URL`, redeploy |
| Build fails in `migrate deploy` (auth/unreachable) | wrong/rotated connection string | re-pull from Storage, re-add the env var |
| Live URL returns 401 | Deployment Protection enabled | disable Vercel Authentication (step 7) |
| Runtime: `Can't reach database` / connection limit | app using the direct URL, or pool exhausted | ensure `DATABASE_URL` is the **pooled** string |
| Live app has no proposals/KB | cloud DB not seeded | run step 6 |
| 500 on every page | `AUTH_SECRET` missing | add it, redeploy |
| Upload route times out | PDF exceeds 60s | demo data is pre-seeded; keep live uploads to small files |

## Security checklist (before sharing the URL or making the repo public)

- [ ] Only `.env.example` is tracked (`git ls-files | grep '^\.env'`).
- [ ] No source fixtures tracked (`git ls-files | grep -iE 'ExampleProposals|\.pdf$'` is empty).
- [ ] `USE_REAL_AI` unset/false in production (public demo cannot incur AI spend).
- [ ] `AUTH_SECRET` in production is a fresh value, not the local one.
- [ ] Deployment Protection set as intended for the audience (public for a demo URL).

## Appendix — GitHub-connected deploy (alternative)

For auto-deploy on push and a public repository:

```bash
gh repo create <name> --public --source=. --push
```

Then Dashboard → **Add New → Project → Import** the repo. Steps 2–8 are identical; deploys then
trigger on each push to `main` instead of `vercel deploy`.
