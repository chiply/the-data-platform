# Infra

Pulumi programs defining shared infrastructure for The Data Platform. The local development environment runs a full Kubernetes cluster on your machine using k3d, with the same Pulumi programs that target production.

## Directory Layout

```
infra/
  cluster/        Pulumi project: tdp-cluster — provisions the Kubernetes cluster
  platform/       Pulumi project: tdp-platform — bootstraps platform services
                  (cert-manager, monitoring) onto the cluster
  components/     Reusable Pulumi components (e.g. ServiceDeployment)
  scripts/        Lifecycle scripts for the local environment
```

## Prerequisites

Install the following tools before using the local development environment:

| Tool       | Purpose                                      | Install                                              |
|------------|----------------------------------------------|------------------------------------------------------|
| Docker     | Container runtime (must be running)          | https://docs.docker.com/get-docker/                  |
| k3d        | Runs k3s clusters inside Docker              | `brew install k3d` or https://k3d.io                 |
| Pulumi     | Infrastructure-as-code engine                | `brew install pulumi` or https://www.pulumi.com/docs/install/ |
| Node.js    | Runs the Pulumi TypeScript programs          | `brew install node` (v18+)                           |
| npm        | Installs Pulumi project dependencies         | Bundled with Node.js                                 |
| kubectl    | Kubernetes CLI (needed for smoke tests, debugging) | `brew install kubectl`                          |
| curl       | Used by the smoke test script                | Pre-installed on macOS/Linux                         |

> **Tip:** The `local-up.sh` script checks for `docker`, `k3d`, `pulumi`, `node`, and `npm` at startup and will exit with a clear error message if any are missing.

## Quick Start

All commands are run from the `monorepo/` directory.

### 1. Bring Up the Local Environment

```bash
./infra/scripts/local-up.sh
```

This single command does everything:

1. Validates prerequisites (Docker running, required CLIs installed).
2. Deploys the **tdp-cluster** Pulumi stack (`infra/cluster/`, stack name `local`):
   - Creates a k3d container registry (`k3d-tdp-local-registry` on port 5111).
   - Creates a k3d cluster named `tdp-local` with 2 worker nodes.
   - Maps host ports 80 and 443 to the cluster load balancer for Traefik ingress.
3. Deploys the **tdp-platform** Pulumi stack (`infra/platform/`, stack name `local`):
   - Installs cert-manager.
   - Installs the monitoring stack.
   - Traefik ingress controller is bundled with k3s and available automatically.
4. Prints cluster access instructions (kubeconfig path, registry URL).

### 2. Configure kubectl

After `local-up.sh` completes, export the kubeconfig it prints:

```bash
export KUBECONFIG="$HOME/.k3d/kubeconfig-tdp-local.yaml"
```

Verify connectivity:

```bash
kubectl cluster-info
kubectl get nodes
```

You should see one server node and two agent (worker) nodes.

### 3. Run the Smoke Test

```bash
./infra/scripts/smoke-test.sh
```

The smoke test deploys a lightweight nginx container, creates an Ingress resource on `smoke.localhost`, waits for the pod to become ready, and verifies HTTP 200 via `curl`. It cleans up after itself automatically.

### 4. Tear Down the Local Environment

```bash
./infra/scripts/local-down.sh
```

This destroys the platform stack first, then the cluster stack (reverse order of creation). The k3d cluster and registry containers are removed from Docker.

## Deploying a Service to the Local Cluster

### Build and Push a Container Image

From the `monorepo/` directory:

```bash
# 1. Build the shared base image (only needed once, or when Dockerfile.base changes)
docker build -f services/Dockerfile.base -t tdp-python-base services/

# 2. Build the service image
docker build -f services/example/Dockerfile -t tdp-example-service services/example/

# 3. Push to the k3d local registry
docker tag tdp-example-service k3d-tdp-local-registry:5111/tdp-example-service
docker push k3d-tdp-local-registry:5111/tdp-example-service
```

Alternatively, import the image directly into the cluster (no registry push needed):

```bash
k3d image import tdp-example-service -c tdp-local
```

### Deploy with kubectl

Create a Deployment, Service, and Ingress. Example manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: example-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: example-service
  template:
    metadata:
      labels:
        app: example-service
    spec:
      containers:
      - name: example-service
        image: k3d-tdp-local-registry:5111/tdp-example-service
        ports:
        - containerPort: 8000
---
apiVersion: v1
kind: Service
metadata:
  name: example-service
