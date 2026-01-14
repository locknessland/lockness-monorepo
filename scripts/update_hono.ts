#!/usr/bin/env -S deno run -A
/**
 * Update Hono Version Script
 *
 * Updates the Hono version across all imports in packages/hono/deno.json
 *
 * Usage:
 *   deno run -A scripts/update_hono.ts 4.12.0
 */

const newVersion = Deno.args[0]

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error('❌ Error: Please provide a valid version number')
    console.error('Usage: deno run -A scripts/update_hono.ts 4.12.0')
    Deno.exit(1)
}

const denoJsonPath = 'packages/hono/deno.json'

try {
    // Read deno.json
    const content = await Deno.readTextFile(denoJsonPath)
    const denoJson = JSON.parse(content)

    let updateCount = 0

    // Update all hono imports
    for (const [key, value] of Object.entries(denoJson.imports)) {
        if (typeof value === 'string' && value.includes('npm:hono@')) {
            const oldVersion = value.match(/npm:hono@([\d.]+)/)?.[1]
            denoJson.imports[key] = value.replace(
                /npm:hono@[\d.]+/,
                `npm:hono@${newVersion}`,
            )
            updateCount++
            if (oldVersion) {
                console.log(`  ${key}: ${oldVersion} → ${newVersion}`)
            }
        }
    }

    // Write updated deno.json
    await Deno.writeTextFile(
        denoJsonPath,
        JSON.stringify(denoJson, null, 4) + '\n',
    )

    console.log(
        `\n✅ Successfully updated ${updateCount} Hono imports to v${newVersion}`,
    )
    console.log(`\nNext steps:`)
    console.log(`  1. deno cache --reload packages/hono/mod.ts`)
    console.log(`  2. deno task test`)
    console.log(`  3. git commit -m "chore(hono): update to v${newVersion}"`)
} catch (error) {
    console.error(
        '❌ Error:',
        error instanceof Error ? error.message : String(error),
    )
    Deno.exit(1)
}
