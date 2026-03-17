# Contributing to The Data Platform

Everything a new developer needs to get the platform running locally.

## Prerequisites

### Required accounts

| Account | Purpose | Setup |
|---------|---------|-------|
| [Pulumi Cloud](https://app.pulumi.com/signup) | Infrastructure state management (free tier) | Sign up, then run `pulumi login` |

After creating your Pulumi account, log in from the CLI:

```bash
pulumi login
```

This stores your credentials in `~/.pulumi/credentials.json`. You only need to do this once.

> **Note:** A Linode/Akamai account is only needed for production deployments, not local
> development. See [Production Deployment](#production-deployment-linode) below for setup.

### Required tools

Install all required tools with Homebrew (macOS):

```bash
brew install --cask docker   # Docker Desktop (includes daemon)
brew install k3d pulumi kubectl derailed/k9s/k9s node
```

> **Note:** `brew install docker` only installs the CLI, not the Docker daemon.
> Use `brew install --cask docker` for Docker Desktop, or download from
> https://docs.docker.com/get-docker/.

| Tool | Purpose | Verify |
|------|---------|--------|
| [Docker Desktop](https://docs.docker.com/get-docker/) | Container runtime — must be running | `docker info` |
| [k3d](https://k3d.io/) | Runs lightweight k3s clusters in Docker | `k3d version` |
| [Pulumi](https://www.pulumi.com/docs/install/) | Infrastructure-as-code engine | `pulumi version` |
| [Node.js](https://nodejs.org/) | Runs Pulumi TypeScript programs | `node --version` (v20+) |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Kubernetes CLI | `kubectl version --client` |
| [k9s](https://k9scli.io/) | Terminal UI for Kubernetes cluster management | `k9s version` |
| [Copier](https://copier.readthedocs.io/) | Service scaffolding from templates | `copier --version` |

Install Copier with pip or Homebrew:

```bash
pip install copier    # or: brew install copier
```

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

> **Tip:** The lifecycle scripts (`local-up.sh`, `dev-up.sh`, `production-up.sh`) run
> `npm install` automatically before deploying. However, if you run `pulumi preview` or
> `pulumi up` directly, you must run `npm install` in the relevant directory first.
> Without it, Pulumi will fail with _"It looks like the Pulumi SDK has not been installed."_

### 2. Configure Pulumi

```bash
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

### Accessing platform UIs

A convenience script prints port-forward commands and retrieves credentials for ArgoCD
and Grafana:

```bash
# All UIs for the current environment
./monorepo/infra/scripts/ui-access.sh local          # or: dev, production
./monorepo/infra/scripts/ui-access.sh production argocd   # single service
./monorepo/infra/scripts/ui-access.sh dev grafana         # single service
```

**ArgoCD UI:**

| Environment | Access method | URL |
|-------------|--------------|-----|
| Local | Ingress (automatic) | http://argocd.localhost |
| Dev | `kubectl port-forward -n argocd svc/argocd-server 8080:80` | http://localhost:8080 |
| Production | `kubectl port-forward -n argocd svc/argocd-server 8080:80` | http://localhost:8080 |

Credentials: `admin` / password from `argocd-initial-admin-secret` (the script retrieves it automatically).

**Grafana:**

| Environment | Access method | URL |
|-------------|--------------|-----|
| All | `kubectl port-forward -n monitoring svc/<grafana-svc> 3001:80` | http://localhost:3001 |

Credentials: `admin` / password from the Grafana secret (the script retrieves it automatically).
For local, the default password is `admin`.

### Creating a new service

New services are scaffolded from a Copier template using `scripts/new-service.sh`.

```bash
./scripts/new-service.sh <service-name>
```

The script runs Copier against the service template in
`enterprise-patterns/python/enterprise-pattern-fastapi/` and generates a
fully-configured service directory under `monorepo/services/`.

#### Template questions and defaults

| Question | Default | Notes |
|----------|---------|-------|
| `service_name` | — | Kebab-case name (e.g. `feed-ingest`) |
| `module_name` | derived from `service_name` | Snake_case Python module (e.g. `feed_ingest`) |
| `service_description` | `"A FastAPI service"` | One-line description |
| `service_port` | `8000` | Port the service listens on |
| `service_version` | `"0.1.0"` | Initial version |
| `use_database` | `true` | Include SQLAlchemy + Alembic support |
| `use_gunicorn` | `true` | Use Gunicorn as the process manager |

#### Post-generation steps

After the template generates your service directory you should:

1. Review the generated files under `monorepo/services/<service_name>/`
2. Add a Helm chart for the service (or extend the generated one) if custom deployment
   configuration is needed
3. Register the service in `release-please-config.json` so releases are tracked
4. Build and push the image as described in [Building and deploying a service](#building-and-deploying-a-service)

#### Updating an existing service from template changes

When the service template evolves (new best practices, dependency updates, structural
changes), you can pull those changes into an existing service:

```bash
cd monorepo/services/<service_name>
copier update --trust --vcs-ref HEAD
```

This replays the template against your service, preserving your answers from the
original generation. Where the template change and your local edits overlap, Copier
writes standard conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) into the affected
files. Resolve these markers the same way you would resolve a Git merge conflict, then
commit the result.

> **Note:** Run `copier update` intentionally when you know template changes exist that
> you want to adopt. It is not something that should be run automatically or as part of
> routine development.

See `monorepo/services/README.md` for image build details and
`monorepo/infra/README.md` for Pulumi deployment patterns.

### Local container registry

| Property | Value |
|----------|-------|
| Registry name | `k3d-tdp-local-registry` |
| Host port | `5111` |
| In-cluster address | `k3d-tdp-local-registry:5111` |
| Push from host | `docker push k3d-tdp-local-registry:5111/<image>` |

## Dev Environment (Linode)

The dev cluster is a persistent, shared environment for integration testing and demos.
It runs k3s on Linode, identical to production but fully disposable — no backups, no
real data.

### Quick start

```bash
./monorepo/infra/scripts/dev-up.sh
```

Secrets (Linode token, root password, Grafana password) are provided automatically by
the Pulumi ESC environment `tdp/dev`. No env vars needed — just `pulumi login`.

### Tear down

```bash
./monorepo/infra/scripts/dev-down.sh
```

This destroys the Linode instance and all data. The cluster can be recreated from
scratch at any time.

### Accessing the dev cluster

```bash
kubectl --kubeconfig ~/.kube/tdp-dev.yaml get nodes
k9s --kubeconfig ~/.kube/tdp-dev.yaml

# Open platform UIs (ArgoCD, Grafana)
./monorepo/infra/scripts/ui-access.sh dev

# Smoke test against dev
./monorepo/infra/scripts/smoke-test.sh dev
```

Services are accessed via `<service>.<linode-ip>.nip.io` (self-signed TLS).

> **Note:** Dev uses the `local-path` provisioner for persistent volumes (not Linode
> Block Storage CSI). Data is lost on node replacement.

## Production Deployment (Linode)

The production cluster runs k3s on a Linode instance. This section is only needed if you
are deploying to production.

### 1. Create a Linode account

Sign up at [Linode/Akamai Cloud](https://login.linode.com/signup). Generate a personal
access token at **My Profile > API Tokens** with Read/Write access for Linodes, Firewalls,
and StackScripts.

### 2. Verify access to secrets

Production secrets (Linode token, root password, Grafana password) are managed via
Pulumi ESC. Ask a team member for access to the `chiply-org` Pulumi organization.

Verify you can access the production environment:

```bash
pulumi env open chiply-org/tdp/production
```

If you need to add or rotate a secret, see the
[Secrets Management](monorepo/infra/README.md#secrets-management-pulumi-esc) section
in the infra README.

### 3. Deploy everything

```bash
./monorepo/infra/scripts/production-up.sh
```

This single command:
1. Provisions a **Linode Standard 2** (4GB/2CPU) in `us-east` with k3s installed
2. Configures a firewall (SSH, HTTP, HTTPS, K8s API)
3. Installs **cert-manager** and the **Prometheus/Grafana monitoring stack**
4. Exports the kubeconfig to `~/.kube/tdp-production.yaml`

### 4. Access the production cluster

```bash
# Verify nodes
kubectl --kubeconfig ~/.kube/tdp-production.yaml get nodes

# Browse with k9s
k9s --kubeconfig ~/.kube/tdp-production.yaml

# Open platform UIs (ArgoCD, Grafana) — see "Accessing Platform UIs" below
./monorepo/infra/scripts/ui-access.sh production
```

### 5. Tear down production

```bash
./monorepo/infra/scripts/production-down.sh
```

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

## Local Resource Management

### Memory budget

The local k3d cluster runs in Docker containers. A rough memory budget:

| Component | Memory |
|---|---|
| k3d control plane (server-0) | ~2 GB (fixed) |
| k3d worker node (base overhead) | ~500 MB each |
| Each FastAPI service (gunicorn + 2 workers) | ~128–256 MB |
| CNPG Postgres | ~512 MB |
| ArgoCD (if running) | ~300–500 MB |
| Observability stack (otel-lgtm) | ~680 MB |
| Registry + serverlb | ~50 MB |

The default configuration creates 2 worker nodes. For most development work, 1 worker
node is sufficient — check Docker Desktop memory allocation if you experience OOM kills
or sluggish performance.

### Selective local development

As the platform grows, running every service locally becomes impractical. The strategy
is to use the **C4 architecture diagram** to determine which services are relevant to
the feature you're working on, and only spin up those components.

#### How it works

1. **Consult the C4 diagram** — identify which containers interact with the service
   you're changing (direct dependencies and callers)
2. **Start only those resources** — use Tilt resource labels to selectively bring up
   the relevant subset
3. **Stub or point elsewhere** for services outside your boundary — either connect to
   the dev environment or use mocks

#### Tilt resource labels

Resources in the Tiltfile can be tagged with labels that correspond to C4 container
boundaries:

```python
# Tag resources by which features/boundaries they belong to
k8s_resource('schema-registry', labels=['schema-registry', 'core'])
k8s_resource('tdp-postgres',    labels=['schema-registry', 'feed-reader', 'core'])
k8s_resource('feed-reader',     labels=['feed-reader'])
k8s_resource('workflow-engine', labels=['orchestration'])
```

Then start only what you need:

```bash
tilt up schema-registry tdp-postgres   # just these resources
```

#### Connecting to services outside your boundary

For dependencies you're not running locally, you have three options:

| Approach | When to use |
|---|---|
| Point at dev | Service is deployed and stable on dev — set `SERVICE_URL` env vars to the dev endpoint |
| Lightweight mock/stub | Service API is simple and you need predictable responses |
| Skip it | The feature doesn't exercise that dependency — test it on dev later |

#### Progression as the platform scales

| Platform size | Local dev approach |
|---|---|
| Small (now) | `tilt up` — run everything |
| Medium (5–10 services) | `tilt up <boundary resources>` — run only your C4 boundary |
| Large (many services) | Run boundary locally + stubs, full integration testing on dev |

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
