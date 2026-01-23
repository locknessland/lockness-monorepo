/**
 * @fileoverview Component re-exports for direct usage.
 *
 * Use this for quick prototyping or testing. For production,
 * consider using the CLI to copy components into your project:
 *
 * @example
 * ```bash
 * deno run -A jsr:@lockness/ui add button card
 * ```
 *
 * @module @lockness/ui/components
 */

// Utility
export { cn } from './lib/utils.ts'

// Layout Components
export { RootLayout } from './components/RootLayout/mod.tsx'

// Navigation Components
export { Link } from './components/Link/mod.tsx'
export type { LinkProps } from './components/Link/mod.tsx'
export {
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenu,
    NavbarMenuItem,
    NavbarToggle,
} from './components/Navbar/mod.tsx'
export type {
    NavbarBrandProps,
    NavbarContentProps,
    NavbarMenuItemProps,
    NavbarMenuProps,
    NavbarProps,
    NavbarToggleProps,
} from './components/Navbar/mod.tsx'

// Form Components
export { Label } from './components/Label/mod.tsx'
export { Input } from './components/Input/mod.tsx'
export { Textarea } from './components/Textarea/mod.tsx'
export { Checkbox } from './components/Checkbox/mod.tsx'
export { Switch } from './components/Switch/mod.tsx'

// Display Components
export { Button } from './components/Button/mod.tsx'
export {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from './components/Card/mod.tsx'
export { Badge } from './components/Badge/mod.tsx'
export { Progress } from './components/Progress/mod.tsx'
export type { ProgressProps } from './components/Progress/mod.tsx'
export { CircularProgress } from './components/CircularProgress/mod.tsx'
export type { CircularProgressProps } from './components/CircularProgress/mod.tsx'
export { SteppedProgress } from './components/SteppedProgress/mod.tsx'
export type { SteppedProgressProps } from './components/SteppedProgress/mod.tsx'
export { GaugeProgress } from './components/GaugeProgress/mod.tsx'
export type { GaugeProgressProps } from './components/GaugeProgress/mod.tsx'
export {
    AreaChart,
    BarChart,
    ChartLegend,
    ChartLegendItem,
    ChartScript,
    LineChart,
} from './components/Chart/mod.tsx'
export type {
    AreaChartProps,
    BarChartProps,
    ChartDataPoint,
    ChartDataset,
    ChartLegendItemProps,
    ChartLegendProps,
    LineChartProps,
} from './components/Chart/mod.tsx'
export {
    BubbleChart,
    PieChart,
    Sparkline,
    SparklinePie,
} from './components/ChartExtras/mod.tsx'
export type {
    BubbleChartDataItem,
    BubbleChartDataset,
    BubbleChartProps,
    PieChartDataItem,
    PieChartProps,
    SparklinePieProps,
    SparklineProps,
} from './components/ChartExtras/mod.tsx'
export {
    InputFile,
    SingleImageUpload,
    UploadFileList,
    UploadFilePreview,
    UploadZone,
} from './components/UploadZone/mod.tsx'
export type {
    InputFileProps,
    SingleImageUploadProps,
    UploadFileListProps,
    UploadFilePreviewProps,
    UploadZoneProps,
} from './components/UploadZone/mod.tsx'
export { Separator } from './components/Separator/mod.tsx'
export type { SeparatorProps } from './components/Separator/mod.tsx'
export {
    Skeleton,
    SkeletonAvatar,
    SkeletonCard,
    SkeletonText,
} from './components/Skeleton/mod.tsx'
export type {
    SkeletonProps,
    SkeletonVariant,
} from './components/Skeleton/mod.tsx'
export { Spinner } from './components/Spinner/mod.tsx'
export type { SpinnerProps } from './components/Spinner/mod.tsx'
export { Newsletter, NewsletterSection } from './components/Newsletter/mod.tsx'
export type {
    NewsletterProps,
    NewsletterSectionProps,
} from './components/Newsletter/mod.tsx'
export {
    Hero,
    HeroActions,
    HeroAnnouncement,
    HeroBadge,
    HeroCommand,
    HeroCTA,
    HeroFooter,
    HeroImage,
    HeroLink,
    HeroSeparator,
    HeroSubtitle,
    HeroTitle,
} from './components/Hero/mod.tsx'
export type {
    HeroActionsProps,
    HeroAnnouncementProps,
    HeroBadgeProps,
    HeroCommandProps,
    HeroCTAProps,
    HeroFooterProps,
    HeroImageProps,
    HeroLinkProps,
    HeroProps,
    HeroSubtitleProps,
    HeroTitleProps,
} from './components/Hero/mod.tsx'
export {
    Gallery,
    GalleryGrid,
    GalleryImage,
    GalleryItem,
    GalleryJustified,
    GalleryJustifiedItem,
    GalleryLightboxItem,
    GalleryLightboxScript,
    GalleryMasonry,
    GalleryMasonryColumn,
} from './components/Gallery/mod.tsx'
export type {
    GalleryGridProps,
    GalleryImageProps,
    GalleryItemProps,
    GalleryJustifiedGap,
    GalleryJustifiedItemProps,
    GalleryJustifiedItemRatio,
    GalleryJustifiedItemRounded,
    GalleryJustifiedProps,
    GalleryJustifiedRowHeight,
    GalleryLightboxItemProps,
    GalleryMasonryColumnProps,
    GalleryMasonryProps,
    GalleryProps,
} from './components/Gallery/mod.tsx'
export { Alert, AlertDescription, AlertTitle } from './components/Alert/mod.tsx'
export { Kbd } from './components/Kbd/mod.tsx'

// Media Components
export { Video } from './components/Video/mod.tsx'
export type { VideoProps, VideoSource } from './components/Video/mod.tsx'

// Code Components
export {
    CodeBlock,
    Command,
    CommandBlock,
    getAvailableThemes,
    getThemeStyles,
    HighlightedCodeBlock,
    InlineCode,
} from './components/CodeBlock/mod.tsx'
export { SyntaxHighlightingStyles } from './components/CodeBlock/styles.tsx'
export type { ThemeName } from './components/CodeBlock/mod.tsx'

// Copy Components
export { CopyButton, CopyLink } from './components/CopyButton/mod.tsx'
export type {
    CopyButtonProps,
    CopyLinkProps,
} from './components/CopyButton/mod.tsx'

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
} from './components/Modal/mod.tsx'

