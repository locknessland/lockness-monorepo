import { Listener } from '@lockness/events'
import { AlphaEvent } from './events.ts'

/** A top-level listener with an explicit priority. */
export class AlphaListener {
    @Listener(AlphaEvent, { priority: 10 })
    onAlpha(_e: AlphaEvent): void {}
}
