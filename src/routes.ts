/**
 * Controllers Registry
 * 
 * Import all controllers here for production/compile mode.
 * In development mode (APP_ENV=development), controllers are auto-discovered.
 */

import { AppController } from '@controller/app_controller.tsx'
import { AuthController } from '@controller/auth_controller.tsx'
import { DocsController } from '@controller/docs_controller.tsx'

export const controllers = [
    AppController,
    AuthController,
    DocsController,
]
