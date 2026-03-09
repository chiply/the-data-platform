# The Data Platform

## Architecture Reference

The platform's architectural principles, technology decisions, and standards are documented in
`ARCHITECTURE.md` at the repository root. Consult this file when:
- Making technology or tooling choices
- Designing a new service or library
- Questions arise about standards, testing strategy, or infrastructure patterns
- You need to understand how a component fits into the broader system

Do not duplicate or contradict decisions documented there.

## Sample Service Reference

The platform is being built against a concrete sample service — a feed reader/aggregator. The
service design, scope, and how it exercises each platform subsystem is documented in
`SAMPLE-SERVICE.md` at the repository root. Consult this file when:
- Implementing or designing platform features that need a concrete use case
- Understanding what the platform needs to support end-to-end
- Building example services, workflows, pipelines, or schemas

## Build & Test Commands

The monorepo uses Bazel (bzlmod). Run these from the `monorepo/` directory:

```bash
# Build all targets
bazel build //...

# Run all tests
bazel test //...

# Render architecture diagrams
bazel build //tools/architecture-diagram/...
```

CI wrapper scripts (once created) live in `monorepo/scripts/`:

```bash
./scripts/build.sh           # wraps bazel build
./scripts/test.sh             # wraps bazel test
./scripts/render-diagrams.sh  # renders Mermaid diagrams
./scripts/affected.sh         # computes affected targets from git diff
```

## Design Doc Workflow

This project uses design docs for task management. Design docs live in `docs/design/`.

### Key Files
- `backlog.org` - Working surface for active tasks
- `docs/design/*.org` - Design documents (source of truth)
- `README.org` - Project config (prefix, categories, statuses)

### Workflow
1. Create design docs with `/backlog:new-design-doc`
2. Queue tasks with `/backlog:task-queue <id>`
3. Start work with `/backlog:task-start <id>`
4. Complete with `/backlog:task-complete <id>`

### Task ID Format
`[TDP-NNN-XX]` where:
- TDP = project prefix
- NNN = design doc number
- XX = task sequence
