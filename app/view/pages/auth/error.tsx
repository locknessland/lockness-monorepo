import { LandingLayout } from '@view/layouts/landing_layout.tsx'

export const AuthErrorPage = (props: {
    title: string
    message: string
    backUrl: string
    backText: string
}) => {
    return (
        <LandingLayout title={`${props.title} - Lockness JS`}>
            <div class='min-h-screen flex items-center justify-center p-4'>
                <div class='w-full max-w-md'>
                    <div class='bg-card border border-destructive rounded-lg shadow-lg p-8'>
                        <div class='flex flex-col items-center text-center'>
                            <div class='w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mb-4'>
                                <svg
                                    class='w-8 h-8 text-destructive'
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'
                                >
                                    <path
                                        stroke-linecap='round'
                                        stroke-linejoin='round'
                                        stroke-width='2'
                                        d='M6 18L18 6M6 6l12 12'
                                    />
                                </svg>
                            </div>

                            <h1 class='text-2xl font-bold text-destructive mb-2'>
                                {props.title}
                            </h1>

                            <p class='text-muted-foreground mb-6'>
                                {props.message}
                            </p>

                            <a
                                href={props.backUrl}
                                class='w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-center inline-block'
                            >
                                {props.backText}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </LandingLayout>
    )
}
