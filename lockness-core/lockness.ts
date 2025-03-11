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
    Req,
    Res,
} from './decorators/controller.ts'
export { All, Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res }

export { Hono, RegExpRouter, SmartRouter, TrieRouter }
export type { Context }
