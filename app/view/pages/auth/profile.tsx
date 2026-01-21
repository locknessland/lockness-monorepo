import { AuthLayout } from '@view/layouts/auth_layout.tsx'
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Label,
    Separator,
} from '@lockness/ui/components'

// deno-lint-ignore no-explicit-any
export const ProfilePage = (props: { user: any }) => {
    return (
        <AuthLayout title='Profile'>
            <div class='min-h-screen flex items-center justify-center p-4'>
                <Card class='w-full max-w-2xl'>
                    <CardHeader>
                        <div class='flex items-center justify-between'>
                            <div>
                                <CardTitle class='text-2xl'>
                                    Welcome, {props.user?.name}!
                                </CardTitle>
                                <CardDescription>
                                    Manage your account settings and preferences
                                </CardDescription>
                            </div>
                            <form method='post' action='/auth/logout'>
                                <Button type='submit' variant='danger'>
                                    Logout
                                </Button>
                            </form>
                        </div>
                    </CardHeader>

                    <CardContent class='space-y-4'>
                        <div class='grid gap-4 md:grid-cols-2'>
                            <div class='space-y-2'>
                                <Label class='text-muted-foreground'>
                                    Name
                                </Label>
                                <p class='text-lg font-medium'>
                                    {props.user?.name}
                                </p>
                            </div>

                            <div class='space-y-2'>
                                <Label class='text-muted-foreground'>
                                    Email
                                </Label>
                                <p class='text-lg font-medium'>
                                    {props.user?.email}
                                </p>
                            </div>

                            <div class='space-y-2'>
                                <Label class='text-muted-foreground'>
                                    User ID
                                </Label>
                                <p class='text-lg font-mono text-muted-foreground'>
                                    {props.user?.id}
                                </p>
                            </div>

                            {props.user?.createdAt && (
                                <div class='space-y-2'>
                                    <Label class='text-muted-foreground'>
                                        Member Since
                                    </Label>
                                    <p class='text-lg font-medium'>
                                        {new Date(props.user.createdAt)
                                            .toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                            })}
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>

                    <Separator />

                    <CardFooter class='justify-center'>
                        <p class='text-sm text-muted-foreground'>
                            You are successfully authenticated! 🎉
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </AuthLayout>
    )
}
