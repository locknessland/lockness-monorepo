import { Service } from '@lockness/core'

interface LlmSection {
    name: string
    description: string
}

@Service()
export class LlmSectionService {
    private sections: LlmSection[] = [
        {
            name: 'lockness',
            description: 'Core principles and philosophy of Lockness',
        },
        { name: 'installation', description: 'Installation and setup guide' },
        { name: 'getting-started', description: 'First steps with Lockness' },
        {
            name: 'routing',
            description: 'Controllers, decorators, and routing',
        },
        { name: 'models', description: 'Database models with Drizzle ORM' },
        { name: 'validation', description: 'Request validation with Zod' },
        {
            name: 'authentication',
            description: 'Session-based authentication system',
        },
        { name: 'middleware', description: 'Class-based middleware' },
        { name: 'sessions', description: 'Multi-driver session management' },
        {
            name: 'dependency-injection',
            description: 'Dependency injection container',
        },
        { name: 'cli', description: 'CLI command reference' },
        { name: 'nessy', description: 'Nessy CLI wrapper' },
        { name: 'components', description: 'JSX components for views' },
        { name: 'ui', description: '@lockness/ui component library with CLI' },
        { name: 'devtools', description: 'Development tools and debugging' },
        { name: 'deprecation', description: 'Deprecation system and warnings' },
        { name: 'packages', description: 'Official Lockness packages' },
        {
            name: 'architecture',
            description: 'Framework architecture and design',
        },
        { name: 'testing', description: 'Testing guide and best practices' },
        { name: 'deployment', description: 'Deployment and production setup' },
        {
            name: 'error-handling',
            description: 'Error handling and custom error pages',
        },
        { name: 'contribution', description: 'Contributing to Lockness' },
    ]

    getAllSections(): LlmSection[] {
        return this.sections
    }

    getSectionByName(name: string): LlmSection | undefined {
        return this.sections.find((s) => s.name === name)
    }

    getSectionNames(): string[] {
        return this.sections.map((s) => s.name)
    }

    generateIndexText(): string {
        return [
            'Lockness Framework - LLM Documentation Index',
            '=============================================',
            '',
            'Complete list of available documentation files:',
            '',
            ...this.sections.map((s) =>
                `- https://lockness.land/llms/${s.name}.txt - ${s.description}`
            ),
            '',
            'Usage: Fetch any endpoint to get plain text documentation optimized for LLM consumption.',
            '',
            'Example: https://lockness.land/llms/routing.txt',
        ].join('\n')
    }
}
