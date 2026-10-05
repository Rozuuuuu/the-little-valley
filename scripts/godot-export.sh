#!/usr/bin/env bash
# Exports the Godot version. Usage, from the repository root:
#   GODOT=/path/to/Godot_v4.7.2-stable_win64_console.exe \
#   GODOT_TEMPLATES=/path/to/templates \
#   scripts/godot-export.sh web|windows [release|debug]
#
# GODOT_TEMPLATES is the folder holding web_nothreads_release.zip, windows_release_x86_64.exe,
# etc. (extracted from the official Godot_v4.7.2-stable_export_templates.tpz). The committed
# godot/export_presets.cfg holds a placeholder for that folder, so no machine path is committed;
# this script fills it in for the export and puts the placeholder back afterwards.
#
# Output: dist-godot/web/ (index.html and friends; a PWA) or dist-godot/windows/LittleValley.exe.
set -euo pipefail
target="${1:-web}"
mode="${2:-release}"
: "${GODOT:?set GODOT to the Godot 4.7.2 (standard, not .NET) editor executable}"
: "${GODOT_TEMPLATES:?set GODOT_TEMPLATES to the folder with the export templates}"
root="$(cd "$(dirname "$0")/.." && pwd)"
presets="$root/godot/export_presets.cfg"
backup="$(mktemp)"
cp "$presets" "$backup"
restore() { cp "$backup" "$presets"; rm -f "$backup"; }
trap restore EXIT
templates="${GODOT_TEMPLATES//\\//}"
sed -i "s#__TEMPLATES__#${templates}#g" "$presets"
case "$target" in
  web) preset="Web"; out="$root/dist-godot/web/index.html" ;;
  windows) preset="Windows"; out="$root/dist-godot/windows/LittleValley.exe" ;;
  *) echo "unknown target $target (web or windows)"; exit 2 ;;
esac
mkdir -p "$(dirname "$out")"
"$GODOT" --headless --path "$root/godot" --import >/dev/null 2>&1 || true
"$GODOT" --headless --path "$root/godot" "--export-$mode" "$preset" "$out"
if [ "$target" = web ]; then
  # Send the login cookie with the manifest request: on Vercel deployments behind login, the
  # browser fetches the manifest without credentials by default and gets a 401.
  sed -i 's#<link rel="manifest" href="index.manifest.json">#<link rel="manifest" href="index.manifest.json" crossorigin="use-credentials">#' "$out"
  grep -q 'crossorigin="use-credentials"' "$out" || { echo "manifest credentials patch did not apply"; exit 1; }
fi
echo "exported $preset ($mode) to $out"
