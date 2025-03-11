import 'reflect-metadata'
import {
    Context,
    Hono,
    RegExpRouter,
    SmartRouter,
    TrieRouter,
} from '@lockness/hono'

/** Lockness Decorators */
import {
    Controller,
    Delete,
    Get,
    Patch,
    Post,
    Put,
    registerController,
} from '@lockness/decorators'

interface Module {
    controllers?: any[]
}

export class App {
    private readonly app: Hono

    constructor() {
        // Initialize Hono with SmartRouter for best performance
        this.app = new Hono({
            router: new SmartRouter({
                routers: [new RegExpRouter(), new TrieRouter()],
            }),
        })
    }


    init(module: Module) {
        if (module.controllers) {
            // Register each controller
            for (const controller of module.controllers) {
                registerController(this.app, controller)
            }
        }
        return this
    }

    listen(port: number) {
        return Deno.serve({ port }, this.app.fetch.bind(this.app))
    }

    getApp() {
        return this.app
    }
}

// Export everything needed for controllers
export { Controller, Delete, Get, Patch, Post, Put }

// Export Hono types and classes
export type { Context }
export { Hono, RegExpRouter, SmartRouter, TrieRouter }
