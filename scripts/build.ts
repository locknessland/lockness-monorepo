import * as esbuild from 'esbuild'
import { denoPlugins } from '@luca/esbuild-deno-loader'

const build = async () => {
    console.log('🚀 Building Lockness app...')

    try {
        await esbuild.build({
            plugins: [
                ...denoPlugins({ configPath: Deno.realPathSync('./deno.json') }),
            ],
            entryPoints: ['./main.ts'],
            outfile: './_output/server.ts',
            bundle: true,
            format: 'esm',
            platform: 'neutral',
            target: 'esnext',
            minify: true,
            jsx: 'transform',
            external: ['node:*'],
            alias: {
                'perf_hooks': 'node:perf_hooks',
                'async_hooks': 'node:async_hooks',
                'net': 'node:net',
                'fs': 'node:fs',
                'path': 'node:path',
            },
        })
        console.log('✅ Build complete: _output/server.ts')
    } catch (e) {
        console.error('❌ Build failed:', e)
        Deno.exit(1)
    } finally {
        await esbuild.stop()
    }
}

build()
