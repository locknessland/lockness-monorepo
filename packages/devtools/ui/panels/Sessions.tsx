import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
} from '../atoms/Table.tsx'
import { Badge } from '../components/Badge.tsx'
import { colors, fontSize } from '../theme.ts'
import type { SessionData } from '../../types.ts'

/** The Sessions panel — captured session snapshots (secret values redacted). */
export const Sessions = ({ data }: { data: { sessions: SessionData[] } }) => {
    const sessions = data.sessions

    if (sessions.length === 0) {
        return (
            <Table title='Sessions' count={0}>
                <TableBody>
                    <tr>
                        <TableCell>
                            <span
                                style={{ color: colors.text.disabled } as any}
                            >
                                No session captured for this request.
                            </span>
                        </TableCell>
                    </tr>
                </TableBody>
            </Table>
        )
    }

    const idStyles = {
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: fontSize.xs,
        color: colors.text.disabled,
    }
    const valStyles = {
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: fontSize.sm,
        color: colors.text.secondary,
    }

    return (
        <Table title='Sessions' count={sessions.length}>
            <TableHead>
                <tr>
                    <TableHeaderCell>Session</TableHeaderCell>
                    <TableHeaderCell>Key</TableHeaderCell>
                    <TableHeaderCell>Value</TableHeaderCell>
                    <TableHeaderCell>Kind</TableHeaderCell>
                </tr>
            </TableHead>
            <TableBody>
                {sessions.flatMap((s: SessionData) => {
                    const rows = Object.entries(s.data)
                    const flash = s.flash ?? {}
                    if (rows.length === 0 && Object.keys(flash).length === 0) {
                        return [
                            <tr key={`${s.id}-empty`}>
                                <TableCell>
                                    <span style={idStyles as any}>{s.id}</span>
                                </TableCell>
                                <TableCell>
                                    <span
                                        style={{
                                            color: colors.text.disabled,
                                        } as any}
                                    >
                                        (empty)
                                    </span>
                                </TableCell>
                                <TableCell>-</TableCell>
                                <TableCell>-</TableCell>
                            </tr>,
                        ]
                    }
                    return Object.entries({ ...s.data, ...flash }).map(
                        ([key, value]) => (
                            <tr key={`${s.id}-${key}`}>
                                <TableCell>
                                    <span style={idStyles as any}>{s.id}</span>
                                </TableCell>
                                <TableCell>
                                    <span style={valStyles as any}>{key}</span>
                                </TableCell>
                                <TableCell>
                                    <span style={valStyles as any}>
                                        {typeof value === 'string'
                                            ? value
                                            : JSON.stringify(value)}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        text={key in flash ? 'flash' : 'data'}
                                        color={key in flash ? 'blue' : 'gray'}
                                    />
                                </TableCell>
                            </tr>
                        ),
                    )
                })}
            </TableBody>
        </Table>
    )
}
