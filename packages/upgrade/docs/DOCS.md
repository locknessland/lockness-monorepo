# Lockness Upgrade

Automated upgrade tool for updating all @lockness/* dependencies to the latest
or specified version.

## Overview

@lockness/upgrade simplifies version management by automatically updating all
Lockness packages in your deno.json with a single command. Features smart
detection, dry-run mode, and safe updates.

## Installation

No installation required - run directly from JSR:

```bash
deno run -Ar jsr:@lockness/upgrade
```

## Quick Start

### Upgrade to Latest Version

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
deno run -Ar jsr:@lockness/upgrade 0.2.0 --dry-run
```

## Command Line Options

| Option      | Alias | Description                             |
| ----------- | ----- | --------------------------------------- |
| `--dry-run` | `-d`  | Preview changes without modifying files |
| `--help`    | `-h`  | Show help message                       |
| `[version]` | -     | Target version (omit for latest)        |

## How It Works

1. **Detection** - Scans deno.json for all @lockness/* packages
2. **Version Check** - Fetches latest versions from JSR (or uses specified
   version)
3. **Comparison** - Identifies packages that need upgrading
4. **Update** - Modifies deno.json with new versions (unless dry-run)
5. **Summary** - Displays what was upgraded with before/after versions

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
  - Check the changelog at https://github.com/locknessland/lockness-monorepo/releases
  - Test your application
```

## What Gets Updated

The tool only updates packages matching these criteria:

- Package name starts with `@lockness/`
- Import value starts with `jsr:@lockness/`

**Before:**

```json
{
    "imports": {
        "@lockness/core": "jsr:@lockness/core@^0.1.19",
        "@lockness/cli": "jsr:@lockness/cli@^0.1.19",
        "@std/path": "jsr:@std/path@^1.0.0"
    }
}
```

**After:**

```json
{
    "imports": {
        "@lockness/core": "jsr:@lockness/core@^0.2.0",
        "@lockness/cli": "jsr:@lockness/cli@^0.2.0",
        "@std/path": "jsr:@std/path@^1.0.0"
    }
}
```

Note: `@std/path` remains unchanged (not a Lockness package).

## When to Use

### ✅ Use This Tool When:

- Upgrading a Lockness project to a new version
- Applying security patches across all packages
- Ensuring version consistency in your project
- Setting up CI/CD version updates

### ❌ Don't Use This Tool When:

- You need to selectively upgrade specific packages (manually edit deno.json)
- Your project is not using Lockness
- You want to downgrade versions (manually edit deno.json)

## Common Use Cases

### Upgrade Before Deployment

```bash
# Check what would be upgraded
deno run -Ar jsr:@lockness/upgrade --dry-run

# Review changes
git diff deno.json

# If looks good, apply upgrade
deno run -Ar jsr:@lockness/upgrade

# Test application
deno task dev

# Commit changes
git add deno.json
git commit -m "chore: upgrade lockness to v0.2.0"
```

### CI/CD Version Check

```yaml
# .github/workflows/upgrade-check.yml
name: Check Lockness Version
on:
    schedule:
        - cron: '0 0 * * 1' # Weekly on Monday

jobs:
    upgrade-check:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: denoland/setup-deno@v1
            - name: Check for upgrades
              run: |
                  deno run -Ar jsr:@lockness/upgrade --dry-run
```

### Upgrade Multiple Projects

```bash
#!/bin/bash
for project in project1 project2 project3; do
  cd $project
  echo "Upgrading $project..."
  deno run -Ar jsr:@lockness/upgrade
  cd ..
done
```

## Programmatic Usage

Use the upgrader programmatically in scripts:

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

if (result.success) {
    console.log(`Upgraded ${result.packages?.length} packages`)
    for (const pkg of result.packages!) {
        console.log(`${pkg.name}: ${pkg.oldVersion} → ${pkg.newVersion}`)
    }
} else {
    console.error(result.error)
}
```

## Error Handling

The tool handles common errors gracefully:

### "No Lockness packages found in imports"

Your deno.json doesn't contain any @lockness/* packages. Ensure your imports
section includes at least one Lockness package.

```json
{
    "imports": {
        "@lockness/core": "jsr:@lockness/core@^0.1.19"
    }
}
```

### "Timeout fetching version for @lockness/..."

Network request to JSR API timed out. Check your internet connection or try
again later.

```bash
# Try again with longer timeout
deno run -Ar jsr:@lockness/upgrade
```

### "Failed to fetch version for @lockness/..."

JSR API returned an error. The package may not exist or JSR may be temporarily
unavailable.

### "deno.json not found"

Run the command from your project root where deno.json is located:

```bash
cd /path/to/project
deno run -Ar jsr:@lockness/upgrade
```

## Best Practices

### 1. Always Review Changes

Use git diff after upgrading to review changes:

```bash
deno run -Ar jsr:@lockness/upgrade
git diff deno.json
```

### 2. Check Breaking Changes

Read the changelog before upgrading:

```bash
# Visit changelog
open https://github.com/locknessland/lockness-monorepo/releases
```

### 3. Test Thoroughly

Run your test suite after upgrading:

```bash
deno run -Ar jsr:@lockness/upgrade
deno task test
```

### 4. Use Dry Run First

Preview changes before applying them:

```bash
deno run -Ar jsr:@lockness/upgrade --dry-run
```

### 5. Version Control

Commit before upgrading so you can revert if needed:

```bash
git add .
git commit -m "save: before lockness upgrade"
deno run -Ar jsr:@lockness/upgrade
```

### 6. Upgrade Regularly

Keep dependencies up to date for security patches:

```bash
# Weekly upgrade check
deno run -Ar jsr:@lockness/upgrade --dry-run
```

## Integration with Package Managers

### Using as npm Script

Add to package.json if using npm:

```json
{
    "scripts": {
        "upgrade": "deno run -Ar jsr:@lockness/upgrade",
        "upgrade:check": "deno run -Ar jsr:@lockness/upgrade --dry-run"
    }
}
```

### Using with deno task

Add to deno.json tasks:

```json
{
    "tasks": {
        "upgrade": "deno run -Ar jsr:@lockness/upgrade",
        "upgrade:check": "deno run -Ar jsr:@lockness/upgrade --dry-run"
    }
}
```

Then run:

```bash
deno task upgrade
deno task upgrade:check
```

## Troubleshooting

### Issue: "Permission denied"

Solution: Add required permissions with `-Ar` flags:

```bash
deno run -Ar jsr:@lockness/upgrade
# -A = all permissions
# -r = reload cache
```

### Issue: Outdated cache

Solution: Clear Deno cache and try again:

```bash
deno cache --reload jsr:@lockness/upgrade
deno run -Ar jsr:@lockness/upgrade
```

### Issue: Version conflict

Solution: Manually resolve conflicts in deno.json before upgrading:

```bash
# Fix any JSON syntax errors first
deno task check
# Then upgrade
deno run -Ar jsr:@lockness/upgrade
```

## Version Strategy

The upgrade tool uses semantic versioning (semver):

```json
{
    "imports": {
        "@lockness/core": "jsr:@lockness/core@^0.2.0"
    }
}
```

- `^0.2.0` - Compatible with 0.2.x (recommended)
- `~0.2.0` - Compatible with 0.2.x patches only
- `0.2.0` - Exact version (not recommended)

The tool preserves your existing version prefix (^, ~, or exact).

## Security

The upgrade tool:

- Only modifies deno.json file
- Only updates @lockness/* packages
- Never executes arbitrary code
- Fetches versions from official JSR API
- Has 5-second timeout for network requests
- Validates JSON before writing

## Contributing

Found a bug or have a feature request? Open an issue on
[GitHub](https://github.com/locknessland/lockness-monorepo/issues).

## Links

- [Lockness Framework](https://github.com/locknessland/lockness-monorepo)
- [JSR Package Registry](https://jsr.io/@lockness/upgrade)
- [Documentation](https://lockness.land/docs)
- [Changelog](https://github.com/locknessland/lockness-monorepo/releases)
