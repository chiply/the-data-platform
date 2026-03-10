# Infra

Pulumi programs defining shared infrastructure for The Data Platform. The same Pulumi programs target every environment — local (k3d), dev (k3s on Linode), and production (k3s on Linode). Per-environment differences are expressed entirely through Pulumi stack configuration.

> **New here?** See [CONTRIBUTING.md](../../CONTRIBUTING.md) for full setup instructions
> including prerequisites, account setup, and the step-by-step getting started guide.

## Directory Layout

```
infra/
  cluster/        Pulumi project: tdp-cluster — provisions the Kubernetes cluster
  platform/       Pulumi project: tdp-platform — bootstraps platform services
                  (cert-manager, monitoring) onto the cluster
  components/     Reusable Pulumi components (e.g. ServiceDeployment)
  scripts/        Lifecycle scripts for all environments
```

## Environments

| Concern | Local | Dev | Production |
|---------|-------|-----|------------|
| Cluster type | k3d (Docker) | k3s on Linode 4GB | k3s on Linode 4GB |
| Cluster name | `tdp-local` | `tdp-dev` | `tdp-production` |
| DNS | `*.localhost` | `*.<ip>.nip.io` | `*.tdp.example.com` |
| TLS | None | Self-signed (cert-manager) | Let's Encrypt |
| Monitoring retention | 6h | 7d | 30d |
| Monitoring storage | None (emptyDir) | 10Gi (local-path) | 50Gi (local-path) |
| Deploy frequency | On-demand | Every push to `main` | Manual / release-gated |
| Data | Local / synthetic | Synthetic / seed data | Real data |
| Disposability | Fully disposable | Fully disposable, no backups | Persistent, backed up |
| Cost | Free | ~$24/mo (Linode 4GB) | ~$24/mo (Linode 4GB) |

**Dev is fully disposable.** Running `dev-down.sh` destroys the Linode instance and all data, including monitoring history. The cluster can be recreated from scratch at any time via `dev-up.sh`.

**Persistent volume caveat:** Both dev and production use the k3s `local-path` provisioner for persistent volumes (not Linode Block Storage CSI). Data stored in persistent volumes is lost if the node is replaced or recreated.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/local-up.sh` | Create k3d cluster + install platform services |
| `scripts/local-down.sh` | Destroy platform + cluster (reverse order) |
| `scripts/dev-up.sh` | Provision dev Linode + k3s cluster + platform services |
| `scripts/dev-down.sh` | Destroy dev platform + cluster + Linode instance |
| `scripts/production-up.sh` | Provision production Linode + k3s cluster + platform services |
| `scripts/production-down.sh` | Destroy production platform + cluster + Linode instance |
| `scripts/smoke-test.sh` | Deploy nginx, test ingress, clean up (environment-aware) |

### Usage

```bash
# Local environment (default)
monorepo/infra/scripts/local-up.sh
monorepo/infra/scripts/smoke-test.sh            # defaults to local
monorepo/infra/scripts/local-down.sh

# Dev environment (secrets provided by Pulumi ESC)
monorepo/infra/scripts/dev-up.sh
monorepo/infra/scripts/smoke-test.sh dev
monorepo/infra/scripts/dev-down.sh

# Production environment (secrets provided by Pulumi ESC)
monorepo/infra/scripts/production-up.sh
monorepo/infra/scripts/smoke-test.sh production
monorepo/infra/scripts/production-down.sh
```

## Multi-Kubeconfig Workflow

Each environment exports its kubeconfig to a separate file:

| Environment | Kubeconfig path |
|-------------|----------------|
| Local | Merged into default (`~/.kube/config`) by k3d |
| Dev | `~/.kube/tdp-dev.yaml` |
| Production | `~/.kube/tdp-production.yaml` |

To interact with a specific environment:

```bash
# Option 1: --kubeconfig flag
kubectl --kubeconfig ~/.kube/tdp-dev.yaml get nodes

# Option 2: KUBECONFIG env var
export KUBECONFIG=~/.kube/tdp-dev.yaml
kubectl get nodes

# Option 3: Merge multiple kubeconfigs
export KUBECONFIG=~/.kube/config:~/.kube/tdp-dev.yaml:~/.kube/tdp-production.yaml
kubectl config get-contexts
kubectl config use-context <context-name>
```

## Pulumi Stack Configuration

Each Pulumi project has a `Pulumi.<env>.yaml` file per environment with stack-specific configuration. Adding a new environment requires only a new YAML file — zero code changes.

**Cluster** (`cluster/Pulumi.<env>.yaml`):
- `clusterType: k3d` or `clusterType: linode-k3s` — selects the cluster provider
- `clusterName: tdp-<env>` — name of the cluster and related resources
- `workerCount` — number of worker nodes (k3d only, default: 2)

**Platform** (`platform/Pulumi.<env>.yaml`):
- `clusterStackRef: <org>/tdp-cluster/<env>` — references the cluster stack for kubeconfig
- `resourceTier: minimal|standard` — selects resource sizing presets
- `prometheusRetention` — metrics retention period (default: `"6h"`)
- `prometheusScrapeInterval` — scrape interval (default: `"30s"`)
- `prometheusStorageSize` — PV size for Prometheus (omit for emptyDir)
- `grafanaAdminPassword` — provided by ESC (omit for default `"admin"` in local)

### Secrets Management (Pulumi ESC)

Infrastructure secrets are managed via [Pulumi ESC](https://www.pulumi.com/docs/esc/) environments, not `.env` files or inline encrypted values. Each remote environment (dev, production) imports its ESC environment in `Pulumi.<env>.yaml`:

```yaml
environment:
  - tdp/dev      # or tdp/production
