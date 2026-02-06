/**
 * @fileoverview Live examples for Tabs component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Tabs'),
    {
        title: 'Basic Tabs',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Tabs defaultValue='account' name='basic-tabs'>
                            <TabsList>
                                <TabsTrigger
                                    value='account'
                                    name='basic-tabs'
                                    checked
                                >
                                    Account
                                </TabsTrigger>
                                <TabsTrigger value='password' name='basic-tabs'>
                                    Password
                                </TabsTrigger>
                                <TabsTrigger value='settings' name='basic-tabs'>
                                    Settings
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value='account' name='basic-tabs'>
                                <p class='text-sm text-muted-foreground pt-4'>
                                    Manage your account settings and preferences
                                    here.
                                </p>
                            </TabsContent>
                            <TabsContent value='password' name='basic-tabs'>
                                <p class='text-sm text-muted-foreground pt-4'>
                                    Change your password and security settings.
                                </p>
                            </TabsContent>
                            <TabsContent value='settings' name='basic-tabs'>
                                <p class='text-sm text-muted-foreground pt-4'>
                                    Configure your application settings.
                                </p>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Tabs, TabsList, TabsTrigger, TabsContent } from '@lockness/ui/components'

<Tabs defaultValue="account" name="my-tabs">
  <TabsList>
    <TabsTrigger value="account" name="my-tabs" checked>
      Account
    </TabsTrigger>
    <TabsTrigger value="password" name="my-tabs">
      Password
    </TabsTrigger>
  </TabsList>
  <TabsContent value="account" name="my-tabs">
    <p>Account settings content</p>
  </TabsContent>
  <TabsContent value="password" name="my-tabs">
    <p>Password settings content</p>
  </TabsContent>
</Tabs>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Vertical Tabs',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Tabs
                            defaultValue='general'
                            name='vertical-tabs'
                            orientation='vertical'
                        >
                            <TabsList orientation='vertical'>
                                <TabsTrigger
                                    value='general'
                                    name='vertical-tabs'
                                    checked
                                >
                                    General
                                </TabsTrigger>
                                <TabsTrigger
                                    value='appearance'
                                    name='vertical-tabs'
                                >
                                    Appearance
                                </TabsTrigger>
                                <TabsTrigger
                                    value='notifications'
                                    name='vertical-tabs'
                                >
                                    Notifications
                                </TabsTrigger>
                            </TabsList>
                            <div class='flex-1'>
                                <TabsContent
                                    value='general'
                                    name='vertical-tabs'
                                >
                                    <p class='text-sm text-muted-foreground'>
                                        General settings for your application.
                                    </p>
                                </TabsContent>
                                <TabsContent
                                    value='appearance'
                                    name='vertical-tabs'
                                >
                                    <p class='text-sm text-muted-foreground'>
                                        Customize the look and feel.
                                    </p>
                                </TabsContent>
                                <TabsContent
                                    value='notifications'
                                    name='vertical-tabs'
                                >
                                    <p class='text-sm text-muted-foreground'>
                                        Configure notification preferences.
                                    </p>
                                </TabsContent>
                            </div>
                        </Tabs>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Tabs defaultValue="general" name="v-tabs" orientation="vertical">
  <TabsList orientation="vertical">
    <TabsTrigger value="general" name="v-tabs" checked>
      General
    </TabsTrigger>
    <TabsTrigger value="appearance" name="v-tabs">
      Appearance
    </TabsTrigger>
  </TabsList>
  <div class="flex-1">
    <TabsContent value="general" name="v-tabs">
      <p>General settings</p>
    </TabsContent>
    <TabsContent value="appearance" name="v-tabs">
      <p>Appearance settings</p>
    </TabsContent>
  </div>
</Tabs>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Card Content',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Tabs defaultValue='overview' name='card-tabs'>
                            <TabsList>
                                <TabsTrigger
                                    value='overview'
                                    name='card-tabs'
                                    checked
                                >
                                    Overview
                                </TabsTrigger>
                                <TabsTrigger value='analytics' name='card-tabs'>
                                    Analytics
                                </TabsTrigger>
                                <TabsTrigger value='reports' name='card-tabs'>
                                    Reports
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value='overview' name='card-tabs'>
                                <Card class='mt-4'>
                                    <CardContent class='p-4'>
                                        <h3 class='font-semibold mb-2'>
                                            Dashboard Overview
                                        </h3>
                                        <p class='text-sm text-muted-foreground'>
                                            Your project statistics at a glance.
                                        </p>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                            <TabsContent value='analytics' name='card-tabs'>
                                <Card class='mt-4'>
                                    <CardContent class='p-4'>
                                        <h3 class='font-semibold mb-2'>
                                            Analytics
                                        </h3>
                                        <p class='text-sm text-muted-foreground'>
                                            Detailed analytics and metrics.
                                        </p>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                            <TabsContent value='reports' name='card-tabs'>
                                <Card class='mt-4'>
                                    <CardContent class='p-4'>
                                        <h3 class='font-semibold mb-2'>
                                            Reports
                                        </h3>
                                        <p class='text-sm text-muted-foreground'>
                                            Download and view generated reports.
                                        </p>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Tabs defaultValue="overview" name="tabs">
  <TabsList>
    <TabsTrigger value="overview" name="tabs" checked>
      Overview
    </TabsTrigger>
    <TabsTrigger value="analytics" name="tabs">
      Analytics
    </TabsTrigger>
  </TabsList>
  <TabsContent value="overview" name="tabs">
    <Card class="mt-4">
      <CardContent class="p-4">
        <h3>Dashboard Overview</h3>
        <p>Your project statistics.</p>
      </CardContent>
    </Card>
  </TabsContent>
</Tabs>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'How It Works',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ul class='space-y-2 text-sm'>
                            <li>
                                <strong>Zero JavaScript:</strong>{' '}
                                Uses Unpoly's up-switch directive with hidden
                                radio buttons
                            </li>
                            <li>
                                <strong>Accessible:</strong>{' '}
                                Full ARIA support with role="tablist" and
                                role="tabpanel"
                            </li>
                            <li>
                                <strong>Keyboard Navigation:</strong>{' '}
                                Navigate with Tab and select with Enter/Space
                            </li>
                            <li>
                                <strong>Unique Names:</strong>{' '}
                                Use unique name props for multiple tab groups on
                                the same page
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        ),
    },
]
