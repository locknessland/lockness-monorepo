/**
 * @fileoverview #360 T1 — `getMeter` is the one way an application reaches
 * the OpenTelemetry meter, and it is the no-op meter when `OTEL_DENO` is
 * unset: recording on it costs nothing and throws nothing.
 *
 * **#386 item 10.** The OpenTelemetry API's no-op meter provider always hands
 * back the same singleton (`NoopMeterProvider.getMeter` returns
 * `NOOP_METER`, and `createNoopMeter()` returns that same value) — so a
 * reference-identity check against `createNoopMeter()` is what actually
 * proves "the no-op meter", where recording without throwing does not: a
 * real meter with no exporter attached would record without throwing too.
 *
 * @module @lockness/telemetry/tests/meter
 */

import { assertEquals, assertStrictEquals } from '@std/assert'
// A hard-rule-#2 exception, the same one `meter.ts` documents: there is no
// JSR mirror of the OpenTelemetry API, and `createNoopMeter` is the one way
// to name the singleton `getMeter` falls back to.
import { createNoopMeter } from '@opentelemetry/api'
import { getMeter } from '../mod.ts'

Deno.test('#360 T1 getMeter returns a meter that records without throwing when OTEL_DENO is unset', () => {
    assertEquals(Deno.env.get('OTEL_DENO'), undefined, 'precondition')
    const meter = getMeter('x')
    assertStrictEquals(
        meter,
        createNoopMeter(),
        'with no provider installed, getMeter returns the OpenTelemetry ' +
            'API no-op meter singleton',
    )
    const histogram = meter.createHistogram('x.test', {
        unit: 's',
        advice: { explicitBucketBoundaries: [0.5, 1] },
    })
    histogram.record(1, { 'x.kind': 'test' })
})
