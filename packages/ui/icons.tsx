/**
 * @fileoverview Icon components for Lockness UI.
 *
 * SVG icon components with consistent sizing and styling.
 *
 * @module @lockness/ui/icons
 */

import type { FC } from '@lockness/hono'

/**
 * Icon component props
 */
export interface IconProps {
    /**
     * Icon size (width and height)
     * @default 24
     */
    size?: number
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Stroke width
     * @default 2
     */
    strokeWidth?: number
}

/**
 * Base SVG wrapper for icons
 */
const IconBase: FC<IconProps & { children?: unknown }> = ({
    size = 24,
    class: className,
    strokeWidth = 2,
    children,
}) => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width={strokeWidth}
        stroke-linecap='round'
        stroke-linejoin='round'
        class={className}
    >
        {children}
    </svg>
)

// Navigation & UI Icons

export const ArrowRightIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M5 12h14' />
        <path d='m12 5 7 7-7 7' />
    </IconBase>
)

export const ArrowLeftIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='m12 19-7-7 7-7' />
        <path d='M19 12H5' />
    </IconBase>
)

export const ChevronRightIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='m9 18 6-6-6-6' />
    </IconBase>
)

export const ChevronDownIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='m6 9 6 6 6-6' />
    </IconBase>
)

export const MenuIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <line x1='4' x2='20' y1='12' y2='12' />
        <line x1='4' x2='20' y1='6' y2='6' />
        <line x1='4' x2='20' y1='18' y2='18' />
    </IconBase>
)

export const XIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M18 6 6 18' />
        <path d='m6 6 12 12' />
    </IconBase>
)

export const CheckIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M20 6 9 17l-5-5' />
    </IconBase>
)

export const CheckCircleIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <circle cx='12' cy='12' r='10' />
        <path d='m9 12 2 2 4-4' />
    </IconBase>
)

export const XCircleIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <circle cx='12' cy='12' r='10' />
        <path d='m15 9-6 6' />
        <path d='m9 9 6 6' />
    </IconBase>
)

export const InfoCircleIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <circle cx='12' cy='12' r='10' />
        <path d='M12 16v-4' />
        <path d='M12 8h.01' />
    </IconBase>
)

export const AlertTriangleIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' />
        <path d='M12 9v4' />
        <path d='M12 17h.01' />
    </IconBase>
)

export const CopyIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <rect width='14' height='14' x='8' y='8' rx='2' ry='2' />
        <path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' />
    </IconBase>
)

export const SearchIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <circle cx='11' cy='11' r='8' />
        <path d='m21 21-4.3-4.3' />
    </IconBase>
)

export const LoaderIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M21 12a9 9 0 1 1-6.219-8.56' />
    </IconBase>
)

// Development Icons

export const CodeIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <polyline points='16 18 22 12 16 6' />
        <polyline points='8 6 2 12 8 18' />
    </IconBase>
)

export const TerminalIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <polyline points='4 17 10 11 4 5' />
        <line x1='12' x2='20' y1='19' y2='19' />
    </IconBase>
)

export const DatabaseIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <ellipse cx='12' cy='5' rx='9' ry='3' />
        <path d='M3 5V19A9 3 0 0 0 21 19V5' />
        <path d='M3 12A9 3 0 0 0 21 12' />
    </IconBase>
)

export const LayersIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' />
        <path d='m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' />
        <path d='m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' />
    </IconBase>
)

export const BoxIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z' />
        <path d='m3.3 7 8.7 5 8.7-5' />
        <path d='M12 22V12' />
    </IconBase>
)

// Status Icons

export const ZapIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z' />
    </IconBase>
)

export const ShieldIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' />
        <path d='m9 12 2 2 4-4' />
    </IconBase>
)

export const ClockIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <circle cx='12' cy='12' r='10' />
        <polyline points='12 6 12 12 16 14' />
    </IconBase>
)

// Communication Icons

export const MailIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <rect width='20' height='16' x='2' y='4' rx='2' />
        <path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' />
    </IconBase>
)

export const UsersIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
        <circle cx='9' cy='7' r='4' />
        <path d='M22 21v-2a4 4 0 0 0-3-3.87' />
        <path d='M16 3.13a4 4 0 0 1 0 7.75' />
    </IconBase>
)

export const UserIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' />
        <circle cx='12' cy='7' r='4' />
    </IconBase>
)

// Brand Icons

export const GithubIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4' />
        <path d='M9 18c-4.51 2-5-2-7-2' />
    </IconBase>
)

export const TwitterIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z' />
    </IconBase>
)

