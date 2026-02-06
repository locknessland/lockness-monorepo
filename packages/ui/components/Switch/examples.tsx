/**
 * @fileoverview Live examples for Switch component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Label } from '../Label/mod.tsx'
import { Switch } from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Switch'),
    {
        title: 'Basic Switch',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center space-x-2'>
                            <Switch id='notifications' />
                            <Label for='notifications'>
                                Enable notifications
                            </Label>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Switch, Label } from '@lockness/ui/components'

<div class="flex items-center space-x-2">
  <Switch id="notifications" />
  <Label for="notifications">Enable notifications</Label>
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Checked State',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center space-x-2'>
                            <Switch id='checked-switch' checked />
                            <Label for='checked-switch'>
                                Enabled by default
                            </Label>
                        </div>
                        <div class='flex items-center space-x-2'>
                            <Switch id='unchecked-switch' />
                            <Label for='unchecked-switch'>
                                Disabled by default
                            </Label>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`// Checked by default
<Switch checked />

// Unchecked
<Switch />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Disabled State',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center space-x-2'>
                            <Switch id='disabled-off' disabled />
                            <Label for='disabled-off' class='opacity-50'>
                                Disabled (off)
                            </Label>
                        </div>
                        <div class='flex items-center space-x-2'>
                            <Switch id='disabled-on' disabled checked />
                            <Label for='disabled-on' class='opacity-50'>
                                Disabled (on)
                            </Label>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`// Disabled off
<Switch disabled />

// Disabled on
<Switch disabled checked />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Settings Example',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='space-y-6'>
                            <div class='flex items-center justify-between'>
                                <div class='space-y-0.5'>
                                    <Label for='dark-mode'>Dark Mode</Label>
                                    <p class='text-sm text-muted-foreground'>
                                        Enable dark theme for the interface
                                    </p>
                                </div>
                                <Switch id='dark-mode' />
                            </div>
                            <div class='flex items-center justify-between'>
                                <div class='space-y-0.5'>
                                    <Label for='email-notif'>
                                        Email Notifications
                                    </Label>
                                    <p class='text-sm text-muted-foreground'>
                                        Receive email updates about your account
                                    </p>
                                </div>
                                <Switch id='email-notif' checked />
                            </div>
                            <div class='flex items-center justify-between'>
                                <div class='space-y-0.5'>
                                    <Label for='push-notif'>
                                        Push Notifications
                                    </Label>
                                    <p class='text-sm text-muted-foreground'>
                                        Get notified on your device
                                    </p>
                                </div>
                                <Switch id='push-notif' />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class="flex items-center justify-between">
  <div class="space-y-0.5">
    <Label for="dark-mode">Dark Mode</Label>
    <p class="text-sm text-muted-foreground">
      Enable dark theme for the interface
    </p>
  </div>
  <Switch id="dark-mode" />
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Form',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <form class='space-y-4'>
                            <div class='flex items-center space-x-2'>
                                <Switch
                                    id='form-newsletter'
                                    name='newsletter'
                                    value='yes'
                                />
                                <Label for='form-newsletter'>
                                    Subscribe to newsletter
                                </Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Switch
                                    id='form-marketing'
                                    name='marketing'
                                    value='yes'
                                />
                                <Label for='form-marketing'>
                                    Receive marketing updates
                                </Label>
                            </div>
                        </form>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<form class="space-y-4">
  <div class="flex items-center space-x-2">
    <Switch id="newsletter" name="newsletter" value="yes" />
    <Label for="newsletter">Subscribe to newsletter</Label>
  </div>
  <div class="flex items-center space-x-2">
    <Switch id="marketing" name="marketing" value="yes" />
    <Label for="marketing">Receive marketing updates</Label>
  </div>
</form>`}
                </CodeBlock>
            </div>
        ),
    },
]
