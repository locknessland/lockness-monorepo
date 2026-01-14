import type { VersionProvider } from './types.ts'

/**
 * Fetches latest version from JSR API
 */
export class JsrVersionProvider implements VersionProvider {
    private readonly baseUrl = 'https://jsr.io'
    private readonly timeout = 5000 // 5 seconds

    /**
     * Fetch the latest version of a package from JSR
     * @param packageName Package name like "@lockness/core"
     * @returns Latest version string like "0.2.0"
     */
    async getLatestVersion(packageName: string): Promise<string> {
        const scope = packageName.split('/')[0].replace('@', '')
        const name = packageName.split('/')[1]
        const url = `${this.baseUrl}/@${scope}/${name}/meta.json`

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), this.timeout)

            const response = await fetch(url, {
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch version for ${packageName}: ${response.statusText}`,
                )
            }

            const data = await response.json()
            return data.latest as string
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(
                        `Timeout fetching version for ${packageName}`,
                    )
                }
                throw new Error(
                    `Failed to fetch version for ${packageName}: ${error.message}`,
                )
            }
            throw error
        }
    }
}

/**
 * Create a version provider instance
 * @returns VersionProvider instance
 */
export function createVersionProvider(): VersionProvider {
    return new JsrVersionProvider()
}
