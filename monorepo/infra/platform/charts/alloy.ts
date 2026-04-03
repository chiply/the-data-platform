import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Installs Grafana Alloy via Helm chart.
 *
 * Alloy acts as an OpenTelemetry Collector, receiving OTLP gRPC traces
 * on port 4317, batching them, and forwarding to Tempo. Deployed as a
 * DaemonSet so every node has a local collector endpoint.
 *
 * The release is named "alloy-otlp" so the auto-created ClusterIP Service
 * is reachable at alloy-otlp.monitoring.svc.cluster.local:4317.
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

interface AlloyPresets {
  alloy: ResourceSpec;
}

const resourcePresets: Record<string, AlloyPresets> = {
  minimal: {
    alloy: {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
  },
  standard: {
    alloy: {
      requests: { cpu: "200m", memory: "256Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
  },
};

/**
 * Alloy configuration in River syntax.
 *
 * Pipeline: otelcol.receiver.otlp (gRPC :4317)
 *         → otelcol.processor.batch
 *         → otelcol.exporter.otlp (Tempo)
 */
const alloyConfig = `
otelcol.receiver.otlp "default" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }
  output {
    traces = [otelcol.processor.batch.default.input]
  }
}

otelcol.processor.batch "default" {
  output {
    traces = [otelcol.exporter.otlp.tempo.input]
  }
}

otelcol.exporter.otlp "tempo" {
  client {
    endpoint = "tempo.monitoring.svc.cluster.local:4317"
    tls {
      insecure = true
    }
  }
}
`;

export interface AlloyArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
  /** Optional resources this release depends on. */
  dependsOn?: pulumi.Resource[];
}

export function installAlloy(args: AlloyArgs): k8s.helm.v3.Release {
  const { provider, dependsOn } = args;

  const config = new pulumi.Config();
  const resourceTier = config.get("resourceTier") || "minimal";
  const preset = resourcePresets[resourceTier] ?? resourcePresets["minimal"];

  const alloy = new k8s.helm.v3.Release(
    "alloy-otlp",
    {
      chart: "alloy",
      version: "1.6.2",
      repositoryOpts: {
        repo: "https://grafana.github.io/helm-charts",
      },
      namespace: "monitoring",
      values: {
        // Deploy as DaemonSet so every node has a local OTLP endpoint
        alloy: {
          configMap: {
            content: alloyConfig,
          },
          resources: preset.alloy,
          // Expose the OTLP gRPC port on the ClusterIP Service so services
          // can reach it at alloy-otlp.monitoring.svc.cluster.local:4317.
          // The default service only exposes the metrics port (12345).
          extraPorts: [
            {
              name: "otlp-grpc",
              port: 4317,
              targetPort: 4317,
              protocol: "TCP",
            },
          ],
        },
        controller: {
          type: "daemonset",
        },
      },
    },
    { provider, dependsOn },
  );

  return alloy;
}
