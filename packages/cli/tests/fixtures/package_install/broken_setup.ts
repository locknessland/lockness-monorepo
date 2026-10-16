// A setup module that loads, then fails to link: a broken import of its own.
// deno-lint-ignore-file
// @ts-ignore -- deliberately missing, the point of the fixture
import { missing } from './empty.ts'

export const setup = async (): Promise<void> => {
    void missing
}