spec:
  selector:
    app: example-service
  ports:
  - port: 80
    targetPort: 8000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: example-service
spec:
  rules:
  - host: example.localhost
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: example-service
            port:
              number: 80
```

Apply with:

```bash
kubectl apply -f my-service.yaml
```

### Deploy with the ServiceDeployment Pulumi Component

For Pulumi-managed deployments, use the reusable `ServiceDeployment` component from `infra/components/`:

```typescript
import { ServiceDeployment } from "../components/service-deployment";

const app = new ServiceDeployment("example-service", {
    image: "k3d-tdp-local-registry:5111/tdp-example-service",
    port: 8000,
    replicas: 1,
    ingress: {
        host: "example.localhost",
    },
    resources: {
        requests: { cpu: "100m", memory: "128Mi" },
        limits:   { cpu: "250m", memory: "256Mi" },
    },
});
```

## Accessing Services

### Via Ingress (Recommended)

The k3d cluster maps host ports **80** (HTTP) and **443** (HTTPS) to the Traefik ingress controller. Any Ingress resource with a `*.localhost` host is accessible directly from your browser or `curl`:

```bash
curl http://example.localhost/
```

> **Note:** `*.localhost` domains resolve to `127.0.0.1` on most systems. If yours does not, add an entry to `/etc/hosts`:
> ```
> 127.0.0.1  example.localhost
> ```

### Via Port Forwarding

For services without an Ingress, use `kubectl port-forward`:

```bash
# Forward local port 8080 to the service's port 80
kubectl port-forward svc/example-service 8080:80

# Then access at http://localhost:8080
```

### Via NodePort

You can also expose services using a NodePort, though Ingress is preferred for consistency with production:

```bash
kubectl expose deployment example-service --type=NodePort --port=80 --target-port=8000
```

## Local Container Registry

The k3d setup creates a local Docker registry:

- **Registry name:** `k3d-tdp-local-registry`
- **Host port:** `5111`
- **In-cluster address:** `k3d-tdp-local-registry:5111` (used in Kubernetes manifests)
- **Push from host:** `docker push k3d-tdp-local-registry:5111/<image-name>`

The registry is automatically connected to the k3d cluster, so pods can pull images from it without additional configuration.

## Platform Services

The platform layer (`infra/platform/`) installs the following on top of the cluster:

| Service        | Purpose                                      | Namespace        |
|----------------|----------------------------------------------|------------------|
| Traefik        | Ingress controller (bundled with k3s)        | kube-system      |
| cert-manager   | Automatic TLS certificate management         | cert-manager     |
| Monitoring     | Metrics and observability stack              | monitoring       |

## Pulumi Stack Configuration

Each Pulumi project has a `Pulumi.local.yaml` file with stack-specific configuration:

**Cluster** (`infra/cluster/Pulumi.local.yaml`):
- `clusterType: k3d` — uses the k3d provider (vs `linode-k3s` for production)
- `clusterName: tdp-local` — name of the k3d cluster and related resources

**Platform** (`infra/platform/Pulumi.local.yaml`):
- `clusterStackRef: organization/tdp-cluster/local` — references the cluster stack for kubeconfig
- `environment: local` — controls environment-specific behavior in chart installations

## Troubleshooting

### Docker is not running

```
ERROR: Docker daemon is not running. Please start Docker and try again.
```

Start Docker Desktop or the Docker daemon before running `local-up.sh`.

### Port 80 or 443 already in use

If another process is using port 80 or 443, the k3d cluster creation will fail. Stop the conflicting process (e.g., a local web server, another k3d cluster) and try again.

### Cannot pull images in the cluster

Ensure you are tagging and pushing to the correct registry address:

```bash
docker tag my-image k3d-tdp-local-registry:5111/my-image
docker push k3d-tdp-local-registry:5111/my-image
```

In your Kubernetes manifests, use `k3d-tdp-local-registry:5111/my-image` as the image (not `localhost:5111`).

### Ingress not responding

1. Check that the Ingress resource exists: `kubectl get ingress`
2. Verify the host resolves to 127.0.0.1: `curl -v http://your-service.localhost/`
3. Check Traefik logs: `kubectl logs -n kube-system -l app.kubernetes.io/name=traefik`
4. Ensure the backend service and pods are healthy: `kubectl get pods,svc`

### Resetting the environment

To start fresh, tear down and recreate:

```bash
./infra/scripts/local-down.sh
./infra/scripts/local-up.sh
```
