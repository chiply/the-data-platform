# Architecture Diagram Tool

Renders Mermaid diagram source files (`.mmd`) to SVG using
[@mermaid-js/mermaid-cli](https://github.com/mermaid-js/mermaid-cli) with the
ELK layout engine.

## Prerequisites

Chrome must be cached locally for Puppeteer (used by mermaid-cli for rendering):

```bash
cd tools/architecture-diagram
npx puppeteer browsers install chrome
```

## Usage

Build all diagrams:

```bash
bazel build //tools/architecture-diagram/...
```

Build a specific diagram:

```bash
bazel build //tools/architecture-diagram:sample_svg
```

Output appears in `bazel-bin/tools/architecture-diagram/`.

## Adding a New Diagram

1. Create a `.mmd` file in `diagrams/`:

   ```mermaid
   flowchart TD
       A[Service A] --> B[Service B]
   ```

2. Add a render target in `BUILD.bazel` using the `mermaid_cli_bin.mmdc` macro:

   ```starlark
   mermaid_cli_bin.mmdc(
       name = "my_diagram_svg",
       srcs = [
           "diagrams/my_diagram.mmd",
           "mermaidrc.json",
       ],
       outs = ["my_diagram.svg"],
       args = [
           "-i", "tools/architecture-diagram/diagrams/my_diagram.mmd",
           "-o", "tools/architecture-diagram/my_diagram.svg",
           "-c", "tools/architecture-diagram/mermaidrc.json",
           "--quiet",
       ],
       execution_requirements = {"no-sandbox": "1"},
       visibility = ["//visibility:public"],
   )
   ```

3. Run `bazel build //tools/architecture-diagram:my_diagram_svg`.

## Configuration

- **mermaidrc.json** — Mermaid rendering config (ELK layout engine, theme settings).
- **package.json** / **pnpm-lock.yaml** — npm dependencies managed via pnpm,
  consumed by Bazel through `aspect_rules_js`.

## Architecture Decisions

- Diagram source (`.mmd`) is committed; rendered output is **not** committed
  (generated on demand via Bazel).
- ELK layout engine is used for complex diagrams with many edges.
- Puppeteer runs outside the Bazel sandbox (`no-sandbox` execution requirement)
  because it needs access to a cached Chrome browser.
