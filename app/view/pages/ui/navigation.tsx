import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Input,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const NavigationPage = () => {
    return (
        <PageUiLayout
            title='Navigation Components - Lockness UI'
           
        >
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        NAVIGATION COMPONENTS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Breadcrumbs and tabs for content organization
                    </p>
                </header>

                {/* Breadcrumb */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BREADCRUMB
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <Breadcrumb>
                                <BreadcrumbList>
                                    <BreadcrumbItem>
                                        <BreadcrumbLink href='/'>
                                            Home
                                        </BreadcrumbLink>
                                    </BreadcrumbItem>
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        <BreadcrumbLink href='/ui'>
                                            Components
                                        </BreadcrumbLink>
                                    </BreadcrumbItem>
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        <BreadcrumbPage>
                                            Navigation
                                        </BreadcrumbPage>
                                    </BreadcrumbItem>
                                </BreadcrumbList>
                            </Breadcrumb>
                        </CardContent>
                    </Card>
                </section>

                {/* Tabs Basic */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TABS (BASIC)
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <Tabs name='demo-tabs'>
                                <TabsList>
                                    <TabsTrigger
                                        value='account'
                                        name='demo-tabs'
                                        checked
                                    >
                                        Account
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value='password'
                                        name='demo-tabs'
                                    >
                                        Password
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value='notifications'
                                        name='demo-tabs'
                                    >
                                        Notifications
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent value='account' name='demo-tabs'>
                                    <div class='p-4 space-y-2'>
                                        <h3 class='font-pixel text-sm'>
                                            Account Settings
                                        </h3>
                                        <p class='text-sm text-muted-foreground'>
                                            Manage your account settings and
                                            preferences.
                                        </p>
                                    </div>
                                </TabsContent>
                                <TabsContent value='password' name='demo-tabs'>
                                    <div class='p-4 space-y-2'>
                                        <h3 class='font-pixel text-sm'>
                                            Password
                                        </h3>
                                        <p class='text-sm text-muted-foreground'>
                                            Change your password here.
                                        </p>
                                    </div>
                                </TabsContent>
                                <TabsContent
                                    value='notifications'
                                    name='demo-tabs'
                                >
                                    <div class='p-4 space-y-2'>
                                        <h3 class='font-pixel text-sm'>
                                            Notifications
                                        </h3>
                                        <p class='text-sm text-muted-foreground'>
                                            Configure your notification
                                            preferences.
                                        </p>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </section>

                {/* Vertical Tabs */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        VERTICAL TABS
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Tabs with vertical orientation for sidebar-style
                        navigation.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <Tabs name='vertical-tabs' orientation='vertical'>
                                <TabsList orientation='vertical'>
                                    <TabsTrigger
                                        value='profile'
                                        name='vertical-tabs'
                                        checked
                                    >
                                        Profile
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value='settings'
                                        name='vertical-tabs'
                                    >
                                        Settings
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value='billing'
                                        name='vertical-tabs'
                                    >
                                        Billing
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value='security'
                                        name='vertical-tabs'
                                    >
                                        Security
                                    </TabsTrigger>
                                </TabsList>
                                <div class='flex-1'>
                                    <TabsContent
                                        value='profile'
                                        name='vertical-tabs'
                                        class='mt-0'
                                    >
                                        <div class='p-4 space-y-2'>
                                            <h3 class='font-pixel text-sm'>
                                                Profile Settings
                                            </h3>
                                            <p class='text-sm text-muted-foreground'>
                                                Manage your public profile
                                                information.
                                            </p>
                                            <Input placeholder='Display name' />
                                        </div>
                                    </TabsContent>
                                    <TabsContent
                                        value='settings'
                                        name='vertical-tabs'
                                        class='mt-0'
                                    >
                                        <div class='p-4 space-y-2'>
                                            <h3 class='font-pixel text-sm'>
                                                General Settings
                                            </h3>
                                            <p class='text-sm text-muted-foreground'>
                                                Configure your application
                                                preferences.
                                            </p>
                                        </div>
                                    </TabsContent>
                                    <TabsContent
                                        value='billing'
                                        name='vertical-tabs'
                                        class='mt-0'
                                    >
                                        <div class='p-4 space-y-2'>
                                            <h3 class='font-pixel text-sm'>
                                                Billing Information
                                            </h3>
                                            <p class='text-sm text-muted-foreground'>
                                                Manage your subscription and
                                                payment methods.
                                            </p>
                                        </div>
                                    </TabsContent>
                                    <TabsContent
                                        value='security'
                                        name='vertical-tabs'
                                        class='mt-0'
                                    >
                                        <div class='p-4 space-y-2'>
                                            <h3 class='font-pixel text-sm'>
                                                Security Settings
                                            </h3>
                                            <p class='text-sm text-muted-foreground'>
                                                Configure two-factor
                                                authentication and security
                                                options.
                                            </p>
                                            <Button variant='primary'>
                                                Enable 2FA
                                            </Button>
                                        </div>
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Tabs name="vertical-tabs" orientation="vertical">
  <TabsList orientation="vertical">
    <TabsTrigger value="profile" name="vertical-tabs" checked>
      Profile
    </TabsTrigger>
    <TabsTrigger value="settings" name="vertical-tabs">
      Settings
    </TabsTrigger>
    <TabsTrigger value="billing" name="vertical-tabs">
      Billing
    </TabsTrigger>
  </TabsList>
  <div class="flex-1">
    <TabsContent value="profile" name="vertical-tabs" class="mt-0">
      <div class="p-4">
        Profile content here
      </div>
    </TabsContent>
    <TabsContent value="settings" name="vertical-tabs" class="mt-0">
      <div class="p-4">
        Settings content here
      </div>
    </TabsContent>
  </div>
</Tabs>`}
                    </CodeBlock>
                </section>

                {/* Tabs Advanced */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TABS (ADVANCED)
                    </h2>
                    <p class='text-sm text-muted-foreground mb-4'>
                        Multiple independent tab groups using Unpoly
                    </p>

                    {/* Grid layout for cards side by side */}
                    <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        {/* First Tab Group */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Tab Group 1</CardTitle>
                                <CardDescription>
                                    First independent tab group
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs name='fade-tabs'>
                                    <TabsList>
                                        <TabsTrigger
                                            value='fade-tab1'
                                            name='fade-tabs'
                                            checked
                                        >
                                            Tab 1
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='fade-tab2'
                                            name='fade-tabs'
                                        >
                                            Tab 2
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='fade-tab3'
                                            name='fade-tabs'
                                        >
                                            Tab 3
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent
                                        value='fade-tab1'
                                        name='fade-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Tab 1 Content
                                            </h3>
                                            <p>Content for first tab.</p>
                                            <Input placeholder='Test input field' />
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value='fade-tab2'
                                        name='fade-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Tab 2 Content
                                            </h3>
                                            <p>
                                                Content for second tab.
                                            </p>
                                            <Button variant='primary'>
                                                Click me
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value='fade-tab3'
                                        name='fade-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Tab 3 Content
                                            </h3>
                                            <p>Content for third tab.</p>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>

                        {/* Second Tab Group */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Tab Group 2</CardTitle>
                                <CardDescription>
                                    Second independent tab group
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs name='slide-tabs'>
                                    <TabsList>
                                        <TabsTrigger
                                            value='slide-tab1'
                                            name='slide-tabs'
                                            checked
                                        >
                                            Tab 1
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='slide-tab2'
                                            name='slide-tabs'
                                        >
                                            Tab 2
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='slide-tab3'
                                            name='slide-tabs'
                                        >
                                            Tab 3
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent
                                        value='slide-tab1'
                                        name='slide-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Slide Tab 1
                                            </h3>
                                            <p>
                                                This content slides up from the
                                                bottom.
                                            </p>
                                            <Input placeholder='Slide transition example' />
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value='slide-tab2'
                                        name='slide-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Slide Tab 2
                                            </h3>
                                            <p>
                                                Watch it slide smoothly into
                                                view.
                                            </p>
                                            <Button variant='secondary'>
                                                Secondary Button
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value='slide-tab3'
                                        name='slide-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Slide Tab 3
                                            </h3>
                                            <p>
                                                Third tab with slide-up
                                                animation.
                                            </p>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>

                        {/* Third Tab Group */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Tab Group 3</CardTitle>
                                <CardDescription>
                                    Third independent tab group
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs name='scale-tabs'>
                                    <TabsList>
                                        <TabsTrigger
                                            value='scale-tab1'
                                            name='scale-tabs'
                                            checked
                                        >
                                            Tab 1
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='scale-tab2'
                                            name='scale-tabs'
                                        >
                                            Tab 2
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='scale-tab3'
                                            name='scale-tabs'
                                        >
                                            Tab 3
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent
                                        value='scale-tab1'
                                        name='scale-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Move Right Tab 1
                                            </h3>
                                            <p>
                                                This content slides in from the
                                                right.
                                            </p>
                                            <Input placeholder='Move right example' />
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value='scale-tab2'
                                        name='scale-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Move Right Tab 2
                                            </h3>
                                            <p>
                                                Watch it slide smoothly from the
                                                right.
                                            </p>
                                            <Button variant='outline'>
                                                Outline Button
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value='scale-tab3'
                                        name='scale-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                Move Right Tab 3
                                            </h3>
                                            <p>
                                                Third tab with right-to-left
                                                slide.
                                            </p>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>

                        {/* Fourth Tab Group */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Tab Group 4</CardTitle>
                                <CardDescription>
                                    Fourth independent tab group
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs name='none-tabs'>
                                    <TabsList>
                                        <TabsTrigger
                                            value='none-tab1'
                                            name='none-tabs'
                                            checked
                                        >
                                            Tab 1
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='none-tab2'
                                            name='none-tabs'
                                        >
                                            Tab 2
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='none-tab3'
                                            name='none-tabs'
                                        >
                                            Tab 3
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent
                                        value='none-tab1'
                                        name='none-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                None Tab 1
                                            </h3>
                                            <p>
                                                This switches instantly without
                                                any transition.
                                            </p>
                                            <Input placeholder='No animation' />
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value='none-tab2'
                                        name='none-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                None Tab 2
                                            </h3>
                                            <p>
                                                Immediate content swap, no
                                                effects.
                                            </p>
                                            <Button variant='danger'>
                                                Danger Button
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value='none-tab3'
                                        name='none-tabs'
                                    >
                                        <div class='space-y-4 py-4'>
                                            <h3 class='font-semibold'>
                                                None Tab 3
                                            </h3>
                                            <p>Third tab, instant switching.</p>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>USAGE</h2>
                    <CodeBlock lang='tsx'>
                        {`import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@lockness/ui/components'

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href='/'>Home</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Current</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
