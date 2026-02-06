import type { FC } from '@lockness/core'
import { NavbarBrand } from '@lockness/ui/components'

interface BrandProps {
    /** Link href, defaults to '/' */
    href?: string
}

/**
 * Brand component showing the Lockness logo and name.
 * Used in navigation bars for consistency across the application.
 */
export const Brand: FC<BrandProps> = ({ href = '/' }) => {
    return (
        <NavbarBrand href={href}>
            <div class='w-8 h-8 bg-primary flex items-center justify-center'>
                <span class='text-sm font-bold text-primary-foreground'>
                    L
                </span>
            </div>
            <span class='font-semibold'>
                Lockness<span class='text-primary'>JS</span>
            </span>
        </NavbarBrand>
    )
}
