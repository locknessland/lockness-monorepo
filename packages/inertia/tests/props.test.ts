import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import { inertiaMiddleware } from '../middleware.ts'
import type { InertiaContextVariables } from '../types.ts'
import { always, defer, merge, once, optional } from '../props.ts'

// ============================================================================
// Partial Reload Tests
// ============================================================================

Deno.test('Partial reload - only includes requested props', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Users/Index', {
            users: ['Alice', 'Bob'],
            companies: ['Acme', 'Corp'],
            categories: ['A', 'B'],
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
                'X-Inertia-Partial-Component': 'Users/Index',
                'X-Inertia-Partial-Data': 'users',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.users, ['Alice', 'Bob'])
    assertEquals(json.props.companies, undefined)
    assertEquals(json.props.categories, undefined)
    // errors is always included
    assertEquals(typeof json.props.errors, 'object')
})

Deno.test('Partial reload - except excludes specified props', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Dashboard', {
            stats: { visits: 100 },
            users: ['Alice'],
            logs: ['log1', 'log2'],
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
                'X-Inertia-Partial-Component': 'Dashboard',
                'X-Inertia-Partial-Except': 'logs,users',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.stats, { visits: 100 })
    assertEquals(json.props.users, undefined)
    assertEquals(json.props.logs, undefined)
})

Deno.test('Partial reload - ignores partial headers if component mismatch', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Users/Index', {
            users: ['Alice'],
            companies: ['Acme'],
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
                'X-Inertia-Partial-Component': 'Dashboard', // Different component!
                'X-Inertia-Partial-Data': 'users',
            },
        }),
    )

    const json = await res.json()
    // Both props included since component doesn't match
    assertEquals(json.props.users, ['Alice'])
    assertEquals(json.props.companies, ['Acme'])
})

// ============================================================================
// Optional Props Tests
// ============================================================================

Deno.test('optional() - not included in standard visits', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()
    let optionalCalled = false

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Users/Index', {
            title: 'Users',
            users: optional(() => {
                optionalCalled = true
                return ['Alice', 'Bob']
            }),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.title, 'Users')
    assertEquals(json.props.users, undefined)
    assertEquals(optionalCalled, false) // Should not be called
})

Deno.test('optional() - included when explicitly requested', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()
    let optionalCalled = false

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Users/Index', {
            title: 'Users',
            users: optional(() => {
                optionalCalled = true
                return ['Alice', 'Bob']
            }),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
                'X-Inertia-Partial-Component': 'Users/Index',
                'X-Inertia-Partial-Data': 'users',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.users, ['Alice', 'Bob'])
    assertEquals(optionalCalled, true) // Should be called
})

// ============================================================================
// Always Props Tests
// ============================================================================

Deno.test('always() - included in standard visits', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Dashboard', {
            user: always(() => ({ name: 'John' })),
            data: 'regular',
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.user, { name: 'John' })
    assertEquals(json.props.data, 'regular')
})

Deno.test('always() - included even when not in partial only list', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Dashboard', {
            user: always(() => ({ name: 'John' })),
            stats: { visits: 100 },
            logs: ['log1'],
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
                'X-Inertia-Partial-Component': 'Dashboard',
                'X-Inertia-Partial-Data': 'stats', // Only requesting stats
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.user, { name: 'John' }) // Always included!
    assertEquals(json.props.stats, { visits: 100 })
    assertEquals(json.props.logs, undefined) // Not requested
})

// ============================================================================
// Deferred Props Tests
// ============================================================================

Deno.test('defer() - not included in initial render, info in deferredProps', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()
    let deferredCalled = false

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Dashboard', {
            title: 'Dashboard',
            analytics: defer(() => {
                deferredCalled = true
                return { views: 1000 }
            }),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.title, 'Dashboard')
    assertEquals(json.props.analytics, undefined) // Not included
    assertEquals(deferredCalled, false) // Not called
    assertEquals(json.deferredProps?.default, ['analytics'])
})

Deno.test('defer() - groups deferred props', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Dashboard', {
            title: 'Dashboard',
            notifications: defer(() => [], 'default'),
            teams: defer(() => [], 'sidebar'),
            projects: defer(() => [], 'sidebar'),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.deferredProps?.default, ['notifications'])
    assertEquals(json.deferredProps?.sidebar?.sort(), ['projects', 'teams'])
})

Deno.test('defer() - resolved when requested via partial reload', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Dashboard', {
            title: 'Dashboard',
            analytics: defer(() => ({ views: 1000 })),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
                'X-Inertia-Partial-Component': 'Dashboard',
                'X-Inertia-Partial-Data': 'analytics',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.analytics, { views: 1000 }) // Resolved!
})

// ============================================================================
// Merge Props Tests
// ============================================================================

Deno.test('merge() - includes mergeProps config in response', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Items/Index', {
            items: merge(() => [{ id: 1 }, { id: 2 }]),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.items, [{ id: 1 }, { id: 2 }])
    assertEquals(json.mergeProps?.items?.strategy, 'append')
    assertEquals(json.mergeProps?.items?.deep, false)
})

Deno.test('merge().prepend() - sets prepend strategy', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Chat', {
            messages: merge(() => ['new message']).prepend(),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.mergeProps?.messages?.strategy, 'prepend')
})

Deno.test('merge().append() - targets specific paths', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Users/Index', {
            users: merge(() => ({ data: [], meta: {} })).append('data'),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.mergeProps?.users?.paths, ['data'])
})

// ============================================================================
// Once Props Tests
// ============================================================================

Deno.test('once() - includes prop value and onceProps config', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Settings', {
            countries: once(() => ['USA', 'Canada', 'Mexico']),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.countries, ['USA', 'Canada', 'Mexico'])
    assertEquals(json.onceProps?.countries, 'countries') // Default key is prop key
})

Deno.test('once().as() - uses custom cache key', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Team/Index', {
            memberRoles: once(() => ['Admin', 'Member', 'Guest']).as('roles'),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.memberRoles, ['Admin', 'Member', 'Guest'])
    assertEquals(json.onceProps?.memberRoles, 'roles') // Custom key
})

Deno.test('once() - resolves async functions', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('Billing', {
            plans: once(async () => {
                // Simulate async operation
                return await Promise.resolve([{ id: 1, name: 'Free' }, {
                    id: 2,
                    name: 'Pro',
                }])
            }),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.plans, [{ id: 1, name: 'Free' }, {
        id: 2,
        name: 'Pro',
    }])
})
