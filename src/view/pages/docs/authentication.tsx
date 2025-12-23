import { DocsLayout } from '@view/layouts/docs_layout.tsx'

export const AuthenticationPage = () => {
    return (
        <DocsLayout title="Authentication - Lockness JS">
            <div class="max-w-4xl mx-auto">
                <h1 class="text-4xl font-bold mb-4">Authentication</h1>
                <p class="text-xl text-gray-600 mb-8">
                    Complete authentication system with session-based auth, password hashing, and OAuth2 social login.
                </p>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Quick Setup</h2>
                    <p class="mb-4">Scaffold a complete authentication system with one command:</p>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>deno task ace make:auth</code></pre>
                    <p class="mb-4">This creates:</p>
                    <ul class="list-disc list-inside space-y-2 mb-6">
                        <li><code>src/controller/auth_controller.ts</code> - Login, logout, register routes</li>
                        <li><code>src/provider/user_provider.ts</code> - User authentication provider</li>
                    </ul>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Configuration</h2>
                    <p class="mb-4">Configure authentication in <code>src/kernel.ts</code>:</p>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { configureAuth, container } from 'lockness'
import { UserProvider } from '@provider/user_provider.ts'

configureAuth({
    userProvider: container.get(UserProvider),
    redirectTo: '/auth/login',
})`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Guards & Decorators</h2>
                    <p class="mb-4">Protect routes with authentication guards:</p>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { Controller, Get, Auth, Guest, auth } from 'lockness'

@Controller('/dashboard')
@Auth()  // Require authentication for entire controller
export class DashboardController {
    @Get('/')
    async index(c: Context) {
        const user = await auth(c).user()
        return c.json({ user })
    }
}

@Controller('/auth')
export class AuthController {
    @Guest('/dashboard')  // Redirect if already logged in
    @Get('/login')
    showLogin(c: Context) {
        return c.html(<LoginPage />)
    }
}`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Auth API</h2>
                    <div class="space-y-6">
                        <div>
                            <h3 class="text-2xl font-bold mb-2">Login with credentials</h3>
                            <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto"><code>{`const success = await auth(c).attempt(email, password)
if (success) {
    return c.redirect('/dashboard')
}`}</code></pre>
                        </div>
                        <div>
                            <h3 class="text-2xl font-bold mb-2">Get authenticated user</h3>
                            <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto"><code>{`const user = await auth(c).user()
const userId = await auth(c).id()`}</code></pre>
                        </div>
                        <div>
                            <h3 class="text-2xl font-bold mb-2">Check authentication status</h3>
                            <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto"><code>{`if (await auth(c).check()) {
    // User is authenticated
}
if (await auth(c).guest()) {
    // User is NOT authenticated
}`}</code></pre>
                        </div>
                        <div>
                            <h3 class="text-2xl font-bold mb-2">Logout</h3>
                            <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto"><code>{`await auth(c).logout()
return c.redirect('/auth/login')`}</code></pre>
                        </div>
                    </div>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Social Authentication (OAuth2)</h2>
                    <p class="mb-4">Add social login with Google, GitHub, or Discord:</p>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>deno task ace make:auth --social</code></pre>
                    
                    <h3 class="text-2xl font-bold mb-4 mt-6">Configure providers</h3>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { configureSocialite } from 'lockness'

configureSocialite({
    google: {
        clientId: Deno.env.get('GOOGLE_CLIENT_ID')!,
        clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        redirectUri: Deno.env.get('APP_URL') + '/auth/google/callback',
    },
    github: {
        clientId: Deno.env.get('GITHUB_CLIENT_ID')!,
        clientSecret: Deno.env.get('GITHUB_CLIENT_SECRET')!,
        redirectUri: Deno.env.get('APP_URL') + '/auth/github/callback',
    },
})`}</code></pre>

                    <h3 class="text-2xl font-bold mb-4 mt-6">Use in controllers</h3>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { socialite, generateState, session } from 'lockness'

@Get('/auth/google')
google(c: Context) {
    const state = generateState()
    session(c).set('oauth_state', state)
    return socialite('google').redirect(state)
}

@Get('/auth/google/callback')
async googleCallback(c: Context) {
    const user = await socialite('google').user(c)
    // user: { id, email, name, avatar, accessToken, ... }
    
    // Find or create user, then log them in
    session(c).set('user_id', user.id)
    return c.redirect('/dashboard')
}`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Password Hashing</h2>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { hashPassword, verifyPassword } from 'lockness'

// Hash a password (for registration)
const hash = await hashPassword('secret123')

// Verify password (for login)
const valid = await verifyPassword('secret123', hash)`}</code></pre>
                </section>

                <div class="flex justify-between mt-12 pt-8 border-t">
                    <a href="/docs/validation" class="text-blue-600 hover:underline">← Validation</a>
                    <a href="/docs/middleware" class="text-blue-600 hover:underline">Middleware →</a>
                </div>
            </div>
        </DocsLayout>
    )
}
