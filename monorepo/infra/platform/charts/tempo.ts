import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Installs Grafana Tempo via Helm chart.
 *
 * Tempo provides distributed tracing storage and query. Deployed in
 * monolithic mode for simplicity, it accepts OTLP gRPC on port 4317
 * and serves the Tempo API on port 3200.
 *
 * Resource sizing is controlled by the `resourceTier` config key:
 * - minimal: reduced footprint suitable for local development
 * - standard: production-sized resources
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
  const preset = resourcePresets[resourceTier] ?? resourcePresets["minimal"];

  const tempo = new k8s.helm.v3.Release(
    "tempo",
    {
      chart: "tempo",
      version: "1.14.0",
      repositoryOpts: {
        repo: "https://grafana.github.io/helm-charts",
      },
      namespace: "monitoring",
      values: {
        tempo: {
          resources: preset.tempo,
          receivers: {
            otlp: {
              protocols: {
                grpc: {
                  endpoint: "0.0.0.0:4317",
                },
              },
            },
          },
        },
      },
    },
    { provider, dependsOn },
  );

  return tempo;
}
