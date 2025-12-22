import type { Ace } from '@lockness/ace'

export function registerKyselyCommands(ace: Ace) {
    // Placeholder for Kysely commands (e.g. migrate)
    ace.register('db:test', () => {
        console.log('🛠️ Kysely commands coming soon')
        return Promise.resolve()
    })
}
