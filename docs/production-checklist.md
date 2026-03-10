# Bardo Deployment Runbook

This is the official step-by-step guide for taking Bardo from local development to staging and then to production with the current architecture:

- `website` deploys on Vercel
- `mcp` deploys on Railway
- Bun is the only package manager/runtime workflow used by this repo
- the goal is the lowest practical cost while keeping the system safe, simple, and ready to scale later

Use this document as an operations runbook, not as a loose checklist.

## 1. Architecture Snapshot

Bardo is split into two deploy targets:

1. `website`
   - Next.js App Router app
   - handles Clerk auth, dashboard, API key creation, API key revoke/rotate, billing display, and API key introspection
   - deploy target: Vercel
2. `mcp`
   - Bun MCP server
   - handles MCP transport, sessions, tools, telemetry, and customer/campaign persistence
   - deploy target: Railway

These two applications are connected by two things:

1. `BARDO_AUTH_INTROSPECTION_URL`
   - the MCP calls the website introspection route at `POST /api/auth/introspect-key`
2. `BARDO_AUTH_INTROSPECTION_TOKEN`
   - both apps must share the exact same secret per environment

Observability is split into two Sentry projects:

1. `bardo-website`
2. `bardo-mcp`

Do not deploy `website` on Railway.
Do not deploy `mcp` on Vercel.

## 2. Current Known State

Current repo and live infra facts:

1. Vercel website project exists:
   - project name: `bardo-website`
   - current staging alias:
     `https://bardo-website-armando-andre-armando-andre-projects.vercel.app`
   - current production alias:
     `https://bardo.gg`
   - Preview protection is enabled
2. Railway project exists:
   - name: `bardo-mcp`
   - id: `ec9ed69c-b1e0-44a0-a5fe-08877b0c4d67`
3. Railway CLI is linked and authenticated.
4. Railway MCP service exists:
   - service name: `mcp`
   - staging public domain: `https://mcp-staging-67d7.up.railway.app`
   - production public domain: `https://mcp.bardo.gg`
5. Railway staging volume is mounted at:
   - `/app/customers`
6. Upstash Redis databases are split by environment:
   - staging DB: `bardo-staging`
   - production DB: `bardo-production`
7. Sentry projects exist:
   - `bardo-website`
   - `bardo-mcp`
8. Current Sentry release state:
   - `bardo-website` has release
     `097e85bdddf962f401826fec7352b2bf346268ed`
   - `bardo-mcp` has release
     `097e85bdddf962f401826fec7352b2bf346268ed`
9. Website production sourcemap upload is enabled through:
   - `SENTRY_AUTH_TOKEN`
   - `withSentryConfig(...)` in the Next.js build
   - release metadata on the website deployment
10. Current staging server-to-server bridge:
   - Railway MCP reaches the protected Vercel Preview introspection route by
     using Vercel's automation bypass support
11. MCP is currently designed around:
   - `BARDO_MCP_TRANSPORT_MODE=stateful`
   - `numReplicas=1`
   - persistent data written under `./customers`
12. Browser Sentry in the website requires `NEXT_PUBLIC_SENTRY_ENVIRONMENT` outside local development.

## 2.1 Current Verified Staging Checks

These checks have already been verified against the live staging endpoints:

1. website Preview pages return `200`:
   - `/`
   - `/pricing`
   - `/legal`
   - `/sign-in`
2. website introspection route rejects the wrong shared secret with `401 Unauthorized`
3. website introspection route accepts the correct shared secret and returns
   `{ "valid": false }` for an invalid API key
4. MCP `GET /health` returns `200`
5. MCP `POST /mcp` without an API key returns `401`
6. MCP `POST /mcp` with an invalid API key returns `403 Invalid API key`

Completed staging checks:

1. Clerk sign-in through the staging website
2. API key creation from `/dashboard`
3. a real valid staging API key working against the staging MCP
4. a visible `bardo-mcp` Sentry release

## 3. Environment Model

Use exactly three environments:

1. Local development
   - purpose: build and debug features on your machine
   - website URL: `http://localhost:3001`
   - MCP URL: `http://127.0.0.1:3000`
2. Dedicated staging
   - purpose: real end-to-end testing before production
   - website: Vercel Preview deployment from a dedicated staging branch
   - MCP: Railway `staging` environment in the same Railway project
3. Production
   - purpose: live customer traffic
   - website: Vercel Production
   - MCP: Railway `production` environment

This is the recommended low-cost staging model:

1. Use one Vercel project for `website`
   - production uses the Production environment
   - staging uses the Preview environment from a dedicated `staging` branch
   - on the current Vercel plan, use Preview as staging because custom environments are not available
2. Use one Railway project for `mcp`
   - create one `mcp` service
   - create separate `staging` and `production` environments inside that project

