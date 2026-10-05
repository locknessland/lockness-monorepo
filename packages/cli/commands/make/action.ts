/**
 * @fileoverview The `make:action` scaffolding command.
 *
 * Appends an action method to an existing controller.
 *
 * @module @lockness/cli/commands/make/action
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { CommandFailedError } from '../../command_failure.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:action` command definition.
 *
 * Appends an action method to an existing controller.
 *
 * @throws {CommandFailedError} When an argument is missing or invalid, the
 * controller does not exist, or it has no class closing brace. Any other
 * failed read or write is not caught: it reaches `Cli.dispatch()`, which
 * prints it with its frames.
 */
export const makeAction: MakeCommand = {
    name: 'make:action',
    description: 'Add a new action (method) to an existing controller',
    handler: async (args) => {
        const controllerName = args[0]
        const actionName = args[1]

        if (!controllerName || !actionName) {
            throw new CommandFailedError(
                'Usage: make:action <ControllerName> <actionName> [--method=get|post|put|delete|patch] [--view] (e.g., make:action User show)',
            )
        }

        // Parse options
        const methodArg = args.find((arg) => arg.startsWith('--method='))
        const method = methodArg ? methodArg.split('=')[1].toLowerCase() : 'get'
        const withView = args.includes('--view')

        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            throw new CommandFailedError(
                'Invalid method. Use: get, post, put, delete, or patch',
            )
        }

        const className = controllerName.charAt(0).toUpperCase() +
            controllerName.slice(1)
        const controllerFileName =
            `${controllerName.toLowerCase()}_controller.tsx`
        const controllerPath = `./app/controller/${controllerFileName}`

        let controllerContent: string
        try {
            controllerContent = await Deno.readTextFile(controllerPath)
        } catch (error) {
            // Only a missing controller is expected; anything else propagates.
            if (!(error instanceof Deno.errors.NotFound)) throw error
            throw new CommandFailedError(
                `Controller not found: ${controllerPath}. Create it first with: make:controller ${className}`,
            )
        }

        // Determine route path and name based on RESTful conventions
        const route = controllerName.toLowerCase()
        let path = '/'
        const routeName = `${route}.${actionName}`

        // RESTful path patterns
        const restfulPaths: Record<string, string> = {
            'index': '/',
            'create': '/create',
            'store': '/',
            'show': '/:id',
            'edit': '/:id/edit',
            'update': '/:id',
            'destroy': '/:id',
        }

        if (restfulPaths[actionName]) {
            path = restfulPaths[actionName]
        } else {
            path = `/${actionName}`
        }

        // Generate method body
        let body = ''
        if (withView) {
            // Create view if it doesn't exist
            const viewClassName = `${className}${
                actionName.charAt(0).toUpperCase() + actionName.slice(1)
            }`
            const viewFileName =
                `${controllerName.toLowerCase()}/${actionName.toLowerCase()}`
            const viewDirPath =
                `./app/view/pages/${controllerName.toLowerCase()}`
            const viewFilePath =
                `${viewDirPath}/${actionName.toLowerCase()}.tsx`

            try {
                await Deno.mkdir(viewDirPath, { recursive: true })
                const viewContent = await Stub.renderFrom(
                    STUBS_PATH,
                    'make',
                    'view',
                    {
                        className: viewClassName,
                        fileName: viewFileName,
                    },
                )
                await Deno.writeTextFile(viewFilePath, viewContent)
                console.log(`✅ View created at ${viewFilePath}`)
            } catch {
                // View already exists or failed to create
            }

            body = `return c.html(<${viewClassName} />)`
        } else if (
            actionName === 'show' || actionName === 'edit' ||
            actionName === 'update' || actionName === 'destroy'
        ) {
            body =
                `const id = c.req.param('id')\n        return c.json({ message: '${actionName} ${className} ' + id })`
        } else if (actionName === 'store' || actionName === 'update') {
            body =
                `const body = await c.req.json()\n        return c.json({ message: '${className} ${actionName}d', data: body })`
        } else {
            body =
                `return c.json({ message: '${actionName} from ${className}Controller' })`
        }

        // Generate the action method
        const actionContent = await Stub.renderFrom(
            STUBS_PATH,
            'make',
            `action-${method}`,
            {
                path,
                routeName,
                methodName: actionName,
                body,
            },
        )

        // Find the last closing brace of the class
        const lines = controllerContent.split('\n')
        let lastBraceIndex = -1
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim() === '}') {
                lastBraceIndex = i
                break
            }
        }

        if (lastBraceIndex === -1) {
            throw new CommandFailedError(
                `Could not find the class closing brace in ${controllerPath}`,
            )
        }

        // Insert the new method before the last brace
        lines.splice(lastBraceIndex, 0, actionContent)
        const newContent = lines.join('\n')

        // Add import for the decorator if needed
        let finalContent = newContent
        const decoratorImports = ['Get', 'Post', 'Put', 'Delete', 'Patch']
        const decoratorName = method.charAt(0).toUpperCase() +
            method.slice(1)

        if (
            !controllerContent.includes(decoratorName) &&
            decoratorImports.includes(decoratorName)
        ) {
            // Add to imports
            finalContent = finalContent.replace(
                /import\s*{([^}]+)}\s*from\s*['"]lockness['"]/,
                (_match, imports) => {
                    const importList = imports.split(',').map((i: string) =>
                        i.trim()
                    )
                    if (!importList.includes(decoratorName)) {
                        importList.push(decoratorName)
                    }
                    return `import { ${
                        importList.join(', ')
                    } } from 'lockness/core'`
                },
            )
        }

        // Add view import if needed
        if (withView) {
            const viewClassName = `${className}${
                actionName.charAt(0).toUpperCase() + actionName.slice(1)
            }`
            const viewImport =
                `import { ${viewClassName} } from '@view/pages/${controllerName.toLowerCase()}/${actionName.toLowerCase()}.tsx'\n`

            // Add after the lockness import
            finalContent = finalContent.replace(
                /(import\s*{[^}]+}\s*from\s*['"]lockness['"])/,
                `$1\n${viewImport}`,
            )
        }

        await Deno.writeTextFile(controllerPath, finalContent)
        console.log(`✅ Action '${actionName}' added to ${controllerPath}`)
        console.log(
            `   Route: ${method.toUpperCase()} ${path} → ${routeName}`,
        )
    },
}
