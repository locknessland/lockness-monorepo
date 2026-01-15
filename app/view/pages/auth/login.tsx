import { AuthLayout } from '@view/layouts/auth_layout.tsx'

export const LoginPage = () => {
    return (
        <AuthLayout title='Login'>
            <div class='min-h-screen flex items-center justify-center p-4'>
                <div class='w-full max-w-md'>
                    <div class='bg-card border border-border rounded-lg shadow-lg p-8'>
                        <h1 class='text-3xl font-bold text-center mb-6'>
                            Login
                        </h1>

                        <form
                            method='post'
                            action='/auth/login'
                            class='space-y-4'
                        >
                            <div>
                                <label
                                    for='email'
                                    class='block text-sm font-medium mb-2'
                                >
                                    Email
                                </label>
                                <input
                                    type='email'
                                    id='email'
                                    name='email'
                                    required
                                    class='w-full px-4 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary'
                                    placeholder='you@example.com'
                                />
                            </div>

                            <div>
                                <label
                                    for='password'
                                    class='block text-sm font-medium mb-2'
                                >
                                    Password
                                </label>
                                <input
                                    type='password'
                                    id='password'
                                    name='password'
                                    required
                                    class='w-full px-4 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary'
                                    placeholder='••••••••'
                                />
                            </div>

                            <div class='flex items-center'>
                                <input
                                    type='checkbox'
                                    id='remember'
                                    name='remember'
                                    value='1'
                                    class='w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary'
                                />
                                <label
                                    for='remember'
                                    class='ml-2 text-sm text-muted-foreground'
                                >
                                    Remember me
                                </label>
                            </div>

                            <button
                                type='submit'
                                class='w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium'
                            >
                                Login
                            </button>
                        </form>

                        <p class='text-center text-sm text-muted-foreground mt-6'>
                            Don't have an account?{' '}
                            <a
                                href='/auth/register'
                                class='text-primary hover:underline'
                            >
                                Register
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </AuthLayout>
    )
}
