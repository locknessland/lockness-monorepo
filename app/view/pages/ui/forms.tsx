import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Checkbox,
    Input,
    Label,
    Switch,
    Textarea,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const FormsPage = () => {
    return (
        <PageUiLayout
            title='Form Components - Lockness UI'
           
        >
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        FORM COMPONENTS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Input, textarea, checkbox, switch, and label components
                    </p>
                </header>

                {/* Label & Input */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Label & Input</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <div class='space-y-2'>
                                <Label for='email'>Email Address</Label>
                                <Input
                                    id='email'
                                    type='email'
                                    placeholder='you@example.com'
                                />
                            </div>
                            <div class='space-y-2'>
                                <Label for='password'>Password</Label>
                                <Input
                                    id='password'
                                    type='password'
                                    placeholder='Enter password'
                                />
                            </div>
                            <div class='space-y-2'>
                                <Label for='number'>Number</Label>
                                <Input
                                    id='number'
                                    type='number'
                                    placeholder='42'
                                />
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Textarea */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Textarea</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <div class='space-y-2'>
                                <Label for='message'>Message</Label>
                                <Textarea
                                    id='message'
                                    rows={4}
                                    placeholder='Enter your message...'
                                />
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Checkbox */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Checkbox</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-3'>
                            <div class='flex items-center space-x-2'>
                                <Checkbox id='terms' />
                                <Label for='terms'>
                                    Accept terms and conditions
                                </Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Checkbox id='marketing' />
                                <Label for='marketing'>
                                    Receive marketing emails
                                </Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Checkbox id='disabled' disabled />
                                <Label for='disabled'>Disabled checkbox</Label>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Switch */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Switch</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-3'>
                            <div class='flex items-center space-x-2'>
                                <Switch id='notifications' />
                                <Label for='notifications'>
                                    Enable notifications
                                </Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Switch id='dark-mode' />
                                <Label for='dark-mode'>Dark mode</Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Switch id='disabled-switch' disabled />
                                <Label for='disabled-switch'>
                                    Disabled switch
                                </Label>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Radio Button */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Radio Button</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <div class='space-y-3'>
                                <Label>Choose your plan</Label>
                                <div class='space-y-2'>
                                    <div class='flex items-center space-x-2'>
                                        <input
                                            type='radio'
                                            id='free'
                                            name='plan'
                                            value='free'
                                            class='h-4 w-4 border border-(--input) text-(--primary) focus:ring-2 focus:ring-(--ring) focus:ring-offset-2'
                                        />
                                        <Label for='free'>
                                            Free - $0/month
                                        </Label>
                                    </div>
                                    <div class='flex items-center space-x-2'>
                                        <input
                                            type='radio'
                                            id='pro'
                                            name='plan'
                                            value='pro'
                                            class='h-4 w-4 border border-(--input) text-(--primary) focus:ring-2 focus:ring-(--ring) focus:ring-offset-2'
                                        />
                                        <Label for='pro'>Pro - $9/month</Label>
                                    </div>
                                    <div class='flex items-center space-x-2'>
                                        <input
                                            type='radio'
                                            id='enterprise'
                                            name='plan'
                                            value='enterprise'
                                            class='h-4 w-4 border border-(--input) text-(--primary) focus:ring-2 focus:ring-(--ring) focus:ring-offset-2'
                                        />
                                        <Label for='enterprise'>
                                            Enterprise - $29/month
                                        </Label>
                                    </div>
                                </div>
                            </div>
                            <div class='space-y-3'>
                                <Label>Payment method</Label>
                                <div class='space-y-2'>
                                    <div class='flex items-center space-x-2'>
                                        <input
                                            type='radio'
                                            id='credit-card'
                                            name='payment'
                                            value='credit-card'
                                            class='h-4 w-4 border border-(--input) text-(--primary) focus:ring-2 focus:ring-(--ring) focus:ring-offset-2'
                                            checked
                                        />
                                        <Label for='credit-card'>
                                            Credit Card
                                        </Label>
                                    </div>
                                    <div class='flex items-center space-x-2'>
                                        <input
                                            type='radio'
                                            id='paypal'
                                            name='payment'
                                            value='paypal'
                                            class='h-4 w-4 border border-(--input) text-(--primary) focus:ring-2 focus:ring-(--ring) focus:ring-offset-2'
                                        />
                                        <Label for='paypal'>PayPal</Label>
                                    </div>
                                    <div class='flex items-center space-x-2'>
                                        <input
                                            type='radio'
                                            id='bank'
                                            name='payment'
                                            value='bank'
                                            class='h-4 w-4 border border-(--input) text-(--primary) focus:ring-2 focus:ring-(--ring) focus:ring-offset-2'
                                            disabled
                                        />
                                        <Label for='bank'>
                                            Bank Transfer (Disabled)
                                        </Label>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>USAGE</h2>
                    <CodeBlock lang='tsx'>
                        {`import { Input, Label, Checkbox, Switch, Textarea } from '@lockness/ui/components'

<div class='space-y-2'>
  <Label for='email'>Email</Label>
  <Input id='email' type='email' placeholder='you@example.com' />
</div>`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
