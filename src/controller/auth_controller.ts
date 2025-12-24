/**
 * Authentication Controller
 * 
 * Handles login, logout, and registration
 */

import { Controller, Get, Post, Use, type Context } from 'lockness'
import { getAuth } from '@lockness/auth'
import type { UserProvider } from '../auth/user_provider.ts'
import { hashPassword } from 'lockness'
import { UserRepository } from '@repository/user_repository.ts'

@Controller('/auth')
export class AuthController {
    /**
     * Show login page
     */
    @Get('/login')
    async showLogin(c: Context) {
        return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login</title>
                <style>
                    body { font-family: system-ui; max-width: 400px; margin: 50px auto; padding: 20px; }
                    form { display: flex; flex-direction: column; gap: 10px; }
                    input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
                    button { padding: 10px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
                    button:hover { background: #0052a3; }
                </style>
            </head>
            <body>
                <h1>Login</h1>
                <form method="POST" action="/auth/login">
                    <input type="email" name="email" placeholder="Email" required />
                    <input type="password" name="password" placeholder="Password" required />
                    <label>
                        <input type="checkbox" name="remember" value="1" />
                        Remember me
                    </label>
                    <button type="submit">Login</button>
                </form>
                <p>Don't have an account? <a href="/auth/register">Register</a></p>
            </body>
            </html>
        `)
    }

    /**
     * Handle login
     */
    @Post('/login')
    async login(c: Context) {
        const body = await c.req.parseBody()
        const email = body.email as string
        const password = body.password as string
        const remember = body.remember === '1'

        const auth = getAuth(c)
        const guard = auth.use('web') as import('@lockness/auth').SessionGuard<any, any>

        try {
            await guard.login(email, password, remember)
            return c.redirect('/profile')
        } catch (error) {
            return c.html(`
                <h1>Login Failed</h1>
                <p>${(error as Error).message}</p>
                <a href="/auth/login">Try again</a>
            `, 401)
        }
    }

    /**
     * Show registration page
     */
    @Get('/register')
    async showRegister(c: Context) {
        return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Register</title>
                <style>
                    body { font-family: system-ui; max-width: 400px; margin: 50px auto; padding: 20px; }
                    form { display: flex; flex-direction: column; gap: 10px; }
                    input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
                    button { padding: 10px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
                    button:hover { background: #0052a3; }
                </style>
            </head>
            <body>
                <h1>Register</h1>
                <form method="POST" action="/auth/register">
                    <input type="text" name="name" placeholder="Name" required />
                    <input type="email" name="email" placeholder="Email" required />
                    <input type="password" name="password" placeholder="Password" required />
                    <button type="submit">Register</button>
                </form>
                <p>Already have an account? <a href="/auth/login">Login</a></p>
            </body>
            </html>
        `)
    }

    /**
     * Handle registration
     */
    @Post('/register')
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
            const guard = auth.use('web') as import('@lockness/auth').SessionGuard<any, any>
            await guard.loginById(user.id)

            return c.redirect('/profile')
        } catch (error) {
            return c.html(`
                <h1>Registration Failed</h1>
                <p>${(error as Error).message}</p>
                <a href="/auth/register">Try again</a>
            `, 400)
        }
    }

    /**
     * Protected profile page (requires authentication)
     */
    @Get('/profile')
    @Use('auth')
    async profile(c: Context) {
        const auth = getAuth(c)
        const user = auth.user

        return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Profile</title>
                <style>
                    body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; }
                    button { padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; }
                    button:hover { background: #b91c1c; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Welcome, ${user?.name}!</h1>
                    <p><strong>Email:</strong> ${user?.email}</p>
                    <p><strong>ID:</strong> ${user?.id}</p>
                    <form method="POST" action="/auth/logout">
                        <button type="submit">Logout</button>
                    </form>
                </div>
            </body>
            </html>
        `)
    }

    /**
     * Handle logout
     */
    @Post('/logout')
    @Use('auth')
    async logout(c: Context) {
        const auth = getAuth(c)
        const guard = auth.use('web') as import('@lockness/auth').SessionGuard<any, any>

        await guard.logout()

        return c.redirect('/auth/login')
    }
}
