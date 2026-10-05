/**
 * @fileoverview The `make:action` scaffolding command.
 *
 * Appends an action method to an existing controller.
 *
 * @module @lockness/cli/commands/make/action
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import {
    CommandFailedError,
    type CommandStep,
    runSteps,
} from '../../command_failure.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:action` command definition.
 *
 * Appends an action method to an existing controller. With `--view`, the view
 * is written first; one that already exists is the user's and is kept, never
 * overwritten. A view that fails to write does not stop the action: it is
 * added without rendering a view, then the command fails naming the `view`
 * step (#436, P1).
 *
 * @throws {CommandFailedError} When an argument is missing or invalid, the
 * controller does not exist, it has no class closing brace, or a step failed
 * (`<n> of <m> steps failed: <labels>`, the first failure as its cause). A
 * failed controller read other than a missing file is not caught: it reaches
 * `Cli.dispatch()`, which prints it with its frames.
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

        // Find the last closing brace of the class before anything is
        // written: a controller the action cannot go into gets no view.
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

        const viewClassName = `${className}${
            actionName.charAt(0).toUpperCase() + actionName.slice(1)
        }`

        const steps: CommandStep[] = []
        let viewAvailable = false
        if (withView) {
            steps.push({
                label: 'view',
                run: async () => {
                    const viewFileName =
                        `${controllerName.toLowerCase()}/${actionName.toLowerCase()}`
                    const viewDirPath =
                        `./app/view/pages/${controllerName.toLowerCase()}`
                    const viewFilePath =
                        `${viewDirPath}/${actionName.toLowerCase()}.tsx`

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
                    try {
                        await Deno.writeTextFile(viewFilePath, viewContent, {
                            createNew: true,
                        })
                        console.log(`✅ View created at ${viewFilePath}`)
                    } catch (error) {
                        // Only an existing view FILE is expected: it is the
                        // user's, so it is kept. Anything else fails the step.
                        if (!(error instanceof Deno.errors.AlreadyExists)) {
                            throw error
                        }
                        if (!(await Deno.stat(viewFilePath)).isFile) throw error
                        console.log(
                            `ℹ️  View already exists at ${viewFilePath}, kept as is`,
                        )
                    }
                    viewAvailable = true
                },
            })
        }

        steps.push({
            label: 'action',
            run: async () => {
                // Without its view, the action renders none.
                const actionContent = await Stub.renderFrom(
                    STUBS_PATH,
                    'make',
                    `action-${method}`,
                    {
                        path,
                        routeName,
                        methodName: actionName,
                        body: actionBody(
                            viewAvailable ? viewClassName : undefined,
                            actionName,
                            className,
                        ),
                    },
                )

                // Insert the new method before the last brace
                let finalContent = [
                    ...lines.slice(0, lastBraceIndex),
                    actionContent,
                    ...lines.slice(lastBraceIndex),
                ].join('\n')

                // Add import for the decorator if needed
                const decoratorImports = [
                    'Get',
                    'Post',
                    'Put',
                    'Delete',
                    'Patch',
                ]
                const decoratorName = method.charAt(0).toUpperCase() +
                    method.slice(1)

                if (
                    !controllerContent.includes(decoratorName) &&
                    decoratorImports.includes(decoratorName)
                ) {
                    finalContent = finalContent.replace(
                        /import\s*{([^}]+)}\s*from\s*['"]lockness['"]/,
                        (_match, imports) => {
                            const importList = imports.split(',').map((
                                i: string,
                            ) => i.trim())
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
                if (viewAvailable) {
                    const viewImport =
                        `import { ${viewClassName} } from '@view/pages/${controllerName.toLowerCase()}/${actionName.toLowerCase()}.tsx'\n`
                    finalContent = finalContent.replace(
                        /(import\s*{[^}]+}\s*from\s*['"]lockness['"])/,
                        `$1\n${viewImport}`,
                    )
                }

                await Deno.writeTextFile(controllerPath, finalContent)
                console.log(
                    `✅ Action '${actionName}' added to ${controllerPath}`,
                )
                console.log(
                    `   Route: ${method.toUpperCase()} ${path} → ${routeName}`,
                )
            },
        })

        await runSteps(steps)
    },
}

/**
 * The body of the generated action method.
 *
 * @param viewClassName - The view to render, or `undefined` for none.
 * @param actionName - The action's method name.
 * @param className - The controller's class name, without `Controller`.
 * @returns The method body, indented for the action stub.
 */
function actionBody(
    viewClassName: string | undefined,
    actionName: string,
    className: string,
): string {
    if (viewClassName) return `return c.html(<${viewClassName} />)`
    if (
        actionName === 'show' || actionName === 'edit' ||
        actionName === 'update' || actionName === 'destroy'
    ) {
        return `const id = c.req.param('id')\n        return c.json({ message: '${actionName} ${className} ' + id })`
    }
    if (actionName === 'store') {
        return `const body = await c.req.json()\n        return c.json({ message: '${className} ${actionName}d', data: body })`
    }
    return `return c.json({ message: '${actionName} from ${className}Controller' })`
}
