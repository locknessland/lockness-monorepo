/**
 * @lockness/ui - Component exports for direct usage
 *
 * Use this for quick prototyping or testing. For production,
 * consider using the CLI to copy components into your project:
 *
 * ```bash
 * deno run -A jsr:@lockness/ui add button card
 * ```
 *
 * @module
 */

// Utility
export { cn } from './lib/utils.ts'

// Layout Components
export { RootLayout } from './components/RootLayout.tsx'

// Navigation Components
export { Link } from './components/Link.tsx'
export type { LinkProps } from './components/Link.tsx'
export {
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenu,
    NavbarMenuItem,
    NavbarToggle,
} from './components/Navbar.tsx'
export type {
    NavbarBrandProps,
    NavbarContentProps,
    NavbarMenuItemProps,
    NavbarMenuProps,
    NavbarProps,
    NavbarToggleProps,
} from './components/Navbar.tsx'

// Form Components
export { Label } from './components/Label.tsx'
export { Input } from './components/Input.tsx'
export { Textarea } from './components/Textarea.tsx'
export { Checkbox } from './components/Checkbox.tsx'
export { Switch } from './components/Switch.tsx'

// Display Components
export { Button } from './components/Button.tsx'
export {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from './components/Card.tsx'
export { Badge } from './components/Badge.tsx'
export { Progress } from './components/Progress.tsx'
export type { ProgressProps } from './components/Progress.tsx'
export { CircularProgress } from './components/CircularProgress.tsx'
export type { CircularProgressProps } from './components/CircularProgress.tsx'
export { SteppedProgress } from './components/SteppedProgress.tsx'
export type { SteppedProgressProps } from './components/SteppedProgress.tsx'
export { GaugeProgress } from './components/GaugeProgress.tsx'
export type { GaugeProgressProps } from './components/GaugeProgress.tsx'
export {
    AreaChart,
    BarChart,
    ChartLegend,
    ChartLegendItem,
    ChartScript,
    LineChart,
} from './components/Chart.tsx'
export type {
    AreaChartProps,
    BarChartProps,
    ChartDataPoint,
    ChartDataset,
    ChartLegendItemProps,
    ChartLegendProps,
    LineChartProps,
} from './components/Chart.tsx'
export {
    BubbleChart,
    PieChart,
    Sparkline,
    SparklinePie,
} from './components/ChartExtras.tsx'
export type {
    BubbleChartDataItem,
    BubbleChartDataset,
    BubbleChartProps,
    PieChartDataItem,
    PieChartProps,
    SparklinePieProps,
    SparklineProps,
} from './components/ChartExtras.tsx'
export {
    InputFile,
    SingleImageUpload,
    UploadFileList,
    UploadFilePreview,
    UploadZone,
} from './components/UploadZone.tsx'
export type {
    InputFileProps,
    SingleImageUploadProps,
    UploadFileListProps,
    UploadFilePreviewProps,
    UploadZoneProps,
} from './components/UploadZone.tsx'
export { Separator } from './components/Separator.tsx'
export { Skeleton } from './components/Skeleton.tsx'
export { Alert, AlertDescription, AlertTitle } from './components/Alert.tsx'
export { Kbd } from './components/Kbd.tsx'

// Code Components
export {
    CodeBlock,
    Command,
    CommandBlock,
    InlineCode,
} from './components/CodeBlock.tsx'

// Copy Components
export { CopyButton, CopyLink } from './components/CopyButton.tsx'
export type {
    CopyButtonProps,
    CopyLinkProps,
} from './components/CopyButton.tsx'

// Modal Components
export {
    Modal,
    ModalBody,
    ModalClose,
    ModalCloseIcon,
    ModalContent,
    ModalDescription,
    ModalFooter,
    ModalHeader,
    ModalTitle,
    ModalTrigger,
} from './components/modal.tsx'

// Navigation Components
export {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from './components/Breadcrumb.tsx'
export {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
    SimplePagination,
} from './components/Pagination.tsx'
export type {
    PaginationItemProps,
    PaginationProps,
    SimplePaginationProps,
} from './components/Pagination.tsx'
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/Tabs.tsx'

// Layout Components
export {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from './components/Accordion.tsx'

export {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSkeleton,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarProvider,
    SidebarRail,
    SidebarTrigger,
} from './components/sidebar.tsx'

// Landing Page Components
export { FeatureCard } from './components/FeatureCard.tsx'
export type { FeatureCardProps } from './components/FeatureCard.tsx'
export {
    Section,
    SectionContent,
    SectionDescription,
    SectionHeader,
    SectionTitle,
} from './components/Section.tsx'
export type {
    SectionContentProps,
    SectionDescriptionProps,
    SectionHeaderProps,
    SectionProps,
    SectionTitleProps,
} from './components/Section.tsx'
export {
    Footer,
    FooterLink,
    FooterSection,
    FooterSectionItem,
} from './components/Footer.tsx'
export type {
    FooterLinkProps,
    FooterProps,
    FooterSectionItemProps,
    FooterSectionProps,
} from './components/Footer.tsx'

// Typography Components
export { Title } from './components/Title.tsx'
export type { TitleProps } from './components/Title.tsx'

// Table Components
export {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableEmpty,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from './components/table.tsx'
export type {
    TableBodyProps,
    TableCaptionProps,
    TableCellProps,
    TableEmptyProps,
    TableFooterProps,
    TableHeaderProps,
    TableHeadProps,
    TableProps,
    TableRowProps,
} from './components/table.tsx'

// Theme Components
export { ThemeToggle, ThemeToggleScript } from './components/ThemeToggle.tsx'
export type { ThemeToggleProps } from './components/ThemeToggle.tsx'

// Icons
export * from './icons.tsx'