export const DiscordIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M18.8 7a10 10 0 0 0-2.4-1' />
        <path d='M5.2 7a10 10 0 0 1 2.4-1' />
        <path d='M8 17a5 5 0 0 0 8 0' />
        <path d='M18.8 17a10 10 0 0 0 2.4-3.3C22 11.5 21.5 5 17 3.5c-1.2-.4-2.4.3-3.2 1.3a5 5 0 0 0-3.6 0C9.4 3.8 8.2 3 7 3.5c-4.5 1.5-5 8-4.2 10.2A10 10 0 0 0 5.2 17' />
        <circle cx='9' cy='12' r='1' />
        <circle cx='15' cy='12' r='1' />
    </IconBase>
)

// Document Icons

export const FileIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' />
        <path d='M14 2v4a2 2 0 0 0 2 2h4' />
    </IconBase>
)

export const BookIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20' />
    </IconBase>
)

// Misc Icons

export const ExternalLinkIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M15 3h6v6' />
        <path d='M10 14 21 3' />
        <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
    </IconBase>
)

export const SunIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <circle cx='12' cy='12' r='4' />
        <path d='M12 2v2' />
        <path d='M12 20v2' />
        <path d='m4.93 4.93 1.41 1.41' />
        <path d='m17.66 17.66 1.41 1.41' />
        <path d='M2 12h2' />
        <path d='M20 12h2' />
        <path d='m6.34 17.66-1.41 1.41' />
        <path d='m19.07 4.93-1.41 1.41' />
    </IconBase>
)

export const MoonIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
    </IconBase>
)

export const SettingsIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' />
        <circle cx='12' cy='12' r='3' />
    </IconBase>
)

export const RobotIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M12 8V4H8' />
        <rect width='16' height='12' x='4' y='8' rx='2' />
        <path d='M2 14h2' />
        <path d='M20 14h2' />
        <path d='M15 13v2' />
        <path d='M9 13v2' />
    </IconBase>
)

export const RocketIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z' />
        <path d='m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z' />
        <path d='M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0' />
        <path d='M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' />
    </IconBase>
)

export const PuzzleIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z' />
    </IconBase>
)

export const WrenchIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' />
    </IconBase>
)

export const GitBranchIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <line x1='6' x2='6' y1='3' y2='15' />
        <circle cx='18' cy='6' r='3' />
        <circle cx='6' cy='18' r='3' />
        <path d='M18 9a9 9 0 0 1-9 9' />
    </IconBase>
)

export const LayoutGridIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <rect width='7' height='7' x='3' y='3' rx='1' />
        <rect width='7' height='7' x='14' y='3' rx='1' />
        <rect width='7' height='7' x='14' y='14' rx='1' />
        <rect width='7' height='7' x='3' y='14' rx='1' />
    </IconBase>
)

export const PaletteIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <circle cx='13.5' cy='6.5' r='.5' fill='currentColor' />
        <circle cx='17.5' cy='10.5' r='.5' fill='currentColor' />
        <circle cx='8.5' cy='7.5' r='.5' fill='currentColor' />
        <circle cx='6.5' cy='12.5' r='.5' fill='currentColor' />
        <path d='M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z' />
    </IconBase>
)

export const FormInputIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <rect width='20' height='12' x='2' y='6' rx='2' />
        <path d='M12 12h.01' />
        <path d='M17 12h.01' />
        <path d='M7 12h.01' />
    </IconBase>
)

export const SparklesIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z' />
        <path d='M20 3v4' />
        <path d='M22 5h-4' />
    </IconBase>
)

export const NavigationIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <polygon points='3 11 22 2 13 21 11 13 3 11' />
    </IconBase>
)

export const BarChartIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <line x1='12' x2='12' y1='20' y2='10' />
        <line x1='18' x2='18' y1='20' y2='4' />
        <line x1='6' x2='6' y1='20' y2='14' />
    </IconBase>
)

export const MegaphoneIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='m3 11 18-5v12L3 14v-3z' />
        <path d='M11.6 16.8a3 3 0 1 1-5.8-1.6' />
    </IconBase>
)

export const PlayIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <polygon points='6 3 20 12 6 21 6 3' />
    </IconBase>
)

export const UploadIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
        <polyline points='17 8 12 3 7 8' />
        <line x1='12' x2='12' y1='3' y2='15' />
    </IconBase>
)

export const ImageIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <rect width='18' height='18' x='3' y='3' rx='2' ry='2' />
        <circle cx='9' cy='9' r='2' />
        <path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' />
    </IconBase>
)
