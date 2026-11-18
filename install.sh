#!/bin/sh
set -eu
case " ${NODE_OPTIONS:-} " in
  *' --experimental-strip-types '*) ;;
  *) NODE_OPTIONS="${NODE_OPTIONS:-} --experimental-strip-types"; export NODE_OPTIONS ;;
esac

root=${SYMBIOTE_INSTALL_ROOT:-"$HOME/.symbiote"}
app="$root/app"
runtime="$root/runtime/node-v22.19.0"
bin=${SYMBIOTE_BIN_DIR:-"$HOME/.local/bin"}
no_launch=0
no_path=0
no_system_deps=0
for arg in "$@"; do
  case "$arg" in
    --no-launch) no_launch=1 ;;
    --no-path) no_path=1 ;;
    --no-system-deps) no_system_deps=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
work=$(mktemp -d "${TMPDIR:-/tmp}/symbiote-install.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT HUP INT TERM
mkdir -p "$root"

if [ ! -e "$app" ]; then
  echo 'Downloading Symbiote...'
  curl -fsSL 'https://github.com/rajarshidattapy/Symbiote/archive/refs/heads/master.tar.gz' -o "$work/symbiote.tar.gz"
  tar -xzf "$work/symbiote.tar.gz" -C "$work"
  [ -f "$work/Symbiote-master/ai-service/package.json" ] || { echo 'The downloaded archive is missing required files.' >&2; exit 1; }
  mv "$work/Symbiote-master" "$app"
elif [ ! -f "$app/ai-service/package.json" ]; then
  echo "The installation directory $app exists and is not a Symbiote installation; it was not changed." >&2
  exit 1
else
  echo 'Using the existing Symbiote installation; local files and credentials will be preserved.'
fi

node="$runtime/bin/node"
printf 'const value: number = 1; if (value !== 1) process.exit(1);\n' > "$work/node-probe.ts"
if [ ! -x "$node" ] && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && node -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit(major>22 || (major===22 && minor>=19) ? 0 : 1)' >/dev/null 2>&1 && node "$work/node-probe.ts" >/dev/null 2>&1; then
  node=$(command -v node)
fi
if [ ! -x "$node" ]; then
  [ ! -e "$runtime" ] || { echo "The Node runtime directory $runtime is incomplete and was not changed." >&2; exit 1; }
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) echo 'Supported systems: macOS and Linux.' >&2; exit 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) echo 'Supported architectures: x64 and arm64.' >&2; exit 1 ;; esac
  case "$os-$arch" in
    darwin-arm64) expected=c59006db713c770d6ec63ae16cb3edc11f49ee093b5c415d667bb4f436c6526d ;;
    darwin-x64) expected=3cfed4795cd97277559763c5f56e711852d2cc2420bda1cea30c8aa9ac77ce0c ;;
    linux-arm64) expected=d32817b937219b8f131a28546035183d79e7fd17a86e38ccb8772901a7cd9009 ;;
    linux-x64) expected=d36e56998220085782c0ca965f9d51b7726335aed2f5fc7321c6c0ad233aa96d ;;
  esac
  filename="node-v22.19.0-$os-$arch.tar.gz"
  echo 'Installing a private Node.js runtime...'
  curl -fsSL "https://nodejs.org/dist/v22.19.0/$filename" -o "$work/$filename"
  if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$work/$filename" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then actual=$(shasum -a 256 "$work/$filename" | awk '{print $1}')
  else echo 'A SHA-256 utility is required to verify Node.js.' >&2; exit 1; fi
  [ "$actual" = "$expected" ] || { echo 'Node.js download checksum did not match.' >&2; exit 1; }
  tar -xzf "$work/$filename" -C "$work"
  mkdir -p "$root/runtime"
  mv "$work/node-v22.19.0-$os-$arch" "$runtime"
  node="$runtime/bin/node"
fi
"$node" "$work/node-probe.ts" >/dev/null 2>&1 || { echo 'The Node.js runtime cannot execute TypeScript. Remove the incomplete runtime and retry.' >&2; exit 1; }
PATH="$(dirname "$node"):$PATH"
export PATH
command -v npm >/dev/null 2>&1 || { echo 'npm was not found alongside Node.js.' >&2; exit 1; }

echo 'Installing the AI service and building Pi...'
(cd "$app/ai-service" && npm ci --ignore-scripts --no-audit --no-fund)
(cd "$app/harness" && npm ci --ignore-scripts --no-audit --no-fund && npm run hydrate:model-data && npm run build:offline)
echo 'Installing the sign-in browser...'
"$node" "$app/ai-service/node_modules/playwright/cli.js" install chromium --no-shell
if [ "$(uname -s)" = Linux ] && [ "$no_system_deps" -eq 0 ] && command -v ldd >/dev/null 2>&1; then
  browser=$(cd "$app/ai-service" && "$node" --input-type=module -e 'import {chromium} from "playwright"; console.log(chromium.executablePath())')
  if ldd "$browser" 2>/dev/null | grep -q 'not found'; then
    echo 'Installing missing browser libraries; your system may ask for administrator credentials...'
    "$node" "$app/ai-service/node_modules/playwright/cli.js" install-deps chromium
  fi
fi

mkdir -p "$bin"
target="$bin/symbiote"
if [ -e "$target" ] || [ -L "$target" ]; then
  [ "$(readlink "$target" 2>/dev/null || true)" = "$app/symbiote" ] || { echo "A different command exists at $target; it was not overwritten." >&2; exit 1; }
else
  chmod +x "$app/symbiote"
  ln -s "$app/symbiote" "$target"
fi
if [ "$no_path" -eq 0 ]; then
case ":$PATH:" in
  *":$bin:"*) ;;
  *)
    login_shell=${SHELL:-}
    case "${login_shell##*/}" in
      zsh) rc="$HOME/.zshrc" ;;
      bash) rc="$HOME/.bashrc" ;;
      fish) rc="$HOME/.config/fish/conf.d/symbiote.fish"; mkdir -p "$(dirname "$rc")" ;;
      *) rc='' ;;
    esac
    if [ -n "$rc" ] && ! grep -Fq '# Symbiote CLI' "$rc" 2>/dev/null; then
      if [ "${login_shell##*/}" = fish ]; then
        printf '\n%s\n%s\n' '# Symbiote CLI' 'fish_add_path "$HOME/.local/bin"' >> "$rc"
      else
        printf '\n%s\n%s\n' '# Symbiote CLI' 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
      fi
      echo "Added ~/.local/bin to $rc; open a new terminal to use the symbiote command."
    else
      echo 'Ensure ~/.local/bin is on your PATH in new terminals.'
    fi ;;
esac
fi

echo 'Symbiote is installed.'
if [ "$no_launch" -eq 0 ]; then
  echo 'Starting first-time setup...'
  "$node" "$app/ai-service/launcher.ts" </dev/tty
fi
