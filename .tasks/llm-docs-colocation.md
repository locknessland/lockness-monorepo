# Technical Task: LLM Documentation Colocation

## 📋 Task Overview

Déplacer les fichiers `llm.txt` du dossier `public/llms/` vers leurs packages
respectifs pour améliorer la maintenabilité. Quand on modifie un package, on ne
doit pas oublier de mettre à jour sa documentation LLM correspondante. Le
contrôleur sera refactorisé pour charger dynamiquement ces fichiers depuis les
packages.

### Problème actuel

- Les fichiers LLM sont centralisés dans `public/llms/`
- Quand on modifie un package, on oublie souvent de mettre à jour le fichier LLM
- Pas de lien évident entre un package et sa documentation LLM
- Le contrôleur a une méthode par fichier (duplication massive)

### Solution proposée

- Chaque package contient son propre `llm.txt`
- Le contrôleur charge dynamiquement les fichiers depuis les packages
- Les fichiers généraux (lockness, getting-started, etc.) restent dans
  `public/llms/` ou un dossier `docs/llms/`

## 🎯 Objectives

1. **Colocation**: Déplacer chaque fichier LLM dans son package correspondant
2. **Discovery automatique**: Le contrôleur découvre automatiquement les
   fichiers LLM
3. **Simplification**: Réduire le code du contrôleur de ~150 lignes à ~30 lignes
4. **Convention over Configuration**: Utiliser une convention de nommage
   standard
5. **Backward Compatibility**: Maintenir les mêmes URLs `/llms/*.txt`

## 📁 Affected File Paths

### Fichiers LLM à déplacer vers packages

| Fichier actuel                         | Destination                              |
| -------------------------------------- | ---------------------------------------- |
| `public/llms/authentication.txt`       | `packages/auth/llm.txt`                  |
| `public/llms/cli.txt`                  | `packages/cli/llm.txt`                   |
| `public/llms/dependency-injection.txt` | `packages/container/llm.txt`             |
| `public/llms/devtools.txt`             | `packages/devtools/llm.txt`              |
| `public/llms/deprecation.txt`          | `packages/deprecation-contracts/llm.txt` |
| `public/llms/inertia.txt`              | `packages/inertia/llm.txt`               |
| `public/llms/middleware.txt`           | `packages/core/llms/middleware.txt`      |
| `public/llms/routing.txt`              | `packages/core/llms/routing.txt`         |
| `public/llms/error-handling.txt`       | `packages/core/llms/error-handling.txt`  |
| `public/llms/sessions.txt`             | `packages/session/llm.txt`               |
| `public/llms/ui.txt`                   | `packages/ui/llm.txt`                    |
| `public/llms/ui-treeview.txt`          | `packages/ui/llms/treeview.txt`          |
| `public/llms/components.txt`           | `packages/core/llms/components.txt`      |
| `public/llms/validation.txt`           | `packages/validator/llm.txt`             |

### Fichiers LLM généraux (restent centralisés)

Ces fichiers concernent le framework global et non un package spécifique :

```
docs/llms/
├── lockness.txt        # Présentation générale
├── installation.txt    # Guide d'installation
├── getting-started.txt # Guide de démarrage
├── architecture.txt    # Architecture globale
├── models.txt          # Models (lié à Drizzle externe)
├── nessy.txt           # CLI wrapper
├── packages.txt        # Vue d'ensemble des packages
├── testing.txt         # Guide de tests
├── deployment.txt      # Guide de déploiement
├── contribution.txt    # Guide de contribution
└── full.txt            # Documentation complète (générée)
```

### Core Files to Modify

- `app/controller/llm_controller.tsx` - Refactoriser pour discovery dynamique
- `app/service/llm_section_service.ts` - Adapter pour nouvelle structure

### New Files to Create

- `packages/core/llm_loader.ts` - Utilitaire de chargement des fichiers LLM

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: Le contrôleur a une méthode par fichier LLM
- **Solution**: Un service centralisé pour le chargement des fichiers LLM

```typescript
// packages/core/llm_loader.ts
export class LlmLoader {
    private readonly packagePaths: Map<string, string>
    private readonly generalPath: string

    async load(name: string): Promise<string> {
        // Cherche d'abord dans les packages, puis dans docs/llms/
    }

    async discoverAll(): Promise<LlmDocument[]> {
        // Découvre tous les fichiers LLM disponibles
    }
}
```

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Ajouter un fichier LLM = modifier le contrôleur
- **Solution**: Discovery automatique, pas besoin de modifier le code

