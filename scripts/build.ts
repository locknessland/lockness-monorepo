import * as esbuild from 'esbuild'
import { denoPlugins } from '@luca/esbuild-deno-loader'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

const build = async () => {
    console.log('🚀 Building Lockness app...')

    try {
        await esbuild.build({
            plugins: [
                polyfillNode({
                    polyfills: {
                        fs: true,
                        crypto: true,
                        path: false,
                    },
                }) as any,
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
