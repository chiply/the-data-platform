import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Installs Grafana Tempo via Helm chart in monolithic (single-binary) mode.
 *
 * Provides a trace storage backend for distributed tracing. Deployed into the
 * monitoring namespace alongside the kube-prometheus-stack.
 *
 * All environment-specific knobs are read from Pulumi stack config:
 * - resourceTier (minimal | standard) — selects resource request/limit presets
 * - tempoRetention — trace retention duration (default: "6h")
 * - tempoStorageSize — PVC size; empty string means no persistent storage (default: "")
 */

/** Resource preset for a single component. */
interface ResourceSpec {
  requests: { cpu: string; memory: string };
  limits: { cpu: string; memory: string };
}

interface TempoPresets {
  tempo: ResourceSpec;
}

const resourcePresets: Record<string, TempoPresets> = {
  minimal: {
    tempo: {
      requests: { cpu: "100m", memory: "256Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
  },
  standard: {
    tempo: {
      requests: { cpu: "500m", memory: "1Gi" },
      limits: { cpu: "1000m", memory: "2Gi" },
    },
  },
};

export interface TempoArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
  /** Optional resources this release depends on. */
  dependsOn?: pulumi.Resource[];
}

export function installTempo(args: TempoArgs): k8s.helm.v3.Release {
  const { provider, dependsOn } = args;

  const config = new pulumi.Config();
  const resourceTier = config.get("resourceTier") || "minimal";
  const tempoRetention = config.get("tempoRetention") || "6h";
  const tempoStorageSize = config.get("tempoStorageSize") || "";

  const preset = resourcePresets[resourceTier] ?? resourcePresets["minimal"];

  // Build persistence config: disabled when no size is configured (ephemeral),
  // otherwise create a PVC with the requested size.
  const persistence = tempoStorageSize
    ? {
        enabled: true,
        size: tempoStorageSize,
      }
    : {
        enabled: false,
      };

  const tempo = new k8s.helm.v3.Release(
    "tempo",
    {
      chart: "tempo",
      version: "1.12.0",
      repositoryOpts: {
        repo: "https://grafana.github.io/helm-charts",
      },
      namespace: "monitoring",
      createNamespace: true,
      values: {
        // Pin the resource names so the ClusterIP Service is always
        // tempo.monitoring.svc.cluster.local (Pulumi appends a random
        // suffix to Helm release names by default).
        fullnameOverride: "tempo",
        // Monolithic (single-binary) mode is the default for the grafana/tempo chart
        tempo: {
          resources: preset.tempo,
          retention: tempoRetention,
          // Enable multitenancy disabled (single-tenant / monolithic)
          multitenancyEnabled: false,
          // Receivers for trace ingestion
          receivers: {
            otlp: {
              protocols: {
                grpc: {
                  endpoint: "0.0.0.0:4317",
                },
                http: {
                  endpoint: "0.0.0.0:4318",
                },
              },
            },
          },
        },
        persistence,
      },
    },
    { provider, dependsOn },
  );

  return tempo;
}
