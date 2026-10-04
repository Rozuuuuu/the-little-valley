# Little Valley (Godot)

The Godot version of Little Valley, under construction. The browser game in the repository
root is still the playable game. Plan and status: [docs/godot/MIGRATION.md](../docs/godot/MIGRATION.md).
Measurements: [docs/godot/BASELINE.md](../docs/godot/BASELINE.md).

## Requirements

- **Godot 4.7.2-stable** (pinned in `VERSION`). Either the standard or the .NET build works;
  the project is GDScript only, because C# cannot be exported to the web in Godot 4.
- Node 20+ in the repository root, only to regenerate the exported content and golden data.

Below, `godot` means the Godot executable (on Windows, the `_console.exe` shows output in
the terminal).

## Running the tests

```bash
cd godot
godot --headless --path . --import                      # first time, or after adding scripts
godot --headless --path . -s res://tools/run_tests.gd    # every test
godot --headless --path . -s res://tools/run_tests.gd -- test_core   # only matching files or methods
```

The runner exits with code 1 if anything fails. The world tests take about 20 seconds,
because they generate every fingerprinted chunk.

## Benchmarks

```bash
godot --headless --path . -s res://tools/bench_gen.gd -- 12   # ms per chunk, generators 1–4
```

## Exporting (web and Windows)

Use the **standard** Godot 4.7.2 editor (not the .NET one: C# projects can't export to the web)
and the official export templates (`Godot_v4.7.2-stable_export_templates.tpz`, unzipped).

```bash
GODOT=/path/to/Godot_v4.7.2-stable_win64_console.exe \
GODOT_TEMPLATES=/path/to/templates \
scripts/godot-export.sh web        # → dist-godot/web/ (an installable PWA)
scripts/godot-export.sh windows    # → dist-godot/windows/LittleValley.exe
```

Check the web build in Chrome: `npx tsx scripts/godot-web-bench.ts 100 600 desktop`, or with
phone emulation (`phone`). To try it on a real phone on your Wi-Fi: `npx tsx scripts/serve-godot-web.ts`.

The game also takes capture options, as command-line arguments or, on the web, in the page
address:

| Option | Meaning |
| --- | --- |
| `--shot=out.png` | Save a screenshot |
| `--settlers=N` | Add N settlers |
| `--ticks=N` | Run N ticks first |
| `--zoom=Z` | Camera zoom |
| `--frames=N` | Frame benchmark over N frames |
| `--people=1` | Open the People window |

On the web, use `?bench=N&settlers=M` instead.

## Data shared with the browser game

Both versions must agree exactly, so the Godot side reads data exported from the TypeScript
game. Run these from the repository root:

```bash
npx tsx scripts/export-content.ts          # content/*.json: every balance table
npx tsx scripts/export-content.ts --check  # fails if content/ is out of date
npx tsx scripts/export-golden.ts           # tests/golden/*.json: RNG, noise, math and chunk reference values
```

Never edit `content/` or `tests/golden/` by hand.

## Rules for code here

- **Typed GDScript everywhere.** Untyped declarations are errors (see `project.godot`).
- **Simulation code lives in `src/sim`.** It is plain objects and packed arrays, never
  scene nodes, and it runs headless.
- **Exact numerics.** Use `I32` for JavaScript-style 32-bit integer maths, `JsMath.hypot` and
  `JsMath.sin_js` instead of `sqrt(x*x+y*y)` and `sin`, a float operand in every division
  (`int / int` truncates), and `JsMath.from_bits` for constants that need more than 15
  significant digits (GDScript reads long literals inexactly; a test enforces this).
- **Never change a shipped world generator;** add a new version.
