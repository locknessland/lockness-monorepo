import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
} from '../atoms/Table.tsx'
import { Badge } from '../components/Badge.tsx'
import { colors, fontSize } from '../theme.ts'
import type { EventInfo } from '../../types.ts'

/** The Events panel — dispatched events, newest first, correlated per request. */
export const Events = ({ data }: { data: { events: EventInfo[] } }) => {
    const events = data.events

    if (events.length === 0) {
        return (
            <Table title='Dispatched Events' count={0}>
                <TableBody>
                    <tr>
                        <TableCell>
                            <span
                                style={{ color: colors.text.disabled } as any}
                            >
                                No events dispatched yet.
                            </span>
                        </TableCell>
                    </tr>
                </TableBody>
            </Table>
        )
    }

    const nameStyles = {
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: fontSize.sm,
        color: colors.brand.indigo[400],
        fontWeight: '500',
    }
    const reqStyles = {
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: fontSize.xs,
        color: colors.text.disabled,
    }

    return (
        <Table title='Dispatched Events' count={events.length}>
            <TableHead>
                <tr>
                    <TableHeaderCell>Event</TableHeaderCell>
                    <TableHeaderCell>Listeners</TableHeaderCell>
                    <TableHeaderCell>Request</TableHeaderCell>
                    <TableHeaderCell>Time</TableHeaderCell>
                </tr>
            </TableHead>
            <TableBody>
                {events.map((e: EventInfo) => (
                    <tr key={`${e.eventName}-${e.timestamp}`}>
                        <TableCell>
                            <span style={nameStyles as any}>{e.eventName}</span>
                        </TableCell>
                        <TableCell>
                            <Badge
                                text={String(e.listenerCount)}
                                color={e.listenerCount > 0 ? 'green' : 'gray'}
                            />
                        </TableCell>
                        <TableCell>
                            <span style={reqStyles as any}>
                                {e.requestId ?? '— (outside a request)'}
                            </span>
                        </TableCell>
                        <TableCell>
                            <span style={reqStyles as any}>
                                {new Date(e.timestamp).toLocaleTimeString()}
                            </span>
                        </TableCell>
                    </tr>
                ))}
            </TableBody>
        </Table>
    )
}
