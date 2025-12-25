import { Context, Controller, Get } from 'lockness'
import { InstallationPage } from '@view/pages/docs/installation.tsx'
import { GettingStartedPage } from '@view/pages/docs/getting-started.tsx'
import { RoutingPage } from '@view/pages/docs/routing.tsx'
import { ModelsPage } from '@view/pages/docs/models.tsx'
import { ValidationPage } from '@view/pages/docs/validation.tsx'
import { AuthenticationPage } from '@view/pages/docs/authentication.tsx'
import { MiddlewarePage } from '@view/pages/docs/middleware.tsx'
import { CliPage } from '@view/pages/docs/cli.tsx'
import { ComponentsPage } from '@view/pages/docs/components.tsx'
import { NessyPage } from '@view/pages/docs/nessy.tsx'
import { PackagesPage } from '@view/pages/docs/packages.tsx'

@Controller('/docs')
export class DocsController {
    @Get('/')
    index(c: Context) {
        return c.redirect('/docs/installation')
    }

    @Get('/installation')
    installation(c: Context) {
        return c.html(<InstallationPage />)
    }

    @Get('/getting-started')
    gettingStarted(c: Context) {
        return c.html(<GettingStartedPage />)
    }

    @Get('/routing')
    routing(c: Context) {
        return c.html(<RoutingPage />)
    }

    @Get('/models')
    models(c: Context) {
        return c.html(<ModelsPage />)
    }

    @Get('/validation')
    validation(c: Context) {
        return c.html(<ValidationPage />)
    }

    @Get('/authentication')
    authentication(c: Context) {
        return c.html(<AuthenticationPage />)
    }

    @Get('/middleware')
    middleware(c: Context) {
        return c.html(<MiddlewarePage />)
    }

    @Get('/cli')
    cli(c: Context) {
        return c.html(<CliPage />)
    }

    @Get('/components')
    components(c: Context) {
        return c.html(<ComponentsPage />)
    }

    @Get('/nessy')
    nessy(c: Context) {
        return c.html(<NessyPage />)
    }

    @Get('/packages')
    packages(c: Context) {
        return c.html(<PackagesPage />)
    }
}
