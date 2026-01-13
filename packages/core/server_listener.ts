// deno-lint-ignore-file no-explicit-any
import type { Hono } from 'hono'

/**
 * Configuration for the server listener
 */
export interface ServerListenerConfig {
    /** Port number to listen on */
    port: number
    /** Framework version to display */
    version: string
}

/**
 * Manages server startup, port management, and console output.
 * Handles port conflict detection and provides helpful error messages.
 */
export class ServerListener {
    /**
     * Start the server and listen on the specified port
     *
     * @param hono - The Hono application instance
     * @param config - Server configuration
     * @returns A Deno HTTP server instance
     *
     * @example
     * const listener = new ServerListener()
     * const server = listener.listen(hono, { port: 8000, version: '1.0.0' })
     */
    listen(
        hono: Hono,
        config: ServerListenerConfig,
    ): Deno.HttpServer<Deno.NetAddr> {
        this.displayBanner(config.version)

        return this.tryServe(hono, config.port) as any
    }

    /**
     * Display the Lockness banner
     */
    private displayBanner(version: string): void {
        const env = Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') ||
            'development'
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
     * Attempt to start the server, with retry logic for port conflicts
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
     * Handle port conflict - attempt force release if --force flag is present
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
     * Attempt to force release a port by killing the process using it
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
     * Display helpful error message for port conflicts
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
