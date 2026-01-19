import { Context, Controller, Get } from '@lockness/core'
import { UiIndex } from '@view/pages/ui/getting-started.tsx'
import { ButtonsPage } from '@view/pages/ui/buttons.tsx'
import { CardsPage } from '@view/pages/ui/cards.tsx'
import { FormsPage } from '@view/pages/ui/forms.tsx'
import { DisplayPage } from '@view/pages/ui/display.tsx'
import { NavigationPage } from '@view/pages/ui/navigation.tsx'
import { AccordionPage } from '@view/pages/ui/accordion.tsx'
import { SidebarPage } from '@view/pages/ui/sidebar.tsx'
import { ModalPage } from '@view/pages/ui/modal.tsx'
import { NavbarDemoPage } from '@view/pages/ui/navbar-demo.tsx'
import { TablePage } from '@view/pages/ui/table.tsx'
import { PaginationDemo } from '@view/pages/ui/pagination-demo.tsx'

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

    @Get('/display', { name: 'ui.display' })
    display(c: Context) {
        return c.render(<DisplayPage />)
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
}
