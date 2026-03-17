import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Installs kube-prometheus-stack via Helm chart.
 *
 * Provides a complete monitoring stack: Prometheus, Grafana, Alertmanager,
 * node-exporter, and kube-state-metrics with pre-configured dashboards and
 * recording rules for Kubernetes.
 *
 * All environment-specific knobs are read from Pulumi stack config:
 * - resourceTier (minimal | standard) — selects resource request/limit presets
 * - prometheusRetention — Prometheus TSDB retention (default: "6h")
 * - prometheusScrapeInterval — global scrape interval (default: "30s")
 * - prometheusStorageSize — PVC size; empty string means no persistent storage (default: "")
 * - grafanaAdminPassword — admin password; falls back to "admin" when unset
 */

/** Resource preset for a single component. */
interface ResourceSpec {
  requests: { cpu: string; memory: string };
  limits: { cpu: string; memory: string };
}

interface MonitoringPresets {
  prometheus: ResourceSpec;
  grafana: ResourceSpec;
  alertmanager: ResourceSpec;
  nodeExporter: ResourceSpec;
  kubeStateMetrics: ResourceSpec;
}

const resourcePresets: Record<string, MonitoringPresets> = {
  minimal: {
    prometheus: {
      requests: { cpu: "100m", memory: "256Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    grafana: {
      requests: { cpu: "50m", memory: "128Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
    alertmanager: {
      requests: { cpu: "25m", memory: "32Mi" },
      limits: { cpu: "100m", memory: "128Mi" },
    },
    nodeExporter: {
      requests: { cpu: "25m", memory: "32Mi" },
      limits: { cpu: "100m", memory: "64Mi" },
    },
    kubeStateMetrics: {
      requests: { cpu: "25m", memory: "32Mi" },
      limits: { cpu: "100m", memory: "128Mi" },
    },
  },
  standard: {
    prometheus: {
      requests: { cpu: "500m", memory: "1Gi" },
      limits: { cpu: "1000m", memory: "2Gi" },
    },
    grafana: {
      requests: { cpu: "200m", memory: "256Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    alertmanager: {
      requests: { cpu: "100m", memory: "128Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
    nodeExporter: {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "200m", memory: "128Mi" },
    },
    kubeStateMetrics: {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
  },
};

export interface MonitoringArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
}

export function installMonitoring(args: MonitoringArgs): k8s.helm.v3.Release {
  const { provider } = args;

  const config = new pulumi.Config();
  const resourceTier = config.get("resourceTier") || "minimal";
  const prometheusRetention = config.get("prometheusRetention") || "6h";
  const prometheusScrapeInterval = config.get("prometheusScrapeInterval") || "30s";
  const prometheusStorageSize = config.get("prometheusStorageSize") || "";
  const grafanaAdminPassword = config.get("grafanaAdminPassword")
    ? config.requireSecret("grafanaAdminPassword")
    : "admin";

  const preset = resourcePresets[resourceTier] ?? resourcePresets["minimal"];

  // Build storageSpec: empty object when no size is configured (no PVC),
  // otherwise create a volume claim template with the requested size.
  const storageSpec = prometheusStorageSize
    ? {
        volumeClaimTemplate: {
          spec: {
            accessModes: ["ReadWriteOnce"],
            resources: {
              requests: { storage: prometheusStorageSize },
            },
          },
        },
      }
    : {};

  const monitoring = new k8s.helm.v3.Release(
    "kube-prometheus-stack",
    {
      chart: "kube-prometheus-stack",
      version: "72.3.0",
      repositoryOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
      },
      namespace: "monitoring",
      createNamespace: true,
      values: {
        // Prometheus configuration
        prometheus: {
          prometheusSpec: {
            retention: prometheusRetention,
            resources: preset.prometheus,
            scrapeInterval: prometheusScrapeInterval,
            storageSpec,
          },
        },

        // Grafana configuration
        grafana: {
          resources: preset.grafana,
          adminPassword: grafanaAdminPassword,
          additionalDataSources: [
            {
              name: "Tempo",
              type: "tempo",
              url: "http://tempo.monitoring.svc.cluster.local:3100",
              access: "proxy",
              isDefault: false,
              jsonData: {
                tracesToMetrics: {
                  datasourceUid: "prometheus",
                  tags: [
                    { key: "service.name", value: "service" },
                    { key: "job" },
                  ],
                  queries: [
                    {
                      name: "Request rate",
                      query:
                        "sum(rate(http_server_request_duration_seconds_count{$$__tags}[5m]))",
                    },
                  ],
                },
                serviceMap: {
                  datasourceUid: "prometheus",
                },
                nodeGraph: {
                  enabled: true,
                },
              },
            },
          ],
        },

        // Alertmanager configuration
        alertmanager: {
          alertmanagerSpec: {
            resources: preset.alertmanager,
          },
        },

        // Node exporter
        "prometheus-node-exporter": {
          resources: preset.nodeExporter,
        },

        // kube-state-metrics
        "kube-state-metrics": {
          resources: preset.kubeStateMetrics,
        },
      },
    },
    { provider },
  );

  return monitoring;
}
