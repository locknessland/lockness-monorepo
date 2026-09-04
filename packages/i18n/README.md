# @lockness/i18n

The translation layer for Lockness — message catalogs, `t()` with ICU
interpolation and pluralization (on Deno's built-in `Intl`, **zero
dependencies**), and a per-request locale resolver.

```ts
import { configureI18n } from '@lockness/i18n'
import en from './resources/lang/en-us.ts'
import fr from './resources/lang/fr-fr.ts'

configureI18n({
    catalogs: { 'en-us': en, 'fr-fr': fr },
    defaultLocale: 'en-us', // agrees with config/i18n.ts
})
```

```ts
// en-us.ts
export default {
    cart: { items: '{count, plural, one {# item} other {# items}}' },
    greet: 'Hi {name}',
}
```

```ts
const t = registry.translator('fr-fr')
t.t('greet', { name: 'Ada' }) // interpolation
t.t('cart.items', { count: 3 }) // '3 items' (ICU plural via Intl.PluralRules)
```

## What ships

- **`t()` / `trans()`** — `{name}` interpolation, cardinal `{n, plural, …}`
  (with `=N` exact cases and `#`), and `{v, select, …}`. A missing key returns
  the key itself; nothing throws.
- **Per-key language cascade** — `en-us` → `en` → fallback → default, so a
  partial compound catalog still resolves.
- **A lazy per-request resolver** — `getLocale(c)` / `getTranslator(c)` pick the
  locale from route → cookie → header → default, validated against the
  configured set.
- **`make:lang` + `i18n:extract`** — scaffold catalogs and keep keys in sync.

## Security

`t()` returns a plain string; **the view layer escapes** (Hono JSX
auto-escapes). Params are data — never re-parsed as ICU. A request's
`Accept-Language` / cookie only _selects_ among the configured locales; a raw
value is never a catalog key or a path.

See [docs/i18n.md](../../docs/i18n.md) for the full guide.
