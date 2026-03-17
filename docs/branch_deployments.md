# Branch Deployments

> Isolated, per-branch environments on Kubernetes that allow multiple developers (human and agent)
> to test their work in a real environment without interfering with each other.

---

## Motivation

The data platform is built by multiple concurrent developers — including AI agents iterating
through tasks in parallel. Branch deployments solve:

- **Isolation**: Each branch gets its own environment; no cross-contamination between features
- **Confidence**: Test against real infrastructure (Temporal, Dagster, databases) before merging
- **Velocity**: No queue for a shared dev environment; every branch can deploy simultaneously
- **Agent concurrency**: Agents can autonomously deploy and validate their work without coordination

---

## Core Concept: Namespace-per-Branch

The primary isolation primitive is a **Kubernetes namespace per branch**. Instead of a single `tdp`
namespace, branch deployments create `tdp-{branch-name}` namespaces dynamically:

```
tdp                (main / dev — stable)
tdp-branch-abc     (agent 1's feature branch)
tdp-branch-def     (agent 2's feature branch)
tdp-branch-ghi     (human developer's branch)
```

Each namespace gets its own copy of the services under development, fully isolated from other
branches.

---

## ArgoCD ApplicationSets

The current architecture uses hand-written ArgoCD `Application` manifests per environment (local,
dev, production). Branch deployments replace this with **ApplicationSets** using a pull request
generator that automatically creates and destroys environments as PRs open and close.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: branch-deployments
  namespace: argocd
spec:
  generators:
    - pullRequest:
        github:
          owner: chiply
          repo: the-data-platform
        requeueAfterSeconds: 30
  template:
    metadata:
      name: '{{branch}}-schema-registry'
    spec:
      project: tdp-branches
      source:
        repoURL: https://github.com/chiply/the-data-platform.git
        targetRevision: '{{head_sha}}'
        path: monorepo/deploy/charts/schema-registry
        helm:
          valueFiles:
            - values.yaml
            - values-branch.yaml
          parameters:
            - name: global.namespace
              value: 'tdp-{{branch}}'
            - name: ingress.host
              value: '{{branch}}.schema-registry.dev.example.com'
      destination:
        server: https://kubernetes.default.svc
        namespace: 'tdp-{{branch}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

Key properties:

- **Automatic lifecycle**: Environment created when a PR opens, destroyed when it closes/merges
- **Per-commit sync**: Each push to the branch triggers ArgoCD to sync the latest changes
- **Namespace creation**: `CreateNamespace=true` means no manual namespace provisioning

---

## Service-Specific Considerations

### FastAPI Services (schema-registry, feed-service, etc.)

FastAPI services are the simplest case. Each branch namespace gets its own Deployment + Service +
Ingress.

**Routing**: Branch-prefixed hostnames via wildcard DNS:

```
branch-abc.schema-registry.dev.example.com
branch-def.feed-service.dev.example.com
```

Requirements:

- Wildcard DNS record: `*.dev.example.com → cluster ingress IP`
- Wildcard TLS certificate via cert-manager (Let's Encrypt supports wildcard certs with DNS-01
  challenge)
- Helm charts parameterized to accept the branch name for ingress host generation

### Temporal

Temporal is the most complex piece. Two strategies, in order of preference:

**Strategy 1: Shared Temporal cluster, isolated namespaces (recommended)**

Temporal has its own namespace concept independent of Kubernetes namespaces. Each branch gets a
Temporal namespace (e.g., `tdp-branch-abc`), while the Temporal server itself remains shared
infrastructure.

- Temporal workers in each K8s namespace connect to their branch-specific Temporal namespace
- Task queues are scoped to the Temporal namespace, preventing cross-branch workflow execution
- Workflow IDs can be the same across branches without collision

Helm values for branch workers:

```yaml
temporal:
  serverAddress: "temporal-frontend.temporal:7233"  # shared server
  namespace: "tdp-{{ .Values.branchName }}"
  taskQueue: "default"  # scoped by Temporal namespace, not K8s namespace
```

