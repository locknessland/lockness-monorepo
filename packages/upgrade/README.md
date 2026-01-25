# @lockness/upgrade

Automated upgrade tool for Lockness projects. Updates all `@lockness/*`
dependencies in your `deno.json` file to the latest or a specified version with
a single command.

## Features

- 🚀 **Zero Installation**: Run directly from JSR without prior setup
- 🎯 **Smart Detection**: Automatically finds all Lockness packages in your
  project
- 🔄 **Version Flexibility**: Upgrade to latest or specify a target version
- 👀 **Dry Run Mode**: Preview changes before applying them
- ✅ **Safe Updates**: Only modifies Lockness dependencies, leaves others intact
- 📊 **Clear Feedback**: Shows detailed upgrade summary with before/after
  versions

## Usage

### Quick Start

Upgrade all Lockness packages to the latest version:

```bash
deno run -Ar jsr:@lockness/upgrade
```

### Upgrade to Specific Version

```bash
deno run -Ar jsr:@lockness/upgrade 0.2.0
```

### Preview Changes (Dry Run)

```bash
deno run -Ar jsr:@lockness/upgrade --dry-run
```

### Combined Options

```bash
# Dry run with specific version
deno run -Ar jsr:@lockness/upgrade 0.2.0 --dry-run
```

## Command Line Options

| Option      | Alias | Description                             |
| ----------- | ----- | --------------------------------------- |
| `--dry-run` | `-d`  | Preview changes without modifying files |
| `--help`    | `-h`  | Show help message                       |
| `[version]` | -     | Target version (omit for latest)        |

## How It Works

1. **Detection**: Scans your `deno.json` for all `@lockness/*` packages
2. **Version Check**: Fetches latest versions from JSR (or uses specified
   version)
3. **Comparison**: Identifies packages that need upgrading
4. **Update**: Modifies `deno.json` with new versions (unless dry-run)
5. **Summary**: Displays what was upgraded with before/after versions

## Example Output

```
🔍 Detecting Lockness packages in deno.json...

📦 Found 5 package(s):

  @lockness/core              0.1.19 → 0.2.0
  @lockness/cli               0.1.19 → 0.2.0
  @lockness/auth              0.1.19 → 0.2.0
  @lockness/drizzle           0.1.19 → 0.2.0
  @lockness/cache             0.1.19 → 0.2.0

✅ deno.json updated successfully!

⚠️  Don't forget to:
  - Review the changes with git diff
  - Check the changelog at https://github.com/locknessland/lockness/releases
  - Test your application
```

## What Gets Updated

The tool only updates packages matching these criteria:

- Package name starts with `@lockness/`
- Import value starts with `jsr:@lockness/`

**Example:**

Before:

```json
{
    "imports": {
        "@lockness/core": "jsr:@lockness/core@^0.1.19",
        "@lockness/cli": "jsr:@lockness/cli@^0.1.19",
        "@std/path": "jsr:@std/path@^1.0.0"
    }
}
```

After:

```json
{
    "imports": {
        "@lockness/core": "jsr:@lockness/core@^0.2.0",
        "@lockness/cli": "jsr:@lockness/cli@^0.2.0",
        "@std/path": "jsr:@std/path@^1.0.0"
    }
}
```

Note: `@std/path` remains unchanged.

## When to Use

### ✅ Use This Tool When:

- Upgrading a Lockness project to a new version
- Applying security patches across all packages
- Ensuring version consistency in your project
- Setting up CI/CD version updates

### ❌ Don't Use This Tool When:

- You need to selectively upgrade specific packages (manually edit `deno.json`)
- Your project is not using Lockness
- You want to downgrade versions (manually edit `deno.json`)

## Best Practices

1. **Always Review Changes**: Use `git diff` after upgrading
2. **Check Breaking Changes**: Read the
   [changelog](https://github.com/locknessland/lockness/releases) before
   upgrading
3. **Test Thoroughly**: Run your test suite after upgrading
4. **Use Dry Run First**: Preview changes before applying them
5. **Version Control**: Commit before upgrading so you can revert if needed

## Programmatic Usage

While primarily designed as a CLI tool, you can use the upgrader
programmatically:

```typescript
import { Upgrader } from 'jsr:@lockness/upgrade/upgrader'
import { createVersionProvider } from 'jsr:@lockness/upgrade/version_fetcher'

const versionProvider = createVersionProvider()
const upgrader = new Upgrader(versionProvider)

const result = await upgrader.upgrade({
    targetVersion: '0.2.0',
    dryRun: true,
    configPath: './deno.json',
})

console.log(result)
```

## Error Handling

The tool handles common errors gracefully:

- **File Not Found**: Returns error if `deno.json` doesn't exist
- **No Imports**: Returns error if no `imports` section exists
- **No Lockness Packages**: Returns error if no `@lockness/*` packages found
- **Network Issues**: Returns error if JSR API is unreachable (5s timeout)
- **Invalid JSON**: Returns error if `deno.json` is malformed

## Troubleshooting

### "No Lockness packages found in imports"

Your `deno.json` doesn't contain any `@lockness/*` packages. Ensure your imports
section includes at least one Lockness package.

### "Timeout fetching version for @lockness/..."

Network request to JSR API timed out. Check your internet connection or try
again later.

### "Failed to fetch version for @lockness/..."

JSR API returned an error. The package may not exist or JSR may be temporarily
unavailable.

## Contributing

Found a bug or have a feature request? Please open an issue on
[GitHub](https://github.com/locknessland/lockness/issues).

## License

MIT License - see LICENSE file for details

## Links

- [Lockness Framework](https://github.com/locknessland/lockness)
- [JSR Package Registry](https://jsr.io/@lockness/upgrade)
- [Documentation](https://lockness.land/docs)

---

Made with 🌊 by the Lockness team
