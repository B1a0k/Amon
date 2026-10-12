// The part of the SSH extension's remote CLI scripts that WSL uses. Extensions share only contracts, so
// keep the two copies in step.

export function quote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function requireVersion(version: string) {
  if (version !== "local" && !/^[0-9][a-zA-Z0-9.+-]*$/.test(version)) throw new Error(version)

  return version
}

export function discoverScript() {
  return `cli=""
if [ -z "$cli" ] && [ -x "$HOME/.amon/bin/amon-engine" ]; then cli="$HOME/.amon/bin/amon-engine"; fi
if [ -n "$cli" ]; then printf '%s\\n' "$cli"; fi
`
}

// Adapters supply a quoted shell expression, including remote HOME or wslpath expansion.
export function versionScript(command: string) {
  return `if [ -x ${command} ]; then ${command} --version 2>/dev/null || true; fi\n`
}

export function parseVersion(output: string) {
  const line = output
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim()

  if (!line) return null
  const marker = line.lastIndexOf(" v")
  const version = marker === -1 ? line : line.slice(marker + 2)

  if (!version) throw new Error("V2 CLI did not provide a version")

  return version
}

/** The managed CLI installer also configures the user's shell PATH. */
export function installScript(input: { version: string; binary?: string }) {
  const version = requireVersion(input.version)

  return `set -eu
destination="$HOME/.amon/bin/amon-engine"
mkdir -p "$(dirname "$destination")"
${input.binary ? `cp ${input.binary} "$destination.bin"` : `stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
arch=$(uname -m)
case "$arch" in x86_64|amd64) target=linux-x64-baseline ;; aarch64|arm64) target=linux-arm64 ;; *) exit 2 ;; esac
if [ -f /etc/alpine-release ] || (ldd --version 2>&1 | grep -qi musl); then target="$target-musl"; fi
curl -fsSL --connect-timeout 15 --max-time 180 "https://registry.npmjs.org/@opencode/cli-$target/-/cli-$target-${version}.tgz" -o "$stage/archive.tgz"
tar -xzf "$stage/archive.tgz" -C "$stage"
cp "$stage/package/bin/opencode" "$destination.bin"`}
chmod 755 "$destination.bin"
cat > "$destination" <<'AMON_ENGINE'
#!/bin/sh
export XDG_DATA_HOME="$HOME/.amon/remote/data"
export XDG_CONFIG_HOME="$HOME/.amon/remote/config"
export XDG_CACHE_HOME="$HOME/.amon/remote/cache"
export XDG_STATE_HOME="$HOME/.amon/remote/state"
export OPENCODE_PASSWORD="\${AMON_PASSWORD:-\${AMON_SERVER_PASSWORD:-}}"
export OPENCODE_SERVER_PASSWORD="$OPENCODE_PASSWORD"
export OPENCODE_CLIENT=desktop
exec "$0.bin" "$@"
AMON_ENGINE
chmod 755 "$destination"
test "$("$destination" --version | awk '{print $NF}' | sed 's/^v//')" = ${quote(version)}
`
}
