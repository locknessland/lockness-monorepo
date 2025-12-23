import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface MarkdownBlock {
    type: 'heading' | 'paragraph' | 'code' | 'list' | 'blockquote'
    content: string
    level?: number
    language?: string
    items?: string[]
}

/**
 * Parse markdown content into structured blocks
 */
export function parseMarkdown(content: string): MarkdownBlock[] {
    const lines = content.split('\n')
    const blocks: MarkdownBlock[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        // Skip empty lines
        if (!line.trim()) {
            i++
            continue
        }

        // Headings
        if (line.startsWith('#')) {
            const level = line.match(/^#+/)?.[0].length || 1
            const content = line.replace(/^#+\s*/, '')
            blocks.push({ type: 'heading', level, content })
            i++
            continue
        }

        // Code blocks
        if (line.startsWith('```')) {
            const language = line.slice(3).trim() || 'typescript'
            const codeLines: string[] = []
            i++
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i])
                i++
            }
            blocks.push({
                type: 'code',
                language,
                content: codeLines.join('\n'),
            })
            i++ // skip closing ```
            continue
        }

        // Blockquotes
        if (line.startsWith('>')) {
            const content = line.replace(/^>\s*/, '')
            blocks.push({ type: 'blockquote', content })
            i++
            continue
        }

        // Lists
        if (line.match(/^[\-\*]\s/)) {
            const items: string[] = []
            while (i < lines.length && lines[i].match(/^[\-\*]\s/)) {
                items.push(lines[i].replace(/^[\-\*]\s/, ''))
                i++
            }
            blocks.push({ type: 'list', items })
            continue
        }

        // Paragraphs
        const paragraphLines: string[] = []
        while (
            i < lines.length &&
            lines[i].trim() &&
            !lines[i].startsWith('#') &&
            !lines[i].startsWith('```') &&
            !lines[i].startsWith('>') &&
            !lines[i].match(/^[\-\*]\s/)
        ) {
            paragraphLines.push(lines[i])
            i++
        }
        if (paragraphLines.length > 0) {
            blocks.push({
                type: 'paragraph',
                content: paragraphLines.join(' '),
            })
        }
    }

    return blocks
}

/**
 * Load markdown content from a file
 */
export function loadMarkdownContent(filename: string): MarkdownBlock[] {
    const contentPath = join(
        Deno.cwd(),
        'src',
        'view',
        'pages',
        'docs',
        'content',
        `${filename}.md`,
    )
    const content = readFileSync(contentPath, 'utf-8')
    return parseMarkdown(content)
}

/**
 * Process inline markdown syntax (bold, italic, code)
 */
export function processInlineMarkdown(text: string): string {
    return text
        .replace(
            /`([^`]+)`/g,
            '<code class="px-2 py-1 bg-primary/20 text-primary font-pixel-body text-sm border border-primary/30 rounded">$1</code>',
        )
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}
