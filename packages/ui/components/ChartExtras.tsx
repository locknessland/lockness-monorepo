/**
 * @fileoverview Additional chart components (Pie, Doughnut, Sparkline).
 *
 * Pie, Doughnut, Bubble, and Sparkline charts using Chart.js via CDN.
 *
 * @module @lockness/ui/components/chart-extras
 */

import type { FC } from '@lockness/core'
import type { JSX } from '@lockness/core/jsx-runtime'
import { cn } from '../lib/utils.ts'

/**
 * Pie/Doughnut chart data item
 */
export interface PieChartDataItem {
    /**
     * Label for the segment
     */
    label: string
    /**
     * Value for the segment
     */
    value: number
    /**
     * Color for the segment
     */
    color: string
}

/**
 * PieChart props
 */
export interface PieChartProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Unique ID for the chart (required for Chart.js initialization)
     */
    chartId: string
    /**
     * Data items with label, value, and color
     */
    data: PieChartDataItem[]
    /**
     * Whether to render as doughnut (with hole in center)
     * @default false
     */
    doughnut?: boolean
    /**
     * Cutout percentage for doughnut (0-100)
     * @default 70
     */
    cutout?: number
    /**
     * Chart size (width and height)
     * @default '250px'
     */
    size?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Element ID
     */
    id?: string
}

/**
 * PieChart Component
 *
 * A pie or doughnut chart component using Chart.js.
 *
 * @example
 * ```tsx
 * // Pie chart
 * <PieChart
 *   chartId="my-pie"
 *   data={[
 *     { label: 'Income', value: 50, color: 'rgb(59, 130, 246)' },
 *     { label: 'Outcome', value: 30, color: 'rgb(6, 182, 212)' },
 *     { label: 'Others', value: 20, color: 'rgb(209, 213, 219)' },
 *   ]}
 * />
 *
 * // Doughnut chart
 * <PieChart
 *   chartId="my-doughnut"
 *   data={data}
 *   doughnut
 * />
 * ```
 */
export const PieChart: FC<PieChartProps> = ({
    chartId,
    data,
    doughnut = false,
    cutout = 70,
    size = '250px',
    class: className,
    id,
    ...props
}) => {
    const chartConfig = {
        type: doughnut ? 'doughnut' : 'pie',
        data: {
            labels: data.map((d) => d.label),
            datasets: [
                {
                    data: data.map((d) => d.value),
                    backgroundColor: data.map((d) => d.color),
                    borderWidth: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: doughnut ? `${cutout}%` : 0,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                },
            },
        },
    }

    const configJson = JSON.stringify(chartConfig)

    return (
        <div id={id} class={cn('flex justify-center', className)} {...props}>
            <div style={`width: ${size}; height: ${size}`}>
                <canvas id={chartId} />
            </div>
            <script
                dangerouslySetInnerHTML={{
                    __html: `
(function() {
  function initChart() {
    if (typeof Chart === 'undefined') {
      setTimeout(initChart, 100);
      return;
    }
    const ctx = document.getElementById('${chartId}');
    if (!ctx) return;
    if (ctx._chartInstance) {
      ctx._chartInstance.destroy();
    }
    ctx._chartInstance = new Chart(ctx, ${configJson});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChart);
  } else {
    initChart();
  }
})();
`,
                }}
            />
        </div>
    )
}

/**
 * Bubble chart data item
 */
export interface BubbleChartDataItem {
    /**
     * X position
     */
    x: number
    /**
     * Y position
     */
    y: number
    /**
     * Bubble radius
     */
    r: number
}

/**
 * Bubble chart dataset
 */
export interface BubbleChartDataset {
    /**
     * Dataset name
     */
    name: string
    /**
     * Bubble data points
     */
    data: BubbleChartDataItem[]
    /**
     * Color for the bubbles
     */
    color: string
}

/**
 * BubbleChart props
 */
export interface BubbleChartProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Unique ID for the chart (required for Chart.js initialization)
     */
    chartId: string
    /**
     * Datasets with bubble data
     */
    datasets: BubbleChartDataset[]
    /**
     * Chart height
     * @default '300px'
     */
    height?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Element ID
     */
    id?: string
}

/**
 * BubbleChart Component
 *
 * A bubble chart component using Chart.js.
 *
 * @example
 * ```tsx
 * <BubbleChart
 *   chartId="my-bubble"
 *   datasets={[
 *     { name: 'Income', data: [{ x: 20, y: 30, r: 15 }, { x: 40, y: 10, r: 10 }], color: 'rgb(59, 130, 246)' },
 *     { name: 'Outcome', data: [{ x: 30, y: 20, r: 12 }], color: 'rgb(6, 182, 212)' },
 *   ]}
 * />
 * ```
 */
export const BubbleChart: FC<BubbleChartProps> = ({
    chartId,
    datasets,
    height = '300px',
    class: className,
    id,
    ...props
}) => {
    const chartConfig = {
        type: 'bubble',
        data: {
            datasets: datasets.map((ds) => ({
                label: ds.name,
                data: ds.data,
                backgroundColor: ds.color.replace('rgb', 'rgba').replace(
                    ')',
                    ', 0.6)',
                ),
                borderColor: ds.color,
                borderWidth: 1,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                },
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(156, 163, 175, 0.1)',
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        font: {
                            size: 12,
                        },
                    },
                },
                y: {
                    grid: {
                        color: 'rgba(156, 163, 175, 0.1)',
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        font: {
                            size: 12,
                        },
                    },
                },
            },
        },
    }

    const configJson = JSON.stringify(chartConfig)

    return (
        <div id={id} class={cn('relative', className)} {...props}>
            <div style={`height: ${height}`}>
                <canvas id={chartId} />
            </div>
            <script
                dangerouslySetInnerHTML={{
                    __html: `
(function() {
  function initChart() {
    if (typeof Chart === 'undefined') {
      setTimeout(initChart, 100);
      return;
    }
    const ctx = document.getElementById('${chartId}');
    if (!ctx) return;
    if (ctx._chartInstance) {
      ctx._chartInstance.destroy();
    }
    ctx._chartInstance = new Chart(ctx, ${configJson});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChart);
  } else {
    initChart();
  }
})();
`,
                }}
            />
        </div>
    )
}

