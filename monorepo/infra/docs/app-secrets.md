# Application Secrets Management

## Overview

Application-level secrets flow into ArgoCD-managed deployments through a two-layer
approach: **Pulumi owns the Secret objects**, ArgoCD references them but never manages
or stores secret values.

```
Pulumi ESC (fn::secret)
    │
    ▼
Pulumi Config (requireSecret)
    │
    ▼
K8s Secret in "tdp" namespace  ← created during platform bootstrap (Layer 2)
    │
    ▼
Helm chart env vars (secretKeyRef)  ← deployed by ArgoCD (Layer 3)
```

## Architecture

### Layer separation

| Layer | Owner | Responsibility |
|-------|-------|----------------|
| ESC (Layer 0) | Pulumi ESC | Encrypted secret storage, access policies |
| Platform (Layer 2) | Pulumi `tdp-platform` stack | Creates K8s Secrets in `tdp` namespace |
| Application (Layer 3) | ArgoCD + Helm | References secrets via `secretKeyRef` |

### Why Pulumi owns the secrets

- Secrets are created **before** ArgoCD syncs any application, guaranteeing they
  exist when pods start.
- Secret values never appear in Git — they flow from ESC through Pulumi config.
- Pulumi tracks secret state and can rotate/update secrets with `pulumi up`.

## Current Secrets

| K8s Secret Name | Keys | Purpose |
|-----------------|------|---------|
| `tdp-db-credentials` | `host`, `port`, `database`, `username`, `password` | Database connection |
| `tdp-app-credentials` | `apiKey`, `sessionSecret` | Application-level auth |

## How to Add a New Application Secret

### 1. Add the secret value to Pulumi ESC

In the ESC environment (e.g., `tdp/dev`), add a new secret:

```yaml
values:
  pulumiConfig:
    myNewSecret:
      fn::secret: "the-actual-value"
```

### 2. Read the secret in app-secrets.ts

In `monorepo/infra/platform/app-secrets.ts`, add a new config read with a local
default:

```typescript
const myNewSecret: pulumi.Output<string> | string = config.get("myNewSecret")
  ? config.requireSecret("myNewSecret")
  : "local-dev-default";
```

### 3. Add to an existing K8s Secret or create a new one

Either add a key to an existing Secret's `stringData`:

```typescript
stringData: {
  // ... existing keys
  myNewKey: pulumi.output(myNewSecret).apply((v) => v),
},
```

Or create a new `k8s.core.v1.Secret` resource following the existing pattern.

### 4. Update stack configs (optional)

If the secret has non-sensitive config (like a hostname), add it to the stack
config files:

- `Pulumi.dev.yaml` — dev environment overrides
- `Pulumi.production.yaml` — production overrides
- `Pulumi.local.yaml` — no changes needed (uses defaults)

### 5. Reference in Helm chart values

In your Helm chart's `values.yaml` or ArgoCD Application values:

```yaml
env:
  - name: MY_NEW_SECRET
    valueFrom:
      secretKeyRef:
        name: tdp-app-credentials  # or your new secret name
        key: myNewKey
```

### 6. Run typecheck and deploy

```bash
cd monorepo/infra/platform
npx tsc --noEmit          # verify types
pulumi up --stack dev     # deploy to dev
```

## Local Development

For local development, **no ESC environment is needed**. All secrets fall back to
dummy default values defined in `app-secrets.ts`. The pattern uses `config.get()`
(returns `undefined` when unset) to detect whether a value was provided:

```typescript
const dbPassword: pulumi.Output<string> | string = config.get("dbPassword")
  ? config.requireSecret("dbPassword")
  : "local-dev-password";
```

This means `pulumi up --stack local` works without any ESC configuration.

## Verification

To verify secrets are available before ArgoCD syncs:

1. Secrets are created by the `tdp-platform` Pulumi stack (Layer 2).
2. ArgoCD is installed as part of the platform layer.
3. ArgoCD Applications that reference these secrets are synced after platform
   bootstrap completes.
4. The Pulumi dependency graph ensures secrets exist before any downstream
   resource that depends on them.

```bash
# Check secrets exist in the tdp namespace
kubectl get secrets -n tdp
```
