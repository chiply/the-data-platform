import * as k8s from "@pulumi/kubernetes";

/**
 * Installs kube-prometheus-stack via Helm chart.
 *
 * Provides a complete monitoring stack: Prometheus, Grafana, Alertmanager,
 * node-exporter, and kube-state-metrics with pre-configured dashboards and
 * recording rules for Kubernetes.
 *
 * Environment-appropriate resource limits:
 * - Local: minimal footprint, short retention (6h), reduced scrape intervals
 * - Production: production-sized resources, 30d retention
 */
export interface MonitoringArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
  /** Environment name ("local" or "production") for resource sizing. */
  environment: string;
}

export function installMonitoring(args: MonitoringArgs): k8s.helm.v3.Release {
  const { provider, environment } = args;

  const isLocal = environment === "local";

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
            retention: isLocal ? "6h" : "30d",
            resources: isLocal
              ? {
                  requests: { cpu: "100m", memory: "256Mi" },
                  limits: { cpu: "500m", memory: "512Mi" },
                }
              : {
                  requests: { cpu: "500m", memory: "1Gi" },
                  limits: { cpu: "1000m", memory: "2Gi" },
                },
            // Longer scrape interval locally (30s) to reduce resource usage
            scrapeInterval: isLocal ? "30s" : "15s",
            // Disable persistent storage locally to save resources
            storageSpec: isLocal
              ? {}
              : {
                  volumeClaimTemplate: {
                    spec: {
                      accessModes: ["ReadWriteOnce"],
                      resources: {
                        requests: { storage: "50Gi" },
                      },
                    },
                  },
                },
          },
        },

        // Grafana configuration
        grafana: {
          resources: isLocal
            ? {
                requests: { cpu: "50m", memory: "128Mi" },
                limits: { cpu: "200m", memory: "256Mi" },
              }
            : {
                requests: { cpu: "200m", memory: "256Mi" },
                limits: { cpu: "500m", memory: "512Mi" },
              },
          // Default admin credentials (override in production via secrets)
          adminPassword: isLocal ? "admin" : undefined,
        },

        // Alertmanager configuration
        alertmanager: {
          alertmanagerSpec: {
            resources: isLocal
              ? {
                  requests: { cpu: "25m", memory: "32Mi" },
                  limits: { cpu: "100m", memory: "128Mi" },
                }
              : {
                  requests: { cpu: "100m", memory: "128Mi" },
                  limits: { cpu: "200m", memory: "256Mi" },
                },
          },
        },

        // Node exporter — lighter limits locally
        "prometheus-node-exporter": {
          resources: isLocal
            ? {
                requests: { cpu: "25m", memory: "32Mi" },
                limits: { cpu: "100m", memory: "64Mi" },
              }
            : {
                requests: { cpu: "50m", memory: "64Mi" },
                limits: { cpu: "200m", memory: "128Mi" },
              },
        },

        // kube-state-metrics
        "kube-state-metrics": {
          resources: isLocal
            ? {
                requests: { cpu: "25m", memory: "32Mi" },
                limits: { cpu: "100m", memory: "128Mi" },
              }
            : {
                requests: { cpu: "50m", memory: "64Mi" },
                limits: { cpu: "200m", memory: "256Mi" },
              },
        },
      },
    },
    { provider },
  );

  return monitoring;
}
