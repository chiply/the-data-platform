# Contributing to The Data Platform

Everything a new developer needs to get the platform running locally.

## Prerequisites

### Required accounts

| Account | Purpose | Setup |
|---------|---------|-------|
| [Pulumi Cloud](https://app.pulumi.com/signup) | Infrastructure state management (free tier) | Sign up, then run `pulumi login` |

After creating your Pulumi account, generate a personal access token at
**Settings > Access Tokens** and store it in a `.env` file at the repo root:

```bash
# .env (gitignored — never committed)
PULUMI_ACCESS_TOKEN=pul-xxxxx
```

Then source it before running Pulumi commands:

```bash
source .env && export PULUMI_ACCESS_TOKEN
```

> **Note:** A Linode/Akamai account is only needed for production deployments, not local
> development. If you need one, generate an API token and store it as a Pulumi secret:
> `pulumi config set --secret linode:token <token>`

### Required tools

Install all required tools with Homebrew (macOS):

```bash
brew install docker k3d pulumi kubectl derailed/k9s/k9s node
```

| Tool | Purpose | Verify |
|------|---------|--------|
| [Docker](https://docs.docker.com/get-docker/) | Container runtime — must be running | `docker info` |
| [k3d](https://k3d.io/) | Runs lightweight k3s clusters in Docker | `k3d version` |
| [Pulumi](https://www.pulumi.com/docs/install/) | Infrastructure-as-code engine | `pulumi version` |
| [Node.js](https://nodejs.org/) | Runs Pulumi TypeScript programs | `node --version` (v18+) |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Kubernetes CLI | `kubectl version --client` |
| [k9s](https://k9scli.io/) | Terminal UI for Kubernetes cluster management | `k9s version` |

> The `local-up.sh` script checks for docker, k3d, pulumi, node, and npm at startup and
> exits with a clear error if any are missing.

## Getting Started

All commands below are run from the repository root unless noted otherwise.

### 1. Clone and install dependencies

```bash
git clone <repo-url> && cd the-data-platform
cd monorepo/infra/cluster && npm install
cd ../platform && npm install
cd ../components && npm install
```

### 2. Configure Pulumi

```bash
source .env && export PULUMI_ACCESS_TOKEN
pulumi login

# Initialize local stacks (one-time)
cd monorepo/infra/cluster && pulumi stack init local
cd ../platform && pulumi stack init local
```

### 3. Start the local Kubernetes cluster

```bash
./monorepo/infra/scripts/local-up.sh
```

This single command:
1. Validates that Docker is running and all CLI tools are installed
2. Creates a **k3d cluster** (`tdp-local`) with a local container registry and 2 worker nodes
3. Maps host ports **80** and **443** to the Traefik ingress controller
4. Installs **cert-manager** and the **Prometheus/Grafana monitoring stack**
5. Prints cluster access instructions

### 4. Verify the cluster

```bash
# Check nodes (expect 1 server + 2 agents)
kubectl get nodes

# Check all pods are running
kubectl get pods -A

# Run the smoke test (deploys nginx, tests ingress, cleans up)
./monorepo/infra/scripts/smoke-test.sh
```

### 5. Browse the cluster with k9s

```bash
k9s
```

k9s is a terminal UI that lets you navigate pods, view logs, exec into containers, and
manage resources interactively. Press `?` for help, `:` to switch resource views (e.g.,
`:pods`, `:svc`, `:ns`).

## Working with the Local Cluster

### Architecture

The local environment has three Pulumi layers:

```
monorepo/infra/
  cluster/      tdp-cluster   — k3d cluster + registry provisioning
  platform/     tdp-platform  — platform services (cert-manager, monitoring)
  components/   —             — reusable Pulumi components (ServiceDeployment)
```

Platform services installed automatically:

| Service | Namespace | Purpose |
|---------|-----------|---------|
| Traefik | kube-system | Ingress controller (bundled with k3s) |
| cert-manager | cert-manager | TLS certificate management |
| Prometheus + Grafana | monitoring | Metrics, dashboards, alerting |

### Building and deploying a service

```bash
# Build the shared Python base image (one-time or when Dockerfile.base changes)
docker build -f monorepo/services/Dockerfile.base -t tdp-python-base monorepo/services/

# Build a service image
docker build -f monorepo/services/example/Dockerfile -t tdp-example-service monorepo/services/example/

# Push to the k3d local registry
docker tag tdp-example-service k3d-tdp-local-registry:5111/tdp-example-service
docker push k3d-tdp-local-registry:5111/tdp-example-service
```

Or import directly (no registry push needed):

```bash
k3d image import tdp-example-service -c tdp-local
```

### Accessing services

**Via ingress (recommended):** Any Kubernetes Ingress with a `*.localhost` host is
accessible directly from your browser. Traefik listens on ports 80 and 443.

```bash
curl http://example.localhost/
```

**Via port-forward:** For services without an Ingress:

```bash
kubectl port-forward svc/example-service 8080:80
# Then: http://localhost:8080
```

### Creating a new service

1. Create a directory under `monorepo/services/my-service/`
2. Add a `Dockerfile` starting with `FROM tdp-python-base AS base`
3. Add `requirements.txt` and application code
4. Build and push as shown above
5. Deploy with `kubectl apply` or using the `ServiceDeployment` Pulumi component

See `monorepo/services/README.md` for image build details and
`monorepo/infra/README.md` for Pulumi deployment patterns.

### Local container registry

| Property | Value |
|----------|-------|
| Registry name | `k3d-tdp-local-registry` |
| Host port | `5111` |
| In-cluster address | `k3d-tdp-local-registry:5111` |
| Push from host | `docker push k3d-tdp-local-registry:5111/<image>` |

## Tearing Down

```bash
./monorepo/infra/scripts/local-down.sh
```

Destroys the platform stack first, then the cluster stack. Removes all k3d containers
from Docker. To start fresh, just run `local-up.sh` again.

## Troubleshooting

### Port 80 or 443 already in use

Stop whatever is using those ports (another web server, another k3d cluster) before
running `local-up.sh`.

### Cannot pull images in the cluster

Use the full registry address in manifests: `k3d-tdp-local-registry:5111/<image>`
(not `localhost:5111`).

### Ingress not responding

```bash
kubectl get ingress                                          # Ingress exists?
kubectl get pods,svc                                         # Backend healthy?
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik  # Traefik logs
```

### Pulumi stack reference error

If you see `unknown stack "organization/tdp-cluster/local"`, update the org name in
`monorepo/infra/platform/Pulumi.local.yaml` to match your Pulumi account:

```yaml
config:
  tdp-platform:clusterStackRef: <your-org>/tdp-cluster/local
```

### Reset everything

```bash
./monorepo/infra/scripts/local-down.sh
./monorepo/infra/scripts/local-up.sh
```

## Development Workflow

### Conventional commits

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/).
See `ARCHITECTURE.md` for the full prefix table. Common examples:

```
feat(feed-service): add OPML import endpoint
fix(infra): correct stack reference org name
chore: update dev dependencies
```

### Design docs and task management

This project uses org-mode design docs for planning. See the root `README.md` for the
full workflow. Key files:

- `backlog.org` — active task queue
- `docs/design/*.org` — design documents (source of truth)

### Build system

The monorepo uses Bazel. From `monorepo/`:

```bash
bazel build //...    # Build everything
bazel test //...     # Run all tests
```
