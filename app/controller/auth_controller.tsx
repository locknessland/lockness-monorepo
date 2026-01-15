/**
 * Authentication Controller
 *
 * Demonstrates multiple approaches to guard access:
 * 1. Auth Decorators (@AuthOptional/@AuthRequired) - Recommended, most explicit
 * 2. Context API (c.get('auth')) - Fluent API for authentication operations
 * 3. Decorator injection (@InjectGuard) - For advanced scenarios requiring guard access
 */

import { Context, Controller, Get, Post } from '@lockness/core'
import {
    AuthGuard,
    AuthOptional,
    AuthRequired,
    getAuth,
    InjectGuard,
} from '@lockness/auth'
import type { SessionGuard } from '@lockness/auth'
import type { UserProvider } from '../auth/user_provider.ts'
import { hashPassword } from '@lockness/auth'
import { UserRepository } from '@repository/user_repository.ts'
import { LoginPage } from '@view/pages/auth/login.tsx'
import { RegisterPage } from '@view/pages/auth/register.tsx'
import { ProfilePage } from '@view/pages/auth/profile.tsx'
import { AuthErrorPage } from '@view/pages/auth/error.tsx'

type WebGuard = SessionGuard<true, UserProvider>

@Controller('/auth')
export class AuthController {
    /**
     * Show login page (Approach 1: Auth Decorator - Optional)
     */
    @Get('/login', { name: 'auth.login' })
    @AuthOptional()
    showLogin(c: Context) {
        const auth = c.get('auth')
        if (auth?.user) {
            return c.redirect('/auth/profile')
        }
        return c.html(<LoginPage />)
    }

    /**
     * Handle login (Approach 1: Auth Decorator - Optional)
     */
    @Post('/login', { name: 'auth.login.submit' })
    @AuthOptional()
    async login(c: Context) {
        const body = await c.req.parseBody()
        const email = body.email as string
        const password = body.password as string
        const remember = body.remember === '1'
        const auth = c.get('auth')

        try {
            await auth.login(email, password, remember) // ✨ Clean!
            return c.redirect('/auth/profile')
        } catch (error) {
            return c.html(
                <AuthErrorPage
                    title='Login Failed'
                    message={(error as Error).message}
                    backUrl='/auth/login'
                    backText='Try again'
                />,
                401,
            )
        }
    }

    /**
     * Show registration page
     */
    @Get('/register', { name: 'auth.register' })
    @AuthOptional()
    showRegister(c: Context) {
        const auth = c.get('auth')
        if (auth?.user) {
            return c.redirect('/auth/profile')
        }
        return c.html(<RegisterPage />)
    }

    /**
     * Handle registration (Approach 1: Auth Decorator - Optional)
     */
    @Post('/register', { name: 'auth.register.submit' })
    @AuthOptional()
    async register(c: Context) {
        const body = await c.req.parseBody()
        const name = body.name as string
        const email = body.email as string
        const password = body.password as string

        const userRepo = new UserRepository()

        const auth = c.get('auth')

        try {
            // Create user
            const hashedPassword = await hashPassword(password)
            const user = await userRepo.create({
                name,
                email,
                password: hashedPassword,
            })

            // Auto-login after registration
            await auth.loginById(user.id) // ✨ Clean!

            return c.redirect('/auth/profile')
        } catch (error) {
            return c.html(
                <AuthErrorPage
                    title='Registration Failed'
                    message={(error as Error).message}
                    backUrl='/auth/register'
                    backText='Try again'
                />,
                400,
            )
        }
    }

    /**
     * Protected profile page (Approach 1: Auth Decorator - Required)
     * Redirects to login if user is not authenticated
     */
    @Get('/profile', { name: 'auth.profile' })
    @AuthRequired({ redirectTo: '/auth/login' })
    profile(c: Context) {
        const auth = c.get('auth')
        const user = auth?.user // ✨ Guaranteed to exist

        return c.html(<ProfilePage user={user} />)
    }

    /**
     * Handle logout (Approach 1: Auth Decorator - Required)
     * Redirects to login if user is not authenticated
     */
    @Post('/logout', { name: 'auth.logout' })
    @AuthRequired({ redirectTo: '/auth/login' })
    async logout(c: Context) {
        const auth = c.get('auth')
        await auth.logout() // ✨ One line!
        return c.redirect('/auth/login')
    }

    /**
     * Example: Decorator injection (Approach 2)
     * Use when you need direct guard access for advanced operations
     */
    @Post('/logout-with-decorator', { name: 'auth.logout.decorator' })
    @InjectGuard('web')
    async logoutWithDecorator(c: Context, guard: WebGuard) {
        // guard is injected as 2nd parameter, fully typed
        await guard.logout()
        return c.redirect('/auth/login')
    }

    /**
     * Example: API guard with specific guard decorator (Approach 1 variant)
     * Use @AuthGuard() when you need a specific non-default guard
     */
    @Post('/api/data')
    @AuthGuard('api')
    getApiData(c: Context) {
        const auth = c.get('auth')
        const user = auth?.user // Authenticated via 'api' guard
        return c.json({ success: true, user })
    }

    /**
     * Example: Manual multi-guard access (Approach 3)
     * Use only when you need to dynamically determine guard usage
     */
    @Post('/multi-auth')
    @AuthOptional()
    async multiAuth(c: Context) {
        const auth = getAuth(c)

        // Determine which guard to use based on request
        if (c.req.header('Authorization')) {
            const apiGuard = auth.use('api')
            const isAuthenticated = await apiGuard.check()
            return c.json({ authenticated: isAuthenticated, via: 'api' })
        } else {
            const webGuard = auth.use('web') as WebGuard
            const isAuthenticated = await webGuard.check()
            return c.json({ authenticated: isAuthenticated, via: 'web' })
        }
    }
}
