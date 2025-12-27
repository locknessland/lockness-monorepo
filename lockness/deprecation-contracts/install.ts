#!/usr/bin/env -S deno run -A
/**
 * Deprecation Contracts Package Installer
 *
 * Automatically configures the @lockness/deprecation-contracts package in your project.
 */

import { addPackage } from '@lockness/cli'

async function checkProjectStructure() {
    try {
        await Deno.stat('./deno.json')
        return true
    } catch {
        console.error('❌ deno.json not found. Are you in a Lockness project?')
        return false
    }
}

async function updateEnvFile() {
    const envPath = './.env'
    const envExemplePath = './.env.exemple'
    const deprecationConfig =
        '\n# Deprecation Configuration\nSTRICT_DEPRECATIONS=false\nIGNORE_DEPRECATIONS=false\n'

    // Update .env if it exists
    try {
        const envContent = await Deno.readTextFile(envPath)
        if (!envContent.includes('STRICT_DEPRECATIONS')) {
            await Deno.writeTextFile(envPath, envContent + deprecationConfig)
            console.log('✓ Updated .env with deprecation configuration')
        }
    } catch {
        // .env might not exist, skip silently
    }

    // Update .env.exemple if it exists
    try {
        const envExContent = await Deno.readTextFile(envExemplePath)
        if (!envExContent.includes('STRICT_DEPRECATIONS')) {
            await Deno.writeTextFile(
                envExemplePath,
                envExContent + deprecationConfig,
            )
            console.log('✓ Updated .env.exemple with deprecation configuration')
        }
    } catch {
        // .env.exemple might not exist, skip silently
    }
}

async function main() {
    console.log('🌊 Installing @lockness/deprecation-contracts...\n')

    if (!(await checkProjectStructure())) {
        Deno.exit(1)
    }

    try {
        // 1. Add package to deno.json
        await addPackage('deprecation-contracts')

        // 2. Update environment variables
        await updateEnvFile()

        console.log(
            '\n✅ @lockness/deprecation-contracts installed successfully!',
        )
        console.log('📖 Usage:')
        console.log(
            '   import { triggerDeprecation } from "@lockness/deprecation-contracts"',
        )
        console.log(
            '   triggerDeprecation("my-pkg", "1.2.0", "Use newMethod() instead")\n',
        )
        console.log('⚙️ Configuration:')
        console.log(
            '   CHECK your .env file to control deprecation behavior.\n',
        )
    } catch (error) {
        console.error('❌ Failed to add package to deno.json:', error)
        Deno.exit(1)
    }
}

if (import.meta.main) {
    await main()
}
