import { LandingLayout } from '@view/layouts/landing_layout.tsx'

// deno-lint-ignore no-explicit-any
export const ProfilePage = (props: { user: any }) => {
    return (
        <LandingLayout title='Profile - Lockness JS'>
            <div class='min-h-screen flex items-center justify-center p-4'>
                <div class='w-full max-w-2xl'>
                    <div class='bg-card border border-border rounded-lg shadow-lg p-8'>
                        <div class='flex items-center justify-between mb-6'>
                            <h1 class='text-3xl font-bold'>
                                Welcome, {props.user?.name}!
                            </h1>
                            <form method='post' action='/auth/logout'>
                                <button
                                    type='submit'
                                    class='px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors'
                                >
                                    Logout
                                </button>
                            </form>
                        </div>

                        <div class='space-y-4'>
                            <div class='bg-background border border-border rounded-md p-4'>
                                <label class='text-sm font-medium text-muted-foreground'>
                                    Name
                                </label>
                                <p class='text-lg mt-1'>{props.user?.name}</p>
                            </div>

                            <div class='bg-background border border-border rounded-md p-4'>
                                <label class='text-sm font-medium text-muted-foreground'>
                                    Email
                                </label>
                                <p class='text-lg mt-1'>{props.user?.email}</p>
                            </div>

                            <div class='bg-background border border-border rounded-md p-4'>
                                <label class='text-sm font-medium text-muted-foreground'>
                                    User ID
                                </label>
                                <p class='text-lg mt-1 font-mono'>
                                    {props.user?.id}
                                </p>
                            </div>

                            {props.user?.createdAt && (
                                <div class='bg-background border border-border rounded-md p-4'>
                                    <label class='text-sm font-medium text-muted-foreground'>
                                        Member Since
                                    </label>
                                    <p class='text-lg mt-1'>
                                        {new Date(
                                            props.user.createdAt,
                                        ).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                        })}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div class='mt-6 pt-6 border-t border-border'>
                            <p class='text-sm text-muted-foreground text-center'>
                                You are successfully authenticated! 🎉
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </LandingLayout>
    )
}