Do not create extra projects yet unless you hit a real isolation problem.

## 4. Quick Glossary

- Vercel project:
  the deploy target for the `website`
- Railway project:
  the container for MCP services and environments
- Railway service:
  the actual running MCP app inside Railway
- Railway environment:
  a separate variable set and deploy target such as `staging` or `production`
- DSN:
  the Sentry connection string for one project
- release:
  the version string Sentry uses to group errors and deploys
- health check:
  the endpoint the platform pings to confirm the service is alive
- volume:
  persistent disk storage that survives restarts and redeploys
- introspection:
  the MCP asking the website to verify whether an API key is valid
- stateful transport:
  MCP mode where the server keeps session state and returns `mcp-session-id`
- smoke test:
  a short list of high-value checks after deploy
- rollback:
  going back to the last known good deployment

## 5. Deployment Principles

These rules keep the architecture simple and cost efficient:

1. Keep `website` and `mcp` independent.
2. Keep MCP single-replica while transport mode is `stateful`.
3. Do not add extra services until a real problem appears.
4. Use free tiers aggressively where they help:
   - Clerk
   - Sentry
   - Upstash
   - Vercel
   - GitHub
5. Be conservative with:
   - Railway usage
   - Greptile usage
6. Use the same code path in staging and production whenever possible.
7. Change one variable at a time during cutovers.

## 6. Before You Start

You need these things before touching staging or production:

1. Bun installed locally
2. GitHub access to the repo
3. Vercel access for the website project
4. Railway access for the `bardo-mcp` project
5. Clerk access for publishable key, secret key, and billing plan IDs
   - production must use `pk_live_...` and `sk_live_...`
6. Sentry access for:
   - `bardo-website`
   - `bardo-mcp`
7. Real domains decided, or platform-generated domains accepted temporarily
8. A secure place to store secrets

Recommended but not mandatory on day one:

1. Upstash account ready for later rate-limit/distributed counter use
2. custom staging domain
3. custom production domain

## 7. Source Of Truth Files

These are the repo files to trust when configuring environments:

1. [website/.env.example](/home/armando/projects/bardo/website/.env.example)
   - website environment variable reference for local, staging, and production
2. [mcp/.env.example](/home/armando/projects/bardo/mcp/.env.example)
   - MCP environment variable reference for local, staging, and production
3. [mcp/railway.json](/home/armando/projects/bardo/mcp/railway.json)
   - Railway build/start/replica/health-check configuration
4. [mcp/docs/railway-deploy.md](/home/armando/projects/bardo/mcp/docs/railway-deploy.md)
   - MCP-specific Railway notes
5. [website/next.config.ts](/home/armando/projects/bardo/website/next.config.ts)
   - website Sentry build integration and Next.js config
9. [website/scripts/validate-deploy-env.ts](/home/armando/projects/bardo/website/scripts/validate-deploy-env.ts)
   - blocks Vercel production builds that still use Clerk test keys
10. [mcp/src/domain/config/validate-runtime-config.ts](/home/armando/projects/bardo/mcp/src/domain/config/validate-runtime-config.ts)
   - validates MCP runtime policy combinations before startup and in CI
11. [website/lib/next-config-policy.ts](/home/armando/projects/bardo/website/lib/next-config-policy.ts)
   - resolves allowed dev origins and Sentry release-upload policy from env
6. [website/instrumentation-client.ts](/home/armando/projects/bardo/website/instrumentation-client.ts)
   - browser Sentry startup
7. [website/sentry.server.config.ts](/home/armando/projects/bardo/website/sentry.server.config.ts)
   - server-side website Sentry startup
8. [mcp/src/telemetry/sentry.ts](/home/armando/projects/bardo/mcp/src/telemetry/sentry.ts)
   - MCP Sentry startup and log behavior

## 7.2 Website Sentry Build Policy

Website Sentry behavior is intentionally different between local development and release contexts:

1. local ad-hoc builds do not upload Sentry releases or sourcemaps
2. enforced release contexts do upload and must fail closed if the Sentry contract is broken
3. release enforcement turns on when any of these are true:
   - `CI=true`
   - `VERCEL_ENV=preview`
   - `VERCEL_ENV=production`
   - `BARDO_ENFORCE_SENTRY_RELEASE_HEALTH=true`

Local noise such as `401 Invalid token` during `next build` should be treated as a configuration bug now, not as expected behavior.

## 7.1 Optional Server-To-Server Bootstrap Path

The website contains a server-to-server MCP bootstrap path used by onboarding-related flows:

1. [website/lib/mcp-orchestrator.ts](/home/armando/projects/bardo/website/lib/mcp-orchestrator.ts)
2. [website/app/(site)/onboarding/page.tsx](/home/armando/projects/bardo/website/app/(site)/onboarding/page.tsx)
3. [website/app/api/init/bootstrap/route.ts](/home/armando/projects/bardo/website/app/api/init/bootstrap/route.ts)

