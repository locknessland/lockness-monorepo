import { type Ace, Stub } from '@lockness/ace'
import { dirname, fromFileUrl, join } from '@std/path'

const currentDir = dirname(fromFileUrl(import.meta.url))
const STUBS_PATH = join(currentDir, 'stubs')

export function registerDrizzleCommands(ace: Ace) {
    ace.register('make:model', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a model name (e.g., User)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}.ts`
        const dirPath = `./src/model`
        const filePath = `${dirPath}/${fileName}`

        try {
            const tableName = name.toLowerCase() + 's'
            const content = await Stub.renderFrom(STUBS_PATH, 'make', 'model', {
                className,
                tableName,
            })

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Model created at ${filePath}`)
        } catch (error) {
            console.error(
                `❌ Failed to create model: ${(error as Error).message}`,
            )
        }
    })

    ace.register('make:repository', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a repository name (e.g., User)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const modelFileName = name.toLowerCase()
        const fileName = `${name.toLowerCase()}_repository.ts`
        const dirPath = `./src/repository`
        const filePath = `${dirPath}/${fileName}`

        try {
            const tableName = name.toLowerCase() + 's'
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'repository',
                {
                    className,
                    modelFileName,
                    tableName,
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Repository created at ${filePath}`)
        } catch (error) {
            console.error(
                `❌ Failed to create repository: ${(error as Error).message}`,
            )
        }
    })

    ace.register('make:migration', async () => {
        console.log('⏳ Generating migrations...')
        const process = new Deno.Command('deno', {
            args: [
                'run',
                '-A',
                '--env-file=.env',
                'npm:drizzle-kit',
                'generate',
            ],
        })
        const { success, stderr } = await process.output()
        if (success) {
            console.log('✅ Migrations generated successfully')
        } else {
            console.error('❌ Failed to generate migrations')
            console.error(new TextDecoder().decode(stderr))
        }
    })

    ace.register('db:generate', async () => {
        const process = new Deno.Command('deno', {
            args: [
                'run',
                '-A',
                '--env-file=.env',
                'npm:drizzle-kit',
                'generate',
            ],
        })
        await process.output()
    })

    ace.register('db:push', async () => {
        console.log('⏳ Pushing schema to database...')
        const process = new Deno.Command('deno', {
            args: ['run', '-A', '--env-file=.env', 'npm:drizzle-kit', 'push'],
        })
        const { success, stderr } = await process.output()
        if (success) {
            console.log('✅ Schema pushed successfully')
        } else {
            console.error('❌ Failed to push schema')
            console.error(new TextDecoder().decode(stderr))
        }
    })

    ace.register('db:studio', async () => {
        console.log('🚀 Starting Drizzle Studio...')
        const process = new Deno.Command('deno', {
            args: ['run', '-A', '--env-file=.env', 'npm:drizzle-kit', 'studio'],
        })
        await process.spawn().status
    })
}