Branch Temporal namespaces must be created as part of environment setup (via a Kubernetes Job or
init container that calls `tctl namespace register`).

**Strategy 2: Per-branch Temporal cluster (expensive)**

A full Temporal server per branch. Only justified if testing changes to Temporal server
configuration or plugins. Requires significant resources per branch (~1-2 GB RAM for Temporal
alone).

### Dagster

Similar isolation model to Temporal:

- Each branch deployment runs its own `dagster-webserver` + `dagster-daemon`
- Each needs isolated storage (separate Postgres database or schema per branch)
- Resource-heavy — consider making Dagster deployment conditional: only deploy if files under
  `pipelines/` changed on the branch

Optimization: Use Bazel's affected target analysis (`scripts/affected.sh`) to determine whether
Dagster deployment is needed for a given branch.

### Databases

Each branch needs data isolation. Options:

| Approach | Pros | Cons |
|----------|------|------|
| Database-per-branch (separate Postgres instances) | Full isolation, simple cleanup | Resource-heavy |
| Schema-per-branch (shared Postgres, separate schemas) | Resource-efficient | Cleanup complexity, shared connection limits |
| Lightweight per-namespace Postgres (StatefulSet) | Good isolation, moderate resources | Storage accumulation |
| CloudNativePG operator | Production-like, automated | Operator overhead |

Recommended starting point: A lightweight Postgres StatefulSet per branch namespace with a small
PVC (1 Gi). Migrations run automatically on environment creation via an init container or Helm
hook Job.

### Message Brokers (Kafka / NATS)

If the platform introduces event streaming:

- **Kafka**: Branch-prefixed topics (`branch-abc.feed-events`). Shared broker is fine — topic
  isolation is sufficient.
- **NATS**: Branch-specific subjects or NATS accounts. JetStream streams scoped per branch.

The broker itself remains shared infrastructure; only the topic/subject/stream names are
branch-scoped.

---

## Shared vs. Per-Branch Infrastructure

Not everything should be duplicated per branch. Clear separation:

```
Shared (platform-level):              Per-branch (tdp-{branch} namespace):
├── Temporal server                    ├── FastAPI services
├── Schema registry                    ├── Temporal workers
├── Prometheus / Grafana               ├── Dagster instance (if needed)
├── ArgoCD                             ├── Postgres (lightweight)
├── Cert-manager                       ├── Branch-specific ConfigMaps/Secrets
├── Ingress controller (Traefik)       └── Branch-scoped message topics
└── Message broker (Kafka/NATS)
```

Shared services must be multi-tenant aware:

- **Temporal server**: Supports multiple namespaces natively
- **Schema registry**: Branch deployments can register schemas with a branch prefix or in a
  branch-scoped context
- **Monitoring**: Branch environments emit metrics with a `branch` label for filtering in Grafana

---

## Helm Chart Changes

### Parameterize Namespace and Routing

Current Helm charts assume the `tdp` namespace. For branch deployments, all charts must accept:

- `global.namespace` — the target namespace
- `global.branchName` — used for constructing ingress hosts, Temporal namespace names, database
  names, topic prefixes, etc.
- `global.isBranchDeployment` — boolean to toggle branch-specific behavior (e.g., reduced
  replicas, skip optional components)

### Add `values-branch.yaml`

A minimal resource profile for branch deployments:

```yaml
# values-branch.yaml — base for all branch deployments
replicaCount: 1

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    memory: 256Mi

# Lightweight database
postgresql:
  enabled: true
  persistence:
    size: 1Gi
  resources:
    requests:
      cpu: 50m
      memory: 128Mi

# Disable optional components by default
dagster:
  enabled: false

# Reduce health check frequency
livenessProbe:
  periodSeconds: 30
readinessProbe:
  periodSeconds: 15
```

---

## Resource Management

### Per-Branch Resource Quotas