Important:

1. this path is not required for the basic release path of:
   - website auth
   - dashboard
   - API key creation
   - API key use against MCP
2. if you want the website to call a remote MCP directly for onboarding/bootstrap flows, you may also need a dedicated server-to-server MCP credential strategy
3. the current repo exposes `BARDO_MCP_API_KEY` on the website side for that advanced path
4. do not block the first staging/production release on this path unless onboarding is part of the release scope you are actively testing

## 8. Recommended Rollout Order

Always deploy in this order:

1. confirm local development is healthy
2. provision staging infra
3. deploy website staging
4. deploy MCP staging
5. run staging smoke tests
6. fix staging issues before touching production
7. configure production
8. deploy website production
9. deploy MCP production
10. run production smoke tests
11. watch Sentry and Railway logs after release

## 9. Local Development Baseline

Local URLs:

1. website: `http://localhost:3001`
2. MCP: `http://127.0.0.1:3000`

Recommended local commands:

```bash
bun run dev
```

Or run each app separately:

```bash
bun run dev:website
bun run dev:mcp
```

Before moving to staging, run these checks:

```bash
bun run check
cd website && bun test
cd ../mcp && bun run check
```

Notes:

1. `cd ../mcp && bun run check` now includes `bun run validate:env`
2. local CLI config is versioned and currently persists `version: 1`
3. versionless local CLI config is migrated on read

Recommended before production work on the MCP:

```bash
cd mcp && bun run ga:readiness
```

Local manual checks:

1. open `/`
2. open `/pricing`
3. open `/sign-in`
4. sign in if Clerk is configured
5. open `/dashboard`
6. create an API key
7. confirm the snippet generator points to local MCP
8. check local MCP health:

```bash
curl http://127.0.0.1:3000/health
```

Expected result:

```json
{
  "status": "ok",
  "authRequired": true,
  "configuredApiKeys": 0
}
```

## 10. Staging Design

Use staging as a real environment, not as an afterthought.

Recommended low-cost staging setup:

1. Vercel:
   - one Vercel project for `website`
   - use a dedicated `staging` branch
   - let that branch deploy to the Preview environment
   - add a stable staging URL later if your Vercel plan or domain setup supports it
2. Railway:
   - keep the existing project `bardo-mcp`
   - create one MCP service
   - create a dedicated Railway `staging` environment
3. Secrets:
   - staging secrets must be separate from production secrets
   - especially `BARDO_AUTH_INTROSPECTION_TOKEN`

Use clearly different staging domains so nobody confuses staging with production.
If Vercel staging is using Preview, the staging website URL may be a generated Preview URL until you add a custom staging domain.

Good examples:

1. website staging:
   - `https://staging.your-domain.com`
2. MCP staging:
   - `https://bardo-mcp-staging.up.railway.app`

Current active staging endpoints:

1. website staging:
   - `https://bardo-website-6dbva400a-armando-andre-projects.vercel.app`
2. MCP staging:
   - `https://mcp-staging-67d7.up.railway.app`

## 11. Website On Vercel: Staging First

### 11.1 Create or confirm the Vercel project

1. import the monorepo into Vercel
2. select the `website` app
3. set Root Directory to `website`
4. framework: Next.js
5. do not switch package manager away from Bun

Important:

1. this repo already declares `packageManager: bun@1.3.10` at the monorepo root
2. do not add npm or pnpm commands in Vercel settings
3. if Vercel offers auto-detected settings and Bun is detected, keep them

### 11.2 Configure the staging website environment variables

Set these values in the Vercel Preview environment for the `staging` branch.
If your current Vercel plan does not support custom environments, this Preview deployment is your staging website.

#### Clerk

1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
2. `CLERK_SECRET_KEY`
3. `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
4. `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`

Important:

1. production must use Clerk live keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must start with `pk_live_`
   - `CLERK_SECRET_KEY` must start with `sk_live_`
2. the website build now warns on Vercel production if test keys are still configured
3. set `BARDO_ENFORCE_LIVE_CLERK_KEYS=true` when you want production builds to hard-fail on test keys
5. `CLERK_BILLING_PLAN_SOLO`
6. `CLERK_BILLING_PLAN_SOLO_PLUS`

#### Website and MCP connection

1. `NEXT_PUBLIC_APP_URL=https://<staging-website-domain>`
2. `BARDO_MCP_BASE_URL=https://<staging-mcp-domain>`
3. `BARDO_AUTH_INTROSPECTION_TOKEN=<staging-shared-secret>`

Current route behavior to remember:

1. `GET /api/connect/snippets` is public but secret-free
2. real API keys must only be sent to `POST /api/connect/snippets`
3. `GET /api/keys` is paginated with `limit` and `offset`

