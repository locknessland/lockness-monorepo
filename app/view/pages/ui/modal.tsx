import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
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
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const ModalPage = () => {
    return (
        <PageUiLayout title='Modal - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        MODAL
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Pure CSS modal dialogs using native HTML dialog element
                    </p>
                </header>

                {/* Live Examples */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        LIVE EXAMPLES
                    </h2>
                    <div class='flex flex-wrap gap-4'>
                        <ModalTrigger targetId='basic-modal' variant='primary'>
                            Basic Modal
                        </ModalTrigger>
                        <ModalTrigger
                            targetId='with-description-modal'
                            variant='secondary'
                        >
                            With Description
                        </ModalTrigger>
                        <ModalTrigger
                            targetId='confirmation-modal'
                            variant='outline'
                        >
                            Confirmation
                        </ModalTrigger>
                        <ModalTrigger targetId='form-modal' variant='ghost'>
                            Form Modal
                        </ModalTrigger>
                    </div>
                </section>

                {/* Features */}
                <section class='grid grid-cols-1 md:grid-cols-2 gap-4'>
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
                </section>

                {/* Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BASIC USAGE
                    </h2>
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
                </section>

                {/* Unpoly Layer Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        UNPOLY LAYER MODE
                    </h2>
                    <CodeBlock lang='tsx'>
                        {`// Opens a server-rendered page in an Unpoly layer
<ModalTrigger 
  href="/some-page" 
  variant="primary"
>
  Open Unpoly Layer
</ModalTrigger>`}
                    </CodeBlock>
                </section>

                {/* Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TRIGGER VARIANTS
                    </h2>
                    <div class='flex flex-wrap gap-3'>
                        <ModalTrigger
                            targetId='basic-modal'
                            variant='primary'
                        >
                            Primary
                        </ModalTrigger>
                        <ModalTrigger
                            targetId='basic-modal'
                            variant='secondary'
                        >
                            Secondary
                        </ModalTrigger>
                        <ModalTrigger
                            targetId='basic-modal'
                            variant='outline'
                        >
                            Outline
                        </ModalTrigger>
                        <ModalTrigger targetId='basic-modal' variant='ghost'>
                            Ghost
                        </ModalTrigger>
                    </div>
                </section>
            </div>

            {/* Modal Definitions */}
            <Modal id='basic-modal'>
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

            <Modal id='with-description-modal'>
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
                            The description provides additional context about
                            what the modal is for. This is useful for forms,
                            confirmations, or any action that needs
                            clarification.
                        </p>
                    </ModalBody>
                    <ModalFooter>
                        <ModalClose>Got it</ModalClose>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Modal id='confirmation-modal'>
                <ModalContent>
                    <ModalHeader>
                        <ModalTitle>Confirm Action</ModalTitle>
                        <ModalCloseIcon />
                    </ModalHeader>
                    <ModalBody>
                        <p class='text-muted-foreground'>
                            Are you sure you want to proceed with this action?
                            This cannot be undone.
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

            <Modal id='form-modal'>
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
                                    for='name'
                                    class='text-sm font-medium text-foreground'
                                >
                                    Name
                                </label>
                                <input
                                    type='text'
                                    id='name'
                                    class='w-full px-3 py-2 border border-input rounded-(--radius) bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-(--ring-offset)'
                                    placeholder='Your name'
                                />
                            </div>
                            <div class='space-y-2'>
                                <label
                                    for='email'
                                    class='text-sm font-medium text-foreground'
                                >
                                    Email
                                </label>
                                <input
                                    type='email'
                                    id='email'
                                    class='w-full px-3 py-2 border border-input rounded-(--radius) bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-(--ring-offset)'
                                    placeholder='your@email.com'
                                />
                            </div>
                            <div class='space-y-2'>
                                <label
                                    for='message'
                                    class='text-sm font-medium text-foreground'
                                >
                                    Message
                                </label>
                                <textarea
                                    id='message'
                                    rows={4}
                                    class='w-full px-3 py-2 border border-input rounded-(--radius) bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-(--ring-offset)'
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
        </PageUiLayout>
    )
}