/**
 * Sparkline props (mini inline charts)
 */
export interface SparklineProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Unique ID for the chart
     */
    chartId: string
    /**
     * Data values
     */
    data: number[]
    /**
     * Chart type
     * @default 'line'
     */
    type?: 'line' | 'area' | 'bar'
    /**
     * Chart color
     * @default 'rgb(59, 130, 246)'
     */
    color?: string
    /**
     * Chart width
     * @default '100px'
     */
    width?: string
    /**
     * Chart height
     * @default '32px'
     */
    height?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Element ID
     */
    id?: string
}

/**
 * Sparkline Component
 *
 * A mini inline chart for displaying trends in compact spaces.
 *
 * @example
 * ```tsx
 * // Line sparkline
 * <Sparkline chartId="trend-1" data={[5, 10, 5, 20, 8, 15]} />
 *
 * // Area sparkline
 * <Sparkline chartId="trend-2" data={[5, 10, 5, 20, 8, 15]} type="area" />
 *
 * // Bar sparkline
 * <Sparkline chartId="trend-3" data={[5, 10, 5, 20, 8, 15]} type="bar" />
 * ```
 */
export const Sparkline: FC<SparklineProps> = ({
    chartId,
    data,
    type = 'line',
    color = 'rgb(59, 130, 246)',
    width = '100px',
    height = '32px',
    class: className,
    id,
    ...props
}) => {
    const isBar = type === 'bar'
    const isFilled = type === 'area'

    const chartConfig = {
        type: isBar ? 'bar' : 'line',
        data: {
            labels: data.map((_, i) => i.toString()),
            datasets: [
                {
                    data,
                    borderColor: isBar ? undefined : color,
                    backgroundColor: isBar
                        ? color
                        : isFilled
                        ? color.replace('rgb', 'rgba').replace(')', ', 0.2)')
                        : undefined,
                    fill: isFilled,
                    tension: 0.4,
                    borderWidth: isBar ? 0 : 2,
                    pointRadius: 0,
                    borderRadius: isBar ? 2 : undefined,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: false,
                },
            },
            scales: {
                x: {
                    display: false,
                },
                y: {
                    display: false,
                },
            },
        },
    }

    const configJson = JSON.stringify(chartConfig)

    return (
        <div
            id={id}
            class={cn('inline-block', className)}
            style={`width: ${width}; height: ${height}`}
            {...props}
        >
            <canvas id={chartId} />
            <script
                dangerouslySetInnerHTML={{
                    __html: `
(function() {
  function initChart() {
    if (typeof Chart === 'undefined') {
      setTimeout(initChart, 100);
      return;
    }
    const ctx = document.getElementById('${chartId}');
    if (!ctx) return;
    if (ctx._chartInstance) {
      ctx._chartInstance.destroy();
    }
    ctx._chartInstance = new Chart(ctx, ${configJson});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChart);
  } else {
    initChart();
  }
})();
`,
                }}
            />
        </div>
    )
}

/**
 * SparklinePie props (mini inline pie chart)
 */
export interface SparklinePieProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Unique ID for the chart
     */
    chartId: string
    /**
     * Data values
     */
    data: number[]
    /**
     * Colors for each segment
     */
    colors: string[]
    /**
     * Chart size (width and height)
     * @default '32px'
     */
    size?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Element ID
     */
    id?: string
}

/**
 * SparklinePie Component
 *
 * A mini inline pie chart for displaying proportions in compact spaces.
 *
 * @example
 * ```tsx
 * <SparklinePie
 *   chartId="mini-pie"
 *   data={[60, 25, 15]}
 *   colors={['rgb(59, 130, 246)', 'rgb(6, 182, 212)', 'rgb(209, 213, 219)']}
 * />
 * ```
 */
export const SparklinePie: FC<SparklinePieProps> = ({
    chartId,
    data,
    colors,
    size = '32px',
    class: className,
    id,
    ...props
}) => {
    const chartConfig = {
        type: 'pie',
        data: {
            labels: data.map((_, i) => `Segment ${i + 1}`),
            datasets: [
                {
                    data,
                    backgroundColor: colors,
                    borderWidth: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: false,
                },
            },
        },
    }

    const configJson = JSON.stringify(chartConfig)

    return (
        <div
            id={id}
            class={cn('inline-block', className)}
            style={`width: ${size}; height: ${size}`}
            {...props}
        >
            <canvas id={chartId} />
            <script
                dangerouslySetInnerHTML={{
                    __html: `
(function() {
  function initChart() {
    if (typeof Chart === 'undefined') {
      setTimeout(initChart, 100);
      return;
    }
    const ctx = document.getElementById('${chartId}');
    if (!ctx) return;
    if (ctx._chartInstance) {
      ctx._chartInstance.destroy();
    }
    ctx._chartInstance = new Chart(ctx, ${configJson});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChart);
  } else {
    initChart();
  }
})();
`,
                }}
            />
        </div>
    )
}
