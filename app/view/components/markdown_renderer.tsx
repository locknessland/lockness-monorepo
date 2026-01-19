import { CodeBlock, CommandBlock } from '@lockness/ui/components'
import type { MarkdownBlock } from '../helpers/markdown.ts'
import { processInlineMarkdown } from '../helpers/markdown.ts'

interface MarkdownRendererProps {
    blocks: MarkdownBlock[]
    /** Skip the first H1 heading (useful when title is already in layout header) */
    skipFirstHeading?: boolean
}

export const MarkdownRenderer = (
    { blocks, skipFirstHeading = true }: MarkdownRendererProps,
) => {
    // Find the index of the first H1 to skip if needed
    const firstH1Index = skipFirstHeading
        ? blocks.findIndex((b) => b.type === 'heading' && b.level === 1)
        : -1

    return (
        <div class='prose prose-invert max-w-none'>
            {blocks.map((block, index) => {
                // Skip first H1 if skipFirstHeading is true
                if (index === firstH1Index) {
                    return null
                }

                switch (block.type) {
                    case 'heading':
                        if (block.level === 1) {
                            return (
                                <h1
                                    key={index}
                                    class='font-pixel text-xl text-primary mb-8 crt-glow'
                                    dangerouslySetInnerHTML={{
                                        __html: processInlineMarkdown(
                                            block.content,
                                        ),
                                    }}
                                />
                            )
                        } else if (block.level === 2) {
                            return (
                                <h2
                                    key={index}
                                    class='font-pixel text-base text-foreground mt-12 mb-6'
                                    dangerouslySetInnerHTML={{
                                        __html: processInlineMarkdown(
                                            block.content,
                                        ),
                                    }}
                                />
                            )
                        } else {
                            return (
                                <h3
                                    key={index}
                                    class='text-lg font-semibold text-foreground mt-8 mb-4'
                                    dangerouslySetInnerHTML={{
                                        __html: processInlineMarkdown(
                                            block.content,
                                        ),
                                    }}
                                />
                            )
                        }

                    case 'paragraph':
                        return (
                            <p
                                key={index}
                                class='text-lg leading-relaxed mb-4'
                                dangerouslySetInnerHTML={{
                                    __html: processInlineMarkdown(
                                        block.content,
                                    ),
                                }}
                            />
                        )

                    case 'code':
                        if (
                            block.language === 'bash' ||
                            block.language === 'terminal'
                        ) {
                            return (
                                <CommandBlock key={index} lang={block.language}>
                                    {block.content}
                                </CommandBlock>
                            )
                        }
                        return (
                            <CodeBlock key={index} lang={block.language}>
                                {block.content}
                            </CodeBlock>
                        )

                    case 'list':
                        return (
                            <ul
                                key={index}
                                class='list-disc list-inside space-y-2 mb-6 text-lg'
                            >
                                {block.items?.map((item: string, i: number) => (
                                    <li
                                        key={i}
                                        dangerouslySetInnerHTML={{
                                            __html: processInlineMarkdown(item),
                                        }}
                                    />
                                ))}
                            </ul>
                        )

                    case 'blockquote':
                        return (
                            <div
                                key={index}
                                class='pixel-card p-6 mt-8 bg-primary/10 border-primary'
                            >
                                <p
                                    class='mb-0'
                                    dangerouslySetInnerHTML={{
                                        __html: processInlineMarkdown(
                                            block.content,
                                        ),
                                    }}
                                />
                            </div>
                        )

                    default:
                        return null
                }
            })}
        </div>
    )
}