```typescript
// Convention: packages/{name}/llm.txt -> /llms/{name}.txt
// Convention: packages/{name}/llms/{sub}.txt -> /llms/{name}-{sub}.txt
```

**3. Don't Repeat Yourself (DRY)**

- **Current Problem**: 20+ méthodes quasi-identiques dans le contrôleur
- **Solution**: Une seule méthode dynamique avec paramètre de route

```typescript
@Controller('/llms')
export class LlmController {
    @Inject(LlmLoader)
    accessor loader!: LlmLoader

    @Get('/:name.txt')
    async serve(c: Context) {
        const name = c.req.param('name')
        try {
            const text = await this.loader.load(name)
            return c.text(text)
        } catch {
            return c.notFound()
        }
    }
}
```

## 📋 Implementation Steps

### Phase 1: Create LlmLoader Service

```typescript
// packages/core/llm_loader.ts

interface LlmDocument {
    name: string
    path: string
    description?: string
}

interface LlmLoaderConfig {
    packagesDir: string // 'packages/'
    generalDir: string // 'docs/llms/'
}

@Service()
export class LlmLoader {
    private config: LlmLoaderConfig
    private cache = new Map<string, string>()

    /**
     * Mapping des noms de route vers les chemins de fichiers
     * Ex: 'authentication' -> 'packages/auth/llm.txt'
     * Ex: 'ui-treeview' -> 'packages/ui/llms/treeview.txt'
     */
    private readonly routeToPath: Record<string, string> = {
        // Package-specific (1 package = 1 fichier principal)
        'authentication': 'packages/auth/llm.txt',
        'cli': 'packages/cli/llm.txt',
        'dependency-injection': 'packages/container/llm.txt',
        'devtools': 'packages/devtools/llm.txt',
        'deprecation': 'packages/deprecation-contracts/llm.txt',
        'inertia': 'packages/inertia/llm.txt',
        'sessions': 'packages/session/llm.txt',
        'ui': 'packages/ui/llm.txt',
        'validation': 'packages/validator/llm.txt',

        // Core sub-files (core a plusieurs fichiers)
        'middleware': 'packages/core/llms/middleware.txt',
        'routing': 'packages/core/llms/routing.txt',
        'error-handling': 'packages/core/llms/error-handling.txt',
        'components': 'packages/core/llms/components.txt',

        // UI sub-files
        'ui-treeview': 'packages/ui/llms/treeview.txt',

        // General docs (pas liés à un package)
        'lockness': 'docs/llms/lockness.txt',
        'installation': 'docs/llms/installation.txt',
        'getting-started': 'docs/llms/getting-started.txt',
        'architecture': 'docs/llms/architecture.txt',
        'models': 'docs/llms/models.txt',
        'nessy': 'docs/llms/nessy.txt',
        'packages': 'docs/llms/packages.txt',
        'testing': 'docs/llms/testing.txt',
        'deployment': 'docs/llms/deployment.txt',
        'contribution': 'docs/llms/contribution.txt',
        'full': 'docs/llms/full.txt',
    }

    async load(name: string): Promise<string> {
        // Check cache
        if (this.cache.has(name)) {
            return this.cache.get(name)!
        }

        const path = this.routeToPath[name]
        if (!path) {
            throw new Error(`Unknown LLM document: ${name}`)
        }

        const content = await Deno.readTextFile(path)
        this.cache.set(name, content)
        return content
    }

    clearCache(): void {
        this.cache.clear()
    }

    getAvailableDocuments(): string[] {
        return Object.keys(this.routeToPath)
    }
}
```

### Phase 2: Refactor Controller

```typescript
// app/controller/llm_controller.tsx

import { Context, Controller, Get, Inject } from '@lockness/core'
import { LlmLoader } from '@lockness/core/llm_loader.ts'
import { LlmSectionService } from '@service/llm_section_service.ts'

@Controller('/')
export class LlmsIndexController {
    @Inject(LlmSectionService)
    accessor llmSectionService!: LlmSectionService

    @Get('/llms.txt', { name: 'llms.index' })
    index(c: Context) {
        const text = this.llmSectionService.generateIndexText()
        return c.text(text)
    }
}

@Controller('/llms')
export class LlmController {
    @Inject(LlmLoader)
    accessor loader!: LlmLoader

    @Get('/:name.txt')
    async serve(c: Context) {
        const name = c.req.param('name')

        try {
            const text = await this.loader.load(name)
            return c.text(text)
        } catch {
            return c.notFound()
        }
    }
}
```

