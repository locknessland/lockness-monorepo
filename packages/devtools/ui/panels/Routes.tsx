import { Badge } from '../components/Badge.tsx'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
} from '../atoms/Table.tsx'
import { colors, fontSize } from '../theme.ts'

export const Routes = ({ data }: { data: any }) => {
    const pathStyles = {
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: fontSize.sm,
        color: colors.text.secondary,
    }

    const controllerStyles = {
        fontSize: fontSize.xs,
        color: colors.text.disabled,
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    }

    const nameStyles = {
        fontSize: fontSize.sm,
        color: colors.brand.indigo[400],
        fontWeight: '500',
    }

    return (
        <Table title='Registered Routes' count={data.routes.length}>
            <TableHead>
                <tr>
                    <TableHeaderCell>Method</TableHeaderCell>
                    <TableHeaderCell>Path</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Controller</TableHeaderCell>
                    <TableHeaderCell>Middlewares</TableHeaderCell>
                </tr>
            </TableHead>
            <TableBody>
                {data.routes.map((route: any) => (
                    <tr>
                        <TableCell>
                            <Badge
                                text={route.method}
                                color={route.method === 'GET'
                                    ? 'blue'
                                    : 'green'}
                            />
                        </TableCell>
                        <TableCell>
                            <span style={pathStyles as any}>{route.path}</span>
                        </TableCell>
                        <TableCell>
                            <span style={nameStyles as any}>
                                {route.name || '-'}
                            </span>
                        </TableCell>
                        <TableCell>
                            <span style={controllerStyles as any}>
                                {route.controller || '-'}
                            </span>
                        </TableCell>
                        <TableCell>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: '4px',
                                    flexWrap: 'wrap',
                                } as any}
                            >
                                {route.middlewares.map((m: string) => (
                                    <Badge key={m} text={m} color='gray' />
                                ))}
                            </div>
                        </TableCell>
                    </tr>
                ))}
            </TableBody>
        </Table>
    )
}
