/**
 * @fileoverview Authentication scaffolding commands.
 *
 * Provides the make:auth command to scaffold authentication system
 * including controllers and providers.
 *
 * @module @lockness/cli/commands/auth
 */

import { type Cli, Stub } from '../mod.ts'
import { dirname, fromFileUrl, join } from '@std/path'

/**
 * Path to CLI stubs directory.
 * @internal
 */
let STUBS_PATH: string

if (import.meta.url.startsWith('file://')) {
    const currentDir = dirname(fromFileUrl(import.meta.url))
    STUBS_PATH = join(currentDir, '..', 'stubs')
} else {
    // When running from JSR, use relative URLs
    STUBS_PATH = new URL('../stubs', import.meta.url).href
}

/**
 * Register authentication scaffolding commands.
 *
 * Commands registered:
 * - make:auth - Scaffold authentication system (controller + provider)
 *   - Use --social flag to include OAuth provider support
 *
 * @param cli - The CLI instance to register commands on
 *
 * @example
 * ```bash
 * # Basic auth scaffolding
 * deno task cli make:auth
 *
 * # With OAuth support
 * deno task cli make:auth --social
 * ```
 */
export function registerAuthCommands(cli: Cli): void {
    cli.register(
        'make:auth',
        async (args) => {
            const includeSocial = args.includes('--social') ||
                args.includes('-s')

            console.log('🔐 Scaffolding authentication system...\n')

            const files = [
                {
                    stub: 'auth_controller',
                    output: './app/controller/auth_controller.tsx',
                    name: 'AuthController',
                },
                {
                    stub: 'user_provider',
                    output: './app/provider/user_provider.ts',
                    name: 'UserProvider',
                },
            ]

            if (includeSocial) {
                files.push({
                    stub: 'social_auth_controller',
                    output: './app/controller/social_auth_controller.tsx',
                    name: 'SocialAuthController',
                })
            }

            for (const file of files) {
                try {
                    const content = await Stub.renderFrom(
                        STUBS_PATH,
                        'auth',
                        file.stub,
                        {
                            className: '',
                        },
                    )

                    const dirPath = file.output.substring(
                        0,
                        file.output.lastIndexOf('/'),
                    )
                    await Deno.mkdir(dirPath, { recursive: true })
                    await Deno.writeTextFile(file.output, content)
                    console.log(`✅ ${file.name} created at ${file.output}`)
                } catch (error) {
                    console.error(
                        `❌ Failed to create ${file.name}: ${
                            (error as Error).message
                        }`,
                    )
                }
            }

            console.log('\n📝 Next steps:')
            console.log(
                '1. Ensure you have a User model with email and password fields',
            )
            console.log('2. Configure auth in your kernel.ts:')
            console.log('')
            console.log("   import { configureAuth } from 'lockness/core'")
            console.log(
                "   import { UserProvider } from '@provider/user_provider.ts'",
            )
            console.log('')
            console.log('   configureAuth({')
            console.log('       userProvider: container.get(UserProvider),')
            console.log("       redirectTo: '/auth/login',")
            console.log('   })')
            console.log('')

            if (includeSocial) {
                console.log(
                    '3. Configure socialite providers in your kernel.ts:',
                )
                console.log('')
                console.log(
                    "   import { configureSocialite } from 'lockness/core'",
                )
                console.log('')
                console.log('   configureSocialite({')
                console.log('       google: {')
                console.log(
                    "           clientId: Deno.env.get('GOOGLE_CLIENT_ID')!,",
                )
                console.log(
                    "           clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,",
                )
                console.log(
                    "           redirectUri: Deno.env.get('APP_URL') + '/auth/google/callback',",
                )
                console.log('       },')
                console.log('       // Add github, discord, etc.')
                console.log('   })')
                console.log('')
                console.log('4. Add to your .env:')
                console.log('   GOOGLE_CLIENT_ID=your-google-client-id')
                console.log('   GOOGLE_CLIENT_SECRET=your-google-client-secret')
                console.log('   APP_URL=http://localhost:3000')
                console.log('')
                console.log('5. Use @Auth() decorator on protected routes')
            } else {
                console.log('3. Use @Auth() decorator on protected routes')
                console.log('')
                console.log(
                    '💡 Tip: Run `deno task cli make:auth --social` to add OAuth providers',
                )
            }
            console.log('')
        },
        'Scaffold authentication (controller + provider). Use --social for OAuth',
    )
}
