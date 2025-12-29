/**
 * Authentication Controller
 *
 * Handles login, logout, and registration
 */

import { Context, Controller, Get, Post, Use } from '@lockness/core'
import { getAuth } from '@lockness/auth'
import { hashPassword } from '@lockness/core'
import { UserRepository } from '@repository/user_repository.ts'
import { LoginPage } from '@view/pages/auth/login.tsx'
import { RegisterPage } from '@view/pages/auth/register.tsx'
import { ProfilePage } from '@view/pages/auth/profile.tsx'
import { AuthErrorPage } from '@view/pages/auth/error.tsx'

@Controller('/auth')
export class AuthController {
    /**
     * Show login page
     */
    @Get('/login', { name: 'auth.login' })
    showLogin(c: Context) {
        return c.html(<LoginPage />)
    }

    /**
     * Handle login
     */
    @Post('/login', { name: 'auth.login.submit' })
    async login(c: Context) {
        const body = await c.req.parseBody()
        const email = body.email as string
        const password = body.password as string
        const remember = body.remember === '1'

        const auth = getAuth(c)
        const guard = auth.use('web') as import('@lockness/auth').SessionGuard<
            true,
            import('../auth/user_provider.ts').UserProvider
        >

        try {
            await guard.login(email, password, remember)
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
    showRegister(c: Context) {
        return c.html(<RegisterPage />)
    }

    /**
     * Handle registration
     */
    @Post('/register', { name: 'auth.register.submit' })
    async register(c: Context) {
        const body = await c.req.parseBody()
        const name = body.name as string
        const email = body.email as string
        const password = body.password as string

        const userRepo = new UserRepository()

        try {
            // Create user
            const hashedPassword = await hashPassword(password)
            const user = await userRepo.create({
                name,
                email,
                password: hashedPassword,
            })

            // Auto-login after registration
            const auth = getAuth(c)
            const guard = auth.use(
                'web',
            ) as import('@lockness/auth').SessionGuard<
                true,
                import('../auth/user_provider.ts').UserProvider
            >
            await guard.loginById(user.id)

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
     * Protected profile page (requires authentication)
     */
    @Get('/profile', { name: 'auth.profile' })
    @Use('auth')
    profile(c: Context) {
        const auth = getAuth(c)
        const user = auth.user

        return c.html(<ProfilePage user={user} />)
    }

    /**
     * Handle logout
     */
    @Post('/logout', { name: 'auth.logout' })
    @Use('auth')
    async logout(c: Context) {
        const auth = getAuth(c)
        const guard = auth.use('web') as import('@lockness/auth').SessionGuard<
            true,
            import('../auth/user_provider.ts').UserProvider
        >

        await guard.logout()
        return c.redirect('/auth/login')
    }
}