### Phase 3: Move Files

Script de migration :

```bash
#!/bin/bash
# scripts/migrate_llm_docs.sh

# Créer les dossiers nécessaires
mkdir -p docs/llms
mkdir -p packages/core/llms
mkdir -p packages/ui/llms

# Déplacer vers packages
mv public/llms/authentication.txt packages/auth/llm.txt
mv public/llms/cli.txt packages/cli/llm.txt
mv public/llms/dependency-injection.txt packages/container/llm.txt
mv public/llms/devtools.txt packages/devtools/llm.txt
mv public/llms/deprecation.txt packages/deprecation-contracts/llm.txt
mv public/llms/inertia.txt packages/inertia/llm.txt
mv public/llms/sessions.txt packages/session/llm.txt
mv public/llms/ui.txt packages/ui/llm.txt
mv public/llms/validation.txt packages/validator/llm.txt

# Déplacer vers packages/core/llms/
mv public/llms/middleware.txt packages/core/llms/middleware.txt
mv public/llms/routing.txt packages/core/llms/routing.txt
mv public/llms/error-handling.txt packages/core/llms/error-handling.txt
mv public/llms/components.txt packages/core/llms/components.txt

# Déplacer vers packages/ui/llms/
mv public/llms/ui-treeview.txt packages/ui/llms/treeview.txt

# Déplacer les fichiers généraux
mv public/llms/lockness.txt docs/llms/
mv public/llms/installation.txt docs/llms/
mv public/llms/getting-started.txt docs/llms/
mv public/llms/architecture.txt docs/llms/
mv public/llms/models.txt docs/llms/
mv public/llms/nessy.txt docs/llms/
mv public/llms/packages.txt docs/llms/
mv public/llms/testing.txt docs/llms/
mv public/llms/deployment.txt docs/llms/
mv public/llms/contribution.txt docs/llms/
mv public/llms/full.txt docs/llms/

# Supprimer le dossier vide
rmdir public/llms
```

### Phase 4: Update LlmSectionService

```typescript
// app/service/llm_section_service.ts

@Service()
export class LlmSectionService {
    @Inject(LlmLoader)
    accessor loader!: LlmLoader

    getAllSections(): LlmSection[] {
        return this.loader.getAvailableDocuments().map((name) => ({
            name,
            description: this.getDescription(name),
        }))
    }

    private getDescription(name: string): string {
        const descriptions: Record<string, string> = {
            'lockness': 'Core principles and philosophy',
            'authentication': 'Session-based authentication system',
            'cli': 'CLI command reference',
            // ... etc
        }
        return descriptions[name] ?? `Documentation for ${name}`
    }
}
```

## ✅ Acceptance Criteria

1. [ ] Toutes les URLs `/llms/*.txt` existantes fonctionnent toujours
2. [ ] Chaque package a son fichier `llm.txt` colocalisé
3. [ ] Le contrôleur utilise le chargement dynamique
4. [ ] Ajouter un nouveau fichier LLM ne nécessite que :
   - Créer le fichier dans le package
   - Ajouter l'entrée dans `routeToPath`
5. [ ] Tests unitaires pour `LlmLoader`
6. [ ] Test de validation de structure des packages (llm.txt, README.md, mod.ts)
7. [ ] Documentation mise à jour

## 🧪 Testing Requirements

### Test de validation de la structure des packages

Ce test à la racine du projet vérifie que chaque package du monorepo possède les
fichiers requis : `llm.txt`, `README.md` et `mod.ts`. Il échoue en CI si un
package ne respecte pas la structure standard.

