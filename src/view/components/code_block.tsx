const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
    </svg>
)

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"></path>
    </svg>
)

let copyId = 0

// Inline code snippet (without copy button, for inline text)
export const InlineCode = ({ children }: { children: string }) => {
    return (
        <code class="px-2 py-1 bg-primary/20 text-primary font-pixel-body text-sm border border-primary/30">
            {children}
        </code>
    )
}

// Inline command with copy button (for single line commands)
export const Command = ({ children }: { children: string }) => {
    const id = `cmd-${copyId++}`
    const copyBtnId = `copy-${id}`
    const copyIconId = `copy-icon-${id}`
    const checkIconId = `check-icon-${id}`
    
    return (
        <>
            <div class="relative inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg my-4 group">
                <code id={id} class="flex-1 font-mono text-sm">{children}</code>
                <button
                    id={copyBtnId}
                    class='flex items-center gap-1 px-2 py-1 text-xs opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white transition-all cursor-pointer bg-transparent border border-gray-700 hover:border-gray-500 rounded'
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
            
            <script dangerouslySetInnerHTML={{__html: `
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
            `}} />
        </>
    )
}

export const CommandBlock = ({ children, lang = 'bash' }: { children: string; lang?: string }) => {
    const id = `cmd-${copyId++}`
    const copyBtnId = `copy-${id}`
    const copyIconId = `copy-icon-${id}`
    const checkIconId = `check-icon-${id}`
    
    return (
        <>
            <div class='my-6 pixel-code overflow-hidden'>
                <div class='flex items-center justify-between px-4 py-2 bg-card/50 border-b-3 border-border'>
                    <div class='flex items-center gap-2'>
                        <div class='flex gap-2'>
                            <div class='w-3 h-3 bg-red-500/80'></div>
                            <div class='w-3 h-3 bg-yellow-500/80'></div>
                            <div class='w-3 h-3 bg-green-500/80'></div>
                        </div>
                        <span class='ml-2 text-sm text-primary font-pixel-body'>{lang}</span>
                    </div>
                    <button
                        id={copyBtnId}
                        class='flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent border-2 border-border hover:border-primary'
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
                <pre class='p-4 overflow-x-auto'>
                    <code id={id} class='text-foreground font-pixel-body text-sm leading-relaxed whitespace-pre'>{children}</code>
                </pre>
            </div>
            
            <script dangerouslySetInnerHTML={{__html: `
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
            `}} />
        </>
    )
}

export const CodeBlock = ({ children, lang = 'typescript' }: { children: string; lang?: string }) => (
    <div class='my-6 pixel-code overflow-hidden'>
        <div class='flex items-center gap-2 px-4 py-2 bg-card/50 border-b-3 border-border'>
            <div class='flex gap-2'>
                <div class='w-3 h-3 bg-red-500/80'></div>
                <div class='w-3 h-3 bg-yellow-500/80'></div>
                <div class='w-3 h-3 bg-green-500/80'></div>
            </div>
            <span class='ml-2 text-sm text-primary font-pixel-body'>{lang}</span>
        </div>
        <pre class='p-4 overflow-x-auto'>
            <code class='text-foreground font-pixel-body text-sm leading-relaxed whitespace-pre'>{children}</code>
        </pre>
    </div>
)