#### Sentry

1. `SENTRY_DSN=<bardo-website DSN>`
2. `NEXT_PUBLIC_SENTRY_DSN=<bardo-website DSN>`
3. `SENTRY_ENVIRONMENT=staging`
4. `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging`
5. `SENTRY_RELEASE=<git sha or release id>`
6. `SENTRY_TRACES_SAMPLE_RATE=1`
7. `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1`
8. `SENTRY_ORG=bardo-1k`
9. `SENTRY_PROJECT=bardo-website`
10. `SENTRY_AUTH_TOKEN=<sentry auth token>`

#### Recommended optional website tuning

1. `BARDO_INTROSPECTION_PLAN_CACHE_TTL_MS=300000`
2. `BARDO_INTROSPECTION_VERIFY_CACHE_TTL_MS=120000`
3. `BARDO_INTROSPECTION_INVALID_CACHE_TTL_MS=20000`
4. `BARDO_INTROSPECTION_TELEMETRY_LOG=false`
5. `BARDO_INTROSPECTION_TELEMETRY_LOG_EVERY=100`
6. `BARDO_ALLOW_CUSTOM_WORKSPACE_PATH=false`
7. `BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE=false`

#### Optional Upstash for website-side verification budgets

Only turn this on when you need shared/distributed counters:

1. `UPSTASH_REDIS_REST_URL`
2. `UPSTASH_REDIS_REST_TOKEN`
3. `BARDO_UPSTASH_TIMEOUT_MS=1200`
4. `BARDO_VERIFICATION_LIMIT_ALLOW_MEMORY_FALLBACK=false`
5. recommended DB name in staging: `bardo-staging`
6. recommended DB name in production: `bardo-production`

### 11.3 Why `NEXT_PUBLIC_SENTRY_ENVIRONMENT` matters

This is important:

1. browser code can only safely use `NEXT_PUBLIC_*` env vars
2. this repo intentionally disables browser Sentry outside local development if `NEXT_PUBLIC_SENTRY_ENVIRONMENT` is missing
3. this prevents staging browser events from being incorrectly tagged as production

If staging browser Sentry looks empty, this is one of the first things to check.

### 11.3.1 If the staging website is a protected Vercel Preview

If Vercel Deployment Protection is enabled for Preview deployments, Railway will not be able to call the staging introspection route unless you explicitly use the official Protection Bypass for Automation secret.

Supported forms:

1. HTTP header:
   - `x-vercel-protection-bypass: <secret>`
2. Query parameter:
   - `?x-vercel-protection-bypass=<secret>`

Because the MCP currently stores a plain introspection URL, the simplest staging setup is to include the bypass secret as a query parameter in `BARDO_AUTH_INTROSPECTION_URL`.

Example:

```text
https://<preview-url>/api/auth/introspect-key?x-vercel-protection-bypass=<secret>
```

Rules:

1. do not expose this secret to frontend code
2. do not put it in browser-visible env vars
3. only use it for trusted server-to-server calls such as Railway MCP -> Vercel website introspection

### 11.4 Deploy the staging website

1. push the `staging` branch
2. let Vercel build the Preview deployment
3. wait for deployment success
4. if the deployment is preview-protected, either log into Vercel in the browser or use the automation bypass secret for server-to-server checks
5. open the staging website URL

### 11.5 Staging website checks

1. `/` returns `200`
2. `/pricing` loads
3. `/sign-in` loads
4. sign-in works
5. `/dashboard` loads after auth
6. API key creation works
7. connection snippet uses the staging MCP URL, not localhost and not production

Important:

1. for anonymous smoke checks, start from `/sign-in`
2. do not treat unauthenticated `GET /dashboard` as the main pass/fail test
3. with Clerk route protection and Vercel Preview protection in front of the app,
   an anonymous fetch of `/dashboard` may not look like a simple public-page redirect
4. the real staging dashboard test is:
   - sign in first
   - then open `/dashboard`

## 12. MCP On Railway: Staging First

### 12.1 Create the MCP service

Current state:

1. Railway project exists
2. MCP service exists: `mcp`
3. Railway staging environment exists and is the correct target for end-to-end staging

If you are recreating the service from scratch, use the settings below.

Required Railway target:

1. project: `bardo-mcp`
2. environment: start with `production` as the base environment, then duplicate into `staging`
3. service name: `mcp`
4. root directory: `mcp`
5. config file: `mcp/railway.json`

Current repo-controlled Railway behavior:

1. `numReplicas=1`
2. `healthcheckPath=/health`
3. `restartPolicyType=ON_FAILURE`
4. `restartPolicyMaxRetries=10`

Do not change those defaults yet.

### 12.2 Mount persistent storage

The MCP writes customer data under `./customers`.

Mount a Railway volume at:

1. `/app/customers`

Why:

