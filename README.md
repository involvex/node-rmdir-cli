# @involvex/rmdir-cli

@involvex/rmdir-cli is cross-platform command to recursively delete directories

## Usage

```javascript
npm install @involvex/rmdir-cli -g
```

and use it

```bash
rmdir <dir>
```

## Quick Use

```bash
npx @involvex/rmdir-cli <dir>
```

## Parameters

- `-h`, `--help` - output usage information
- `-v`, `--version` - output the version number
- `-f`, `--force` - enable recursive deletion of non-empty directories (requires confirmation)
- `-y`, `--yes` - skip confirmation prompts (non-interactive mode)

## Usage Examples

### Basic Usage

```bash
# Delete an empty directory
rmdir mydir

# Delete a non-empty directory with confirmation prompt
rmdir --force mydir

# Delete a non-empty directory without confirmation
rmdir --force --yes mydir

# Delete multiple directories
rmdir --force dir1 dir2 dir3
```

### Safety Features

The `--force` parameter enables recursive deletion of non-empty directories, but includes safety measures:

1. **Confirmation Prompt**: By default, the CLI will prompt for confirmation before deleting non-empty directories
2. **Non-Interactive Mode**: Use `--yes` to skip confirmation prompts for automated scripts
3. **Error Handling**: Clear error messages for permission issues, non-existent directories, or invalid paths
4. **Progress Information**: Shows directory size and file count before deletion

### Help Information

```bash
rmdir --help
```

Output:

```bash
Usage: rmdir [options] <dir> [dir2 ...]

Options:
  -h, --help     output usage information
  -v, --version  output the version number
  -f, --force    enable recursive deletion of non-empty directories
  -y, --yes      skip confirmation prompts (non-interactive mode)

Examples:
  rmdir mydir                    # Delete empty directory
  rmdir --force mydir           # Delete non-empty directory with confirmation
  rmdir --force --yes mydir     # Delete non-empty directory without confirmation
  rmdir --force dir1 dir2 dir3  # Delete multiple directories
```
