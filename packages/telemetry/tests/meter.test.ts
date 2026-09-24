/**
 * @fileoverview #360 T1 — `getMeter` is the one way an application reaches
 * the OpenTelemetry meter, and it is the no-op meter when `OTEL_DENO` is
 * unset: recording on it costs nothing and throws nothing.
 *
 * @module @lockness/telemetry/tests/meter
 */

import { assertEquals } from '@std/assert'
import { getMeter } from '../mod.ts'

Deno.test('#360 T1 getMeter returns a meter that records without throwing when OTEL_DENO is unset', () => {
    assertEquals(Deno.env.get('OTEL_DENO'), undefined, 'precondition')
    const meter = getMeter('x')
    const histogram = meter.createHistogram('x.test', {
        unit: 's',
        advice: { explicitBucketBoundaries: [0.5, 1] },
    })
    histogram.record(1, { 'x.kind': 'test' })
})
