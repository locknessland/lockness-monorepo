import { Listener } from '@lockness/events'
import { AlphaEvent } from './events.ts'

const handle = Symbol('symHandle')

/** A listener whose handler method is symbol-keyed (A6). */
export class SymbolListener {
    @Listener(AlphaEvent)
    [handle](_e: AlphaEvent): void {}
}
