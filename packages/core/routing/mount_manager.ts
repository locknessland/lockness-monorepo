import type { Hono } from 'hono'
import type { Env, Schema } from 'hono'
import type {
    AppConfig,
    Module,
    ModuleWithMiddleware,
    MountPoint,
} from '../types.ts'

/**
 * Manages the mounting of the application on a URL pattern prefix.
 * Implements the dual-layer routing strategy for i18n and similar use cases.
 */
export class MountManager {
    constructor(
        private readonly rootHono: Hono<Env, Schema, string>,
        private readonly internalHono: Hono<Env, Schema, string>,
    ) {}

    /**
     * Sets up mount point by connecting rootHono to internalHono.
     * If no mount point is defined, only mounts at root `/`.
     */
    setup(config: Module | ModuleWithMiddleware | AppConfig): void {
        const mountPoint = 'mountPoint' in config
            ? config.mountPoint
            : undefined

        // Mount at root first. Registration order only decides who gets asked
        // first — it does not protect a path from the mount. A root handler
        // wins only when it actually responds; anything that falls through
        // reaches the mount pattern below.
        this.rootHono.route('/', this.internalHono)

        if (mountPoint) {
            if (mountPoint.middleware) {
                warnIfUnconstrained(mountPoint.pattern)

                // Cover every path the mount route admits. Registration is
                // unconditional; runOncePerRequest keeps the gate from firing
                // twice where both registrations match.
                const gate = runOncePerRequest(mountPoint.middleware)

                for (const path of gatePathsFor(mountPoint.pattern)) {
                    this.rootHono.use(path, gate)
                }
            }

            // Route requests under this pattern to internal hono
            this.rootHono.route(mountPoint.pattern, this.internalHono)

            this.probeCompile(mountPoint.pattern)
        }
    }

    /**
     * Forces the router to build now, so an unsupported pattern shape fails at
     * boot with a named error instead of as a 500 on the first request.
     *
     * Hono builds its route table lazily on the first match. Some router
     * implementations reject a constrained param that shares a trie level with
     * static siblings, and they do it at build time — which, left lazy, means
     * the first user request pays for a configuration mistake.
     *
     * **This builds and seals the root router.** Matching resolves handlers
     * without running them, but `SmartRouter` locks its choice once matched, so
     * no further route may be registered on the root app afterwards. That is
     * safe here because nothing does: the only later bootstrap step installs a
     * `notFound` handler, which is a property rather than a route, and the
     * public post-`init()` surfaces (`static()`, `getHono()`) both operate on
     * the internal app. A mounted app therefore seals its root router at
     * `init()` while an unmounted one does not — pinned by test.
     *
     * @param pattern - The mount pattern, for the error message.
     * @throws {Error} If the router cannot compile the route table.
     */
    private probeCompile(pattern: string): void {
        try {
            this.rootHono.router.match('GET', '/')
        } catch (cause) {
            throw new Error(
                `Mount point ${
                    JSON.stringify(pattern)
                } produced a route table ` +
                    `this router cannot compile: ${
                        cause instanceof Error ? cause.message : String(cause)
                    }`,
                { cause },
            )
        }
    }
}

/**
 * A constraint region, masked out before params are counted.
 *
 * Mirrors how Hono itself extracts them (`/\{[^}]+\}/g`), and it has to be done
 * first: a constraint body legitimately contains colons — `(?:en|fr)` — and a
 * naive scan reads `:en` as a param.
 */
const CONSTRAINT = /\{[^}]*\}/g

/** Stands in for a masked constraint. Cannot occur in a URL pattern. */
const MASK = '\uFFFF'

/**
 * Warns when a mount pattern gates traffic through an unconstrained param.
 *
 * An unconstrained mount is a legal routing choice on its own. An unconstrained
 * mount *with a middleware attached* is the catch-all gate shape: `/:a/:b`
 * matches any two leading segments, so unrelated paths — `/.well-known/…`,
 * `/apple-touch-icon/…` — are handed to a middleware written for something
 * else.
 *
 * It warns rather than throwing: the shape is legal, and throwing would break
 * every existing mount on upgrade. There is no suppression flag — constraining
 * the pattern is the remedy, and it silences this by construction.
 *
 * @param pattern - The mount pattern to inspect.
 */
function warnIfUnconstrained(pattern: string): void {
    const masked = pattern.replace(CONSTRAINT, MASK)

    const unconstrained = masked
        .split('/')
        .filter((segment) => segment.startsWith(':') && !segment.includes(MASK))

    if (unconstrained.length === 0) return

    console.warn(
        `⚠️  Mount point ${JSON.stringify(pattern)} gates traffic through ` +
            `unconstrained ${
                unconstrained.length === 1 ? 'param' : 'params'
            } ` +
            `${
                unconstrained.join(', ')
            }, so it matches any path of that shape ` +
            `and hands it to the mount middleware. Constrain it — e.g. ` +
            `constrainedParam('langId', validLanguages) from @lockness/core.`,
    )
}

/**
 * The paths a mount's middleware must cover for a given mount pattern.
 *
 * Derived from the route path rather than written out separately, so the gate
 * and the route it guards cannot drift apart.
 *
 * @param pattern - The mount pattern the route is registered at.
 * @returns The mount root, then everything below it.
 */
function gatePathsFor(pattern: string): readonly string[] {
    return [pattern, `${pattern}/*`]
}

/**
 * Requests whose mount gate has already run.
 *
 * Keyed on the underlying `Request`, so entries are collected with it.
 */
const gateRan = new WeakSet<Request>()

/**
 * Makes a mount middleware run at most once per request.
 *
 * @remarks
 * The gate is registered on both the mount root and everything below it,
 * because whether `${pattern}/*` alone covers the root depends on how Hono
 * compiles the pattern — and that is **not** predictable from the pattern text.
 * Measured against 4.11.1, all three of these disagree:
 *
 * - `/:a/:b` — `/*` matches the empty tail, so the root is already covered
 * - `/:a{(?:x|y)}/:b{(?:x|y)}` — it is not, and the root needs its own gate
 * - `/api/:v{(?:v1|v2)}` — covered again, despite carrying a constraint
 *
 * Two heuristics were tried against those shapes and both mis-classified one
 * of them, in the direction that runs a non-idempotent gate twice. So the
 * registration is unconditional and the *execution* is deduplicated here,
 * which is correct for every shape by construction rather than by prediction.
 *
 * @param middleware - The user's mount middleware.
 * @returns The same middleware, guarded against a second execution.
 */
function runOncePerRequest(
    middleware: NonNullable<MountPoint['middleware']>,
): NonNullable<MountPoint['middleware']> {
    return async (c, next) => {
        const request = c.req.raw

        if (gateRan.has(request)) return await next()
        gateRan.add(request)

        return await middleware(c, next)
    }
}
