// scripts/bump.ts
import { parse } from '@std/jsonc'
const newVersion = Deno.args[0]
if (!newVersion) {
    console.error('❌ Merci de spécifier une version. Ex: deno task bump 0.2.0')
    Deno.exit(1)
}

console.log(`🚀 Mise à jour vers la version ${newVersion}`)
console.log('')

// Lit la configuration racine pour trouver les membres
// deno-lint-ignore no-explicit-any
const rootConfig = parse(await Deno.readTextFile('./deno.jsonc')) as any

// Étape 0: Met à jour la version du monorepo racine
console.log('🏠 Mise à jour de la version du monorepo racine...')
rootConfig.version = newVersion
await Deno.writeTextFile(
    './deno.jsonc',
    JSON.stringify(rootConfig, null, 4) + '\n',
)
console.log(`   ✅ deno.jsonc → ${newVersion}`)

console.log('')

// Étape 1: Met à jour la version de chaque package
console.log('📦 Mise à jour des versions des packages...')
for (const member of rootConfig.workspace) {
    const configPath = `${member}/deno.json`
    try {
        const config = JSON.parse(await Deno.readTextFile(configPath))
        config.version = newVersion
        await Deno.writeTextFile(
            configPath,
            JSON.stringify(config, null, 4) + '\n',
        )
        console.log(`   ✅ ${member} → ${newVersion}`)
    } catch {
        console.warn(`   ⚠️  Pas de deno.json trouvé pour ${member}`)
    }
}

console.log('')
console.log('🔗 Mise à jour des dépendances inter-packages...')

// Étape 2a: Met à jour les imports dans le deno.json racine
try {
    // deno-lint-ignore no-explicit-any
    const rootConfig = parse(await Deno.readTextFile('./deno.jsonc')) as any

    if (rootConfig.imports) {
        let hasUpdates = false

        for (const [key, value] of Object.entries(rootConfig.imports)) {
            if (
                typeof value === 'string' &&
                (key.startsWith('@lockness/') ||
                    value.includes('jsr:@lockness/'))
            ) {
                const match = value.match(
                    /(jsr:@lockness\/[^@]+)@([\^~])([\d.]+)/,
                )
                if (match) {
                    const [, packagePath, versionPrefix] = match
                    const newImport =
                        `${packagePath}@${versionPrefix}${newVersion}`
                    if (newImport !== value) {
                        rootConfig.imports[key] = newImport
                        hasUpdates = true
                    }
                }
            }
        }

        if (hasUpdates) {
            await Deno.writeTextFile(
                './deno.jsonc',
                JSON.stringify(rootConfig, null, 4) + '\n',
            )
            console.log('   ✅ deno.jsonc racine - dépendances mises à jour')
        }
    }
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`   ⚠️  Erreur pour deno.jsonc racine: ${message}`)
}

// Étape 2b: Met à jour les imports @lockness/* dans chaque package
for (const member of rootConfig.workspace) {
    const configPath = `${member}/deno.json`
    try {
        const config = JSON.parse(await Deno.readTextFile(configPath))

        if (!config.imports) continue

        let hasUpdates = false

        // Parcourt tous les imports
        for (const [key, value] of Object.entries(config.imports)) {
            // Si c'est un import @lockness/* ou une valeur contenant jsr:@lockness/
            if (
                typeof value === 'string' &&
                (key.startsWith('@lockness/') ||
                    value.includes('jsr:@lockness/'))
            ) {
                // Extrait le pattern de version (^X.X.X ou ~X.X.X)
                const match = value.match(
                    /(jsr:@lockness\/[^@]+)@([\^~])([\d.]+)/,
                )
                if (match) {
                    const [, packagePath, versionPrefix] = match
                    const newImport =
                        `${packagePath}@${versionPrefix}${newVersion}`
                    if (newImport !== value) {
                        config.imports[key] = newImport
                        hasUpdates = true
                    }
                }
            }
        }

        if (hasUpdates) {
            await Deno.writeTextFile(
                configPath,
                JSON.stringify(config, null, 4) + '\n',
            )
            console.log(`   ✅ ${member} - dépendances mises à jour`)
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`   ⚠️  Erreur pour ${member}: ${message}`)
    }
}

console.log('')
console.log('🔧 Mise à jour des fichiers stubs...')

// Étape 3: Met à jour les versions dans les fichiers .stub
const stubFiles = []
for await (const entry of Deno.readDir('packages')) {
    if (entry.isDirectory) {
        const stubsPath = `packages/${entry.name}/stubs`
        try {
            for await (
                const walkEntry of Deno.readDir(stubsPath)
            ) {
                if (walkEntry.isDirectory) {
                    // Parcourt récursivement les sous-dossiers de stubs
                    const walk = async (path: string) => {
                        for await (const file of Deno.readDir(path)) {
                            const fullPath = `${path}/${file.name}`
                            if (file.isDirectory) {
                                await walk(fullPath)
                            } else if (file.name.endsWith('.stub')) {
                                stubFiles.push(fullPath)
                            }
                        }
                    }
                    await walk(`${stubsPath}/${walkEntry.name}`)
                } else if (walkEntry.name.endsWith('.stub')) {
                    stubFiles.push(`${stubsPath}/${walkEntry.name}`)
                }
            }
        } catch {
            // Pas de dossier stubs, on continue
        }
    }
}

for (const stubPath of stubFiles) {
    try {
        let content = await Deno.readTextFile(stubPath)
        const originalContent = content

        // Remplace toutes les versions @lockness/* dans le contenu
        content = content.replace(
            /(jsr:@lockness\/[^@]+)@([\^~])([\d.]+)/g,
            `$1@$2${newVersion}`,
        )

        if (content !== originalContent) {
            await Deno.writeTextFile(stubPath, content)
            console.log(`   ✅ ${stubPath}`)
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`   ⚠️  Erreur pour ${stubPath}: ${message}`)
    }
}

console.log('')
console.log(`✨ Bump terminé ! Tous les packages sont en version ${newVersion}`)
console.log('')
console.log('📝 Prochaines étapes:')
console.log('   1. Vérifier les changements: git diff')
console.log('   2. Tester: deno task test')
console.log('   3. Publier: deno publish')
console.log('')
