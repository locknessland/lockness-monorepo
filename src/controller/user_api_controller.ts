import { Context, Controller, Get, Post, Validate, z } from 'lockness'
import { insertUserSchema } from '@model/user.ts'

// Validation schema for URL params
const UserIdSchema = z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number'),
})

@Controller('/api/users')
export class UserApiController {
    @Get('/')
    list(c: Context) {
        return c.json({
            success: true,
            data: [
                { id: 1, email: 'admin@lockness.dev' },
                { id: 2, email: 'user@lockness.dev' },
            ],
        })
    }

    @Post('/')
    @Validate('json', insertUserSchema)
    create(c: Context) {
        // Data is already validated at this point
        const data = c.req.valid('json')

        return c.json({
            success: true,
            message: 'User created successfully',
            data: {
                id: 3,
                email: data.email,
                name: data.name,
            },
        }, 201)
    }

    @Get('/:id')
    @Validate('param', UserIdSchema)
    show(c: Context) {
        const { id } = c.req.valid('param')

        return c.json({
            success: true,
            data: {
                id: parseInt(id),
                email: 'user@lockness.dev',
            },
        })
    }
}
