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
            '@router': resolve(Deno.cwd(), './src/router.ts'),
            '@repository': resolve(Deno.cwd(), './src/repository'),
            '@kernel': resolve(Deno.cwd(), './src/kernel.ts'),
            'lockness': resolve(Deno.cwd(), './lockness/core/core.ts'),
            '@lockness/core': resolve(Deno.cwd(), './lockness/core/core.ts'),
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
        manifest: true,
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
