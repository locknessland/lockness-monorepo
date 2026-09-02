import { Listener } from '@lockness/events'
import { BetaEvent } from '../events.ts'

/** A listener in a subdirectory — must be found by a recursive walk (A2). */
export class BetaListener {
    @Listener(BetaEvent)
    onBeta(_e: BetaEvent): void {}
}
