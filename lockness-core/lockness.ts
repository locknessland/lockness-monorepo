import { Context, Hono, RegExpRouter, SmartRouter, TrieRouter } from './hono.ts'

/** Lockness framework */
import {
    All,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    registerController,
    Req,
    Res,
} from './decorators/controller.ts'

interface Module {
    controllers?: any[]
}

export class App {
    private app: Hono

    constructor() {
        this.app = new Hono({
            router: new SmartRouter({
                routers: [new RegExpRouter(), new TrieRouter()],
            }),
        })
    }

    async init(module: Module) {
        if (module.controllers) {
            for (const controller of module.controllers) {
                registerController(this.app, controller)
            }
        }
        return this
    }

    async listen(port: number) {
        return Deno.serve({ port }, this.app.fetch)
    }

    getApp() {
        return this.app
    }
}

export { All, Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res }
export { Hono, RegExpRouter, SmartRouter, TrieRouter }
export type { Context }