1. without the volume, customer state can disappear on restart or redeploy
2. this is required for production

Recommended staging approach:

1. if Railway allows a separate staging volume, use it
2. if not, treat staging data as disposable and do not rely on it

### 12.3 Create the Railway staging environment

After the `mcp` service exists:

1. create a Railway `staging` environment
2. duplicate from `production` only after the base service settings look correct
3. then replace the environment-specific values listed below

This is cheaper and simpler than running a second Railway project.

### 12.4 Configure staging MCP environment variables

Set these in the Railway `staging` environment.

#### Core runtime

1. `NODE_ENV=production`
2. `PORT` is injected by Railway

Use `NODE_ENV=production` in staging too. This is correct. Staging should behave like production, not like local dev.

#### Auth and website connection

1. `BARDO_AUTH_PROVIDER=hosted`
2. `BARDO_AUTH_MODE=required`
3. `BARDO_AUTH_INTROSPECTION_URL=https://<staging-website-domain>/api/auth/introspect-key`
4. `BARDO_AUTH_INTROSPECTION_TOKEN=<same staging shared secret as website>`
5. `BARDO_ALLOW_QUERY_API_KEY=false`

If the staging website is a protected Vercel Preview deployment, use:

```text
BARDO_AUTH_INTROSPECTION_URL=https://<preview-url>/api/auth/introspect-key?x-vercel-protection-bypass=<secret>
```

#### Runtime behavior

1. `BARDO_STRICT_CANONICAL_MODE=true`
2. `BARDO_DEFAULT_RULESET=d20_v1`
3. `BARDO_GUIDED_SETUP_ENABLED=false`
4. `BARDO_SETUP_CONTRACT_V2_REQUIRED=false`
5. `BARDO_MCP_TRANSPORT_MODE=stateful`
6. `BARDO_WORKSPACE_LAYOUT=nested`

#### Safety and limits

1. `BARDO_SESSION_TTL_MS=3600000`
2. `BARDO_AUTH_CACHE_TTL_MS=120000`
3. `BARDO_AUTH_INVALID_CACHE_TTL_MS=30000`
4. `BARDO_AUTH_INTROSPECTION_TIMEOUT_MS=10000`
5. `BARDO_MAX_REQUEST_BYTES=1048576`
6. `BARDO_RATE_LIMIT_WINDOW_MS=60000`
7. `BARDO_RATE_LIMIT_MAX_REQUESTS=120`
8. `BARDO_RATE_LIMIT_FAIL_CLOSED=true`

#### Sentry and telemetry

1. `BARDO_SENTRY_ENABLED=true`
2. `BARDO_SENTRY_TRACES_SAMPLE_RATE=1`
3. `SENTRY_DSN=<bardo-mcp DSN>`
4. `SENTRY_ENVIRONMENT=staging`
5. `SENTRY_RELEASE=<git sha or release id>`
6. `BARDO_TELEMETRY_ENABLED=true`
7. `BARDO_METRICS_ROUTE_ENABLED=true`
8. `BARDO_METRICS_REQUIRE_AUTH=true`

#### Optional Upstash for MCP-side shared rate limiting

Turn this on only when you need shared counters or future multi-instance behavior:

1. `UPSTASH_REDIS_REST_URL`
2. `UPSTASH_REDIS_REST_TOKEN`
3. `BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK=true` until Upstash is live
4. `BARDO_MCP_USAGE_BLOCK_CACHE_MS=30000`
5. recommended DB name in staging: `bardo-staging`
6. recommended DB name in production: `bardo-production`

Important:

1. if Upstash is not configured and `BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK=false`, MCP metered usage can fail closed
2. for a lean single-instance staging setup, keep memory fallback enabled first
3. change it to `false` only after Upstash is configured and validated

### 12.5 Why staging MCP should stay production-like

Keep these decisions in staging:

1. `NODE_ENV=production`
2. `BARDO_AUTH_MODE=required`
3. `BARDO_ALLOW_QUERY_API_KEY=false`
4. `BARDO_MCP_TRANSPORT_MODE=stateful`
5. `numReplicas=1`

Reason:

1. staging is where you catch production-only mistakes before production
2. changing security behavior between staging and production creates false confidence

### 12.6 Staging MCP checks

Check health:

```bash
curl https://<staging-mcp-domain>/health
```

Expected result:

```json
{
  "status": "ok",
  "authRequired": true,
  "configuredApiKeys": 0
}
```

Check that the service is alive and that the health check is not failing in Railway.

## 13. End-To-End Staging Verification

Do these tests in order.

### 13.1 Website checks

1. homepage loads
2. pricing page loads
3. sign-in page loads
4. dashboard loads after sign-in
5. create API key works
6. revoke API key works
7. rotate API key works
8. connection snippet shows the staging MCP URL
9. key list pagination returns page metadata