Prevent any single branch from consuming excessive cluster resources:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: branch-quota
spec:
  hard:
    requests.cpu: "500m"
    requests.memory: "1Gi"
    limits.cpu: "2"
    limits.memory: "4Gi"
    pods: "20"
```

Apply this as part of the ApplicationSet template or via a namespace provisioning controller.

### Capacity Planning

| Concurrent Branches | Estimated Resources (minimal profile) | Notes |
|---------------------|---------------------------------------|-------|
| 2-3                 | ~4 GB RAM, 2 CPU                      | Comfortable on a small cluster |
| 5-10                | ~10-20 GB RAM, 5-10 CPU               | May need node autoscaling |
| 10+                 | ~20+ GB RAM, 10+ CPU                  | Dedicated node pool recommended |

### Resource Optimization Strategies

- **Selective deployment**: Only deploy services affected by changes on the branch (use Bazel
  affected target analysis)
- **Shared dependencies**: Don't duplicate Temporal/Postgres per branch if the branch only touches
  a FastAPI service with no workflow or database changes
- **Node autoscaling**: Configure cluster autoscaler on Linode to add/remove nodes based on pending
  pod demand
- **Priority classes**: Branch deployments get `PriorityClass` lower than dev/prod — evicted first
  under memory pressure
- **Scale-to-zero**: After a configurable idle period (e.g., 30 minutes with no commits), scale
  branch deployments to zero replicas. KEDA or a custom controller can handle this.

---

## Branch AppProject

Create a separate ArgoCD AppProject for branch deployments with tighter constraints than the main
`tdp` project:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: tdp-branches
  namespace: argocd
spec:
  description: "Ephemeral branch deployment environments"
  sourceRepos:
    - https://github.com/chiply/the-data-platform.git
  destinations:
    - namespace: 'tdp-*'
      server: https://kubernetes.default.svc
  namespaceResourceWhitelist:
    - group: ''
      kind: ConfigMap
    - group: ''
      kind: Secret
    - group: ''
      kind: Service
    - group: ''
      kind: Pod
    - group: apps
      kind: Deployment
    - group: apps
      kind: StatefulSet
    - group: networking.k8s.io
      kind: Ingress
    - group: networking.k8s.io
      kind: NetworkPolicy
    - group: batch
      kind: Job
    - group: autoscaling
      kind: HorizontalPodAutoscaler
  # No cluster-scoped resources allowed
  clusterResourceWhitelist: []
```

---

## Secrets Management for Branch Environments

The current Pulumi ESC approach creates secrets in the `tdp` namespace during platform bootstrap.
Branch namespaces need secrets too. Options:

| Approach | Pros | Cons |
|----------|------|------|
| External Secrets Operator | Pull from shared secret store per namespace | Additional operator to manage |
| Sealed Secrets | Encrypted secrets in Git, decrypted per namespace | Per-branch sealed secrets needed |
| ArgoCD sync wave Job | Copy secrets from a template namespace | Simple, no new operators |
| Pulumi automation API | Webhook triggers Pulumi to provision secrets | Consistent with existing approach |

Recommended: **External Secrets Operator** with a shared secret store (e.g., AWS Secrets Manager
or HashiCorp Vault). Each branch namespace gets an `ExternalSecret` resource that pulls the same
base secrets. Branch-specific overrides (e.g., database name) are set via Helm values.

Alternatively, for the simplest starting point: a Kubernetes Job in an ArgoCD sync wave (wave -1)
that copies secrets from a template namespace.

---

## Environment Cleanup

Orphaned branch environments waste resources. Multiple cleanup mechanisms should be layered:

### 1. ApplicationSet PR Generator (Primary)

The PR generator automatically deletes the ArgoCD Application when a PR is closed or merged. With
`prune: true`, all resources in the namespace are cleaned up.

### 2. TTL-Based Namespace Cleanup (Safety Net)

For branches created outside of PRs, or if the ApplicationSet misses a cleanup:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: branch-namespace-reaper
  namespace: argocd
