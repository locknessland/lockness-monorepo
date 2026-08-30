export type {
    Constructor,
    ContainerContract,
    ServiceToken,
} from '@lockness/contract'

/**
 * Read-only container interface.
 */
export interface ContainerReader {
    get<T>(
        token:
            | import('@lockness/contract').Constructor<T>
            | import('@lockness/contract').ServiceToken<T>,
    ): T
    has(token: import('@lockness/contract').ServiceToken): boolean
    readonly size: number
}

/**
 * Write-only container interface.
 */
export interface ContainerWriter {
    set<T>(
        token:
            | import('@lockness/contract').Constructor<T>
            | import('@lockness/contract').ServiceToken<T>,
        instance: T,
    ): void
    delete(token: import('@lockness/contract').ServiceToken): boolean
    clear(): void
}
