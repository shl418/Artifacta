# Development Environment

This project is developed with Node.js managed by `fnm` and packages managed by `pnpm`.

## Expected Toolchain

| Tool | Expected Use |
| --- | --- |
| Node.js | `24.16.0` via `fnm`, `.node-version`, or `.nvmrc`. Supported line: `>=22 <25`. |
| pnpm | `11.1.3`, matching the root `packageManager` field. |
| TypeScript check | `pnpm typecheck` |
| Production build | `pnpm build` |
| Unit tests | `pnpm test:unit` |
| Full local tests | `pnpm test` |
| Smoke test | `pnpm test:smoke` against a running app (also runs in CI) |
| Client package | `pnpm client:build` and `pnpm test:client` |
| API contract | `pnpm test:api-contract` |

## `fnm` Setup

The local machine uses `fnm` from `~/.fnm`. A typical zsh setup is:

```zsh
typeset -U path PATH
path=("$HOME/.local/bin" "$HOME/.fnm" "$HOME/bin" "/usr/local/bin" "/usr/local/sbin" $path)
export PATH

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell zsh --use-on-cd)"
fi
```

After opening a normal interactive terminal, these should resolve to `fnm`-managed binaries:

```bash
command -v fnm
command -v node
node -v
command -v pnpm
pnpm -v
```

## Agent And Non-Interactive Shells

Coding agents and CI-style commands may run in non-interactive shells. Those shells do not always load the same startup files as a human zsh terminal:

- Interactive zsh usually reads `~/.zshrc`.
- Login zsh usually reads `~/.zprofile`.
- Non-interactive command runners may inherit a prebuilt environment or skip parts of the interactive setup.

If `pnpm` is missing or `node -v` resolves to an old system Node such as `/usr/local/bin/node`, load `fnm` explicitly before running project commands:

```bash
export PATH="$HOME/.local/bin:$HOME/.fnm:$HOME/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
eval "$(fnm env --shell zsh --use-on-cd)"
pnpm typecheck
```

If the runner is not zsh, use the matching shell option:

```bash
eval "$(fnm env --shell bash --use-on-cd)"
```

## Why This Matters

The repository depends on modern Node APIs such as `node:path`. If a command accidentally uses the old system Node, package manager commands can fail before project scripts start. Always check `node -v` and `command -v pnpm` when an environment-sensitive command behaves differently from the normal terminal.
