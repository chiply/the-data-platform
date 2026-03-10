# Infra

Pulumi programs defining shared infrastructure for The Data Platform. The local development environment runs a full Kubernetes cluster on your machine using k3d, with the same Pulumi programs that target production.

> **New here?** See [CONTRIBUTING.md](../../CONTRIBUTING.md) for full setup instructions
> including prerequisites, account setup, and the step-by-step getting started guide.

## Directory Layout

```
infra/
  cluster/        Pulumi project: tdp-cluster — provisions the Kubernetes cluster
  platform/       Pulumi project: tdp-platform — bootstraps platform services
                  (cert-manager, monitoring) onto the cluster
  components/     Reusable Pulumi components (e.g. ServiceDeployment)
  scripts/        Lifecycle scripts for the local environment
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/local-up.sh` | Create k3d cluster + install platform services |
| `scripts/local-down.sh` | Destroy platform + cluster (reverse order) |
| `scripts/smoke-test.sh` | Deploy nginx, test ingress, clean up |

## Pulumi Stack Configuration

Each Pulumi project has a `Pulumi.local.yaml` file with stack-specific configuration:

**Cluster** (`cluster/Pulumi.local.yaml`):
- `clusterType: k3d` — uses the k3d provider (vs `linode-k3s` for production)
- `clusterName: tdp-local` — name of the k3d cluster and related resources
- `workerCount` — number of worker nodes (default: 2)

**Platform** (`platform/Pulumi.local.yaml`):
- `clusterStackRef: <org>/tdp-cluster/local` — references the cluster stack for kubeconfig
- `environment: local` — controls environment-specific resource limits in chart installations

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
