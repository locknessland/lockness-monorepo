/**
 * @fileoverview The `make:crud` scaffolding command.
 *
 * Scaffolds a full CRUD resource (model, repository, service, controller, views).
 *
 * @module @lockness/cli/commands/make/crud
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { CommandFailedError, runSteps } from '../../command_failure.ts'
import { join } from '@std/path'
import { DRIZZLE_STUBS_PATH, STUBS_PATH } from './stub_paths.ts'
import { refreshRoutesRegistry } from './routes_registry.ts'

/**
 * The `make:crud` command definition.
 *
 * Scaffolds a full CRUD resource (model, repository, service, controller, views).
 * Each file is one step: a file that fails to write does not stop the others,
 * and the command then fails naming the steps that failed (#436, P1).
 *
 * @throws {CommandFailedError} When no name is given, or when a step failed
 *   (`<n> of 6 steps failed: <labels>`, the first failure as its cause).
 */
export const makeCrud: MakeCommand = {
    name: 'make:crud',
    description:
        'Scaffold complete CRUD (model, repository, service, controller, views)',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            throw new CommandFailedError(
                'Please provide a resource name (e.g., Post)',
            )
        }

        // Naming conventions (same as make:model)
        const modelName = name.charAt(0).toUpperCase() + name.slice(1) // Post
        const tableName = name.toLowerCase() + 's' // posts
        const fileName = name.toLowerCase() // post
        const route = tableName // posts
        const repositoryName = `${modelName}Repository`

        const modelPath = `./app/model/${fileName}.ts`
        const repoPath = `./app/repository/${fileName}_repository.ts`
        const servicePath = `./app/service/${fileName}_service.ts`
        const controllerPath = `./app/controller/${fileName}_controller.tsx`
        const viewsDir = `./app/view/pages/${fileName}`

        console.log(`\n🚀 Generating CRUD for ${modelName}...\n`)

        /** Render a `make` view stub into `<viewsDir>/<page>.tsx`. */
        const writeView = async (page: string, className: string) => {
            const viewPath = `${viewsDir}/${page}.tsx`
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'view',
                { className, fileName: page },
            )
            await Deno.mkdir(viewsDir, { recursive: true })
            await Deno.writeTextFile(viewPath, content)
            console.log(`✅ View: ${viewPath}`)
        }

        await runSteps([
            {
                label: 'model',
                run: async () => {
                    const modelStubContent = await Deno.readTextFile(
                        join(DRIZZLE_STUBS_PATH, 'model.stub'),
                    )
                    const modelContent = modelStubContent
                        .replace(/\{\{ModelName\}\}/g, modelName)
                        .replace(/\{\{tableName\}\}/g, tableName)

                    await Deno.mkdir('./app/model', { recursive: true })
                    await Deno.writeTextFile(modelPath, modelContent)
                    console.log(`✅ Model: ${modelPath}`)
                },
            },
            {
                label: 'repository',
                run: async () => {
                    const repoStubContent = await Deno.readTextFile(
                        join(DRIZZLE_STUBS_PATH, 'repository.stub'),
                    )
                    const repoContent = repoStubContent
                        .replace(/\{\{ModelName\}\}/g, modelName)
                        .replace(/\{\{tableName\}\}/g, tableName)
                        .replace(/\{\{fileName\}\}/g, fileName)
                        .replace(/\{\{RepositoryName\}\}/g, repositoryName)

                    await Deno.mkdir('./app/repository', { recursive: true })
                    await Deno.writeTextFile(repoPath, repoContent)
                    console.log(`✅ Repository: ${repoPath}`)
                },
            },
            {
                label: 'service',
                run: async () => {
                    const serviceContent = await Stub.renderFrom(
                        STUBS_PATH,
                        'make',
                        'service',
                        { className: `${modelName}Service` },
                    )
                    await Deno.mkdir('./app/service', { recursive: true })
                    await Deno.writeTextFile(servicePath, serviceContent)
                    console.log(`✅ Service: ${servicePath}`)
                },
            },
            {
                label: 'controller',
                run: async () => {
                    const controllerContent = await Stub.renderFrom(
                        STUBS_PATH,
                        'make',
                        'controller',
                        // The stub appends `Controller` itself.
                        { className: modelName, route },
                    )
                    await Deno.mkdir('./app/controller', { recursive: true })
                    await Deno.writeTextFile(controllerPath, controllerContent)
                    console.log(`✅ Controller: ${controllerPath}`)

                    // Auto-regenerate routes.ts for production builds
                    await refreshRoutesRegistry()
                },
            },
            {
                label: 'index view',
                run: () => writeView('index', `${modelName}Index`),
            },
            {
                label: 'show view',
                run: () => writeView('show', `${modelName}Show`),
            },
        ])

        console.log(`\n🎉 CRUD scaffolding complete!\n`)
        console.log(`💡 Next steps:`)
        console.log(`   1. Define schema in ${modelPath}`)
        console.log(
            `   2. Implement methods in ${repoPath} and ${servicePath}`,
        )
        console.log(`   3. Add routes in app/kernel.ts:`)
        console.log(`      app.route('/${route}', ${modelName}Controller)`)
        console.log(
            `   4. Run "deno task db:generate" to create migrations`,
        )
    },
}
