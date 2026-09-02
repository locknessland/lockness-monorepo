// A syntactically valid TS module that throws at top level: it passes
// `deno check`/`deno lint` (unlike an unresolvable specifier) yet rejects at
// `import()`, exercising collectListeners' per-file import-failure branch (#150).
throw new Error('boom: this fixture fails at import time on purpose')
