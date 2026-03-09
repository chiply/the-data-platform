# The Data Platform

A monorepo housing an end-to-end data platform built on open-source tooling and open standards.

## Reference Documents

- [**ARCHITECTURE.md**](ARCHITECTURE.md) — Core principles, technology decisions, standards, and
  monorepo layout.
- [**SAMPLE-SERVICE.md**](SAMPLE-SERVICE.md) — The feed reader service used as a concrete use case
  to drive the platform implementation.

## Sample Service

The platform is built against a feed reader/aggregator — an app that ingests RSS feeds, summarizes
content, and presents users with a custom front page across sources like YouTube, Reddit, X, PubMed,
and blogs. This service exercises the full platform stack: scheduled workflows, event and batch
orchestration, schema registry, semantic search, SDK generation, observability, and more. See
[SAMPLE-SERVICE.md](SAMPLE-SERVICE.md) for details.

## Project Management

This project uses org-mode design docs for task management, powered by the
[dev-agent-backlog](https://github.com/charlieholland/dev-agent-backlog) plugin.

| File                           | Purpose                                                                   |
|--------------------------------|---------------------------------------------------------------------------|
| `README.org`                   | Project configuration (task prefix, valid categories/statuses)            |
| `org-setup.org`                | Shared org-mode settings (task workflows, effort estimates, tags)         |
| `backlog.org`                  | Working surface for active tasks — tasks are queued here from design docs |
| `docs/design/README.org`       | Index of all design documents                                             |
| `docs/design/000-template.org` | Template for new design docs                                              |
| `docs/design/NNN-*.org`        | Individual design documents (source of truth for decisions and tasks)     |
| `CHANGELOG.md`                 | Notable changes by release                                                |

### Workflow

1. Design docs capture decisions, rationale, and implementation tasks
2. Tasks are "checked out" from design docs into `backlog.org` for active work
3. Completed tasks are reconciled back to their source design doc
