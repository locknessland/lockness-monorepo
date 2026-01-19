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
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const CardsPage = () => {
    return (
        <PageUiLayout title='Cards - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        CARDS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Compound card components for content containers
                    </p>
                </header>

                <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                    {/* Basic Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Card</CardTitle>
                            <CardDescription>
                                A simple card with header and content
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p class='text-muted-foreground'>
                                This is the content area of the card. You can
                                place any content here.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Card with Footer */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Card with Footer</CardTitle>
                            <CardDescription>
                                Includes an action footer
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p class='text-muted-foreground'>
                                Cards can have footers for actions like buttons
                                or links.
                            </p>
                        </CardContent>
                        <CardFooter>
                            <Button variant='outline' class='w-full'>
                                Action Button
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Feature Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Feature Card</CardTitle>
                            <CardDescription>
                                With multiple actions
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ul class='space-y-2 text-muted-foreground'>
                                <li class='flex items-center gap-2'>
                                    <span class='text-primary'>✓</span>
                                    Type-safe
                                </li>
                                <li class='flex items-center gap-2'>
                                    <span class='text-primary'>✓</span>
                                    Composable
                                </li>
                                <li class='flex items-center gap-2'>
                                    <span class='text-primary'>✓</span>
                                    Accessible
                                </li>
                            </ul>
                        </CardContent>
                        <CardFooter class='flex gap-2'>
                            <Button variant='primary' size='sm'>
                                Learn More
                            </Button>
                            <Button variant='ghost' size='sm'>
                                Dismiss
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Full-width Card */}
                    <Card class='md:col-span-2 lg:col-span-3'>
                        <CardHeader>
                            <CardTitle>Full-width Card</CardTitle>
                            <CardDescription>
                                Spans multiple columns for emphasis
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p class='text-muted-foreground mb-4'>
                                This card spans all columns in its grid. Perfect
                                for highlighting important information or
                                creating hero sections.
                            </p>
                            <div class='flex flex-wrap gap-3'>
                                <Button variant='primary'>Get Started</Button>
                                <Button variant='secondary'>Learn More</Button>
                                <Button variant='outline'>Documentation</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Authentication Cards */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        AUTHENTICATION FORMS
                    </h2>
                    <p class='text-muted-foreground'>
                        Practical examples using cards for authentication flows
                    </p>

                    <div class='grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl'>
                        {/* Login Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Login</CardTitle>
                                <CardDescription>
                                    Enter your credentials to access your
                                    account
                                </CardDescription>
                            </CardHeader>
                            <CardContent class='space-y-4'>
                                <div class='space-y-2'>
                                    <Label for='login-email'>Email</Label>
                                    <Input
                                        id='login-email'
                                        type='email'
                                        placeholder='you@example.com'
                                    />
                                </div>
                                <div class='space-y-2'>
                                    <Label for='login-password'>Password</Label>
                                    <Input
                                        id='login-password'
                                        type='password'
                                        placeholder='••••••••'
                                    />
                                </div>
                                <div class='flex items-center justify-between'>
                                    <label class='flex items-center gap-2 text-sm'>
                                        <input
                                            type='checkbox'
                                            class='rounded'
                                        />
                                        <span>Remember me</span>
                                    </label>
                                    <a
                                        href='#'
                                        class='text-sm text-primary hover:underline'
                                    >
                                        Forgot password?
                                    </a>
                                </div>
                            </CardContent>
                            <CardFooter class='flex flex-col gap-2'>
                                <Button variant='primary' class='w-full'>
                                    Sign In
                                </Button>
                                <p class='text-sm text-muted-foreground text-center'>
                                    Don't have an account?{' '}
                                    <a
                                        href='#'
                                        class='text-primary hover:underline'
                                    >
                                        Sign up
                                    </a>
                                </p>
                            </CardFooter>
                        </Card>

                        {/* Register Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Create Account</CardTitle>
                                <CardDescription>
                                    Sign up to get started with Lockness
                                </CardDescription>
                            </CardHeader>
                            <CardContent class='space-y-4'>
                                <div class='space-y-2'>
                                    <Label for='register-name'>Full Name</Label>
                                    <Input
                                        id='register-name'
                                        type='text'
                                        placeholder='John Doe'
                                    />
                                </div>
                                <div class='space-y-2'>
                                    <Label for='register-email'>Email</Label>
                                    <Input
                                        id='register-email'
                                        type='email'
                                        placeholder='you@example.com'
                                    />
                                </div>
                                <div class='space-y-2'>
                                    <Label for='register-password'>
                                        Password
                                    </Label>
                                    <Input
                                        id='register-password'
                                        type='password'
                                        placeholder='••••••••'
                                    />
                                </div>
                                <div class='space-y-2'>
                                    <Label for='register-confirm'>
                                        Confirm Password
                                    </Label>
                                    <Input
                                        id='register-confirm'
                                        type='password'
                                        placeholder='••••••••'
                                    />
                                </div>
                            </CardContent>
                            <CardFooter class='flex flex-col gap-2'>
                                <Button variant='primary' class='w-full'>
                                    Create Account
                                </Button>
                                <p class='text-sm text-muted-foreground text-center'>
                                    Already have an account?{' '}
                                    <a
                                        href='#'
                                        class='text-primary hover:underline'
                                    >
                                        Sign in
                                    </a>
                                </p>
                            </CardFooter>
                        </Card>
                    </div>
                </section>

                {/* Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>USAGE</h2>
                    <CodeBlock lang='tsx'>
                        {`import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@lockness/ui/components'

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
  <CardFooter>
    Footer content
  </CardFooter>
</Card>`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
