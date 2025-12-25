#!/usr/bin/env -S deno run -A
/**
 * Deprecation Contracts Package Installer
 * 
 * Automatically configures the @lockness/deprecation-contracts package in your project.
 */

import { addPackage } from '../ace/package_loader.ts'

async function checkProjectStructure() {
    try {
        await Deno.stat('./deno.json')
        return true
    } catch {
        console.error('❌ deno.json not found. Are you in a Lockness project?')
        return false
    }
}

async function main() {
    console.log('🌊 Installing @lockness/deprecation-contracts...\n')

    if (!(await checkProjectStructure())) {
        Deno.exit(1)
    }

    try {
        await addPackage('deprecation-contracts')
        console.log('\n✅ @lockness/deprecation-contracts installed successfully!')
        console.log('📖 Usage:')
        console.log('   import { triggerDeprecation } from "@lockness/deprecation-contracts"')
        console.log('   triggerDeprecation("my-pkg", "1.2.0", "Use newMethod() instead")\n')
    } catch (error) {
        console.error('❌ Failed to add package to deno.json:', error)
        Deno.exit(1)
    }
}

if (import.meta.main) {
    await main()
}
