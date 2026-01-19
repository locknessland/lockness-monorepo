import { AuthLayout } from '@view/layouts/auth_layout.tsx'
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Checkbox,
    Input,
    Label,
    Link,
} from '@lockness/ui/components'

export const LoginPage = () => {
    return (
        <AuthLayout title='Login'>
            <div class='min-h-screen flex items-center justify-center p-4'>
                <Card class='w-full max-w-md'>
                    <CardHeader class='text-center'>
                        <CardTitle class='text-2xl'>Welcome back</CardTitle>
                        <CardDescription>
                            Enter your credentials to access your account
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form
                            method='post'
                            action='/auth/login'
                            class='space-y-4'
                        >
                            <div class='space-y-2'>
                                <Label for='email'>Email</Label>
                                <Input
                                    type='email'
                                    id='email'
                                    name='email'
                                    required
                                    placeholder='you@example.com'
                                />
                            </div>

                            <div class='space-y-2'>
                                <Label for='password'>Password</Label>
                                <Input
                                    type='password'
                                    id='password'
                                    name='password'
                                    required
                                    placeholder='••••••••'
                                />
                            </div>

                            <div class='flex items-center space-x-2'>
                                <Checkbox
                                    id='remember'
                                    name='remember'
                                    value='1'
                                />
                                <Label
                                    for='remember'
                                    class='text-muted-foreground font-normal'
                                >
                                    Remember me
                                </Label>
                            </div>

                            <Button type='submit' class='w-full'>
                                Sign in
                            </Button>
                        </form>
                    </CardContent>

                    <CardFooter class='flex justify-center'>
                        <p class='text-sm text-muted-foreground'>
                            Don't have an account?{' '}
                            <Link
                                href='/auth/register'
                                class='text-primary hover:underline'
                            >
                                Register
                            </Link>
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </AuthLayout>
    )
}
