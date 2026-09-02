import { Listener } from '@lockness/events'
import { OkEvent } from './events.ts'

/** A valid listener that must still be listed even when a sibling file fails to import. */
export class OkListener {
    @Listener(OkEvent)
    onOk(_e: OkEvent): void {}
}
