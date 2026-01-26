/**
 * @fileoverview Demo Controller
 *
 * Demonstrates the REAL mount point feature with locale prefix at START of URL.
 *
 * With mount point configured in app/kernel.tsx, routes are accessible:
 * - At root: /demo/mount-points (no locale context)
 * - Under mount point: /fr/ca/demo/mount-points (with locale context)
 *
 * The mount point middleware sets c.get('langId'), c.get('countryId'), etc.
 */

import { type Context, Controller, Get } from '@lockness/core'
import {
    MountPointsPage,
    MountPointsProductsPage,
} from '@view/pages/demo/mount_points.tsx'

/**
 * Controller for mount point demo
 *
 * Mount point is configured in app/kernel.tsx with pattern /:langId/:countryId
 * This controller's routes are accessible:
 * - /demo/mount-points → no locale (root access)
 * - /fr/ca/demo/mount-points → locale set by middleware
 */
@Controller('/demo')
export class DemoController {
    /**
     * Demo index - redirects to mount points demo with locale prefix
     */
    @Get('/', { name: 'demo.index' })
    index(c: Context) {
        return c.redirect('/fr/ca/demo/mount-points')
    }

    /**
     * Mount points demo - Main page
     *
     * Access via:
     * - /demo/mount-points → no locale context
     * - /fr/ca/demo/mount-points → locale context from middleware
     */
    @Get('/mount-points', { name: 'demo.mount-points.index' })
    mountPoints(c: Context) {
        const langId = c.get('langId') as string | undefined
        const countryId = c.get('countryId') as string | undefined

        return c.html(
            <MountPointsPage langId={langId} countryId={countryId} />,
        )
    }

    /**
     * Products page under mount point
     */
    @Get('/mount-points/products', { name: 'demo.mount-points.products' })
    mountPointsProducts(c: Context) {
        const langId = c.get('langId') as string | undefined
        const countryId = c.get('countryId') as string | undefined

        return c.html(
            <MountPointsProductsPage langId={langId} countryId={countryId} />,
        )
    }
}
