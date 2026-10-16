import { calls } from './calls.ts'

/** Records that the install step ran; it must not, when a setup exists. */
export default function install(): Promise<void> {
    calls.push('install')
    return Promise.resolve()
}
