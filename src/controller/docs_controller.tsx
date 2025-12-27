import { Context, Controller, Get, route } from 'lockness'
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
import { DeprecationPage } from '@view/pages/docs/deprecation.tsx'
import { DependencyInjectionPage } from '@view/pages/docs/dependency-injection.tsx'
import { SessionsPage } from '@view/pages/docs/sessions.tsx'
import { DevtoolsPage } from '@view/pages/docs/devtools.tsx'
import { ContributionPage } from '@view/pages/docs/contribution.tsx'

@Controller('/docs')
export class DocsController {
    @Get('/', { name: 'docs.index' })
    index(c: Context) {
        return c.redirect(route('docs.installation'))
    }

    @Get('/installation', { name: 'docs.installation' })
    installation(c: Context) {
        return c.html(<InstallationPage />)
    }

    @Get('/getting-started', { name: 'docs.getting-started' })
    gettingStarted(c: Context) {
        return c.html(<GettingStartedPage />)
    }

    @Get('/routing', { name: 'docs.routing' })
    routing(c: Context) {
        return c.html(<RoutingPage />)
    }

    @Get('/models', { name: 'docs.models' })
    models(c: Context) {
        return c.html(<ModelsPage />)
    }

    @Get('/validation', { name: 'docs.validation' })
    validation(c: Context) {
        return c.html(<ValidationPage />)
    }

    @Get('/authentication', { name: 'docs.authentication' })
    authentication(c: Context) {
        return c.html(<AuthenticationPage />)
    }

    @Get('/middleware', { name: 'docs.middleware' })
    middleware(c: Context) {
        return c.html(<MiddlewarePage />)
    }

    @Get('/cli', { name: 'docs.cli' })
    cli(c: Context) {
        return c.html(<CliPage />)
    }

    @Get('/components', { name: 'docs.components' })
    components(c: Context) {
        return c.html(<ComponentsPage />)
    }

    @Get('/nessy', { name: 'docs.nessy' })
    nessy(c: Context) {
        return c.html(<NessyPage />)
    }

    @Get('/packages', { name: 'docs.packages' })
    packages(c: Context) {
        return c.html(<PackagesPage />)
    }

    @Get('/deprecation', { name: 'docs.deprecation' })
    deprecation(c: Context) {
        return c.html(<DeprecationPage />)
    }

    @Get('/dependency-injection', { name: 'docs.dependency-injection' })
    dependencyInjection(c: Context) {
        return c.html(<DependencyInjectionPage />)
    }

    @Get('/sessions', { name: 'docs.sessions' })
    sessions(c: Context) {
        return c.html(<SessionsPage />)
    }

    @Get('/devtools', { name: 'docs.devtools' })
    devtools(c: Context) {
        return c.html(<DevtoolsPage />)
    }

    @Get('/contribution', { name: 'docs.contribution' })
    contribution(c: Context) {
        return c.html(<ContributionPage />)
    }
}