```

This provides secrets (`linode:token`, `linodeRootPassword`, `grafanaAdminPassword`) directly to the Pulumi stack at deployment time. No `.env` file or manual `pulumi config set --secret` is needed.

**Current ESC environments:**

| Environment | ESC path | Secrets |
|-------------|----------|---------|
| `tdp/dev` | `chiply-org/tdp/dev` | `linode:token`, `linodeRootPassword`, `grafanaAdminPassword` |
| `tdp/production` | `chiply-org/tdp/production` | `linode:token`, `linodeRootPassword`, `grafanaAdminPassword` |

Local does not use ESC — it has no secrets.

**Common operations:**

```bash
# View an environment's secrets
pulumi env open chiply-org/tdp/dev

# Add or update a secret
pulumi env set chiply-org/tdp/dev --secret pulumiConfig.<namespace>:<key> <value>

# Add an environment variable (for scripts/CLI tools)
pulumi env set chiply-org/tdp/dev --secret environmentVariables.MY_VAR <value>

# Run a command with ESC environment variables injected
pulumi env run chiply-org/tdp/dev -- <command>
```

**Adding a new secret:**
1. Add it to the ESC environment: `pulumi env set chiply-org/tdp/<env> --secret pulumiConfig.<key> <value>`
2. Reference it in Pulumi code via `config.requireSecret("<key>")` — no script changes needed
3. Team members get the secret automatically on next `pulumi up`

### Adding Platform Charts (Contributor Guide)

When adding a new platform chart or modifying an existing one:

1. **Read configuration from Pulumi stack config** using `config.get()` with sensible defaults
2. **Never use `isLocal` checks** or environment name comparisons in chart code
3. **Provide defaults that match local behavior** so `Pulumi.local.yaml` can be minimal
4. **Use `resourceTier`** for resource sizing — define `minimal` and `standard` presets inline

```typescript
const platformConfig = new pulumi.Config("tdp-platform");
const resourceTier = platformConfig.get("resourceTier") || "minimal";
const myRetention = platformConfig.get("myChartRetention") || "6h";

// Resource presets — select by tier
const resources = resourceTier === "standard"
  ? { requests: { cpu: "200m", memory: "256Mi" }, limits: { cpu: "500m", memory: "512Mi" } }
  : { requests: { cpu: "50m",  memory: "64Mi"  }, limits: { cpu: "100m", memory: "128Mi" } };
```

This approach means adding a future environment (e.g., staging) requires only a new `Pulumi.staging.yaml` with the appropriate config values — no TypeScript changes.

## Platform Services

The platform layer (`platform/`) installs the following on top of the cluster:

| Service | Purpose | Namespace |
|---------|---------|-----------|
| Traefik | Ingress controller (bundled with k3s) | kube-system |
| cert-manager | Automatic TLS certificate management | cert-manager |
| Prometheus + Grafana | Metrics, dashboards, alerting | monitoring |

## ServiceDeployment Component

The `components/` package provides a reusable `ServiceDeployment` Pulumi ComponentResource
that creates a Deployment + Service + optional Ingress with consistent
`app.kubernetes.io/*` labels.

```typescript
import { ServiceDeployment } from "../components/service-deployment";

const app = new ServiceDeployment("my-service", {
    image: "k3d-tdp-local-registry:5111/my-service",
    port: 8000,
    replicas: 1,
    ingress: { host: "my-service.localhost" },
    resources: {
        requests: { cpu: "100m", memory: "128Mi" },
        limits:   { cpu: "250m", memory: "256Mi" },
    },
});
```

## Local Container Registry

| Property | Value |
|----------|-------|
| Registry name | `k3d-tdp-local-registry` |
| Host port | `5111` |
| In-cluster address | `k3d-tdp-local-registry:5111` |
| Push from host | `docker push k3d-tdp-local-registry:5111/<image>` |

## Production Provider

The cluster project also includes a `linode-k3s` provider (`cluster/providers/linode-k3s.ts`)
for provisioning k3s on a Linode instance. Use the `production` stack:

```bash
cd cluster && pulumi up --stack production
```

Requires a Linode API token configured as a Pulumi secret.
