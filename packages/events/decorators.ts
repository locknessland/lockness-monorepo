/**
 * @fileoverview Decorators for event listeners.
 *
 * Provides `@Listener` decorator for marking service methods as event handlers.
 * Listeners are auto-discovered during application bootstrap.
 *
 * @module @lockness/events/decorators
 */

import type { BaseEvent } from './base_event.ts'
import {
    addListenerMetadata,
    type ListenerOptions,
} from './listener_registry.ts'

/**
 * Decorator to mark a service method as an event listener.
 *
 * The decorated method will be automatically registered when the service
 * is instantiated by the DI container during application bootstrap.
 *
 * @typeParam T - The event type being listened to
 * @param eventClass - The event class to listen for
 * @param options - Optional listener configuration
 *
 * @example
 * ```typescript
 * @Service()
 * export class OrderListener {
 *     constructor(private mail: MailService) {}
 *
 *     @Listener(OrderPlaced)
 *     async sendConfirmation(event: OrderPlaced) {
 *         await this.mail.send(event.userId, 'Order Confirmation', {
 *             orderId: event.orderId
 *         })
 *     }
 *
 *     @Listener(OrderPlaced, { priority: 100 })
 *     async trackOrder(event: OrderPlaced) {
 *         await this.analytics.track('order:placed', { total: event.total })
 *     }
 * }
 * ```
 */
export function Listener<T extends BaseEvent>(
    eventClass: new (...args: any[]) => T,
    options: ListenerOptions = {},
): <This, Args extends [T], Return>(
    originalMethod: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Return
    >,
) => (this: This, ...args: Args) => Return {
    return function <This, Args extends [T], Return>(
        originalMethod: (this: This, ...args: Args) => Return,
        context: ClassMethodDecoratorContext<
            This,
            (this: This, ...args: Args) => Return
        >,
    ): (this: This, ...args: Args) => Return {
        // Validate decorator is applied to a method
        if (context.kind !== 'method') {
            throw new Error(
                `@Listener can only decorate methods, received: ${context.kind}`,
            )
        }

        // Use addInitializer to store metadata after class is defined
        context.addInitializer(function (this: This) {
            addListenerMetadata((this as object).constructor, {
                eventClass,
                methodName: context.name,
                options,
            })
        })

        return originalMethod
    }
}
