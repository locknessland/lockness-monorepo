import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

const CopyIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='14'
        height='14'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <rect width='14' height='14' x='8' y='8' rx='2' ry='2'></rect>
        <path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'>
        </path>
    </svg>
)

const CheckIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='14'
        height='14'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M20 6 9 17l-5-5'></path>
    </svg>
)

let copyId = 0

/**
 * Inline code snippet (without copy button, for inline text)
 *
 * CSS Variables (customize in app.css):
 * - --inline-code-padding-x: Horizontal padding (default: 0.375rem)
 * - --inline-code-padding-y: Vertical padding (default: 0.125rem)
 * - --inline-code-font-size: Font size (default: 0.875em)
 * - --inline-code-font-weight: Font weight (default: 500)
 * - --inline-code-border-radius: Border radius (default: var(--radius))
 * - --inline-code-border-width: Border width (default: 1px)
 * - --inline-code-background: Background color (default: var(--muted))
 * - --inline-code-foreground: Text color (default: var(--foreground))
 * - --inline-code-border-color: Border color (default: var(--border))
 */
export interface InlineCodeProps {
    /**
     * Code content
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

export const InlineCode: FC<InlineCodeProps> = ({
    children,
    class: className,
    ...props
}) => {
    return (
        <code
            class={cn(
                'inline-flex items-center',
                'px-(--inline-code-padding-x) py-(--inline-code-padding-y)',
                'text-(length:--inline-code-font-size) font-(--inline-code-font-weight)',
                'font-mono whitespace-nowrap',
                'rounded-(--inline-code-border-radius)',
                'border-(length:--inline-code-border-width) border-(--inline-code-border-color)',
                'bg-(--inline-code-background) text-(--inline-code-foreground)',
                className,
            )}
            {...props}
        >
            {children}
        </code>
    )
}

/**
 * Inline command with copy button (for single line commands)
 */
export interface CommandProps {
    children: string
}

export const Command: FC<CommandProps> = ({ children }) => {
    const id = `cmd-${copyId++}`
    const copyBtnId = `copy-${id}`
    const copyIconId = `copy-icon-${id}`
    const checkIconId = `check-icon-${id}`

    return (
        <>
            <div class='relative inline-flex items-center gap-2 bg-code-background text-code-foreground px-4 py-2 my-4 group border border-code-border rounded-(--radius)'>
                <code
                    id={id}
                    class='flex-1 font-mono'
                    style='font-size: var(--code-font-size); line-height: var(--code-line-height);'
                >
                    {children}
                </code>
                <button
                    type='button'
                    id={copyBtnId}
                    class='opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-transparent rounded-(--radius) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-(--ring-offset)'
                    title='Copy to clipboard'
                >
                    <span id={copyIconId}>
                        <CopyIcon />
                    </span>
                    <span id={checkIconId} class='hidden'>
                        <CheckIcon />
                    </span>
                </button>
            </div>

            <script
                dangerouslySetInnerHTML={{
                    __html: `
                document.getElementById('${copyBtnId}').addEventListener('click', async function() {
                    const text = document.getElementById('${id}').textContent;
                    try {
                        await navigator.clipboard.writeText(text);
                        document.getElementById('${copyIconId}').classList.add('hidden');
                        document.getElementById('${checkIconId}').classList.remove('hidden');
                        setTimeout(() => {
                            document.getElementById('${copyIconId}').classList.remove('hidden');
                            document.getElementById('${checkIconId}').classList.add('hidden');
                        }, 2000);
                    } catch (err) {
                        console.error('Failed to copy:', err);
                    }
                });
            `,
                }}
            />
        </>
    )
}

/**
 * Command block with syntax highlighting and copy button
 */
export interface CommandBlockProps {
    children: string
    lang?: string
}

export const CommandBlock: FC<CommandBlockProps> = (
    { children, lang = 'bash' },
) => {
    const id = `cmd-${copyId++}`
    const copyBtnId = `copy-${id}`
    const copyIconId = `copy-icon-${id}`
    const checkIconId = `check-icon-${id}`

    return (
        <>
            <div class='my-6 overflow-hidden border border-code-border bg-code-background rounded-(--radius)'>
                <div class='flex items-center justify-between px-4 py-2 bg-code-header-background border-b border-code-border'>
                    <div class='flex items-center gap-2'>
                        <div class='flex gap-2'>
                            <div class='w-3 h-3 bg-red-500/80 rounded-(--radius)'>
                            </div>
                            <div class='w-3 h-3 bg-yellow-500/80 rounded-(--radius)'>
                            </div>
                            <div class='w-3 h-3 bg-green-500/80 rounded-(--radius)'>
                            </div>
                        </div>
                        <span class='ml-2 text-sm text-primary font-pixel-body'>
                            {lang}
                        </span>
                    </div>
                    <button
                        type='button'
                        id={copyBtnId}
                        class='text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent rounded-(--radius) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2'
                        title='Copy to clipboard'
                    >
                        <span id={copyIconId}>
                            <CopyIcon />
                        </span>
                        <span id={checkIconId} class='hidden'>
                            <CheckIcon />
                        </span>
                    </button>
                </div>
                <div class='p-6'>
                    <pre class='overflow-x-auto'>
                    <code
                        id={id}
                        class={`language-${lang} block`}
                        style='font-size: var(--code-font-size); line-height: var(--code-line-height); color: var(--code-foreground);'
                    >
                        {children}
                    </code>
                    </pre>
                </div>
            </div>

            <script
                dangerouslySetInnerHTML={{
                    __html: `
                (function() {
                    const codeEl = document.getElementById('${id}');
                    if (window.Prism) {
                        Prism.highlightElement(codeEl);
                    }
                    
                    document.getElementById('${copyBtnId}').addEventListener('click', async function() {
                        const text = codeEl.textContent;
                        try {
                            await navigator.clipboard.writeText(text);
                            document.getElementById('${copyIconId}').classList.add('hidden');
                            document.getElementById('${checkIconId}').classList.remove('hidden');
                            setTimeout(() => {
                                document.getElementById('${copyIconId}').classList.remove('hidden');
                                document.getElementById('${checkIconId}').classList.add('hidden');
                            }, 2000);
                        } catch (err) {
                            console.error('Failed to copy:', err);
                        }
                    });
                })();
            `,
                }}
            />
        </>
    )
}

/**
 * Code block with syntax highlighting (no copy button)
 */
export interface CodeBlockProps {
    children: string
    lang?: string
}

export const CodeBlock: FC<CodeBlockProps> = (
    { children, lang = 'typescript' },
) => {
    const id = `code-${copyId++}`
    const copyBtnId = `copy-${id}`
    const copyIconId = `copy-icon-${id}`
    const checkIconId = `check-icon-${id}`

    return (
        <>
            <div class='my-6 overflow-hidden border border-code-border bg-code-background max-w-full rounded-(--radius)'>
                <div class='flex items-center justify-between px-4 py-2 bg-code-header-background border-b border-code-border'>
                    <div class='flex items-center gap-2'>
                        <div class='flex gap-2'>
                            <div class='w-3 h-3 bg-red-500/80 rounded-(--radius)'>
                            </div>
                            <div class='w-3 h-3 bg-yellow-500/80 rounded-(--radius)'>
                            </div>
                            <div class='w-3 h-3 bg-green-500/80 rounded-(--radius)'>
                            </div>
                        </div>
                        <span class='ml-2 text-sm text-primary font-pixel-body'>
                            {lang}
                        </span>
                    </div>
                    <button
                        type='button'
                        id={copyBtnId}
                        class='text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent rounded-(--radius) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-(--ring-offset)'
                        title='Copy to clipboard'
                    >
                        <span id={copyIconId}>
                            <CopyIcon />
                        </span>
                        <span id={checkIconId} class='hidden'>
                            <CheckIcon />
                        </span>
                    </button>
                </div>
                <pre class='p-6 overflow-x-auto max-w-full'>
                    <code
                        id={id}
                        class={`language-${lang} block`}
                        style='font-size: var(--code-font-size); line-height: var(--code-line-height); color: var(--code-foreground);'
                    >
                        {children}
                    </code>
                </pre>
            </div>

            <script
                dangerouslySetInnerHTML={{
                    __html: `
                (function() {
                    const codeEl = document.getElementById('${id}');
                    if (window.Prism) {
                        Prism.highlightElement(codeEl);
                    }
                    
                    document.getElementById('${copyBtnId}').addEventListener('click', async function() {
                        const text = codeEl.textContent;
                        try {
                            await navigator.clipboard.writeText(text);
                            document.getElementById('${copyIconId}').classList.add('hidden');
                            document.getElementById('${checkIconId}').classList.remove('hidden');
                            setTimeout(() => {
                                document.getElementById('${copyIconId}').classList.remove('hidden');
                                document.getElementById('${checkIconId}').classList.add('hidden');
                            }, 2000);
                        } catch (err) {
                            console.error('Failed to copy:', err);
                        }
                    });
                })();
            `,
                }}
            />
        </>
    )
}
