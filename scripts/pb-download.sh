#!/usr/bin/env bash
# Download the PocketBase binary at the version pinned in pb/VERSION.
#
# Idempotent: skips the download when the local binary already matches the pin.
# Used by local dev (any OS/arch), CI (linux_amd64) and the VPS (linux_amd64).
#
# Cross-target fetch:
#   PB_TARGET=linux_amd64 ./scripts/pb-download.sh    # fetch the VPS binary from any machine
#   PB_DEST=./pb/pocketbase-linux ./scripts/pb-download.sh
#
# Known quirk (do not "fix" this): PocketBase publishes ONE combined
# checksums.txt per release covering every archive, so the verification step
# greps our archive's line out of that file and pipes just that line into
# `sha256sum -c`. Running `sha256sum -c checksums.txt` wholesale fails, because
# it insists on files we never downloaded.

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION_FILE="pb/VERSION"
DEST="${PB_DEST:-pb/pocketbase}"

if [[ ! -f "$VERSION_FILE" ]]; then
  echo "Missing $VERSION_FILE — the PocketBase version pin is the source of truth." >&2
  exit 1
fi

VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"

if [[ -x "$DEST" ]]; then
  INSTALLED="$("$DEST" --version 2>/dev/null | awk '{ print $NF }' || true)"
  if [[ "$INSTALLED" == "v$VERSION" || "$INSTALLED" == "$VERSION" ]]; then
    echo "PocketBase $VERSION already installed at $DEST."
    exit 0
  fi
  echo "Replacing PocketBase ${INSTALLED:-unknown} at $DEST with $VERSION."
fi

if [[ -n "${PB_TARGET:-}" ]]; then
  TARGET="$PB_TARGET"
else
  case "$(uname -s)" in
    Linux*)   OS="linux" ;;
    Darwin*)  OS="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
    *) echo "Unsupported OS: $(uname -s). Set PB_TARGET explicitly." >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported arch: $(uname -m). Set PB_TARGET explicitly." >&2; exit 1 ;;
  esac
  TARGET="${OS}_${ARCH}"
fi

ARCHIVE="pocketbase_${VERSION}_${TARGET}.zip"
RELEASE_URL="https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "Downloading PocketBase $VERSION for $TARGET..."
curl -fsSL -o "$WORKDIR/$ARCHIVE" "$RELEASE_URL/$ARCHIVE"

echo "Verifying SHA256 against the release's combined checksums.txt..."
curl -fsSL -o "$WORKDIR/checksums.txt" "$RELEASE_URL/checksums.txt"
EXPECTED="$(grep -E "[[:space:]]\*?${ARCHIVE}\$" "$WORKDIR/checksums.txt" || true)"
if [[ -z "$EXPECTED" ]]; then
  echo "$ARCHIVE has no entry in checksums.txt — wrong version or target?" >&2
  exit 1
fi
( cd "$WORKDIR" && printf '%s\n' "$EXPECTED" | sha256sum -c - )

echo "Extracting..."
unzip -o -q "$WORKDIR/$ARCHIVE" -d "$WORKDIR/extract"

mkdir -p "$(dirname "$DEST")"
mv "$WORKDIR/extract/pocketbase" "$DEST"
chmod +x "$DEST"

echo "Installed PocketBase $VERSION at $DEST."
