// deno-lint-ignore-file no-explicit-any

export class Container {
    private services = new Map<any, any>()

    /**
     * Get or create an instance of a service
     */
    get<T>(ServiceClass: any): T {
        if (!this.services.has(ServiceClass)) {
            this.services.set(ServiceClass, new ServiceClass())
        }
        return this.services.get(ServiceClass)
    }

    /**
     * Manually register an instance
     */
    set(token: any, instance: any) {
        this.services.set(token, instance)
    }
}

export const container: Container = new Container()

/**
 * Decorator to mark a class as a Service (legacy TypeScript decorators)
 */
export function Service(): (target: unknown) => unknown {
    return function (target: unknown): unknown {
        return target
    }
}

/**
 * Decorator to inject a service into a property (legacy TypeScript decorators)
 */
export function Inject(ServiceClass: unknown): PropertyDecorator {
    return function (_target: object, _propertyKey: string | symbol): void {
        Object.defineProperty(_target.constructor.prototype, _propertyKey, {
            get() {
                const key = `_${String(_propertyKey)}_instance`
                if (!this[key]) {
                    this[key] = container.get(ServiceClass)
                }
                return this[key]
            },
            enumerable: true,
            configurable: true,
        })
    }
}
