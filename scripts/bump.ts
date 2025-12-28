// scripts/bump.ts
const newVersion = Deno.args[0]
if (!newVersion) {
    console.error('❌ Merci de spécifier une version. Ex: deno task bump 0.2.0')
    Deno.exit(1)
}

console.log(`🚀 Mise à jour vers la version ${newVersion}`)
console.log('')

// Lit la configuration racine pour trouver les membres
const rootConfig = JSON.parse(await Deno.readTextFile('./deno.json'))

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

// Étape 2: Met à jour les imports @lockness/* dans chaque package
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
        console.warn(`   ⚠️  Erreur pour ${member}: ${error.message}`)
    }
}

console.log('')
console.log(`✨ Bump terminé ! Tous les packages sont en version ${newVersion}`)
console.log('')
console.log('📝 Prochaines étapes:')
console.log('   1. Vérifier les changements: git diff')
console.log('   2. Tester: deno task test')
console.log('   3. Publier: deno publish --allow-dirty')
console.log('')
