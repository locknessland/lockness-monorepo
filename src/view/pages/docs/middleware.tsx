import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { CommandBlock } from '@view/components/code_block.tsx'

export const MiddlewarePage = () => {
    return (
        <DocsLayout title="Middleware - Lockness JS">
            <div class="max-w-4xl mx-auto">
                <h1 class="text-4xl font-bold mb-4">Middleware</h1>
                <p class="text-xl text-gray-600 mb-8">
                    Middleware allows you to filter and modify HTTP requests before they reach your controllers.
                </p>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Creating Middleware</h2>
                    <p class="mb-4">Generate a new middleware class:</p>
                    <CommandBlock lang='terminal'>
{`deno task ace make:middleware Auth`}
                    </CommandBlock>
                    <p class="mb-4">This creates <code>src/middleware/auth_middleware.ts</code>:</p>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { Context, IMiddleware, MiddlewareHandler } from 'lockness'

export class AuthMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (c: Context, next) => {
        // Your middleware logic here
        console.log('Request URL:', c.req.url)
        
        await next()
        
        // After response
        console.log('Response status:', c.res.status)
    }
}`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Global Middleware</h2>
                    <p class="mb-4">Apply middleware to all routes in <code>src/kernel.ts</code>:</p>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { CorsMiddleware } from '@middleware/cors_middleware.ts'

await app.init({
    controllers,
    globalMiddlewares: [
        LoggerMiddleware,
        CorsMiddleware,
    ],
})`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Named Middleware</h2>
                    <p class="mb-4">Register middleware by name for use with <code>@Use()</code> decorator:</p>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { AuthMiddleware } from '@middleware/auth_middleware.ts'
import { AdminMiddleware } from '@middleware/admin_middleware.ts'

await app.init({
    controllers,
    middlewares: {
        auth: AuthMiddleware,
        admin: AdminMiddleware,
    },
})`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Using Middleware in Controllers</h2>
                    
                    <h3 class="text-2xl font-bold mb-4 mt-6">With class reference</h3>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { Controller, Get, Use } from 'lockness'
import { AuthMiddleware } from '@middleware/auth_middleware.ts'

@Controller('/dashboard')
export class DashboardController {
    @Get('/')
    @Use(AuthMiddleware)
    index(c: Context) {
        return c.json({ dashboard: true })
    }
}`}</code></pre>

                    <h3 class="text-2xl font-bold mb-4 mt-6">With named middleware</h3>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`@Controller('/admin')
export class AdminController {
    @Get('/')
    @Use('auth')
    @Use('admin')
    index(c: Context) {
        return c.json({ admin: true })
    }
}`}</code></pre>

                    <h3 class="text-2xl font-bold mb-4 mt-6">On entire controller</h3>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`@Controller('/api')
@Use(AuthMiddleware)
export class ApiController {
    // All routes in this controller use AuthMiddleware
    
    @Get('/users')
    users(c: Context) { ... }
    
    @Get('/posts')
    posts(c: Context) { ... }
}`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Middleware Examples</h2>
                    
                    <h3 class="text-2xl font-bold mb-4 mt-6">Logger Middleware</h3>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`export class LoggerMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (c, next) => {
        const start = Date.now()
        await next()
        const ms = Date.now() - start
        console.log(\`\${c.req.method} \${c.req.url} - \${ms}ms\`)
    }
}`}</code></pre>

                    <h3 class="text-2xl font-bold mb-4 mt-6">CORS Middleware</h3>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`export class CorsMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (c, next) => {
        c.header('Access-Control-Allow-Origin', '*')
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
        c.header('Access-Control-Allow-Headers', 'Content-Type')
        
        if (c.req.method === 'OPTIONS') {
            return c.text('', 204)
        }
        
        await next()
    }
}`}</code></pre>

                    <h3 class="text-2xl font-bold mb-4 mt-6">API Key Middleware</h3>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`export class ApiKeyMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (c, next) => {
        const apiKey = c.req.header('X-API-Key')
        
        if (!apiKey || apiKey !== Deno.env.get('API_KEY')) {
            return c.json({ error: 'Invalid API key' }, 401)
        }
        
        await next()
    }
}`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Middleware Order</h2>
                    <p class="mb-4">Middleware execution order:</p>
                    <ol class="list-decimal list-inside space-y-2 mb-6">
                        <li><strong>Global middlewares</strong> - Applied to all routes</li>
                        <li><strong>Controller-level middlewares</strong> - Applied to all routes in controller</li>
                        <li><strong>Route-level middlewares</strong> - Applied to specific route method</li>
                    </ol>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`// Execution order: Global → Controller → Route
globalMiddlewares: [LoggerMiddleware]

@Controller('/api')
@Use(AuthMiddleware)
export class ApiController {
    @Get('/users')
    @Use(CacheMiddleware)
    users(c: Context) { ... }
}

// Order: LoggerMiddleware → AuthMiddleware → CacheMiddleware → users()`}</code></pre>
                </section>

                <div class="flex justify-between mt-12 pt-8 border-t">
                    <a href="/docs/authentication" class="text-blue-600 hover:underline">← Authentication</a>
                    <a href="/docs/cli" class="text-blue-600 hover:underline">CLI (Ace) →</a>
                </div>
            </div>
        </DocsLayout>
    )
}
