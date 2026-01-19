import type { FC } from '@lockness/core'

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
