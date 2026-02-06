/**
 * @fileoverview Live examples for Card component
 */

import { Button } from '../Button/mod.tsx'
import { Input } from '../Input/mod.tsx'
import { Label } from '../Label/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from './mod.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Card'),
    {
        title: 'Card Variants',
        render: () => (
            <div class='space-y-4'>
                <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Card</CardTitle>
                            <CardDescription>
                                A simple card with header and content
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p class='text-muted-foreground'>
                                This is the content area of the card.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Card with Footer</CardTitle>
                            <CardDescription>
                                Includes an action footer
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p class='text-muted-foreground'>
                                Cards can have footers for actions.
                            </p>
                        </CardContent>
                        <CardFooter>
                            <Button variant='outline' class='w-full'>
                                Action Button
                            </Button>
                        </CardFooter>
                    </Card>

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
                </div>
                <CodeBlock lang='tsx'>
                    {`import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@lockness/ui/components'

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content goes here</CardContent>
  <CardFooter>Footer content</CardFooter>
</Card>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Authentication Forms',
        render: () => (
            <div class='space-y-4'>
                <div class='grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Login</CardTitle>
                            <CardDescription>
                                Enter your credentials to access your account
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
                        </CardContent>
                        <CardFooter class='flex flex-col gap-2'>
                            <Button variant='primary' class='w-full'>
                                Sign In
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Create Account</CardTitle>
                            <CardDescription>
                                Sign up to get started
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
                                <Label for='register-password'>Password</Label>
                                <Input
                                    id='register-password'
                                    type='password'
                                    placeholder='••••••••'
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button variant='primary' class='w-full'>
                                Create Account
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
                <CodeBlock lang='tsx'>
                    {`<Card>
  <CardHeader>
    <CardTitle>Login</CardTitle>
    <CardDescription>Enter your credentials</CardDescription>
  </CardHeader>
  <CardContent class='space-y-4'>
    <div class='space-y-2'>
      <Label for='email'>Email</Label>
      <Input id='email' type='email' placeholder='you@example.com' />
    </div>
    <div class='space-y-2'>
      <Label for='password'>Password</Label>
      <Input id='password' type='password' />
    </div>
  </CardContent>
  <CardFooter>
    <Button variant='primary' class='w-full'>Sign In</Button>
  </CardFooter>
</Card>`}
                </CodeBlock>
            </div>
        ),
    },
]
