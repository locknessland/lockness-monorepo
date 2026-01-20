import { Context, Controller, Get } from '@lockness/core'
import { UiIndex } from '@view/pages/ui/getting-started.tsx'
import { ButtonsPage } from '@view/pages/ui/buttons.tsx'
import { CardsPage } from '@view/pages/ui/cards.tsx'
import { FormsPage } from '@view/pages/ui/forms.tsx'
import { BadgesPage } from '@view/pages/ui/badges.tsx'
import { AlertsPage } from '@view/pages/ui/alerts.tsx'
import { SeparatorsPage } from '@view/pages/ui/separators.tsx'
import { SkeletonsPage } from '@view/pages/ui/skeletons.tsx'
import { KeyboardsPage } from '@view/pages/ui/keyboards.tsx'
import { NavigationPage } from '@view/pages/ui/navigation.tsx'
import { AccordionPage } from '@view/pages/ui/accordion.tsx'
import { SidebarPage } from '@view/pages/ui/sidebar.tsx'
import { ModalPage } from '@view/pages/ui/modal.tsx'
import { NavbarDemoPage } from '@view/pages/ui/navbar-demo.tsx'
import { TablePage } from '@view/pages/ui/table.tsx'
import { PaginationDemo } from '@view/pages/ui/pagination-demo.tsx'
import { ProgressPage } from '@view/pages/ui/progress.tsx'
import { UploadZonePage } from '@view/pages/ui/upload-zone.tsx'
import { ChartPage } from '@view/pages/ui/chart.tsx'
import { SpinnerPage } from '@view/pages/ui/spinner.tsx'
import { NewsletterPage } from '@view/pages/ui/newsletter.tsx'
import { HeroPage } from '@view/pages/ui/hero.tsx'
import { GalleryPage } from '@view/pages/ui/gallery.tsx'
import { PricingPage } from '@view/pages/ui/pricing.tsx'
import { ThemeSwitchPage } from '@view/pages/ui/theme-switch.tsx'
import { TreeViewPage } from '@view/pages/ui/treeview.tsx'

@Controller('/ui')
export class UiController {
    @Get('/', { name: 'ui.index' })
    index(c: Context) {
        return c.render(<UiIndex />)
    }

    @Get('/buttons', { name: 'ui.buttons' })
    buttons(c: Context) {
        return c.render(<ButtonsPage />)
    }

    @Get('/cards', { name: 'ui.cards' })
    cards(c: Context) {
        return c.render(<CardsPage />)
    }

    @Get('/forms', { name: 'ui.forms' })
    forms(c: Context) {
        return c.render(<FormsPage />)
    }

    @Get('/badges', { name: 'ui.badges' })
    badges(c: Context) {
        return c.render(<BadgesPage />)
    }

    @Get('/alerts', { name: 'ui.alerts' })
    alerts(c: Context) {
        return c.render(<AlertsPage />)
    }

    @Get('/separators', { name: 'ui.separators' })
    separators(c: Context) {
        return c.render(<SeparatorsPage />)
    }

    @Get('/skeletons', { name: 'ui.skeletons' })
    skeletons(c: Context) {
        return c.render(<SkeletonsPage />)
    }

    @Get('/keyboards', { name: 'ui.keyboards' })
    keyboards(c: Context) {
        return c.render(<KeyboardsPage />)
    }

    @Get('/navigation', { name: 'ui.navigation' })
    navigation(c: Context) {
        return c.render(<NavigationPage />)
    }

    @Get('/accordion', { name: 'ui.accordion' })
    accordion(c: Context) {
        return c.render(<AccordionPage />)
    }

    @Get('/sidebar', { name: 'ui.sidebar' })
    sidebar(c: Context) {
        return c.render(<SidebarPage />)
    }

    @Get('/modal', { name: 'ui.modal' })
    modal(c: Context) {
        return c.render(<ModalPage />)
    }

    @Get('/navbar', { name: 'ui.navbar' })
    navbar(c: Context) {
        return c.render(<NavbarDemoPage />)
    }

    @Get('/table', { name: 'ui.table' })
    table(c: Context) {
        return c.render(<TablePage />)
    }

    @Get('/pagination', { name: 'ui.pagination' })
    pagination(c: Context) {
        return c.render(<PaginationDemo />)
    }

    @Get('/progress', { name: 'ui.progress' })
    progress(c: Context) {
        return c.render(<ProgressPage />)
    }

    @Get('/upload-zone', { name: 'ui.upload-zone' })
    uploadZone(c: Context) {
        return c.render(<UploadZonePage />)
    }

    @Get('/chart', { name: 'ui.chart' })
    chart(c: Context) {
        return c.render(<ChartPage />)
    }

    @Get('/spinner', { name: 'ui.spinner' })
    spinner(c: Context) {
        return c.render(<SpinnerPage />)
    }

    @Get('/newsletter', { name: 'ui.newsletter' })
    newsletter(c: Context) {
        return c.render(<NewsletterPage />)
    }

    @Get('/hero', { name: 'ui.hero' })
    hero(c: Context) {
        return c.render(<HeroPage />)
    }

    @Get('/gallery', { name: 'ui.gallery' })
    gallery(c: Context) {
        return c.render(<GalleryPage />)
    }

    @Get('/pricing', { name: 'ui.pricing' })
    pricing(c: Context) {
        return c.render(<PricingPage />)
    }

    @Get('/theme-switch', { name: 'ui.theme-switch' })
    themeSwitch(c: Context) {
        return c.render(<ThemeSwitchPage />)
    }

    @Get('/treeview', { name: 'ui.treeview' })
    treeview(c: Context) {
        return c.render(<TreeViewPage />)
    }
}
