/**
 * @fileoverview Live examples for Modal component
 */

import { Card, CardContent, CardHeader, CardTitle } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Button } from '../Button/mod.tsx'
import {
    Modal,
    ModalBody,
    ModalClose,
    ModalCloseIcon,
    ModalContent,
    ModalDescription,
    ModalFooter,
    ModalHeader,
    ModalTitle,
    ModalTrigger,
} from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Modal'),
    {
        title: 'Live Examples',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-4'>
                            <ModalTrigger
                                targetId='example-basic-modal'
                                variant='primary'
                            >
                                Basic Modal
                            </ModalTrigger>
                            <ModalTrigger
                                targetId='example-description-modal'
                                variant='secondary'
                            >
                                With Description
                            </ModalTrigger>
                            <ModalTrigger
                                targetId='example-confirmation-modal'
                                variant='outline'
                            >
                                Confirmation
                            </ModalTrigger>
                            <ModalTrigger
                                targetId='example-form-modal'
                                variant='ghost'
                            >
                                Form Modal
                            </ModalTrigger>
                        </div>
                    </CardContent>
                </Card>

                {/* Modal definitions for live demo */}
                <Modal id='example-basic-modal'>
                    <ModalContent>
                        <ModalHeader>
                            <ModalTitle>Basic Modal</ModalTitle>
                            <ModalCloseIcon />
                        </ModalHeader>
                        <ModalBody>
                            <p class='text-muted-foreground'>
                                This is a basic modal dialog. It uses the native
                                HTML{' '}
                                <code class='px-1 py-0.5 bg-muted rounded text-xs'>
                                    &lt;dialog&gt;
                                </code>{' '}
                                element with pure CSS styling.
                            </p>
                            <p class='text-muted-foreground mt-4'>
                                Press ESC or click outside to close.
                            </p>
                        </ModalBody>
                        <ModalFooter>
                            <ModalClose>Close</ModalClose>
                        </ModalFooter>
                    </ModalContent>
                </Modal>

                <Modal id='example-description-modal'>
                    <ModalContent>
                        <ModalHeader>
                            <div>
                                <ModalTitle>Modal with Description</ModalTitle>
                                <ModalDescription>
                                    This modal includes a description below the
                                    title
                                </ModalDescription>
                            </div>
                            <ModalCloseIcon />
                        </ModalHeader>
                        <ModalBody>
                            <p class='text-muted-foreground'>
                                The description provides additional context
                                about what the modal is for.
                            </p>
                        </ModalBody>
                        <ModalFooter>
                            <ModalClose>Got it</ModalClose>
                        </ModalFooter>
                    </ModalContent>
                </Modal>

                <Modal id='example-confirmation-modal'>
                    <ModalContent>
                        <ModalHeader>
                            <ModalTitle>Confirm Action</ModalTitle>
                            <ModalCloseIcon />
                        </ModalHeader>
                        <ModalBody>
                            <p class='text-muted-foreground'>
                                Are you sure you want to proceed with this
                                action? This cannot be undone.
                            </p>
                        </ModalBody>
                        <ModalFooter>
                            <ModalClose>Cancel</ModalClose>
                            <Button variant='danger' size='sm'>
                                Confirm
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>

                <Modal id='example-form-modal'>
                    <ModalContent>
                        <ModalHeader>
                            <div>
                                <ModalTitle>Contact Form</ModalTitle>
                                <ModalDescription>
                                    Fill out the form below to send us a message
                                </ModalDescription>
                            </div>
                            <ModalCloseIcon />
                        </ModalHeader>
                        <ModalBody>
                            <form class='space-y-4'>
                                <div class='space-y-2'>
                                    <label
                                        for='example-name'
                                        class='text-sm font-medium text-foreground'
                                    >
                                        Name
                                    </label>
                                    <input
                                        type='text'
                                        id='example-name'
                                        class='w-full px-3 py-2 border border-input rounded-(--radius) bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-(--ring)'
                                        placeholder='Your name'
                                    />
                                </div>
                                <div class='space-y-2'>
                                    <label
                                        for='example-email'
                                        class='text-sm font-medium text-foreground'
                                    >
                                        Email
                                    </label>
                                    <input
                                        type='email'
                                        id='example-email'
                                        class='w-full px-3 py-2 border border-input rounded-(--radius) bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-(--ring)'
                                        placeholder='your@email.com'
                                    />
                                </div>
                                <div class='space-y-2'>
                                    <label
                                        for='example-message'
                                        class='text-sm font-medium text-foreground'
                                    >
                                        Message
                                    </label>
                                    <textarea
                                        id='example-message'
                                        rows={4}
                                        class='w-full px-3 py-2 border border-input rounded-(--radius) bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-(--ring)'
                                        placeholder='Your message...'
                                    />
                                </div>
                            </form>
                        </ModalBody>
                        <ModalFooter>
                            <ModalClose>Cancel</ModalClose>
                            <Button variant='primary' size='sm'>
                                Send Message
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            </div>
        ),
    },
    {
        title: 'Features',
        render: () => (
            <div class='space-y-4'>
                <div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <Card>
                        <CardHeader icon='✨'>
                            <CardTitle>Pure CSS</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p class='text-sm text-muted-foreground'>
                                Uses native HTML{' '}
                                <code class='px-1 py-0.5 bg-muted rounded text-xs'>
                                    &lt;dialog&gt;
                                </code>{' '}
                                element with zero custom JavaScript
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader icon='🎨'>
                            <CardTitle>Animated</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p class='text-sm text-muted-foreground'>
                                Smooth fade-in and zoom-in animations using
                                Tailwind CSS
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader icon='⌨️'>
                            <CardTitle>Accessible</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p class='text-sm text-muted-foreground'>
                                ESC key closes modal, click outside to dismiss,
                                focus trapping
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader icon='🔗'>
                            <CardTitle>Unpoly Support</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p class='text-sm text-muted-foreground'>
                                Can also use Unpoly layers for server-rendered
                                modals
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        ),
    },
    {
        title: 'Basic Usage',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='tsx'>
                    {`import {
  Modal,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalCloseIcon,
  ModalBody,
  ModalFooter,
  ModalClose,
} from '@lockness/ui/components'

// Trigger button
<ModalTrigger targetId="my-modal">Open Modal</ModalTrigger>

// Modal dialog
<Modal id="my-modal">
  <ModalContent>
    <ModalHeader>
      <ModalTitle>Modal Title</ModalTitle>
      <ModalCloseIcon />
    </ModalHeader>
    <ModalBody>
      <p>Your modal content goes here.</p>
    </ModalBody>
    <ModalFooter>
      <ModalClose>Close</ModalClose>
    </ModalFooter>
  </ModalContent>
</Modal>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Trigger Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-3'>
                            <ModalTrigger
                                targetId='example-basic-modal'
                                variant='primary'
                            >
                                Primary
                            </ModalTrigger>
                            <ModalTrigger
                                targetId='example-basic-modal'
                                variant='secondary'
                            >
                                Secondary
                            </ModalTrigger>
                            <ModalTrigger
                                targetId='example-basic-modal'
                                variant='outline'
                            >
                                Outline
                            </ModalTrigger>
                            <ModalTrigger
                                targetId='example-basic-modal'
                                variant='ghost'
                            >
                                Ghost
                            </ModalTrigger>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ModalTrigger targetId="my-modal" variant="primary">Primary</ModalTrigger>
<ModalTrigger targetId="my-modal" variant="secondary">Secondary</ModalTrigger>
<ModalTrigger targetId="my-modal" variant="outline">Outline</ModalTrigger>
<ModalTrigger targetId="my-modal" variant="ghost">Ghost</ModalTrigger>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Unpoly Layer Mode',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='tsx'>
                    {`// Opens a server-rendered page in an Unpoly layer
<ModalTrigger 
  href="/some-page" 
  variant="primary"
>
  Open Unpoly Layer
</ModalTrigger>`}
                </CodeBlock>
            </div>
        ),
    },
]
