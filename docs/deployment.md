# Deployment

Lockness provides multiple deployment options to suit different hosting
environments and requirements.

## 📦 Production Options

### Option 1: Deno Deploy (Recommended)

Deploy directly to Deno Deploy's cloud platform for the simplest production
setup.

**Benefits:**

- Native TypeScript execution (no compilation needed)
- Automatic HTTPS and global CDN
- Zero configuration scaling
- Built-in environment variable management

**Setup:**

1. Connect your GitHub repository to Deno Deploy
2. Configure the project with **Entry Point**: `main.ts` and **Build Command**:
   `deno task build` (every kit defines it: the route registry, plus the CSS in
   the web kit)
3. Set environment variables (see below)

```
APP_ENV=production
APP_PORT=8888
DATABASE_URL=postgresql://...
```

**Important:** Deno Deploy automatically runs your TypeScript code with full
support for TC39 decorators and all Lockness features.

### Option 2: Standalone Binary (VPS/Self-hosted)

Compile your application to a self-contained executable for traditional hosting.

**When to use:**

- Deploying to VPS (DigitalOcean, Linode, etc.)
- Self-hosted infrastructure
- Air-gapped environments

**Create the binary:**

```bash
deno task compile
```

**What happens:**

1. Routes are generated from controllers (`app/routes.ts`)
2. CSS assets are built (`public/css/app.css`)
3. Public folder is copied to `_dist/public/`
4. Application is compiled to `_dist/lockness` (~92MB)
5. Binary includes Deno runtime + all dependencies + static assets

**Deploy to server:**

```bash
# Copy entire _dist folder to server
scp -r _dist/ user@server:/opt/myapp/

# SSH to server and run
ssh user@server
cd /opt/myapp/_dist
./lockness
```

**Important:** The binary looks for the `public/` folder relative to its
location. Always deploy the entire `_dist/` directory.

### Option 3: Direct Execution

Run the application directly from source on your server.

```bash
deno task start
# Or: deno run -A --env-file=.env.production.local main.ts
```

**When to use:**

- Quick prototypes
- Internal tools
- Development staging servers

## 🔧 Production Checklist

Before deploying, ensure:

### The environment signal

`APP_ENV` is the one variable Lockness reads to decide its environment, trimmed
and case-insensitive. `DENO_ENV` is not read. Since v0.5.0 a `DENO_ENV` that
disagrees with `APP_ENV` refuses the boot, and an equal one is ignored with a
warning: set `APP_ENV` and remove `DENO_ENV`.

| `APP_ENV`                   | Session cookie `Secure` | 500 error details | Devtools | Missing `APP_KEY` | Kit cache driver |
| :-------------------------- | :---------------------- | :---------------- | :------- | :---------------- | :--------------- |
| `production`                | yes                     | hidden            | off      | boot refused      | `deno-kv`        |
| unset, `staging`, any other | yes                     | hidden            | off      | per-process key   | `memory`         |
| `development`               | no                      | shown             | on       | per-process key   | `memory`         |

An unset `APP_ENV` is never production, so the production-only refusals do not
apply to it. Set `APP_ENV=production` on every production deployment.

### Environment Variables

```bash
# .env.production or .env.production.local
APP_ENV=production
APP_PORT=8888
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Optional
SESSION_SECRET=your-secret-key
MAIL_DRIVER=smtp
```

### Assets

- ✅ CSS compiled: `deno task css:build`
- ✅ Routes generated: `deno task routes:generate`
- ✅ Static files in `public/` directory

### Database

```bash
# Run migrations before deployment
deno task db:migrate
```

**Boot makes zero database round trips.** With `DATABASE_URL` set, boot loads
the driver and builds a lazy client, and sends nothing to the database. The
first round trip is the first real query, or a `/ready` check. On a serverless
host whose isolates start often, in front of a scale-to-zero database (Neon, for
example), this means a cold start does not wake and bill the database. It also
means boot does not fail when the database is down:

| Failure                                                        | Where it surfaces                                                                                                                                                                                                                                                                                                     |
| :------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSN refused, client package missing, or URL the client rejects | A `❌` line at boot (boot continues), then `/ready` returns `503`. The line quotes no part of the DSN: a fixed message, the missing package, or the client's message withheld (error name only). A refused DSN needs its password percent-encoded; see the [DSN format](../packages/drizzle/docs/DOCS.md#dsn-format). |
| Host unreachable, bad credentials, database down               | Not at boot. `/ready` returns `503` within 3 s, the first query fails, and `deno task cli db:check` reports it. A report that holds a database credential is withheld whole, never masked.                                                                                                                            |

An app that wants boot to fail when the database is down probes from a boot
hook. Boot hooks run after the database is configured, and an error thrown by a
hook stops the boot:

```typescript
@OnBoot()
async verifyDatabase(_app: App) {
    await container.get(Database).probe()
}
```

