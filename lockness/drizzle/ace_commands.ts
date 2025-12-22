import type { Ace } from '@lockness/ace'

export function registerDrizzleCommands(ace: Ace) {
    ace.register('db:generate', async () => {
        console.log('📦 Generating migrations...')
        const command = new Deno.Command('deno', {
            args: ['run', '-A', 'npm:drizzle-kit', 'generate'],
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const { code } = await command.output()
        if (code === 0) {
            console.log('✅ Migrations generated successfully')
        } else {
            console.error('❌ Failed to generate migrations')
        }
    })

    ace.register('db:migrate', async () => {
        console.log('🚀 Running migrations...')
        const command = new Deno.Command('deno', {
            args: ['run', '-A', 'npm:drizzle-kit', 'migrate'],
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const { code } = await command.output()
        if (code === 0) {
            console.log('✅ Migrations applied successfully')
        } else {
            console.error('❌ Failed to apply migrations')
        }
    })

    ace.register('db:push', async () => {
        console.log('🔄 Pushing schema to database...')
        const command = new Deno.Command('deno', {
            args: ['run', '-A', 'npm:drizzle-kit', 'push'],
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const { code } = await command.output()
        if (code === 0) {
            console.log('✅ Schema pushed successfully')
        } else {
            console.error('❌ Failed to push schema')
        }
    })

    ace.register('db:studio', async () => {
        console.log('🎨 Starting Drizzle Studio...')
        const command = new Deno.Command('deno', {
            args: ['run', '-A', 'npm:drizzle-kit', 'studio'],
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const { code } = await command.output()
        if (code !== 0) {
            console.error('❌ Failed to start Drizzle Studio')
        }
    })
}
