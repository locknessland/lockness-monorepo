import { Listener } from '@lockness/events'
import { AlphaEvent } from './events.ts'

/** A listener whose constructor throws (needs injected deps) — must not crash the walk (A1). */
export class BadListener {
    constructor() {
        throw new Error('needs injected dependencies')
    }
    @Listener(AlphaEvent)
    onBad(_e: AlphaEvent): void {}
}