### 13.2 MCP checks

1. `GET /health` returns `200`
2. MCP initialize works
3. `tools/list` works
4. a valid website API key can call the MCP
5. an invalid API key is rejected
6. metrics route behavior matches your auth policy

Important note:

1. because transport mode is `stateful`, the MCP should return `mcp-session-id` during initialization

### 13.3 Cross-system auth checks

Confirm the website introspection route works:

1. create a staging API key in the website dashboard
2. call the MCP with that key
3. confirm the MCP request succeeds without manual database changes

If this fails, the first three things to inspect are:

1. website `BARDO_AUTH_INTROSPECTION_TOKEN`
2. MCP `BARDO_AUTH_INTROSPECTION_TOKEN`
3. MCP `BARDO_AUTH_INTROSPECTION_URL`

### 13.4 Sentry checks

1. `bardo-website` receives events tagged `staging`
2. `bardo-mcp` receives events tagged `staging`
3. both projects show the expected release
4. browser Sentry appears for the website when `NEXT_PUBLIC_SENTRY_ENVIRONMENT` is set

### 13.5 Persistence checks

1. create staging data that writes under customer storage
2. restart the Railway service
3. verify the data still exists

If staging persistence is not configured, write that down and do not assume staging durability.

## 14. Promote Staging To Production

Production should be the same shape as staging.

Do not invent a different production architecture.

Only change what must change:

1. production domains
2. production secrets
3. production Sentry environment values
4. production release value
5. lower production trace sampling

## 15. Website Production Setup

Set these values in the Vercel Production environment.

### Clerk

1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
2. `CLERK_SECRET_KEY`
3. `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
4. `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
5. `CLERK_BILLING_PLAN_SOLO`
6. `CLERK_BILLING_PLAN_SOLO_PLUS`

### Website and MCP connection

1. `NEXT_PUBLIC_APP_URL=https://<production-website-domain>`
2. `BARDO_MCP_BASE_URL=https://<production-mcp-domain>`
3. `BARDO_AUTH_INTROSPECTION_TOKEN=<production-shared-secret>`

### Sentry

1. `SENTRY_DSN=<bardo-website DSN>`
2. `NEXT_PUBLIC_SENTRY_DSN=<bardo-website DSN>`
3. `SENTRY_ENVIRONMENT=production`
4. `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`
5. `SENTRY_RELEASE=<git sha or release id>`
6. `SENTRY_TRACES_SAMPLE_RATE=0.1`
7. `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1`
8. `SENTRY_ORG=bardo-1k`
9. `SENTRY_PROJECT=bardo-website`
10. `SENTRY_AUTH_TOKEN=<sentry auth token>`

### Recommended production website tuning

1. `BARDO_INTROSPECTION_PLAN_CACHE_TTL_MS=300000`
2. `BARDO_INTROSPECTION_VERIFY_CACHE_TTL_MS=120000`
3. `BARDO_INTROSPECTION_INVALID_CACHE_TTL_MS=20000`
4. `BARDO_INTROSPECTION_TELEMETRY_LOG=false`
5. `BARDO_INTROSPECTION_TELEMETRY_LOG_EVERY=100`
6. `BARDO_ALLOW_CUSTOM_WORKSPACE_PATH=false`
7. `BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE=false`

### Vercel firewall and spend management

Use the current non-Enterprise baseline:

1. Firewall enabled
2. AI Bots enabled with action `deny`
3. Bot Protection enabled with action `log`
4. custom rule challenging `/sign-in`
5. custom rule rate-limiting `/api/keys*` if the current plan allows it

Important:

1. do not set global Bot Protection to `challenge` until you have re-verified CLI and server-to-server traffic
2. on the current plan, app-level route limits still matter because not every WAF action is available
3. review Firewall drafts before making future changes so the active config stays the source of truth

Spend Management should also be enabled before the first public production launch:

1. add a monthly budget in the Vercel dashboard
2. add threshold notifications at `50%`, `75%`, and `100%`
3. connect the threshold alerts to email or webhook destinations the team already monitors

Current practical note:

1. Vercel Spend Management thresholds are configured in the dashboard rather than through the public CLI workflow used by this repo

## 16. MCP Production Setup

Set these values in the Railway `production` environment.

### Core runtime

1. `NODE_ENV=production`
2. `PORT` injected by Railway

### Auth and website connection

1. `BARDO_AUTH_PROVIDER=hosted`
2. `BARDO_AUTH_MODE=required`
3. `BARDO_AUTH_INTROSPECTION_URL=https://<production-website-domain>/api/auth/introspect-key`
4. `BARDO_AUTH_INTROSPECTION_TOKEN=<production-shared-secret>`
5. `BARDO_ALLOW_QUERY_API_KEY=false`

### Runtime behavior

