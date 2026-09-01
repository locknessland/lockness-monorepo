# Blog

The application ships a small server-rendered blog as a reference MVC feature.
It reads posts from PostgreSQL and renders their Markdown bodies through the
framework's own pipeline, so a real feature — model → repository → service →
controller → view — is available to read end to end.

## Routes

| Method | Path           | Name         | Purpose                             |
| :----- | :------------- | :----------- | :---------------------------------- |
| GET    | `/blog`        | `blog.index` | Lists published posts, newest first |
| GET    | `/blog/{slug}` | `blog.post`  | Renders a single post by its slug   |

Both routes are cached with `@Cache({ strategy: 'both', ttl: 3600 })`.

## The `posts` model

`app/model/post.ts` defines the `posts` table:

- `id` — surrogate primary key, never exposed in URLs.
- `slug` — unique, lowercase kebab-case natural key used in the URL.
- `title` — shown as the page heading.
- `date` — publication timestamp; list and show queries order by it descending.
- `draft` — defaults to `true`, so nothing publishes by accident.
- `tags` — a `text[]` of labels (stored, not surfaced in v1).
- `body_md` — the Markdown source.
- `created_at` / `updated_at` — audit timestamps.

Generate the table with `deno task cli db:generate` and apply it with
`deno task cli db:migrate`. Seed sample content with the `PostSeeder`
(registered in `database/seeders/database_seeder.ts`).

## Draft behaviour

Whether a draft is visible is decided in exactly one place —
`app/service/post_service.ts`. The service receives the environment by injection
(the `Environment` port), so it never reads configuration directly:

- **Production** — only published posts are served. A draft is invisible on the
  index and returns a `404` on its own URL, indistinguishable from a missing
  post (no enumeration oracle).
- **Development** — drafts are served and rendered with a "Draft" badge so
  authors can preview them before publishing.

The repository fails closed at the database on the production show path
(`findPublishedBySlug` adds `draft = false` to the query), so a forgotten filter
elsewhere cannot leak an unpublished post.

## Trust model and the URI-scheme caveat

`body_md` is authored by trusted operators (there is no public write UI in v1).
Markdown is rendered through `@lockness/markdown`, which is allowlist-based: it
recognises only a fixed set of tags and named attributes, so `<script>`,
`onerror=` and similar are dropped and never execute.

One caveat (tracked as a `@lockness/markdown` follow-up): the renderer
allowlists tags and attributes but **not** link/image URI schemes, so a
`javascript:` link in `body_md` would render as a clickable link. This is
acceptable under the trusted-author model today. A future write UI must not
assume the renderer sanitises URI schemes.
