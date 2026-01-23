/**
 * @fileoverview Live examples for Input component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { Label } from '../Label/mod.tsx'
import { Input } from './mod.tsx'

const inputProps: PropDefinition[] = [
    {
        name: 'type',
        type:
            'text | email | password | number | tel | url | search | date | time | file | hidden',
        default: 'text',
        description: 'Input type',
    },
    { name: 'name', type: 'string', description: 'Input name attribute' },
    { name: 'value', type: 'string | number', description: 'Input value' },
    { name: 'placeholder', type: 'string', description: 'Placeholder text' },
    { name: 'disabled', type: 'boolean', description: 'Disable input' },
    { name: 'readonly', type: 'boolean', description: 'Read-only input' },
    { name: 'required', type: 'boolean', description: 'Required field' },
    {
        name: 'autocomplete',
        type: 'string',
        description: 'Autocomplete attribute',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
    { name: 'id', type: 'string', description: 'Element id attribute' },
]

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    {
        title: 'Basic Input',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <Input type='text' placeholder='Enter your name' />
                        <Input type='email' placeholder='you@example.com' />
                        <Input type='password' placeholder='Enter password' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Input } from '@lockness/ui/components'

<Input type="text" placeholder="Enter your name" />
<Input type="email" placeholder="you@example.com" />
<Input type="password" placeholder="Enter password" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='space-y-2'>
                            <Label for='email-input'>Email</Label>
                            <Input
                                id='email-input'
                                type='email'
                                placeholder='you@example.com'
                            />
                        </div>
                        <div class='space-y-2'>
                            <Label for='password-input'>Password</Label>
                            <Input
                                id='password-input'
                                type='password'
                                placeholder='Enter your password'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Input, Label } from '@lockness/ui/components'

<div class="space-y-2">
  <Label for="email">Email</Label>
  <Input id="email" type="email" placeholder="you@example.com" />
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Input Types',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='grid gap-4 md:grid-cols-2'>
                            <div class='space-y-2'>
                                <Label for='text-input'>Text</Label>
                                <Input
                                    id='text-input'
                                    type='text'
                                    placeholder='Text input'
                                />
                            </div>
                            <div class='space-y-2'>
                                <Label for='number-input'>Number</Label>
                                <Input
                                    id='number-input'
                                    type='number'
                                    placeholder='123'
                                />
                            </div>
                            <div class='space-y-2'>
                                <Label for='tel-input'>Telephone</Label>
                                <Input
                                    id='tel-input'
                                    type='tel'
                                    placeholder='+1 (555) 123-4567'
                                />
                            </div>
                            <div class='space-y-2'>
                                <Label for='url-input'>URL</Label>
                                <Input
                                    id='url-input'
                                    type='url'
                                    placeholder='https://example.com'
                                />
                            </div>
                            <div class='space-y-2'>
                                <Label for='search-input'>Search</Label>
                                <Input
                                    id='search-input'
                                    type='search'
                                    placeholder='Search...'
                                />
                            </div>
                            <div class='space-y-2'>
                                <Label for='date-input'>Date</Label>
                                <Input id='date-input' type='date' />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Input type="text" placeholder="Text input" />
<Input type="number" placeholder="123" />
<Input type="tel" placeholder="+1 (555) 123-4567" />
<Input type="url" placeholder="https://example.com" />
<Input type="search" placeholder="Search..." />
<Input type="date" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'States',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='space-y-2'>
                            <Label for='disabled-input'>Disabled</Label>
                            <Input
                                id='disabled-input'
                                placeholder='Disabled input'
                                disabled
                            />
                        </div>
                        <div class='space-y-2'>
                            <Label for='readonly-input'>Read-only</Label>
                            <Input
                                id='readonly-input'
                                value='Read-only value'
                                readonly
                            />
                        </div>
                        <div class='space-y-2'>
                            <Label for='required-input'>
                                Required <span class='text-destructive'>*</span>
                            </Label>
                            <Input
                                id='required-input'
                                placeholder='Required field'
                                required
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`// Disabled
<Input placeholder="Disabled input" disabled />

// Read-only
<Input value="Read-only value" readonly />

// Required
<Input placeholder="Required field" required />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'File Input',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='space-y-2'>
                            <Label for='file-input'>Upload File</Label>
                            <Input id='file-input' type='file' />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class="space-y-2">
  <Label for="file">Upload File</Label>
  <Input id="file" type="file" />
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Styling',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <Input class='max-w-sm' placeholder='Max width small' />
                        <Input
                            class='max-w-xs'
                            placeholder='Max width extra small'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Input class="max-w-sm" placeholder="Max width small" />
<Input class="max-w-xs" placeholder="Max width extra small" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => <PropsTable props={inputProps} />,
    },
]