```typescript
// tests/package_structure.test.ts

import { assert, assertEquals } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

/**
 * Required files for each package
 */
const REQUIRED_FILES = {
    'llm.txt': {
        description: 'LLM documentation file',
        minLength: 100,
    },
    'README.md': {
        description: 'Package documentation',
        minLength: 50,
    },
    'mod.ts': {
        description: 'Package entry point',
        minLength: 10,
    },
} as const

type RequiredFile = keyof typeof REQUIRED_FILES

/**
 * All packages in the monorepo that should have standard structure
 */
const PACKAGES: string[] = [
    'auth',
    'auth-provider',
    'cache',
    'cli',
    'container',
    'core',
    'deprecation-contracts',
    'devtools',
    'drizzle',
    'events',
    'hono',
    'inertia',
    'init',
    'logger',
    'mail',
    'openapi',
    'queue',
    'session',
    'socialite',
    'sse',
    'storage',
    'ui',
    'upgrade',
    'validator',
]

/**
 * Packages exempted from certain file requirements
 * Key: package name, Value: array of files to exempt
 */
const EXEMPTIONS: Record<string, RequiredFile[]> = {
    // Example: 'some-package': ['llm.txt'], // Package doesn't need LLM doc
}

// =============================================================================
// Test: All packages should have required files
// =============================================================================

Deno.test('Package Structure - all packages should have llm.txt', async (t) => {
    const missing: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('llm.txt')) continue

        await t.step(`checking ${pkg}/llm.txt`, async () => {
            const filePath = join('packages', pkg, 'llm.txt')
            const hasFile = await exists(filePath)

            if (!hasFile) missing.push(pkg)

            assert(hasFile, `Package "${pkg}" is missing llm.txt`)
        })
    }

    assertEquals(missing.length, 0, `Missing llm.txt: ${missing.join(', ')}`)
})

Deno.test('Package Structure - all packages should have README.md', async (t) => {
    const missing: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('README.md')) continue

        await t.step(`checking ${pkg}/README.md`, async () => {
            const filePath = join('packages', pkg, 'README.md')
            const hasFile = await exists(filePath)

            if (!hasFile) missing.push(pkg)

            assert(hasFile, `Package "${pkg}" is missing README.md`)
        })
    }

    assertEquals(missing.length, 0, `Missing README.md: ${missing.join(', ')}`)
})

Deno.test('Package Structure - all packages should have mod.ts', async (t) => {
    const missing: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('mod.ts')) continue

        await t.step(`checking ${pkg}/mod.ts`, async () => {
            const filePath = join('packages', pkg, 'mod.ts')
            const hasFile = await exists(filePath)

            if (!hasFile) missing.push(pkg)

            assert(hasFile, `Package "${pkg}" is missing mod.ts`)
        })
    }

    assertEquals(missing.length, 0, `Missing mod.ts: ${missing.join(', ')}`)
})

// =============================================================================
// Test: Files should not be empty
// =============================================================================

Deno.test('Package Structure - llm.txt files should not be empty', async (t) => {
    const tooShort: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('llm.txt')) continue

        await t.step(`checking ${pkg}/llm.txt content`, async () => {
            const filePath = join('packages', pkg, 'llm.txt')

            if (await exists(filePath)) {
                const content = await Deno.readTextFile(filePath)
                const minLength = REQUIRED_FILES['llm.txt'].minLength

                if (content.trim().length < minLength) {
                    tooShort.push(pkg)
                }

                assert(
                    content.trim().length >= minLength,
                    `Package "${pkg}" llm.txt is too short (${content.trim().length} chars, min ${minLength})`,
                )
            }
        })
    }
})

Deno.test('Package Structure - README.md files should not be empty', async (t) => {
    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('README.md')) continue

        await t.step(`checking ${pkg}/README.md content`, async () => {
            const filePath = join('packages', pkg, 'README.md')

            if (await exists(filePath)) {
                const content = await Deno.readTextFile(filePath)
                const minLength = REQUIRED_FILES['README.md'].minLength

                assert(
                    content.trim().length >= minLength,
                    `Package "${pkg}" README.md is too short (${content.trim().length} chars, min ${minLength})`,
                )
            }
        })
    }
})

Deno.test('Package Structure - mod.ts should export something', async (t) => {
    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('mod.ts')) continue

        await t.step(`checking ${pkg}/mod.ts exports`, async () => {
            const filePath = join('packages', pkg, 'mod.ts')

            if (await exists(filePath)) {
                const content = await Deno.readTextFile(filePath)

                assert(
                    content.includes('export'),
                    `Package "${pkg}" mod.ts should contain exports`,
                )
            }
        })
    }
})

// =============================================================================
// Test: Detect new packages not in the list
// =============================================================================

Deno.test('Package Structure - detect unconfigured packages', async () => {
    const knownPackages = new Set(PACKAGES)
    const unconfigured: string[] = []

    for await (const entry of Deno.readDir('packages')) {
        if (entry.isDirectory && !entry.name.startsWith('.')) {
            const denoJsonPath = join('packages', entry.name, 'deno.json')
            const isPackage = await exists(denoJsonPath)

            if (isPackage && !knownPackages.has(entry.name)) {
                unconfigured.push(entry.name)
            }
        }
    }

    assertEquals(
        unconfigured.length,
        0,
        `New packages not in PACKAGES list: ${unconfigured.join(', ')}. ` +
            `Add them to tests/package_structure.test.ts`,
    )
})

// =============================================================================
// Test: Summary report
// =============================================================================

Deno.test('Package Structure - generate summary report', async () => {
    const report: Record<
        string,
        { llm: boolean; readme: boolean; mod: boolean }
    > = {}

    for (const pkg of PACKAGES) {
        report[pkg] = {
            llm: await exists(join('packages', pkg, 'llm.txt')),
            readme: await exists(join('packages', pkg, 'README.md')),
            mod: await exists(join('packages', pkg, 'mod.ts')),
        }
    }

    // Log summary
    console.log('\n📦 Package Structure Summary:')
    console.log('─'.repeat(50))

    const complete: string[] = []
    const incomplete: string[] = []

    for (const [pkg, status] of Object.entries(report)) {
        const isComplete = status.llm && status.readme && status.mod
        const icons = [
            status.llm ? '✓' : '✗',
            status.readme ? '✓' : '✗',
            status.mod ? '✓' : '✗',
        ]

        if (isComplete) {
            complete.push(pkg)
        } else {
            incomplete.push(pkg)
            console.log(
                `  ${pkg}: llm=${icons[0]} readme=${icons[1]} mod=${icons[2]}`,
            )
        }
    }

    console.log('─'.repeat(50))
    console.log(`Complete: ${complete.length}/${PACKAGES.length}`)

    if (incomplete.length > 0) {
        console.log(`Incomplete: ${incomplete.join(', ')}`)
    }
})
```