spec:
  schedule: "0 */6 * * *"  # every 6 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: reaper
              image: bitnami/kubectl
              command:
                - /bin/sh
                - -c
                - |
                  kubectl get ns -l branch-deployment=true -o json | \
                  jq -r '.items[] | select(
                    (.metadata.annotations["branch-deployment/ttl-expires"] // "9999-12-31") < now
                  ) | .metadata.name' | \
                  xargs -r kubectl delete ns
          restartPolicy: OnFailure
```

Label branch namespaces on creation:

```yaml
metadata:
  labels:
    branch-deployment: "true"
  annotations:
    branch-deployment/ttl-expires: "2026-03-16T00:00:00Z"  # 48 hours from creation
    branch-deployment/branch: "feature-xyz"
    branch-deployment/created-by: "agent-1"
```

### 3. Resource Limit Safety Net

`LimitRange` objects in branch namespaces prevent any single pod from requesting excessive
resources, even if Helm values are misconfigured:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: branch-limits
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: 50m
        memory: 64Mi
      default:
        cpu: 500m
        memory: 512Mi
      max:
        cpu: "1"
        memory: "1Gi"
```

---

## CI Integration

Branch deployments should be surfaced in the CI workflow so developers and agents can access them.

### Post Environment URL as PR Comment

Add a GitHub Actions step that posts the branch environment URLs after deployment:

```yaml
- name: Comment branch environment URLs
  uses: actions/github-script@v7
  with:
    script: |
      const branch = context.payload.pull_request.head.ref;
      const body = `## Branch Environment Ready

      | Service | URL |
      |---------|-----|
      | Schema Registry | https://${branch}.schema-registry.dev.example.com |
      | Grafana (metrics) | Shared — filter by \`branch="${branch}"\` |

      Environment will be automatically destroyed when this PR is closed.`;

      github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.payload.pull_request.number,
        body
      });
```

### Smoke Tests Against Branch Environment

Run integration/contract tests against the branch environment as part of CI:

```yaml
- name: Run smoke tests
  env:
    BASE_URL: https://${{ github.head_ref }}.schema-registry.dev.example.com
  run: |
    cd monorepo && bazel test //services/schema-registry:integration_tests \
      --test_env=BASE_URL=$BASE_URL
```

---

## Network Policies for Branch Namespaces

Branch namespaces should have network policies that:

1. Allow ingress from the ingress controller (Traefik in `kube-system`)
2. Allow egress to shared infrastructure (Temporal, message broker, schema registry)
3. Deny traffic between branch namespaces (isolation)
4. Allow DNS resolution

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: branch-isolation
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow from Traefik
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - port: 8000
    # Allow within same namespace
    - from:
        - podSelector: {}
  egress:
    # DNS
    - to:
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
    # Temporal server
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: temporal
      ports:
        - port: 7233
    # Within same namespace
    - to:
        - podSelector: {}
    # External HTTPS (for APIs, package registries, etc.)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
      ports:
        - port: 443
```

---

## Implementation Order

1. **Parameterize Helm charts** — make namespace, ingress host, and external service URLs
   configurable via values
2. **Add `values-branch.yaml`** — minimal resource profile for branch deployments
3. **Create `tdp-branches` AppProject** — with resource constraints and namespace wildcarding
4. **Create ApplicationSet** with PR generator — auto-create/destroy environments
5. **Add ResourceQuota and LimitRange templates** — prevent resource exhaustion
6. **Set up wildcard DNS + TLS cert** — `*.dev.example.com` with cert-manager DNS-01 challenge
7. **Add TTL-based namespace cleanup CronJob** — safety net for orphaned environments
8. **Integrate with CI** — post branch environment URL as PR comment, run smoke tests
9. **Selective deployment** — use Bazel affected targets to only deploy changed services per branch
10. **Scale-to-zero for idle branches** — reduce cost of long-lived but inactive branches