// Navigation Components
export {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from './components/Breadcrumb/mod.tsx'
export {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
    SimplePagination,
} from './components/Pagination/mod.tsx'
export type {
    PaginationItemProps,
    PaginationProps,
    SimplePaginationProps,
} from './components/Pagination/mod.tsx'
export {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from './components/Tabs/mod.tsx'

// Layout Components
export {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from './components/Accordion/mod.tsx'

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
} from './components/Sidebar/mod.tsx'

export {
    TreeView,
    TreeViewContent,
    TreeViewIcon,
    TreeViewItem,
    TreeViewLabel,
    TreeViewScript,
    TreeViewTrigger,
} from './components/TreeView/mod.tsx'
export type {
    TreeViewContentProps,
    TreeViewDataItem,
    TreeViewIconProps,
    TreeViewItemProps,
    TreeViewLabelProps,
    TreeViewProps,
    TreeViewTriggerProps,
} from './components/TreeView/mod.tsx'

// Landing Page Components
export { FeatureCard } from './components/FeatureCard/mod.tsx'
export type { FeatureCardProps } from './components/FeatureCard/mod.tsx'
export {
    Section,
    SectionContent,
    SectionDescription,
    SectionHeader,
    SectionTitle,
} from './components/Section/mod.tsx'
export type {
    SectionContentProps,
    SectionDescriptionProps,
    SectionHeaderProps,
    SectionProps,
    SectionTitleProps,
} from './components/Section/mod.tsx'
export {
    Footer,
    FooterLink,
    FooterSection,
    FooterSectionItem,
} from './components/Footer/mod.tsx'
export type {
    FooterLinkProps,
    FooterProps,
    FooterSectionItemProps,
    FooterSectionProps,
} from './components/Footer/mod.tsx'

// Typography Components
export { Title } from './components/Title/mod.tsx'
export type { TitleProps } from './components/Title/mod.tsx'

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
} from './components/Table/mod.tsx'
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
} from './components/Table/mod.tsx'

// Theme Components
export {
    ThemeSwitch,
    ThemeSwitchScript,
} from './components/ThemeSwitch/mod.tsx'
export type { ThemeSwitchProps } from './components/ThemeSwitch/mod.tsx'

// Pricing Components
export {
    PricingCard,
    PricingCardAction,
    PricingCardDescription,
    PricingCardFeature,
    PricingCardFeatures,
    PricingCardHeader,
    PricingCardPrice,
    PricingComparison,
    PricingSection,
    PricingToggle,
} from './components/Pricing/mod.tsx'
export type {
    BillingPeriod,
    BillingPeriodSelection,
    CurrencySymbol,
    PricingCardActionProps,
    PricingCardDescriptionProps,
    PricingCardFeatureProps,
    PricingCardFeaturesProps,
    PricingCardHeaderProps,
    PricingCardPriceProps,
    PricingCardProps,
    PricingComparisonFeature,
    PricingComparisonProps,
    PricingSectionProps,
    PricingToggleProps,
} from './components/Pricing/mod.tsx'

// Icons
export * from './icons.tsx'

// SearchBar Components
export {
    type IconPosition,
    SearchBar,
    SearchBarFilter,
    type SearchBarFilterProps,
    SearchBarGroup,
    type SearchBarGroupProps,
    type SearchBarProps,
    type SearchBarSize,
    type SearchBarVariant,
} from './components/SearchBar/mod.tsx'
