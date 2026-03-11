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
}

export function installArgoCD(args: ArgoCDArgs): k8s.helm.v3.Release {
  const { provider } = args;

  const config = new pulumi.Config();
  const resourceTier = config.get("resourceTier") || "minimal";
  const preset = resourcePresets[resourceTier] ?? resourcePresets["minimal"];

  // ArgoCD-specific config
  const argoCDConfig = new pulumi.Config("argocd");
  const repoUrl = argoCDConfig.get("repoUrl") || "";
  const sshPrivateKey = argoCDConfig.get("sshPrivateKey")
    ? argoCDConfig.requireSecret("sshPrivateKey")
    : undefined;

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
            hostname: "argocd.localhost",
            annotations: {
              "traefik.ingress.kubernetes.io/router.entrypoints": "web",
            },
          },
          // Run insecure (no TLS) behind Traefik for local dev
          extraArgs: ["--insecure"],
        },

        // Repo server — configured for monorepo efficiency
        repoServer: {
          resources: preset.repoServer,
          env: [
            // Shallow clones to save disk
            { name: "ARGOCD_GIT_SHALLOW_DEPTH", value: "1" },
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

        // Disable Dex (SSO) — not needed for local
        dex: {
          enabled: false,
        },

        // Disable ApplicationSet controller for local — saves memory
        applicationSet: {
          enabled: false,
        },

        // Disable Notifications controller for local — saves memory
        notifications: {
          enabled: false,
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
    { provider },
  );

  return argocd;
}
