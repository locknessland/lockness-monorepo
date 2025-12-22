// deno-lint-ignore-file no-explicit-any

class Container {
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

export const container = new Container()

/**
 * Decorator to mark a class as a Service
 */
export function Service(): (value: any, _context: ClassDecoratorContext) => any {
    return (value: any, _context: ClassDecoratorContext) => {
        return value
    }
}

/**
 * Decorator to inject a service into a property
 */
export function Inject(ServiceClass: any) {
    return function (_value: undefined, _context: ClassFieldDecoratorContext): any {
        return function (this: any) {
            return container.get(ServiceClass)
        }
    }
}
