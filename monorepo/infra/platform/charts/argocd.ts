import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Installs Argo CD via Helm chart.
 *
 * Argo CD is a declarative, GitOps continuous delivery tool for Kubernetes.
 * It is installed as a Layer 2 platform service so that it can manage Layer 3
 * application deployments.
 *
 * For local development the chart runs in non-HA mode with Dex, ApplicationSet
 * controller, and Notifications controller disabled to reduce memory usage by
 * ~200 Mi.
 *
 * Resource sizing is controlled by the `resourceTier` config key:
 * - minimal: reduced footprint suitable for local development (~400 Mi total requests)
 * - standard: production-sized resources
 *
 * Repo credentials are configured via Pulumi ESC for non-local environments
 * (argocd:repoUrl, argocd:sshPrivateKey as fn::secret). Local uses file:// URL
 * and skips SSH credentials.
 *
 * Prerequisites:
 * - Docker Desktop allocated at least 6 GB of memory
 * - Cluster teardown destroys all ArgoCD state (expected for ephemeral local clusters)
 */

/** Resource preset for a single component. */
interface ResourceSpec {
  requests: { cpu: string; memory: string };
  limits: { cpu: string; memory: string };
}

interface ArgoCDPresets {
  server: ResourceSpec;
  repoServer: ResourceSpec;
  controller: ResourceSpec;
  redis: ResourceSpec;
}

const resourcePresets: Record<string, ArgoCDPresets> = {
  minimal: {
    server: {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
    repoServer: {
      requests: { cpu: "50m", memory: "128Mi" },
      limits: { cpu: "200m", memory: "512Mi" },
    },
    controller: {
      requests: { cpu: "50m", memory: "128Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    redis: {
      requests: { cpu: "25m", memory: "64Mi" },
      limits: { cpu: "100m", memory: "128Mi" },
    },
  },
  standard: {
    server: {
      requests: { cpu: "100m", memory: "128Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    repoServer: {
      requests: { cpu: "200m", memory: "256Mi" },
      limits: { cpu: "500m", memory: "1Gi" },
    },
    controller: {
      requests: { cpu: "200m", memory: "256Mi" },
      limits: { cpu: "1000m", memory: "1Gi" },
    },
    redis: {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
  },
};

export interface ArgoCDArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
  /** Resources that must exist before ArgoCD is installed. */
  dependsOn?: pulumi.Resource[];
}

export function installArgoCD(args: ArgoCDArgs): k8s.helm.v3.Release {
  const { provider, dependsOn } = args;

  const config = new pulumi.Config();
  const resourceTier = config.get("resourceTier") || "minimal";
  const preset = resourcePresets[resourceTier] ?? resourcePresets["minimal"];
  const isLocal = resourceTier === "minimal";

  // ArgoCD-specific config
  const argoCDConfig = new pulumi.Config("argocd");
  const repoUrl = argoCDConfig.get("repoUrl") || "";
  const sshPrivateKey = argoCDConfig.getSecret("sshPrivateKey");
  const ingressHostname =
    argoCDConfig.get("ingressHostname") || "argocd.localhost";

  // Build repo credentials for non-local environments
  const repositories: Record<string, unknown>[] = [];
  if (repoUrl) {
    const repoCred: Record<string, unknown> = {
      url: repoUrl,
      name: "platform-repo",
      type: "git",
    };
    if (sshPrivateKey) {
      repoCred["sshPrivateKey"] = sshPrivateKey;
    }
    repositories.push(repoCred);
  }

  const argocd = new k8s.helm.v3.Release(
    "argocd",
    {
      chart: "argo-cd",
      version: "7.7.16",
      repositoryOpts: {
        repo: "https://argoproj.github.io/argo-helm",
      },
      namespace: "argocd",
      createNamespace: true,
      values: {
        // Non-HA mode for local/dev
        global: {
          revisionHistoryLimit: 1,
        },

        // Server configuration
        server: {
          resources: preset.server,
          ingress: {
            enabled: true,
            ingressClassName: "traefik",
            hostname: ingressHostname,
            annotations: {
              "traefik.ingress.kubernetes.io/router.entrypoints": "web",
            },
          },
          // Run insecure (no TLS) behind reverse proxy for local dev only.
          // Production should terminate TLS at the ingress or use ArgoCD's
          // built-in TLS with a cert-manager certificate.
          ...(isLocal ? { extraArgs: ["--insecure"] } : {}),
        },

        // Repo server — configured for monorepo efficiency
        repoServer: {
          resources: preset.repoServer,
          env: [
            // Shallow clones to save disk
            { name: "ARGOCD_GIT_SHALLOW_DEPTH", value: "1" },
            // Sparse checkout — only clone the deploy directory to reduce
            // disk usage and clone time for the monorepo
            { name: "ARGOCD_GIT_SPARSE_CHECKOUT", value: "true" },
            {
              name: "ARGOCD_GIT_SPARSE_CHECKOUT_PATHS",
              value: "monorepo/deploy/",
            },
          ],
        },

        // Application controller
        controller: {
          resources: preset.controller,
        },

        // Redis
        redis: {
          resources: preset.redis,
        },

        // Dex (SSO) — disabled for local to save memory, enable for prod
        dex: {
          enabled: !isLocal,
        },

        // ApplicationSet controller — disabled for local to save memory
        applicationSet: {
          enabled: !isLocal,
        },

        // Notifications controller — disabled for local to save memory,
        // enabled for non-local to alert on sync failures
        notifications: {
          enabled: !isLocal,
        },

        // Repo credentials (empty for local; populated via ESC for dev/prod)
        configs: {
          repositories: repositories.length > 0
            ? Object.fromEntries(repositories.map((r, i) => [`repo-${i}`, r]))
            : {},
          params: {
            // Cache expiration for repo-server disk management
            "reposerver.repo.cache.expiration": "24h",
          },
        },
      },
    },
    { provider, dependsOn },
  );

  return argocd;
}
