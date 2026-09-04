/**
 * @fileoverview The `make:crud` scaffolding command.
 *
 * Scaffolds a full CRUD resource (model, repository, service, controller, views).
 *
 * @module @lockness/cli/commands/make/crud
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../mod.ts'
import { join } from '@std/path'
import { DRIZZLE_STUBS_PATH, STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:crud` command definition.
 *
 * Scaffolds a full CRUD resource (model, repository, service, controller, views).
 */
export const makeCrud: MakeCommand = {
    name: 'make:crud',
    description:
        'Scaffold complete CRUD (model, repository, service, controller, views)',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a resource name (e.g., Post)')
            return
        }

        // Naming conventions (same as make:model)
        const modelName = name.charAt(0).toUpperCase() + name.slice(1) // Post
        const tableName = name.toLowerCase() + 's' // posts
        const fileName = name.toLowerCase() // post
        const route = tableName // posts
        const repositoryName = `${modelName}Repository`

        console.log(`\n🚀 Generating CRUD for ${modelName}...\n`)

        const files = []

        try {
            // 1. Model (using drizzle stub)
            const modelPath = `./app/model/${fileName}.ts`
            const modelStubContent = await Deno.readTextFile(
                join(DRIZZLE_STUBS_PATH, 'model.stub'),
            )
            const modelContent = modelStubContent
                .replace(/\{\{ModelName\}\}/g, modelName)
                .replace(/\{\{tableName\}\}/g, tableName)

            await Deno.mkdir('./app/model', { recursive: true })
            await Deno.writeTextFile(modelPath, modelContent)
            files.push(`✅ Model: ${modelPath}`)

            // 2. Repository (using drizzle stub)
            const repoPath = `./app/repository/${fileName}_repository.ts`
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
            files.push(`✅ Repository: ${repoPath}`)

            // 3. Service (using cli stub)
            const servicePath = `./app/service/${fileName}_service.ts`
            const serviceContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'service',
                { className: `${modelName}Service` },
            )
            await Deno.mkdir('./app/service', { recursive: true })
            await Deno.writeTextFile(servicePath, serviceContent)
            files.push(`✅ Service: ${servicePath}`)

            // 4. Controller (using cli stub)
            const controllerPath = `./app/controller/${fileName}_controller.tsx`
            const controllerContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'controller',
                {
                    className: `${modelName}Controller`,
                    route: route,
                },
            )
            await Deno.mkdir('./app/controller', { recursive: true })
            await Deno.writeTextFile(controllerPath, controllerContent)
            files.push(`✅ Controller: ${controllerPath}`)

            // 5. Views (index, show)
            const viewsDir = `./app/view/pages/${fileName}`
            await Deno.mkdir(viewsDir, { recursive: true })

            const indexPath = `${viewsDir}/index.tsx`
            const indexContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'view',
                {
                    className: `${modelName}Index`,
                    fileName: 'index',
                },
            )
            await Deno.writeTextFile(indexPath, indexContent)
            files.push(`✅ View: ${indexPath}`)

            const showPath = `${viewsDir}/show.tsx`
            const showContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'view',
                {
                    className: `${modelName}Show`,
                    fileName: 'show',
                },
            )
            await Deno.writeTextFile(showPath, showContent)
            files.push(`✅ View: ${showPath}`)

            console.log(files.join('\n'))
            console.log(`\n🎉 CRUD scaffolding complete!\n`)
            console.log(`💡 Next steps:`)
            console.log(`   1. Define schema in ${modelPath}`)
            console.log(
                `   2. Implement methods in ${repoPath} and ${servicePath}`,
            )
            console.log(`   3. Add routes in app/kernel.tsx:`)
            console.log(`      app.route('/${route}', ${modelName}Controller)`)
            console.log(
                `   4. Run "deno task db:generate" to create migrations`,
            )
            console.log(
                `   5. Run "deno task routes:generate" to update routes registry\n`,
            )

            // Auto-regenerate routes.ts for production builds
            try {
                const { generateRoutesFile } = await import(
                    '@lockness/contract'
                )
                await generateRoutesFile('./app/controller', './app/routes.ts')
                console.log('✅ Routes registry updated')
            } catch {
                // Silently fail, user can run manually
            }
        } catch (error) {
            console.error(
                `\n❌ Failed to generate CRUD: ${(error as Error).message}`,
            )
        }
    },
}
