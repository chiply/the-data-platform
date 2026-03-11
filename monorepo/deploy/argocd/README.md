# ArgoCD Deployment Manifests

Kubernetes manifests for ArgoCD security hardening including RBAC, AppProject
restrictions, and NetworkPolicies.

## Structure

```
argocd/
  appproject.yaml          # AppProject with restricted sources, destinations, and resource whitelists
  rbac/
    clusterrole.yaml       # ClusterRole scoped to managed namespaces (not cluster-admin)
    clusterrolebinding.yaml # Binds ClusterRole to ArgoCD service accounts
    namespace-role.yaml    # Role + RoleBinding for tdp namespace management
  network-policies/
    default-deny.yaml              # Default deny all ingress/egress in argocd namespace
    allow-traefik-ingress.yaml     # Traefik -> argocd-server on port 8080
    allow-inter-component.yaml     # ArgoCD component-to-component traffic
    allow-egress-kube-api.yaml     # Egress to Kubernetes API (443/6443)
    allow-egress-github.yaml       # Egress to GitHub (443 HTTPS, 22 SSH)
```

## AppProject Restrictions

- **sourceRepos**: Only the platform GitHub repository is allowed
- **destinations**: Only the `tdp` namespace on the in-cluster server
- **clusterResourceWhitelist**: Empty list -- no cluster-scoped resources allowed
- **namespaceResourceWhitelist**: Explicit list of permitted resource types

## RBAC

ArgoCD should NOT have `cluster-admin` in production. The custom ClusterRole
(`argocd-managed-namespaces`) grants only the permissions needed to manage
resources in the `tdp` namespace. A namespace-scoped Role provides the actual
management permissions within `tdp`.

## NetworkPolicies

### Local Development (Flannel / k3d)

**Flannel, the default CNI in k3d, does NOT enforce NetworkPolicies.** These
policies are applied for documentation and production-readiness purposes, but
they will have no effect in local k3d development clusters. This is an accepted
local/production parity gap.

To enforce NetworkPolicies locally, you would need to switch to a CNI that
supports them (e.g., Calico, Cilium). This is not required for local development
and is intentionally deferred.

### Production

In production, ensure the cluster uses a CNI that enforces NetworkPolicies
(e.g., Calico, Cilium). The policies defined here will then restrict traffic
to only the explicitly allowed flows:

1. Traefik ingress to ArgoCD server UI (port 8080)
2. Inter-component traffic within the argocd namespace
3. Egress to the Kubernetes API server (ports 443, 6443)
4. Egress to GitHub (ports 443, 22)
5. All other traffic is denied by the default-deny policy
