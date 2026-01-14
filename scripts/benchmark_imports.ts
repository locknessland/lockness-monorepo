#!/usr/bin/env -S deno run -A
/**
 * Benchmark: Barrel Export vs Direct Imports
 *
 * Compares the performance impact of:
 * - Barrel exports (import from '@lockness/hono')
 * - Direct imports (import from 'npm:hono@4.11.1/...')
 *
 * Usage:
 *   deno run -A scripts/benchmark_imports.ts
 */

import { performance } from 'node:perf_hooks'

console.log('🔬 Import Performance Benchmark\n')
console.log('Testing import strategies...\n')

// Test 1: Barrel export (current approach)
console.log('📦 Test 1: Barrel Export (@lockness/hono)')
const barrelStart = performance.now()
await import('../packages/hono/mod.ts')
const barrelEnd = performance.now()
const barrelTime = barrelEnd - barrelStart

console.log(`   Import time: ${barrelTime.toFixed(2)}ms`)

// Test 2: Direct imports (hypothetical comparison)
console.log('\n📦 Test 2: Direct Imports (individual modules)')
const directStart = performance.now()
await import('../packages/hono/deno.ts')
await import('../packages/hono/auth.ts')
await import('../packages/hono/security.ts')
await import('../packages/hono/request.ts')
await import('../packages/hono/content.ts')
const directEnd = performance.now()
const directTime = directEnd - directStart

console.log(`   Import time: ${directTime.toFixed(2)}ms`)

// Test 3: Single module
console.log('\n📦 Test 3: Single Module (baseline)')
const singleStart = performance.now()
await import('../packages/hono/deno.ts')
const singleEnd = performance.now()
const singleTime = singleEnd - singleStart

console.log(`   Import time: ${singleTime.toFixed(2)}ms`)

// Results
console.log('\n' + '='.repeat(50))
console.log('📊 Results Summary')
console.log('='.repeat(50))
console.log(`Barrel Export:   ${barrelTime.toFixed(2)}ms`)
console.log(`Direct Imports:  ${directTime.toFixed(2)}ms`)
console.log(`Single Module:   ${singleTime.toFixed(2)}ms`)

const overhead = barrelTime - singleTime
const overheadPercent = ((overhead / singleTime) * 100).toFixed(1)

console.log(
    `\nBarrel overhead: +${overhead.toFixed(2)}ms (+${overheadPercent}%)`,
)

console.log('\n💡 Analysis:')
if (overhead < 10) {
    console.log('✅ Barrel export has negligible performance impact')
} else if (overhead < 50) {
    console.log('⚠️  Barrel export has minor performance impact')
} else {
    console.log('❌ Barrel export has significant performance impact')
}

console.log('\n📝 Note: Tree-shaking at build time eliminates unused code,')
console.log(
    '   so runtime performance is identical regardless of import style.',
)
console.log('   This benchmark measures initial module loading time only.')