### New Files to Create

- `tests/package_structure.test.ts` - Test de validation de la structure des
  packages (llm.txt, README.md, mod.ts)

### Tests pour LlmLoader

```typescript
// packages/core/tests/llm_loader.test.ts

Deno.test('LlmLoader - should load package llm.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('cli')
    assert(content.includes('CLI'))
})

Deno.test('LlmLoader - should load general llm.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('lockness')
    assert(content.includes('Lockness'))
})

Deno.test('LlmLoader - should throw for unknown doc', async () => {
    const loader = new LlmLoader()
    await assertRejects(() => loader.load('unknown'))
})

Deno.test('LlmLoader - should cache loaded content', async () => {
    const loader = new LlmLoader()
    await loader.load('cli')
    // Second call should use cache
    await loader.load('cli')
})
```

## 📊 Benefits

| Aspect         | Avant                         | Après                          |
| -------------- | ----------------------------- | ------------------------------ |
| Maintenabilité | Fichiers séparés du code      | Fichiers colocalisés           |
| Code           | ~150 lignes de contrôleur     | ~30 lignes                     |
| Ajout de doc   | Modifier contrôleur + service | Créer fichier + 1 ligne config |
| Oubli de MàJ   | Fréquent                      | Difficile (même dossier)       |
| Discovery      | Manuel                        | Automatique                    |

## 🔄 Migration Path

1. **Étape 1**: Créer `LlmLoader` sans modifier l'existant
2. **Étape 2**: Migrer le contrôleur pour utiliser `LlmLoader`
3. **Étape 3**: Exécuter le script de migration des fichiers
4. **Étape 4**: Supprimer `public/llms/`
5. **Étape 5**: Mettre à jour la documentation

## 📝 Future Enhancements

- **Auto-discovery**: Scanner automatiquement les packages pour les fichiers
  `llm.txt`
- **Validation**: Vérifier que chaque package a sa documentation LLM
- **Generation**: Générer `full.txt` à partir de tous les fichiers LLM
- **Hot reload**: Recharger les fichiers en mode dev sans redémarrer
