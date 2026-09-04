/**
 * @fileoverview Public surface of `@lockness/notification` — multi-channel
 * notification delivery.
 *
 * One `Notification` class declares its channels and per-channel payloads; a
 * `Notifiable` resolves its own per-channel address; the `ChannelManager` fans
 * out over the channels, each backing package loaded on demand. Queued
 * notifications enqueue one identifiers-only job.
 *
 * @module @lockness/notification
 *
 * @example
 * ```ts
 * import { Notification, notify } from '@lockness/notification'
 *
 * class InvoicePaid extends Notification {
 *     constructor(private readonly id: number) { super() }
 *     via() { return ['mail', 'database'] }
 *     toMail(user: User) { ... }
 * }
 *
 * await notify(user, new InvoicePaid(7))
 * ```
 */

export { Notification } from './notification.ts'
export {
    isQueueable,
    type Notifiable,
    type QueueableNotifiable,
} from './notifiable.ts'
export type { Channel } from './channel.ts'
export {
    ChannelManager,
    type ChannelManagerOptions,
    defaultManager,
    type DeliveryFailure,
    type DeliveryReport,
    notify,
    type QueueDispatcher,
    type QueuedNotificationJob,
    QueueNotConfiguredError,
    UnknownChannelError,
} from './manager.ts'
export {
    ChannelPackageMissingError,
    type ModuleImporter,
    tryImport,
} from './optional.ts'
export {
    configureNotifications,
    getNotificationConfig,
    type NotificationConfig,
    type NotificationsTable,
    resetNotificationConfig,
} from './config.ts'
