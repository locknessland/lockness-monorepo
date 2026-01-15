import { AuthLayout } from '@view/layouts/auth_layout.tsx'

export const RegisterPage = () => {
    return (
        <AuthLayout title='Register'>
            <div class='min-h-screen flex items-center justify-center p-4'>
                <div class='w-full max-w-md'>
                    <div class='bg-card border border-border rounded-lg shadow-lg p-8'>
                        <h1 class='text-3xl font-bold text-center mb-6'>
                            Create Account
                        </h1>

                        <form
                            method='post'
                            action='/auth/register'
                            class='space-y-4'
                        >
                            <div>
                                <label
                                    for='name'
                                    class='block text-sm font-medium mb-2'
                                >
                                    Name
                                </label>
                                <input
                                    type='text'
                                    id='name'
                                    name='name'
                                    required
                                    class='w-full px-4 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary'
                                    placeholder='John Doe'
                                />
                            </div>

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

                            <button
                                type='submit'
                                class='w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium'
                            >
                                Create Account
                            </button>
                        </form>

                        <p class='text-center text-sm text-muted-foreground mt-6'>
                            Already have an account?{' '}
                            <a
                                href='/auth/login'
                                class='text-primary hover:underline'
                            >
                                Login
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </AuthLayout>
    )
}