1. `BARDO_STRICT_CANONICAL_MODE=true`
2. `BARDO_DEFAULT_RULESET=d20_v1`
3. `BARDO_GUIDED_SETUP_ENABLED=false`
4. `BARDO_SETUP_CONTRACT_V2_REQUIRED=false`
5. `BARDO_MCP_TRANSPORT_MODE=stateful`
6. `BARDO_WORKSPACE_LAYOUT=nested`

### Safety and limits

1. `BARDO_SESSION_TTL_MS=3600000`
2. `BARDO_AUTH_CACHE_TTL_MS=120000`
3. `BARDO_AUTH_INVALID_CACHE_TTL_MS=30000`
4. `BARDO_AUTH_INTROSPECTION_TIMEOUT_MS=10000`
5. `BARDO_MAX_REQUEST_BYTES=1048576`
6. `BARDO_RATE_LIMIT_WINDOW_MS=60000`
7. `BARDO_RATE_LIMIT_MAX_REQUESTS=120`
8. `BARDO_RATE_LIMIT_FAIL_CLOSED=true`

### Sentry and telemetry

1. `BARDO_SENTRY_ENABLED=true`
2. `BARDO_SENTRY_TRACES_SAMPLE_RATE=0.1`
3. `SENTRY_DSN=<bardo-mcp DSN>`
4. `SENTRY_ENVIRONMENT=production`
5. `SENTRY_RELEASE=<git sha or release id>`
6. `BARDO_TELEMETRY_ENABLED=true`
7. `BARDO_METRICS_ROUTE_ENABLED=true`
8. `BARDO_METRICS_REQUIRE_AUTH=true`

### Optional Upstash

1. `UPSTASH_REDIS_REST_URL`
2. `UPSTASH_REDIS_REST_TOKEN`
3. `BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK=true` until Upstash is live
4. recommended DB name in staging: `bardo-staging`
5. recommended DB name in production: `bardo-production`

## 17. Production Smoke Tests

Run these after production deploys finish.

### 17.1 Website

1. open `/`
2. open `/pricing`
3. open `/sign-in`
4. sign in
5. open `/dashboard`
6. create API key
7. confirm `GET /api/keys?limit=20&offset=0` returns page metadata

### 17.2 MCP

1. call `GET https://<production-mcp-domain>/health`
2. confirm it returns `200`
3. initialize an MCP session
4. confirm the response includes `mcp-session-id`
5. call `tools/list`
6. run `bun run --cwd mcp validate:env` against the production env model

### 17.3 End-to-end

1. create a production API key in the website
2. use that key against the production MCP
3. confirm auth succeeds
4. restart the MCP service
5. confirm persisted customer data still exists

### 17.4 Sentry

1. `bardo-website` shows production events
2. `bardo-mcp` shows production events
3. both show the correct release
4. source maps work for website production errors

## 18. Cost Optimization Rules

These are the recommended cost decisions right now.

### Keep now

1. one Vercel project for `website`
2. one Railway project for `mcp`
3. one MCP service
4. one MCP replica
5. `stateful` MCP transport
6. Sentry enabled with lower trace sampling in production
7. Clerk as the auth source of truth
8. dependency security workflow green before promotion

### Delay until needed

1. extra Railway services
2. extra Railway projects
3. horizontal MCP scaling
4. `stateless` transport mode
5. high trace sample rates in production
6. always-on Greptile review loops for every small change

### Turn on later when needed

Turn on Upstash when:

1. you need shared counters across instances
2. you need more predictable rate-limit coordination
3. you begin scaling beyond a simple single-instance model

Until then:

1. keep `BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK=true`
2. use the single-instance Railway setup to stay cheap and stable

Consider `stateless` MCP later when:

1. one replica is no longer enough
2. session affinity becomes operationally painful
3. you are ready to re-test the whole transport contract

## 19. Common Failure Modes

### Website problem: sign-in loops or dashboard redirects to `/`

Most likely causes:

1. Clerk env vars missing
2. wrong Clerk environment
3. Preview/Production values mixed together

Check:

1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
2. `CLERK_SECRET_KEY`
3. `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
4. `NEXT_PUBLIC_CLERK_SIGN_UP_URL`

Fixed looks like:

1. sign-in loads
2. dashboard loads after auth

### Website problem: snippet generator points to the wrong MCP URL

Most likely causes:

1. `BARDO_MCP_BASE_URL` is wrong
2. `NEXT_PUBLIC_MCP_BASE_URL` is set and conflicts with `BARDO_MCP_BASE_URL`
3. staging website is still pointing at production MCP or localhost

Check:

1. `BARDO_MCP_BASE_URL`
2. `NEXT_PUBLIC_MCP_BASE_URL`
3. generated snippet output in the dashboard

Fixed looks like:

1. snippet points only to the correct environment MCP URL

### Website problem: browser Sentry is missing

Most likely cause:

1. `NEXT_PUBLIC_SENTRY_ENVIRONMENT` is missing

Check:

1. `NEXT_PUBLIC_SENTRY_DSN`
2. `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
3. `NEXT_PUBLIC_SENTRY_RELEASE`

