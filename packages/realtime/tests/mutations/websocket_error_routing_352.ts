/**
 * @fileoverview #352's mutation battery — a throw from `onMessage` reaches the
 * operator exactly once, the client never, and leaves the socket open.
 *
 * Each row puts back one way `guard()` / `reportError()` in `buildEvents` can
 * get the #347 refusal wrong at the transport: the error swallowed (M1), a
 * framework frame sent to the client (M2 — a maintainer decision on #347 says
 * none is), the socket closed although the client did nothing wrong (M3), the
 * error reported twice (M4), and the no-hook default sink silenced below
 * `console.error` (M5). Every row must die on a `#352` test.
 *
 * The witness each row dies on — the assertion that fails, not only the test:
 * M1 `onError is called exactly once` (0 calls), M2 `nothing is sent to the
 * client`, M3 `the socket is not closed`, M4 `onError is called exactly once`
 * (2 calls), M5 `exactly one console.error line` (0 lines). Each is named again
 * on its row below.
 *
 * Every row was proven LIVE before it was trusted: a marker was placed at the
 * row's anchor and seen to execute under the killing witness — the `catch`
 * anchor (M1–M4) under `private-orders: an AuthorizeResultError from
 * onMessage`, the default-sink anchor (M5) under `private-orders: with no
 * onError hook`. A row whose line never runs reports a kill it did not cause.
 *
 * Runs under the shared harness: green baseline before anything is mutated, an
 * atomic per-file lock, anchors matched exactly once (a stale anchor reports
 * the row DEAD, never a silent survival), a non-compiling mutant reported DEAD,
 * and every kill attributed to the test that claims it.
 *
 * ```bash
 * deno run -A packages/realtime/tests/mutations/websocket_error_routing_352.ts
 * ```
 *
 * @module @lockness/realtime/tests/mutations/websocket_error_routing_352
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const WEBSOCKET = new URL('../../websocket.ts', import.meta.url)
const SUITES = [
    new URL('../authorize_result_websocket_352.test.ts', import.meta.url)
        .pathname,
]

const CATCH = '        } catch (error) {\n' +
    '            await reportError(conn, error)\n' +
    '        }\n'

const MUTATIONS: Mutation[] = [
    {
        label: 'M1 — the error swallowed: no onError, no log line',
        file: WEBSOCKET,
        edits: [[
            CATCH,
            '        } catch (error) {\n' +
            '            void error\n' +
            '        }\n',
        ]],
        // Witness: `onError is called exactly once` — it is called 0 times.
        killedBy: 'private-orders: an AuthorizeResultError from onMessage',
    },
    {
        label: 'M2 — a framework error frame sent to the client',
        file: WEBSOCKET,
        edits: [[
            CATCH,
            '        } catch (error) {\n' +
            `            conn.send('{"type":"error","message":"internal error"}')\n` +
            '            await reportError(conn, error)\n' +
            '        }\n',
        ]],
        // Witness: `nothing is sent to the client` — one frame was.
        killedBy: 'private-orders: an AuthorizeResultError from onMessage',
    },
    {
        label: 'M3 — the socket closed on an application defect',
        file: WEBSOCKET,
        edits: [[
            CATCH,
            '        } catch (error) {\n' +
            "            conn.close(1011, 'internal error')\n" +
            '            await reportError(conn, error)\n' +
            '        }\n',
        ]],
        // Witness: `the socket is not closed` — one close, code 1011.
        killedBy: 'private-orders: an AuthorizeResultError from onMessage',
    },
    {
        label: 'M4 — the error reported twice',
        file: WEBSOCKET,
        edits: [[
            CATCH,
            '        } catch (error) {\n' +
            '            await reportError(conn, error)\n' +
            '            await reportError(conn, error)\n' +
            '        }\n',
        ]],
        // Witness: `onError is called exactly once` — it is called twice.
        killedBy: 'private-orders: an AuthorizeResultError from onMessage',
    },
    {
        label: 'M5 — the no-hook default sink demoted below console.error',
        file: WEBSOCKET,
        // Re-anchored by #391: the default line is written through
        // `writeMarkedFallback`; the demotion puts a `console.debug` back.
        edits: [[
            '        writeMarkedFallback(UNHANDLED_WEBSOCKET_ERROR, error)\n',
            '        console.debug(`${UNHANDLED_WEBSOCKET_ERROR} ${error}`)\n',
        ]],
        // Witness: `exactly one console.error line` — none reaches it.
        killedBy: 'private-orders: with no onError hook',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#352 — websocket routing of an onMessage throw',
                SUITES,
                MUTATIONS,
            ) >
                0
            ? 1
            : 0,
    )
}
