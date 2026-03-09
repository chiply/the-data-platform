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

## AI-Assisted Development

This project uses [Claude Code](https://claude.com/claude-code) with curated skills and MCP
servers for infrastructure and platform work. Run the setup script to install everything:

```bash
./scripts/setup-ai-tools.sh
```

### Prerequisites

- **Node.js** / `npx` — required for skills installer and MCP servers
- **uv** / `uvx` — required for the Docker MCP server (`brew install uv`)
- **Pulumi CLI** — `pulumi login` must be run and `PULUMI_ACCESS_TOKEN` set
- **Docker** — daemon must be running for Docker MCP

### Skills

Skills are installed into `.agents/skills/` and symlinked to `.claude/skills/`. They provide
domain-specific guidance that Claude Code picks up automatically during relevant tasks.

| Skill | Source | Purpose |
|-------|--------|---------|
| `pulumi-typescript` | [dirien/claude-skills](https://github.com/dirien/claude-skills) | Pulumi IaC with TypeScript, ESC integration, component patterns |
| `pulumi-esc` | [pulumi/agent-skills](https://github.com/pulumi/agent-skills) | Environment & secrets configuration, OIDC dynamic credentials |
| `pulumi-best-practices` | [pulumi/agent-skills](https://github.com/pulumi/agent-skills) | Guardrails: no resources inside apply(), proper parent relationships |
| `kubernetes-specialist` | [jeffallan/claude-skills](https://github.com/jeffallan/claude-skills) | Production K8s: security contexts, resource limits, PDBs, probes |
| `k8s-security-policies` | [wshobson/agents](https://github.com/wshobson/agents) | K8s hardening: NetworkPolicies, RBAC, Pod Security Standards, OPA |
| `helm-chart-development` | [laurigates/claude-plugins](https://github.com/laurigates/claude-plugins) | Helm chart lifecycle: templating, testing, dependencies, OCI publishing |
| `docker-best-practices` | [josiahsiegel/claude-plugin-marketplace](https://github.com/josiahsiegel/claude-plugin-marketplace) | Dockerfile security, multi-stage builds, production hardening |
| `tilt` | [0xbigboss/claude-code](https://github.com/0xbigboss/claude-code) | Tilt session monitoring, status checks, log retrieval |
| `tiltup` | [0xbigboss/claude-code](https://github.com/0xbigboss/claude-code) | Tilt bootstrapping, diagnostics, anti-patterns enforcement |
| `gitops-workflow` | [wshobson/agents](https://github.com/wshobson/agents) | ArgoCD/Flux CD for automated K8s deployments |
| `monitoring-expert` | [jeffallan/claude-skills](https://github.com/jeffallan/claude-skills) | Structured logging, metrics, distributed tracing, alerting |
| `github-actions-templates` | [wshobson/agents](https://github.com/wshobson/agents) | CI/CD workflows, Docker builds, matrix builds, security scanning |
| `devops-engineer` | [jeffallan/claude-skills](https://github.com/jeffallan/claude-skills) | CI/CD pipelines, container management, blue-green/canary deploys |
| `sre-engineer` | [jeffallan/claude-skills](https://github.com/jeffallan/claude-skills) | SLI/SLO definitions, error budgets, golden signals, toil reduction |
| `api-security-best-practices` | [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) | Secrets management, SQL injection, XSS prevention, input validation |
| `cost-optimization` | [wshobson/agents](https://github.com/wshobson/agents) | Cloud cost reduction: right-sizing, reserved instances |
| `incident-runbook-templates` | [wshobson/agents](https://github.com/wshobson/agents) | Incident response: severity model, escalation trees, communication |
| `systematic-debugging` | [obra/superpowers](https://github.com/obra/superpowers) | Four-phase debugging: root cause, pattern analysis, hypothesis, fix |

### MCP Servers

MCP (Model Context Protocol) servers give Claude Code direct access to external tools.
Configuration is stored in `.claude/settings.local.json` (gitignored, machine-specific).

| MCP Server | Package | Purpose |
|------------|---------|---------|
| `kubernetes` | [`kubernetes-mcp-server`](https://github.com/containers/kubernetes-mcp-server) | Full CRUD on K8s resources, pod logs, Helm install/upgrade, multi-context |
| `pulumi` | [`@pulumi/mcp-server`](https://github.com/pulumi/mcp-server) | `pulumi preview`/`up`, stack outputs, registry lookups, resource search |
| `docker-mcp` | [`docker-mcp`](https://github.com/QuantGeekDev/docker-mcp) | Create/manage containers, deploy Compose stacks, retrieve logs |

To manually add an MCP server:

```bash
# Kubernetes (native Go binary, no kubectl required)
claude mcp add kubernetes -- npx -y kubernetes-mcp-server@latest

# Pulumi (official, requires PULUMI_ACCESS_TOKEN)
claude mcp add pulumi -- npx -y @pulumi/mcp-server@latest stdio

# Docker (requires Docker daemon running)
claude mcp add docker-mcp -- uvx docker-mcp
```
