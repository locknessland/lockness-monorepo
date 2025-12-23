/**
 * Socialite Tests
 *
 * Tests for the social authentication module
 */

import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
    BaseOAuth2Driver,
    configureSocialite,
    DiscordDriver,
    generateState,
    getSocialiteConfig,
    GitHubDriver,
    GoogleDriver,
    type OAuthTokens,
    type ProviderConfig,
    registerSocialiteDriver,
    socialite,
    type SocialUser,
} from './socialite.ts'

describe('socialite system', () => {
    const mockConfig: ProviderConfig = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/auth/callback',
    }

    beforeEach(() => {
        // Reset config before each test
        configureSocialite({})
    })

    afterEach(() => {
        configureSocialite({})
    })

    it('configureSocialite sets up providers', () => {
        configureSocialite({
            google: mockConfig,
            github: mockConfig,
        })

        const config = getSocialiteConfig()
        expect(config.google).toBeDefined()
        expect(config.github).toBeDefined()
        expect(config.google?.clientId).toBe('test-client-id')
    })

    it('socialite throws for unconfigured provider', () => {
        expect(() => socialite('google')).toThrow(
            'Socialite provider "google" is not configured',
        )
    })

    it('socialite returns driver for configured provider', () => {
        configureSocialite({ google: mockConfig })

        const driver = socialite('google')
        expect(driver).toBeDefined()
        expect(driver.redirect).toBeDefined()
        expect(driver.user).toBeDefined()
    })

    it('socialite throws for unknown provider', () => {
        configureSocialite({ unknown: mockConfig })

        expect(() => socialite('unknown')).toThrow(
            'Unknown socialite provider "unknown"',
        )
    })

    it('generateState returns a UUID', () => {
        const state = generateState()
        expect(state).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        )
    })

    it('generateState returns unique values', () => {
        const state1 = generateState()
        const state2 = generateState()
        expect(state1).not.toBe(state2)
    })
})

describe('GoogleDriver', () => {
    const config: ProviderConfig = {
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        redirectUri: 'http://localhost:3000/auth/google/callback',
    }

    it('generates correct auth URL', () => {
        const driver = new GoogleDriver(config)
        const url = driver.getAuthUrl()

        expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
        expect(url).toContain('client_id=google-client-id')
        expect(url).toContain(
            'redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fgoogle%2Fcallback',
        )
        expect(url).toContain('response_type=code')
        expect(url).toContain('scope=openid+email+profile')
        expect(url).toContain('access_type=offline')
    })

    it('includes state in auth URL when provided', () => {
        const driver = new GoogleDriver(config)
        const url = driver.getAuthUrl('test-state-123')

        expect(url).toContain('state=test-state-123')
    })

    it('uses custom scopes when provided', () => {
        const customConfig = {
            ...config,
            scopes: ['openid', 'email'],
        }
        const driver = new GoogleDriver(customConfig)
        const url = driver.getAuthUrl()

        expect(url).toContain('scope=openid+email')
        expect(url).not.toContain('profile')
    })

    it('redirect returns 302 response', () => {
        const driver = new GoogleDriver(config)
        const response = driver.redirect()

        expect(response.status).toBe(302)
        expect(response.headers.get('Location')).toContain(
            'https://accounts.google.com',
        )
    })
})

describe('GitHubDriver', () => {
    const config: ProviderConfig = {
        clientId: 'github-client-id',
        clientSecret: 'github-client-secret',
        redirectUri: 'http://localhost:3000/auth/github/callback',
    }

    it('generates correct auth URL', () => {
        const driver = new GitHubDriver(config)
        const url = driver.getAuthUrl()

        expect(url).toContain('https://github.com/login/oauth/authorize')
        expect(url).toContain('client_id=github-client-id')
        expect(url).toContain('scope=read%3Auser+user%3Aemail')
    })

    it('redirect returns 302 response', () => {
        const driver = new GitHubDriver(config)
        const response = driver.redirect()

        expect(response.status).toBe(302)
        expect(response.headers.get('Location')).toContain('https://github.com')
    })
})

describe('DiscordDriver', () => {
    const config: ProviderConfig = {
        clientId: 'discord-client-id',
        clientSecret: 'discord-client-secret',
        redirectUri: 'http://localhost:3000/auth/discord/callback',
    }

    it('generates correct auth URL', () => {
        const driver = new DiscordDriver(config)
        const url = driver.getAuthUrl()

        expect(url).toContain('https://discord.com/api/oauth2/authorize')
        expect(url).toContain('client_id=discord-client-id')
        expect(url).toContain('scope=identify+email')
    })

    it('redirect returns 302 response', () => {
        const driver = new DiscordDriver(config)
        const response = driver.redirect()

        expect(response.status).toBe(302)
        expect(response.headers.get('Location')).toContain(
            'https://discord.com',
        )
    })
})

describe('custom driver registration', () => {
    class CustomDriver extends BaseOAuth2Driver {
        protected authUrl = 'https://custom.example.com/oauth/authorize'
        protected tokenUrl = 'https://custom.example.com/oauth/token'
        protected userInfoUrl = 'https://custom.example.com/api/user'
        protected defaultScopes = ['profile']

        getUserFromTokens(tokens: OAuthTokens): Promise<SocialUser> {
            return Promise.resolve({
                id: 'custom-123',
                email: 'test@example.com',
                name: 'Test User',
                avatar: null,
                accessToken: tokens.access_token,
                refreshToken: null,
                expiresIn: null,
                raw: {},
            })
        }
    }

    it('registerSocialiteDriver adds custom driver', () => {
        registerSocialiteDriver('custom', CustomDriver)
        configureSocialite({
            custom: {
                clientId: 'custom-id',
                clientSecret: 'custom-secret',
                redirectUri: 'http://localhost:3000/auth/custom/callback',
            },
        })

        const driver = socialite('custom')
        expect(driver).toBeDefined()

        const url = driver.getAuthUrl()
        expect(url).toContain('https://custom.example.com/oauth/authorize')
    })
})
