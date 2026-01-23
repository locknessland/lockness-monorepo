/**
 * @fileoverview Live examples for Chart component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import {
    AreaChart,
    BarChart,
    ChartLegend,
    ChartScript,
    LineChart,
} from './mod.tsx'

const areaChartProps: PropDefinition[] = [
    {
        name: 'chartId',
        type: 'string',
        required: true,
        description: 'Unique ID for the chart',
    },
    {
        name: 'labels',
        type: 'string[]',
        required: true,
        description: 'Chart labels (x-axis)',
    },
    { name: 'data', type: 'number[]', description: 'Single dataset values' },
    {
        name: 'datasets',
        type: 'ChartDataset[]',
        description: 'Multiple datasets for comparison',
    },
    {
        name: 'color',
        type: 'string',
        default: 'rgb(59, 130, 246)',
        description: 'Primary color for single dataset',
    },
    {
        name: 'fillColor',
        type: 'string',
        default: 'rgba(59, 130, 246, 0.1)',
        description: 'Fill color for single dataset',
    },
    {
        name: 'curved',
        type: 'boolean',
        default: 'false',
        description: 'Whether to use curved lines',
    },
    {
        name: 'height',
        type: 'string',
        default: '300px',
        description: 'Chart height',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const chartLegendProps: PropDefinition[] = [
    {
        name: 'items',
        type: 'ChartLegendItemProps[]',
        required: true,
        description: 'Legend items with label and color',
    },
    {
        name: 'position',
        type: 'start | center | end',
        default: 'end',
        description: 'Position of the legend',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

export interface ExampleSection {
    title: string
    render: () => unknown
}

// Sample data for examples
const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
const singleData = [65, 59, 80, 81, 56, 55, 72]
const incomeData = [65, 59, 80, 81, 56, 55, 72]
const outcomeData = [28, 48, 40, 19, 86, 27, 50]

export const examples: ExampleSection[] = [
    {
        title: 'Installation',
        render: () => (
            <div class='space-y-4'>
                <p class='text-muted-foreground'>
                    Include the ChartScript component once in your layout or
                    page to load Chart.js from CDN.
                </p>
                <CodeBlock lang='tsx'>
                    {`import { ChartScript } from '@lockness/ui/components'

// In your layout or page
<ChartScript />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Single Area Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ChartScript />
                        <AreaChart
                            chartId='single-area-chart-example'
                            labels={labels}
                            data={singleData}
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { AreaChart } from '@lockness/ui/components'

<AreaChart
  chartId="single-area-chart"
  labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']}
  data={[65, 59, 80, 81, 56, 55, 72]}
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Multiple Area Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ChartLegend
                            items={[
                                { label: 'Income', color: 'rgb(59, 130, 246)' },
                                {
                                    label: 'Outcome',
                                    color: 'rgb(147, 51, 234)',
                                },
                            ]}
                        />
                        <AreaChart
                            chartId='multiple-area-chart-example'
                            labels={labels}
                            datasets={[
                                {
                                    name: 'Income',
                                    data: incomeData,
                                    color: 'rgb(59, 130, 246)',
                                },
                                {
                                    name: 'Outcome',
                                    data: outcomeData,
                                    color: 'rgb(147, 51, 234)',
                                },
                            ]}
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { AreaChart, ChartLegend } from '@lockness/ui/components'

<ChartLegend
  items={[
    { label: 'Income', color: 'rgb(59, 130, 246)' },
    { label: 'Outcome', color: 'rgb(147, 51, 234)' },
  ]}
/>
<AreaChart
  chartId="multiple-area-chart"
  labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']}
  datasets={[
    { name: 'Income', data: [65, 59, 80, 81, 56, 55, 72], color: 'rgb(59, 130, 246)' },
    { name: 'Outcome', data: [28, 48, 40, 19, 86, 27, 50], color: 'rgb(147, 51, 234)' },
  ]}
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Curved Area Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ChartLegend
                            items={[
                                { label: 'Income', color: 'rgb(59, 130, 246)' },
                                {
                                    label: 'Outcome',
                                    color: 'rgb(147, 51, 234)',
                                },
                            ]}
                        />
                        <AreaChart
                            chartId='curved-area-chart-example'
                            labels={labels}
                            datasets={[
                                {
                                    name: 'Income',
                                    data: incomeData,
                                    color: 'rgb(59, 130, 246)',
                                },
                                {
                                    name: 'Outcome',
                                    data: outcomeData,
                                    color: 'rgb(147, 51, 234)',
                                },
                            ]}
                            curved
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<AreaChart
  chartId="curved-area-chart"
  labels={labels}
  datasets={datasets}
  curved
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Colors',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <AreaChart
                            chartId='custom-color-chart-example'
                            labels={labels}
                            data={singleData}
                            color='rgb(34, 197, 94)'
                            fillColor='rgba(34, 197, 94, 0.15)'
                            curved
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<AreaChart
  chartId="custom-color-chart"
  labels={labels}
  data={data}
  color="rgb(34, 197, 94)"
  fillColor="rgba(34, 197, 94, 0.15)"
  curved
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Single Bar Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <BarChart
                            chartId='single-bar-chart-example'
                            labels={labels}
                            data={singleData}
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { BarChart } from '@lockness/ui/components'

<BarChart
  chartId="single-bar-chart"
  labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']}
  data={[65, 59, 80, 81, 56, 55, 72]}
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Multiple Bar Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ChartLegend
                            items={[
                                { label: 'Income', color: 'rgb(59, 130, 246)' },
                                {
                                    label: 'Outcome',
                                    color: 'rgb(209, 213, 219)',
                                },
                            ]}
                        />
                        <BarChart
                            chartId='multiple-bar-chart-example'
                            labels={labels}
                            datasets={[
                                {
                                    name: 'Income',
                                    data: incomeData,
                                    color: 'rgb(59, 130, 246)',
                                },
                                {
                                    name: 'Outcome',
                                    data: outcomeData,
                                    color: 'rgb(209, 213, 219)',
                                },
                            ]}
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ChartLegend
  items={[
    { label: 'Income', color: 'rgb(59, 130, 246)' },
    { label: 'Outcome', color: 'rgb(209, 213, 219)' },
  ]}
/>
<BarChart
  chartId="multiple-bar-chart"
  labels={labels}
  datasets={[
    { name: 'Income', data: incomeData, color: 'rgb(59, 130, 246)' },
    { name: 'Outcome', data: outcomeData, color: 'rgb(209, 213, 219)' },
  ]}
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Horizontal Bar Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <BarChart
                            chartId='horizontal-bar-chart-example'
                            labels={[
                                'Product A',
                                'Product B',
                                'Product C',
                                'Product D',
                                'Product E',
                            ]}
                            data={[85, 72, 96, 54, 68]}
                            horizontal
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<BarChart
  chartId="horizontal-bar-chart"
  labels={['Product A', 'Product B', 'Product C', 'Product D', 'Product E']}
  data={[85, 72, 96, 54, 68]}
  horizontal
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Single Line Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <LineChart
                            chartId='single-line-chart-example'
                            labels={labels}
                            data={singleData}
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { LineChart } from '@lockness/ui/components'

<LineChart
  chartId="single-line-chart"
  labels={labels}
  data={data}
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Multiple Line Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ChartLegend
                            items={[
                                { label: 'Income', color: 'rgb(59, 130, 246)' },
                                {
                                    label: 'Outcome',
                                    color: 'rgb(147, 51, 234)',
                                },
                            ]}
                        />
                        <LineChart
                            chartId='multiple-line-chart-example'
                            labels={labels}
                            datasets={[
                                {
                                    name: 'Income',
                                    data: incomeData,
                                    color: 'rgb(59, 130, 246)',
                                },
                                {
                                    name: 'Outcome',
                                    data: outcomeData,
                                    color: 'rgb(147, 51, 234)',
                                },
                            ]}
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ChartLegend
  items={[
    { label: 'Income', color: 'rgb(59, 130, 246)' },
    { label: 'Outcome', color: 'rgb(147, 51, 234)' },
  ]}
/>
<LineChart
  chartId="multiple-line-chart"
  labels={labels}
  datasets={[
    { name: 'Income', data: incomeData, color: 'rgb(59, 130, 246)' },
    { name: 'Outcome', data: outcomeData, color: 'rgb(147, 51, 234)' },
  ]}
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Curved Line Chart',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ChartLegend
                            items={[
                                { label: 'Income', color: 'rgb(59, 130, 246)' },
                                {
                                    label: 'Outcome',
                                    color: 'rgb(147, 51, 234)',
                                },
                            ]}
                        />
                        <LineChart
                            chartId='curved-line-chart-example'
                            labels={labels}
                            datasets={[
                                {
                                    name: 'Income',
                                    data: incomeData,
                                    color: 'rgb(59, 130, 246)',
                                },
                                {
                                    name: 'Outcome',
                                    data: outcomeData,
                                    color: 'rgb(147, 51, 234)',
                                },
                            ]}
                            curved
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<LineChart
  chartId="curved-line-chart"
  labels={labels}
  datasets={datasets}
  curved
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => (
            <div class='space-y-6'>
                <PropsTable
                    title='AreaChart / BarChart / LineChart'
                    props={areaChartProps}
                />
                <PropsTable title='ChartLegend' props={chartLegendProps} />
            </div>
        ),
    },
]
