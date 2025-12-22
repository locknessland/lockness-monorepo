import { Controller, Get, Post, Validate, z, type Context } from 'lockness'
import todo from '@/data/todo.json' with { type: 'json' }

const createTodoSchema = z.object({
    title: z.string().min(3, 'Le titre doit faire au moins 3 caractères'),
})

interface Todo {
    id: number
    title: string
    completed: boolean
}

@Controller('/')
export class TodoController {
    private todos: Todo[] = todo

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
    @Validate('json', createTodoSchema)
    create(c: Context) {
        const body = c.req.valid('json')

        const newTodo: Todo = {
            id: this.todos.length + 1,
            title: body.title,
            completed: false,
        }

        this.todos.push(newTodo)
        return c.json(this.todos, 201)
    }
}