Fixed looks like:

1. browser events appear in the correct Sentry project
2. events are tagged `staging` or `production` correctly

### MCP problem: Railway deploy is healthy but API requests fail

Most likely causes:

1. `BARDO_AUTH_INTROSPECTION_URL` is wrong
2. `BARDO_AUTH_INTROSPECTION_TOKEN` does not match the website
3. staging MCP points at production website or the reverse

Check:

1. `BARDO_AUTH_INTROSPECTION_URL`
2. `BARDO_AUTH_INTROSPECTION_TOKEN`
3. website environment URL

Fixed looks like:

1. valid API key requests succeed
2. invalid API key requests fail cleanly

### MCP problem: Railway health check fails

Most likely causes:

1. service root is wrong
2. config file is wrong
3. start command is not using repo config
4. MCP never started

Check:

1. service root is `mcp`
2. `mcp/railway.json` is being used
3. Railway logs
4. `GET /health`

Fixed looks like:

1. Railway marks the service healthy
2. `GET /health` returns `200`

### MCP problem: data disappears after restart

Most likely cause:

1. `/app/customers` volume is missing

Check:

1. Railway volume mount path
2. whether the environment/service is using durable storage

Fixed looks like:

1. data survives restart and redeploy

### MCP problem: metrics route is blocked

Most likely causes:

1. `BARDO_METRICS_REQUIRE_AUTH=true`
2. request did not send the required auth

Check:

1. `BARDO_METRICS_ROUTE_ENABLED`
2. `BARDO_METRICS_REQUIRE_AUTH`
3. request headers

Fixed looks like:

1. metrics route behavior matches the chosen policy

### Cross-system problem: staging and production are mixed up

Most likely causes:

1. staging website points to production MCP
2. production MCP introspects against staging website
3. copied env vars were not updated after duplication

Check:

1. `NEXT_PUBLIC_APP_URL`
2. `BARDO_MCP_BASE_URL`
3. `BARDO_AUTH_INTROSPECTION_URL`
4. `BARDO_AUTH_INTROSPECTION_TOKEN`
5. `SENTRY_ENVIRONMENT`

Fixed looks like:

1. each environment talks only to its matching environment

### Sentry problem: no release shown

Most likely causes:

1. `SENTRY_RELEASE` missing
2. website `SENTRY_AUTH_TOKEN` missing
3. deployment happened without correct env values

Check:

1. `SENTRY_RELEASE`
2. `SENTRY_AUTH_TOKEN`
3. `SENTRY_ORG=bardo-1k`
4. `SENTRY_PROJECT`

Fixed looks like:

1. both projects show releases
2. website source maps upload correctly

## 20. Rollback Rules

### Website rollback

1. roll back Vercel to the last healthy deployment
2. re-check:
   - homepage
   - sign-in
   - dashboard
   - API key creation
   - introspection route behavior

### MCP rollback

1. redeploy the last healthy Railway deployment
2. re-check:
   - `GET /health`
   - MCP initialize
   - API key auth
   - volume still mounted

### Shared rollback rule

1. do not rotate the shared introspection secret and redeploy both systems at the same time unless planned
2. change one thing at a time
3. verify one thing at a time

## 21. Manual Testing Script

Use this exact sequence for a release:

1. run local checks
2. deploy website staging
3. deploy MCP staging
4. create a staging API key
5. call staging MCP with that key
6. verify staging Sentry for both apps
7. verify staging persistence if configured
8. deploy website production
9. deploy MCP production
10. create a production API key
11. call production MCP with that key
12. verify production Sentry for both apps
13. restart MCP once and confirm persisted data remains

## 22. Done Means Done

The release is complete only when all of these are true:

1. website staging works
2. MCP staging works
3. staging website and staging MCP authenticate correctly
4. staging Sentry works for both apps
5. website production works
6. MCP production works
7. production website and production MCP authenticate correctly
8. production Sentry works for both apps
9. customer data survives MCP restart
10. no environment points at the wrong counterpart
11. a junior developer could repeat the deployment using this document alone

## 23. Notes For Future Scaling

Do not optimize early.

Only revisit the architecture when one of these becomes true:

1. one MCP replica is no longer enough
2. you need zero-downtime horizontal MCP scale
3. rate limits or counters must be consistent across instances
4. Railway resource usage becomes a bottleneck
5. production error/debug volume justifies stronger observability sampling

When that happens, the next likely changes are:

1. enable Upstash
2. re-evaluate `stateless` MCP transport
3. increase automation around deploy verification
