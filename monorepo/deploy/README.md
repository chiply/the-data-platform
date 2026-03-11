# Deploy

Kubernetes deployment manifests, Helm charts, and ArgoCD application definitions.

## Directory Structure

```
deploy/
  argocd/
    apps/                       # ArgoCD Application manifests
      <service>.yaml            # Dev environment (auto-sync)
      <service>-production.yaml # Production environment (manual sync)
  charts/
    <service>/
      Chart.yaml
      values.yaml               # Base/default values
      values-dev.yaml            # Dev environment overrides (image tag, replicas, etc.)
      values-production.yaml     # Production environment overrides
      templates/
```

## Release, Build, and Promotion Flow

### Overview

```
PR merged to main
  -> release-please creates a Release PR (or updates an existing one)
  -> Release PR merged
    -> release-please creates a GitHub Release + tag (e.g. schema-registry-v0.1.0)
    -> post-release.yml triggers:
      -> Builds container image from the component's Dockerfile
      -> Pushes to ghcr.io/<org>/the-data-platform/<component>:<version>
      -> Tags as :<version>
    -> Operator promotes the version to dev, then production (see below)
```

### Step 1: release-please Creates a Tag

When commits land on `main`, the `release.yml` workflow runs release-please. It maintains
a Release PR that tracks unreleased changes. When that PR is merged, release-please:

1. Creates a GitHub Release with a tag following the pattern `<component>-v<MAJOR>.<MINOR>.<PATCH>` (e.g. `schema-registry-v0.1.0`).
2. Updates the component's `CHANGELOG.md` and version files.

### Step 2: Post-Release Image Build

The `post-release.yml` workflow triggers on the `release: published` event:

1. Parses the release tag to extract the component name and semver version.
2. Looks up the component path in `release-please-config.json`.
3. If a `Dockerfile` exists at that path, builds and pushes the image:
   - `ghcr.io/<org>/the-data-platform/<component>:<version>`
   Mutable `:latest` tags are intentionally not published — ArgoCD cannot detect changes to mutable tags reliably.

### Step 3: Promote to Dev

Update the image tag in the service's dev values file so ArgoCD picks up the new version.

1. Verify the image was pushed successfully:
   ```bash
   # Check the image exists in the registry
   docker pull ghcr.io/<org>/the-data-platform/<component>:<version>
   # or via GitHub CLI:
   gh api orgs/<org>/packages/container/the-data-platform%2F<component>/versions
   ```

2. Update `monorepo/deploy/charts/<service>/values-dev.yaml`:
   ```yaml
   image:
     tag: "<version>"   # e.g. "0.1.0"
   ```

3. Commit and push to `main`:
   ```bash
   git add monorepo/deploy/charts/<service>/values-dev.yaml
   git commit -m "chore(deploy): promote <service> v<version> to dev"
   git push origin main
   ```

4. ArgoCD automatically syncs the dev Application (auto-sync is enabled with `prune` and `selfHeal`). The new image rolls out within the sync interval.

### Step 4: Promote to Production

After validating in dev, promote the same version to production.

1. Verify the version is healthy in dev (check pod status, logs, health endpoints).

2. Update `monorepo/deploy/charts/<service>/values-production.yaml`:
   ```yaml
   image:
     tag: "<version>"   # Same version validated in dev
   ```

3. Commit and push to `main`:
   ```bash
   git add monorepo/deploy/charts/<service>/values-production.yaml
   git commit -m "chore(deploy): promote <service> v<version> to production"
   git push origin main
   ```

4. Production ArgoCD Applications use **manual sync** (no auto-sync, no auto-prune). An operator must explicitly sync in the ArgoCD UI or CLI:
   ```bash
   argocd app sync <service>-production
   ```

## ArgoCD Sync Behavior

| Environment | Auto-Sync | Prune | Self-Heal | Trigger |
|-------------|-----------|-------|-----------|---------|
| Dev         | Yes       | Yes   | Yes       | Automatic on commit to `main` |
| Production  | No        | No    | No        | Manual sync required |

- **Dev**: Changes to `values-dev.yaml` (or chart templates) on `main` are detected and applied automatically. Pruning removes resources no longer in the chart. Self-heal reverts manual drift.
- **Production**: ArgoCD detects the change and shows "OutOfSync" status, but does not apply it until an operator triggers a sync. This provides a gate for final review.

## Rollback Procedure

If a deployed version is unhealthy, roll back by reverting the values file to the previous image tag.

### Steps

1. **Identify the previous working version.** Check git history for the last known-good tag:
   ```bash
   git log --oneline monorepo/deploy/charts/<service>/values-<env>.yaml
   ```

2. **Verify the previous image still exists in the registry:**
   ```bash
   docker pull ghcr.io/<org>/the-data-platform/<component>:<previous-version>
   ```
   If the image no longer exists, you cannot roll back to that version. Check available tags:
   ```bash
   gh api orgs/<org>/packages/container/the-data-platform%2F<component>/versions \
     --jq '.[].metadata.container.tags[]'
   ```

3. **Revert the values file:**
   ```bash
   # Option A: revert the specific commit
   git revert <commit-sha>

   # Option B: manually edit the tag back
   # Edit values-<env>.yaml and set image.tag to the previous version
   git add monorepo/deploy/charts/<service>/values-<env>.yaml
   git commit -m "chore(deploy): rollback <service> to v<previous-version> in <env>"
   ```

4. **Push and sync:**
   ```bash
   git push origin main
   ```
   - **Dev**: ArgoCD auto-syncs the rollback.
   - **Production**: Manually sync in ArgoCD:
     ```bash
     argocd app sync <service>-production
     ```

5. **Verify** the rollback succeeded: check pod status, logs, and health endpoints.

## ServiceDeployment Component Deprecation

The `ServiceDeployment` Pulumi component (`monorepo/infra/components/service-deployment.ts`)
creates Kubernetes Deployments, Services, and Ingresses via Pulumi. For Layer 3 (application)
services, this component is **deprecated** in favor of ArgoCD + Helm charts.

**Migration path:**
1. Create a Helm chart for the service under `monorepo/deploy/charts/<service>/`.
2. Create ArgoCD Application manifests (dev and production) under `monorepo/deploy/argocd/apps/`.
3. Use per-environment values files (`values-dev.yaml`, `values-production.yaml`) for image tags and environment-specific config.
4. Remove the Pulumi-based deployment for the service once the ArgoCD deployment is validated.

The `ServiceDeployment` component remains available for infrastructure-level (Layer 1/2) services
that are managed directly by Pulumi and do not go through the GitOps promotion workflow.
