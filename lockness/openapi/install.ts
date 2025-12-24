#!/usr/bin/env -S deno run -A
/**
 * OpenAPI Package Installer
 * 
 * Automatically configures the @lockness/openapi package in your project.
 * 
 * Usage:
 *   deno run -A jsr:@lockness/openapi/install
 *   or
 *   deno task ace package:install openapi
 */

import { addPackage } from '../ace/package_loader.ts'
import { join } from '@std/path'

const DOCS_CONTROLLER_TEMPLATE = `import { Controller, Get, type Context } from 'lockness'
import {
    ApiDoc,
    generateOpenAPISpec,
    serveSwaggerUI,
    type ControllerClass,
} from '@lockness/openapi'
import { join } from '@std/path'

async function loadControllers(): Promise<ControllerClass[]> {
    const controllers: ControllerClass[] = []
    const controllersDir = './src/controller'

    try {
        for await (const entry of Deno.readDir(controllersDir)) {
            if (
                entry.isFile &&
                (entry.name.endsWith('_controller.ts') ||
                    entry.name.endsWith('_controller.tsx')) &&
                entry.name !== 'docs_controller.ts' // Skip self
            ) {
                const modulePath = join(controllersDir, entry.name)
                const module = await import(\`file://\${Deno.cwd()}/\${modulePath}\`)

                // Get all exported controllers
                for (const key of Object.keys(module)) {
                    const exported = module[key]
                    if (
                        typeof exported === 'function' &&
                        key.endsWith('Controller')
                    ) {
                        controllers.push(exported as ControllerClass)
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error loading controllers:', error)
    }

    return controllers
}

@Controller('/docs')
export class DocsController {
    @Get('/')
    @ApiDoc({
        summary: 'Swagger UI Documentation',
        description: 'Interactive API documentation interface',
        tags: ['Documentation'],
    })
    async index(c: Context) {
        const controllers = await loadControllers()
        const spec = generateOpenAPISpec(controllers, {
            title: 'Lockness API',
            version: '1.0.0',
            description: 'Full-stack Deno framework API documentation',
        })

        const swagger = serveSwaggerUI(spec)
        return swagger.ui(c)
    }

    @Get('/openapi.json')
    @ApiDoc({
        summary: 'OpenAPI Specification',
        description: 'Returns the OpenAPI 3.0 specification in JSON format',
        tags: ['Documentation'],
        responses: {
            '200': {
                description: 'OpenAPI 3.0 specification',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                        },
                    },
                },
            },
        },
    })
    async spec(c: Context) {
        const controllers = await loadControllers()
        const spec = generateOpenAPISpec(controllers, {
            title: 'Lockness API',
            version: '1.0.0',
            description: 'Full-stack Deno framework API documentation',
        })

        const swagger = serveSwaggerUI(spec)
        return swagger.spec(c)
    }
}
`

async function createDocsController() {
    const controllerPath = './src/controller/docs_controller.ts'

    try {
        await Deno.stat(controllerPath)
        console.log('ℹ️  DocsController already exists, skipping...')
        return false
    } catch {
        // File doesn't exist, create it
        await Deno.writeTextFile(controllerPath, DOCS_CONTROLLER_TEMPLATE)
        console.log('✓ Created src/controller/docs_controller.ts')
        return true
    }
}

async function checkProjectStructure() {
    const checks = [
        { path: './src/controller', name: 'src/controller directory' },
        { path: './deno.json', name: 'deno.json' },
    ]

    for (const check of checks) {
        try {
            await Deno.stat(check.path)
        } catch {
            console.error(`❌ ${check.name} not found. Are you in a Lockness project?`)
            return false
        }
    }
    return true
}

async function main() {
    console.log('🌊 Installing @lockness/openapi...\n')

    // Check if we're in a valid Lockness project
    if (!(await checkProjectStructure())) {
        Deno.exit(1)
    }

    let changesMade = false

    // 1. Add package to deno.json
    try {
        await addPackage('openapi')
        changesMade = true
    } catch (error) {
        console.error('❌ Failed to add package to deno.json:', error)
    }

    // 2. Create DocsController
    const controllerCreated = await createDocsController()
    if (controllerCreated) {
        changesMade = true
    }

    // 3. Check if routes need to be regenerated
    if (controllerCreated) {
        console.log('\n⚠️  Routes need to be regenerated:')
        console.log('   Run: deno task routes:generate')
    }

    // 4. Display success message
    if (changesMade) {
        console.log('\n✅ @lockness/openapi installed successfully!\n')
        console.log('📖 Next steps:')
        console.log('   1. Start your dev server: deno task dev')
        console.log('   2. Visit: http://localhost:8888/docs')
        console.log('   3. Document your routes with @ApiDoc decorator\n')
        console.log('📝 Generate static OpenAPI spec:')
        console.log('   deno task ace docs:generate\n')
        console.log('📚 Documentation:')
        console.log('   https://github.com/locknessland/lockness/tree/main/lockness/openapi\n')
    } else {
        console.log('\n✓ @lockness/openapi is already configured\n')
    }
}

if (import.meta.main) {
    await main()
}