Leave this out on a scale-to-zero database: it wakes the database on every cold
start. See the
[Drizzle docs](../packages/drizzle/docs/DOCS.md#boot-behaviour-and-readiness)
for the full contract.

### Security

- ✅ Change `SESSION_SECRET` to a strong random value
- ✅ Set `APP_ENV=production`
- ✅ Use HTTPS in production (automatic with Deno Deploy)
- ✅ Disable devtools (check `kernel.ts`)

## 🐳 Docker Deployment

Every starter kit ships a `Dockerfile` (the same one for web, api and slim):

```bash
# Build image
docker build -t my-lockness-app .

# Run container — `init` created .env.production.local with its own APP_KEY
docker run -p 8888:8888 --env-file .env.production.local my-lockness-app

# Another port: the health check follows PORT
docker run -p 9000:9000 -e PORT=9000 --env-file .env.production.local my-lockness-app

# Custom Deno version (the default is the version CI tests against)
docker build --build-arg DENO_VERSION=2.9.6 -t my-app .

# Resolve jsr: packages from a mirror
docker build --build-arg JSR_URL=https://<mirror> -t my-app .
```

The Dockerfile:

- Is a **single stage**: the app runs with `deno run`, so the final image needs
  Deno anyway, and copying a module cache between stages is where ownership
  breaks.
- Runs your kit's `deno task build`, then caches every module `main.ts` loads,
  and starts the server with `--cached-only`: the running container fetches
  nothing. It keeps `JSR_URL` from the build, because Deno keys its module cache
  by registry origin. So never put credentials in `JSR_URL`: it persists in the
  image config. For a private mirror, pass `DENO_AUTH_TOKENS` to the
  `deno install` steps through a BuildKit secret mount
  (`RUN --mount=type=secret,...`), never as a build argument.
- Leaves every `.env*` file except `.env.exemple`, and key files (`*.pem`,
  `*.key`, `*.p8`, `*.p12`, `*.pfx`), at any depth, out of the build context
  (`.dockerignore`, `**/` patterns), so `COPY . .` cannot bake a secret into a
  layer. Pass configuration at run time with `--env-file`.
- Runs as the base image's non-root `deno` user. The app files stay owned by
  root, so the process cannot rewrite its own code.
- Sets `APP_ENV=production` (after the build steps, so the build itself runs in
  development mode). Both your `config/` and the framework read it; the
  framework also honours `DENO_ENV`.
- Includes a liveness health check that polls `/health` on `$PORT` (never
  `/ready`; see [Health Checks](#health-checks)).
- Keeps the base image's `tini` entrypoint, which forwards signals to Deno for a
  graceful shutdown.

**Commit `deno.lock`.** A fresh scaffold has none, and the first build writes
one inside the image. Without a committed lock every build resolves afresh, and
Deno's minimum dependency age can pick the previous release of a package rather
than the one you tested.

`deno task kits:smoke --registry --docker` builds every kit's image and runs it
until Docker reports it healthy; CI runs it on every push.

## Monitoring

### Health Checks

The framework serves two endpoints. You do not need to write them:

- `GET /health` is **liveness**. It touches no dependency and always returns
  `200` while the process is up.
- `GET /ready` is **readiness**. It runs every registered check, including the
  database's `SELECT 1`, and returns `503` if any check fails. The body names
  each check and whether it is `up` or `down`, and nothing more.

Point uptime and liveness monitors at **`/health`**, not at `/ready`. `/ready`
queries the database whenever its last result is more than 1 s old (the result
is cached per process, or per isolate on a serverless host), so a monitor
polling it keeps a scale-to-zero database awake and billed around the clock. Use
`/ready` only where readiness is the question, such as a load balancer deciding
whether to send traffic to an instance.

The Docker `HEALTHCHECK` reports; it does not restart. Plain Docker and Compose
only mark an unhealthy container `unhealthy` (a restart policy reacts to the
process exiting, not to the health status); Swarm replaces it; Kubernetes
ignores `HEALTHCHECK` entirely, so point its `livenessProbe` at `/health` and
its `readinessProbe` at `/ready` yourself.

### Logging

Lockness logs are structured and production-ready:

```typescript
// In kernel.ts
app.useMiddleware(LoggerMiddleware)
```

### Performance

- Use Deno Deploy's built-in analytics
- Monitor database query performance with Drizzle logs
- Enable response caching for static assets

## 🔍 Troubleshooting

### Static Files Not Loading (Binary Deployment)

**Symptom:** 404 errors on `/css/app.css` or other static files

**Solution:** Ensure the entire `_dist/` folder is deployed, not just the
binary. The `public/` folder must be present at `_dist/public/`.

```bash
# Correct deployment
_dist/
├── lockness          # Binary
└── public/           # Static assets
    └── css/
        └── app.css
```

### Routes Not Found

**Symptom:** 404 errors on valid routes

**Solution:** Ensure routes were generated before compilation:

```bash
deno task routes:generate
deno task compile
```

### Environment Variables Not Loaded

**Symptom:** Application can't find configuration

**Solution:** Use `--env-file` flag or set variables in system:

```bash
# Direct execution
deno run -A --env-file=.env.production.local main.ts

# Binary (set in system environment)
export APP_ENV=production
export DATABASE_URL=...
./lockness
```

## 📚 Next Steps

- [Configure Sessions](/docs/sessions) for production
- [Set up Authentication](/docs/authentication)
- [Enable Caching](/docs/cache) for better performance
