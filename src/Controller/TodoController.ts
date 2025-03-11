import { Controller, Get, Post } from '../../lockness-core/hono.ts'
import type { Context } from '../../lockness-core/hono.ts'

interface Todo {
    id: number
    title: string
    completed: boolean
}

@Controller('/todos')
export class TodoController {
    private todos: Todo[] = []

    @Get()
    findAll(c: Context) {
        return c.json(this.todos)
    }

    @Get('/:id')
    findOne(c: Context) {
        const id = parseInt(c.req.param('id'))
        const todo = this.todos.find((t) => t.id === id)

        if (!todo) {
            return c.json({ error: 'Todo not found' }, 404)
        }

        return c.json(todo)
    }

    @Post()
    async create(c: Context) {
        const body = await c.req.json()
        const newTodo: Todo = {
            id: this.todos.length + 1,
            title: body.title,
            completed: false,
        }

        this.todos.push(newTodo)
        return c.json(newTodo, 201)
    }
}
