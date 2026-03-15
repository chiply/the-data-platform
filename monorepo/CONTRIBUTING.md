# Contributing

## Local Development

### Prerequisites

- [k3d](https://k3d.io/) for local Kubernetes
- [Tilt](https://tilt.dev/) for dev environment orchestration
- [pgcli](https://github.com/dbcli/pgcli) for database access (optional)
- [Pulumi CLI](https://www.pulumi.com/docs/install/) for infrastructure management

### Starting the Dev Environment

```bash
cd monorepo && tilt up
```

This provisions a k3d cluster, installs CloudNativePG, creates a PostgreSQL instance, and deploys the schema-registry.

### Connecting to the Local Database

The local k3d cluster runs a PostgreSQL instance managed by CloudNativePG. Tilt exposes it on `localhost:5432` via the `cnpg-port-forward` resource.

Connect with pgcli:

```bash
PGPASSWORD=local-dev-password PGSSLMODE=disable pgcli -h localhost -p 5432 -U tdp -d schema_registry
```

If the connection is refused, the port-forward may have died. Trigger a restart from Tilt:

```bash
tilt trigger cnpg-port-forward
```

Or restart it manually:

```bash
kubectl port-forward svc/tdp-postgres-rw -n tdp 5432:5432
```

## Infrastructure Deployment

Infrastructure is managed by Pulumi and deployed automatically via GitHub Actions when changes to `monorepo/infra/**` are merged to `main`.

The deploy pipeline runs in order: cluster stack (provisions Linode instance, Object Storage, database passwords) then platform stack (installs CNPG operator, creates PostgreSQL cluster, ArgoCD, monitoring).

### One-Time Setup

These steps are required once per environment. They are **not** automated and must be done manually before the first deploy.

#### 1. Pulumi Cloud

- Create an account at [app.pulumi.com](https://app.pulumi.com)
- Initialize stacks: `pulumi stack init dev` in both `infra/cluster` and `infra/platform`
- Create a Pulumi ESC environment (`tdp/dev`) with required secrets (see below)

#### 2. GitHub Actions Secrets

Set these in the repository settings or via CLI:

```bash
gh secret set PULUMI_ACCESS_TOKEN   # From https://app.pulumi.com/<org>/settings/tokens
gh secret set LINODE_TOKEN          # From Linode API tokens
```

#### 3. Pulumi ESC Environment (`tdp/dev`)

The ESC environment provides secrets to both Pulumi stacks. Required values:

| Key | Source |
|-----|--------|
| `linode:token` | Linode API token |
| `tdp-cluster:linodeRootPassword` | Generated (any strong password) |
| `tdp-platform:dbPassword` | Generated (any strong password) |
| `tdp-platform:grafanaAdminPassword` | Generated (any strong password) |
| `tdp-platform:appApiKey` | Application API key |
| `tdp-platform:appSessionSecret` | Application session secret |
| `argocd:repoUrl` | `git@github.com:<org>/<repo>.git` |
| `argocd:sshPrivateKey` | SSH deploy key (see below) |

**Object Storage keys and database service passwords** are generated automatically by the cluster stack — no manual configuration needed.

#### 4. ArgoCD Deploy Key

Generate and register an SSH deploy key so ArgoCD can pull Helm charts from the repo:

```bash
ssh-keygen -t ed25519 -C "argocd-deploy-key" -f /tmp/argocd-deploy-key -N ""
gh repo deploy-key add /tmp/argocd-deploy-key.pub --title "ArgoCD (dev)"
pulumi env set tdp/dev pulumiConfig.argocd:repoUrl git@github.com:<org>/<repo>.git
pulumi env set tdp/dev --secret pulumiConfig.argocd:sshPrivateKey -- "$(cat /tmp/argocd-deploy-key)"
rm /tmp/argocd-deploy-key /tmp/argocd-deploy-key.pub
```
