# Architecture Diagram Tool

Renders D2 diagram source files (`.d2`) to SVG using
[D2](https://d2lang.com/) with the ELK layout engine.

## Prerequisites

Install D2:

```bash
brew install d2
```

## Usage

Build all diagrams:

```bash
bazel build //tools/architecture-diagram/...
```

Build a specific diagram:

```bash
bazel build //tools/architecture-diagram:c4_context_svg
bazel build //tools/architecture-diagram:c4_container_svg
```

Or use the convenience script:

```bash
./scripts/render-diagrams.sh
```

Output appears in `bazel-bin/tools/architecture-diagram/`.

## Adding a New Diagram

1. Create a `.d2` file in `diagrams/`:

   ```d2
   service_a: Service A
   service_b: Service B
   service_a -> service_b: calls
   ```

2. Add a genrule target in `BUILD.bazel`:

   ```starlark
   genrule(
       name = "my_diagram_svg",
       srcs = ["diagrams/my-diagram.d2"],
       outs = ["my-diagram.svg"],
       cmd = "d2 --layout=elk $(location diagrams/my-diagram.d2) $@",
       visibility = ["//visibility:public"],
   )
   ```

3. Run `bazel build //tools/architecture-diagram:my_diagram_svg`.

## Architecture Decisions

- Diagram source (`.d2`) is committed; rendered output is **not** committed
  (generated on demand via Bazel).
- ELK layout engine is used for clean rendering of complex diagrams (`--layout=elk`).
- D2 is a standalone binary — no npm, Puppeteer, or Chrome dependency.
