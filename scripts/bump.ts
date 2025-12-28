// scripts/bump.ts
const newVersion = Deno.args[0];
if (!newVersion) {
    console.error("❌ Merci de spécifier une version. Ex: deno task bump 0.2.0");
    Deno.exit(1);
}

// Lit la configuration racine pour trouver les membres
const rootConfig = JSON.parse(await Deno.readTextFile("./deno.json"));

for (const member of rootConfig.workspace) {
    const configPath = `${member}/deno.json`;
    try {
        const config = JSON.parse(await Deno.readTextFile(configPath));
        config.version = newVersion;
        // Réécrit le fichier en gardant le formatage
        await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
        console.log(`✅ ${member} passé en version ${newVersion}`);
    } catch {
        console.warn(`⚠️  Pas de deno.json trouvé pour ${member}`);
    }
}