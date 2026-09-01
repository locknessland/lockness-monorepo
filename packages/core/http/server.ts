/**
 * @fileoverview Server Listener Module
 *
 * Manages HTTP server startup, port management, and console output.
 * Provides helpful error messages for common issues like port conflicts.
 *
 * @module @lockness/core/server_listener
 */

import type { Hono } from 'hono'
import { resolveEnvName } from '../environment.ts'

/**
 * Configuration options for the server listener.
 */
export interface ServerListenerConfig {
    /** Port number to listen on (e.g., 8888) */
    readonly port: number
    /** Framework version to display in banner */
    readonly version: string
}

/**
 * Manages server startup, port management, and console output.
 *
 * Features:
 * - Displays a branded banner on startup
 * - Detects and handles port conflicts
 * - Supports `--force` flag to kill processes using the port
 * - Provides helpful error messages
 *
 * @example
 * ```typescript
 * const listener = new ServerListener()
 * const server = listener.listen(hono, { port: 8888, version: '1.0.0' })
 * ```
 */
export class ServerListener {
    /**
     * Starts the HTTP server and listens on the specified port.
     *
     * Displays the Lockness banner and attempts to start the server.
     * If the port is in use and `--force` is passed, attempts to kill
     * the blocking process.
     *
     * @param hono - The Hono application instance
     * @param config - Server configuration
     * @returns A Deno HTTP server instance
     *
     * @example
     * ```typescript
     * const server = listener.listen(hono, { port: 8888, version: '1.0.0' })
     * ```
     *
     * @remarks
     * Applications do not call this directly and do not wire signals: `App.listen()`
     * installs SIGINT/SIGTERM handlers and runs the ordered teardown itself.
     */
    listen(
        hono: Hono,
        config: ServerListenerConfig,
    ): Deno.HttpServer<Deno.NetAddr> {
        this.displayBanner(config.version)

        // Return type assertion needed as tryServe is async but we want sync return
        return this.tryServe(hono, config.port) as unknown as Deno.HttpServer<
            Deno.NetAddr
        >
    }

    /**
     * Displays the Lockness ASCII art banner.
     *
     * Shows version number and environment label (PRODUCTION/DEVELOPMENT).
     *
     * @param version - Framework version to display
     *
     * @internal
     */
    private displayBanner(version: string): void {
        // `resolveEnvName` is NotCapable-safe: this runs synchronously inside
        // `listen()` BEFORE the shutdown signal handlers are installed, and a
        // `deno compile --allow-net` binary once died here — over a banner —
        // because a raw `Deno.env.get` raised without `--allow-env`. The helper
        // guards the read and defaults to development, so no local guard is
        // needed and the environment rule stays in one place.
        const env = resolveEnvName()
        const isProd = env.toLowerCase() === 'production'
        const envLabel = isProd
            ? '\x1b[45m\x1b[37m\x1b[1m PRODUCTION \x1b[0m'
            : '\x1b[44m\x1b[37m DEVELOPMENT \x1b[0m'

        console.log(`
  ▜     ▌         
  ▐ ▛▌▛▘▙▘▛▌█▌▛▘▛▘
  ▐▖▙▌▙▖▛▖▌▌▙▖▄▌▄▌ v${version}
        `)

        console.log(`  Environment: ${envLabel}\n`)
    }

    /**
     * Attempts to start the HTTP server.
     *
     * Handles port conflicts by delegating to `handlePortConflict`.
     *
     * @param hono - The Hono application instance
     * @param port - Port number to listen on
     * @returns Promise resolving to the HTTP server instance
     *
     * @internal
     */
    private async tryServe(
        hono: Hono,
        port: number,
    ): Promise<Deno.HttpServer<Deno.NetAddr>> {
        try {
            return Deno.serve({
                port,
                onListen: ({ port, hostname }) => {
                    const protocol = 'http'
                    const host = hostname === '0.0.0.0' ? 'localhost' : hostname
                    console.log(
                        `  🚀 Server is flying at \x1b[36m${protocol}://${host}:${port}\x1b[0m`,
                    )
                    console.log(`  📂 Ready to serve your awesome app!\n`)
                },
            }, hono.fetch.bind(hono))
        } catch (error) {
            if (error instanceof Deno.errors.AddrInUse) {
                return await this.handlePortConflict(hono, port)
            }
            throw error
        }
    }

    /**
     * Handles port conflict by optionally force-releasing the port.
     *
     * If `--force` flag is present in `Deno.args`, attempts to kill
     * the process using the port and retry.
     *
     * @param hono - The Hono application instance
     * @param port - Port number that's in use
     * @returns Promise resolving to the HTTP server instance
     *
     * @internal
     */
    private async handlePortConflict(
        hono: Hono,
        port: number,
    ): Promise<Deno.HttpServer<Deno.NetAddr>> {
        const hasForce = Deno.args.includes('--force')

        if (hasForce) {
            const released = await this.forceReleasePort(port)
            if (released) {
                // Retry serving after port is released
                return await this.tryServe(hono, port)
            }
        }

        // Port conflict couldn't be resolved
        this.displayPortConflictError(port)
        Deno.exit(1)
    }

    /**
     * Forcefully releases a port by killing processes using it.
     *
     * Uses `lsof` to find PIDs and `kill -9` to terminate them.
     * Only works on Unix-like systems (macOS, Linux).
     *
     * @param port - Port number to release
     * @returns Promise resolving to `true` if successful, `false` otherwise
     *
     * @internal
     */
    private async forceReleasePort(port: number): Promise<boolean> {
        try {
            console.log(
                `  🛠  Port ${port} in use. Attempting to force release...`,
            )
            const lsof = new Deno.Command('lsof', {
                args: ['-ti', `:${port}`],
                stdout: 'piped',
            })
            const { stdout } = await lsof.output()
            const pids = new TextDecoder().decode(stdout).trim()
                .split('\n').filter((p) => p.length > 0)

            if (pids.length > 0) {
                for (const pid of pids) {
                    const kill = new Deno.Command('kill', {
                        args: ['-9', pid],
                    })
                    await kill.output()
                }
                // Small delay to let OS release the port
                await new Promise((r) => setTimeout(r, 800))
                return true
            }
        } catch (e) {
            console.error(
                `  ⚠️  Failed to force release port ${port}: ${
                    (e as Error).message
                }`,
            )
        }

        return false
    }

    /**
     * Displays a helpful error message for port conflicts.
     *
     * Provides solutions including manual kill command, --force flag,
     * and using a different port.
     *
     * @param port - Port number that's in use
     *
     * @internal
     */
    private displayPortConflictError(port: number): void {
        console.error(`\x1b[31m
  ❌ Error: Port ${port} is already in use.
  
  The server could not start because another process is already listening on this port.

  Possible solutions:
  1. Kill the process using this port:
     lsof -ti:${port} | xargs kill -9
  2. Use the --force flag to let Lockness do it for you:
     deno task dev -- --force
  3. Use a different port by setting the PORT environment variable:
     PORT=9999 deno task dev
                \x1b[0m`)
    }
}
