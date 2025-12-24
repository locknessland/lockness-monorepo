import { defineConfig } from 'vite'
import devServer from '@hono/vite-dev-server'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig(({ isSsrBuild }) => ({
    resolve: {
        alias: {
            '@': resolve(Deno.cwd(), './'),
            '@controller': resolve(Deno.cwd(), './src/controller'),
            '@service': resolve(Deno.cwd(), './src/service'),
            '@middleware': resolve(Deno.cwd(), './src/middleware'),
            '@model': resolve(Deno.cwd(), './src/model'),
            '@view': resolve(Deno.cwd(), './src/view'),
            '@repository': resolve(Deno.cwd(), './src/repository'),
            '@kernel': resolve(Deno.cwd(), './src/kernel.ts'),
            'lockness': resolve(Deno.cwd(), './lockness/core/core.ts'),
            '@lockness/core': resolve(Deno.cwd(), './lockness/core/core.ts'),
            '@lockness/auth': resolve(Deno.cwd(), './lockness/auth/auth.ts'),
            '@lockness/cache': resolve(Deno.cwd(), './lockness/cache/cache.ts'),
            '@lockness/container': resolve(Deno.cwd(), './lockness/container/container.ts'),
            '@lockness/events': resolve(Deno.cwd(), './lockness/events/events.ts'),
            '@lockness/logger': resolve(Deno.cwd(), './lockness/logger/logger.ts'),
            '@lockness/mail': resolve(Deno.cwd(), './lockness/mail/mail.ts'),
            '@lockness/queue': resolve(Deno.cwd(), './lockness/queue/queue.ts'),
            '@lockness/session': resolve(Deno.cwd(), './lockness/session/session.ts'),
            '@lockness/socialite': resolve(Deno.cwd(), './lockness/socialite/socialite.ts'),
            '@lockness/storage': resolve(Deno.cwd(), './lockness/storage/storage.ts'),
            '@lockness/validator': resolve(Deno.cwd(), './lockness/validator/validator.ts'),
            '@lockness/ace': resolve(Deno.cwd(), './lockness/ace/cli.ts'),
            '@lockness/drizzle': resolve(
                Deno.cwd(),
                './lockness/drizzle/database.ts',
            ),
        },
    },
    plugins: [
        tailwindcss(),
        devServer({
            entry: 'main.ts',
            injectClientScript: true,
        }),
    ],
    esbuild: {
        jsx: 'automatic',
        jsxImportSource: 'hono/jsx',
        tsconfigRaw: {
            compilerOptions: {
                experimentalDecorators: true,
            },
        },
    },
    build: {
        target: 'es2022',
        ssr: isSsrBuild ? './main.ts' : false,
        outDir: isSsrBuild ? 'dist' : 'dist/static',
        emptyOutDir: !isSsrBuild,
        manifest: !isSsrBuild, // Only generate manifest for client build
        rollupOptions: {
            input: isSsrBuild ? './main.ts' : './src/view/app.ts',
            output: isSsrBuild
                ? {
                    entryFileNames: 'server.js',
                    format: 'esm',
                }
                : {
                    entryFileNames: 'assets/[name]-[hash].js',
                    chunkFileNames: 'assets/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash].[ext]',
                },
            external: isSsrBuild
                ? [
                    /^node:/,
                    'hono',
                    'hono/deno',
                    'hono/jsx',
                    'hono/jsx-renderer',
                    'hono/html',
                    /^npm:/,
                    'lockness',
                ]
                : [],
        },
    },
    ssr: {
        external: [
            'node:process',
            'node:path',
            'node:fs',
            'node:os',
            'node:net',
            'node:tls',
            'node:crypto',
            'node:perf_hooks',
            'node:stream',
            'node:events',
            'node:util',
            'node:buffer',
            'node:string_decoder',
            'node:querystring',
            'node:zlib',
            'node:url',
            'node:dns',
            'node:http',
            'node:https',
            'process',
            'path',
            'fs',
            'os',
            'net',
            'tls',
            'crypto',
            'perf_hooks',
            'stream',
            'events',
            'util',
            'buffer',
            'string_decoder',
            'querystring',
            'zlib',
            'url',
            'dns',
            'http',
            'https',
            '@std/path',
            '@std/fs',
        ],
    },
}))
