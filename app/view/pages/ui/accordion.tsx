import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const AccordionPage = () => {
    return (
        <PageUiLayout title='Accordion - Lockness UI' currentPath='/ui/accordion'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        ACCORDION
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Collapsible content sections with smooth animations
                    </p>
                </header>

                {/* Accordion */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        EXAMPLE
                    </h2>
                    <Accordion>
                        <AccordionItem value='item-1'>
                            <AccordionTrigger>
                                Is it accessible?
                            </AccordionTrigger>
                            <AccordionContent>
                                Yes. It adheres to the WAI-ARIA design pattern
                                and uses native HTML details/summary elements.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value='item-2'>
                            <AccordionTrigger>Is it styled?</AccordionTrigger>
                            <AccordionContent>
                                Yes. It comes with default styles that use CSS
                                variables for easy theming.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value='item-3'>
                            <AccordionTrigger>
                                Can it be animated?
                            </AccordionTrigger>
                            <AccordionContent>
                                Yes. The component uses CSS transitions for
                                smooth expand/collapse animations.
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>USAGE</h2>
                    <CodeBlock lang='tsx'>
                        {`import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@lockness/ui/components'

<Accordion>
  <AccordionItem value='item-1'>
    <AccordionTrigger>Question?</AccordionTrigger>
    <AccordionContent>Answer.</AccordionContent>
  </AccordionItem>
</Accordion>`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
