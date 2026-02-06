/**
 * @fileoverview Live examples for Checkbox component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'
import { Label } from '../Label/mod.tsx'
import { Checkbox } from './mod.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Checkbox'),
    {
        title: 'Basic Checkbox',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center space-x-2'>
                            <Checkbox id='terms' />
                            <Label for='terms'>
                                Accept terms and conditions
                            </Label>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Checkbox, Label } from '@lockness/ui/components'

<div class="flex items-center space-x-2">
  <Checkbox id="terms" />
  <Label for="terms">Accept terms and conditions</Label>
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Checked State',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center space-x-2'>
                            <Checkbox id='checked-default' checked />
                            <Label for='checked-default'>
                                Checked by default
                            </Label>
                        </div>
                        <div class='flex items-center space-x-2'>
                            <Checkbox id='unchecked' />
                            <Label for='unchecked'>Unchecked</Label>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`// Checked by default
<Checkbox checked />

// Unchecked
<Checkbox />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Disabled State',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center space-x-2'>
                            <Checkbox id='disabled-unchecked' disabled />
                            <Label for='disabled-unchecked' class='opacity-50'>
                                Disabled unchecked
                            </Label>
                        </div>
                        <div class='flex items-center space-x-2'>
                            <Checkbox id='disabled-checked' disabled checked />
                            <Label for='disabled-checked' class='opacity-50'>
                                Disabled checked
                            </Label>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`// Disabled unchecked
<Checkbox disabled />

// Disabled checked
<Checkbox disabled checked />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Form',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <form class='space-y-4'>
                            <div class='flex items-center space-x-2'>
                                <Checkbox
                                    id='newsletter'
                                    name='newsletter'
                                    value='yes'
                                />
                                <Label for='newsletter'>
                                    Subscribe to newsletter
                                </Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Checkbox
                                    id='marketing'
                                    name='marketing'
                                    value='yes'
                                />
                                <Label for='marketing'>
                                    Receive marketing emails
                                </Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Checkbox
                                    id='required-terms'
                                    name='terms'
                                    required
                                />
                                <Label for='required-terms'>
                                    I agree to the terms{' '}
                                    <span class='text-destructive'>*</span>
                                </Label>
                            </div>
                        </form>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<form class="space-y-4">
  <div class="flex items-center space-x-2">
    <Checkbox id="newsletter" name="newsletter" value="yes" />
    <Label for="newsletter">Subscribe to newsletter</Label>
  </div>
  <div class="flex items-center space-x-2">
    <Checkbox id="terms" name="terms" required />
    <Label for="terms">
      I agree to the terms <span class="text-destructive">*</span>
    </Label>
  </div>
</form>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Checkbox Group',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <fieldset class='space-y-3'>
                            <legend class='text-sm font-medium mb-2'>
                                Select your interests:
                            </legend>
                            <div class='flex items-center space-x-2'>
                                <Checkbox
                                    id='tech'
                                    name='interests'
                                    value='tech'
                                />
                                <Label for='tech'>Technology</Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Checkbox
                                    id='design'
                                    name='interests'
                                    value='design'
                                />
                                <Label for='design'>Design</Label>
                            </div>
                            <div class='flex items-center space-x-2'>
                                <Checkbox
                                    id='business'
                                    name='interests'
                                    value='business'
                                />
                                <Label for='business'>Business</Label>
                            </div>
                        </fieldset>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<fieldset class="space-y-3">
  <legend class="text-sm font-medium mb-2">
    Select your interests:
  </legend>
  <div class="flex items-center space-x-2">
    <Checkbox id="tech" name="interests" value="tech" />
    <Label for="tech">Technology</Label>
  </div>
  <div class="flex items-center space-x-2">
    <Checkbox id="design" name="interests" value="design" />
    <Label for="design">Design</Label>
  </div>
</fieldset>`}
                </CodeBlock>
            </div>
        ),
    },
]
