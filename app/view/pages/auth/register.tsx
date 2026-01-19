import { AuthLayout } from '@view/layouts/auth_layout.tsx'
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Link,
} from '@lockness/ui/components'

export const RegisterPage = () => {
    return (
        <AuthLayout title='Register'>
            <div class='min-h-screen flex items-center justify-center p-4'>
                <Card class='w-full max-w-md'>
                    <CardHeader class='text-center'>
                        <CardTitle class='text-2xl'>
                            Create an account
                        </CardTitle>
                        <CardDescription>
                            Enter your details to get started
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form
                            method='post'
                            action='/auth/register'
                            class='space-y-4'
                        >
                            <div class='space-y-2'>
                                <Label for='name'>Name</Label>
                                <Input
                                    type='text'
                                    id='name'
                                    name='name'
                                    required
                                    placeholder='John Doe'
                                />
                            </div>

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

                            <Button type='submit' class='w-full'>
                                Create account
                            </Button>
                        </form>
                    </CardContent>

                    <CardFooter class='flex justify-center'>
                        <p class='text-sm text-muted-foreground'>
                            Already have an account?{' '}
                            <Link
                                href='/auth/login'
                                class='text-primary hover:underline'
                            >
                                Sign in
                            </Link>
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </AuthLayout>
    )
}
