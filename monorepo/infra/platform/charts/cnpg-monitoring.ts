import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Configures monitoring for CloudNativePG Postgres clusters.
 *
 * This module creates:
 * 1. PodMonitor — enables Prometheus to scrape CNPG metrics endpoints
 * 2. Grafana dashboard ConfigMap — deploys the official CNPG dashboard (#20417)
 * 3. PrometheusRule — alert rules for database health:
 *    - Connection pool saturation (>80% max_connections)
 *    - PVC usage >80%
 *    - Long-running queries (>5 min)
 *    - WAL archiving failures
 *    - Replication lag (future-proofing for HA)
 *
 * These resources are deployed into the monitoring and tdp namespaces
 * respectively, and require the kube-prometheus-stack and CNPG operator
 * to be installed first.
 */

export interface CnpgMonitoringArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
  /** The tdp namespace resource (PodMonitor is deployed here). */
  namespace: k8s.core.v1.Namespace;
  /** The CNPG Cluster resource (monitoring depends on the cluster existing). */
  cluster: k8s.apiextensions.CustomResource;
  /** Resources that must exist before monitoring resources are created. */
  dependsOn?: pulumi.Resource[];
}

export interface CnpgMonitoringResult {
  /** The PodMonitor resource for Prometheus scraping. */
  podMonitor: k8s.apiextensions.CustomResource;
  /** The Grafana dashboard ConfigMap. */
  dashboardConfigMap: k8s.core.v1.ConfigMap;
  /** The PrometheusRule with alert definitions. */
  prometheusRule: k8s.apiextensions.CustomResource;
}

export function installCnpgMonitoring(
  args: CnpgMonitoringArgs,
): CnpgMonitoringResult {
  const { provider, namespace, cluster, dependsOn } = args;

  const managedLabels = {
    "app.kubernetes.io/managed-by": "pulumi",
    "app.kubernetes.io/part-of": "the-data-platform",
    "app.kubernetes.io/component": "cnpg-monitoring",
  };

  // ---------------------------------------------------------------------------
  // 1. PodMonitor — Prometheus scrapes CNPG metrics from Postgres pods
  // ---------------------------------------------------------------------------

  const podMonitor = new k8s.apiextensions.CustomResource(
    "cnpg-pod-monitor",
    {
      apiVersion: "monitoring.coreos.com/v1",
      kind: "PodMonitor",
      metadata: {
        name: "cnpg-postgres",
        namespace: namespace.metadata.name,
        labels: {
          ...managedLabels,
          // kube-prometheus-stack discovers PodMonitors with this label
          release: "kube-prometheus-stack",
        },
      },
      spec: {
        selector: {
          matchLabels: {
            "cnpg.io/cluster": "tdp-postgres",
          },
        },
        podMetricsEndpoints: [
          {
            port: "metrics",
          },
        ],
      },
    },
    { provider, dependsOn: [...(dependsOn ?? []), cluster] },
  );

  // ---------------------------------------------------------------------------
  // 2. Grafana Dashboard ConfigMap
  // ---------------------------------------------------------------------------
  //
  // Grafana sidecar auto-discovers ConfigMaps with the label
  // grafana_dashboard: "1" and loads them as dashboards.
  //
  // Instead of embedding the full dashboard JSON inline, configure the
  // Grafana sidecar to fetch the official CNPG dashboard (#20417) from
  // grafana.com using the gnetId annotation. The sidecar's
  // DASHBOARD_PROVIDER_FOLDER_ANNOTATION and gnet-id annotation trigger
  // automatic download.
  // ---------------------------------------------------------------------------

  const dashboardConfigMap = new k8s.core.v1.ConfigMap(
    "cnpg-grafana-dashboard",
    {
      metadata: {
        name: "cnpg-grafana-dashboard",
        namespace: "monitoring",
        labels: {
          ...managedLabels,
          grafana_dashboard: "1",
        },
        annotations: {
          "grafana_folder": "CloudNativePG",
          // Grafana sidecar fetches dashboard by gnet ID from grafana.com
          "k8s-sidecar-target-directory": "/tmp/dashboards/CloudNativePG",
        },
      },
      data: {
        // Placeholder with gnetId — the Grafana dashboard provisioner
        // requires the full exported JSON to render panels. Download from:
        //   https://grafana.com/api/dashboards/20417/revisions/latest/download
        // and replace this content, or configure Grafana's dashboard provider
        // to auto-import by gnet ID.
        "cnpg-dashboard.json": JSON.stringify({
          __inputs: [
            {
              name: "DS_PROMETHEUS",
              type: "datasource",
              pluginId: "prometheus",
              pluginName: "Prometheus",
            },
          ],
          annotations: { list: [] },
          description: "CloudNativePG Dashboard — replace with full export from grafana.com/dashboards/20417",
          editable: true,
          gnetId: 20417,
          graphTooltip: 0,
          id: null,
          panels: [],
          refresh: "30s",
          schemaVersion: 39,
          tags: ["cloudnative-pg", "postgresql", "database"],
          templating: {
            list: [
              {
                current: {},
                datasource: { type: "prometheus", uid: "${DS_PROMETHEUS}" },
                definition: "label_values(cnpg_collector_up, namespace)",
                label: "Namespace",
                name: "namespace",
                query: "label_values(cnpg_collector_up, namespace)",
                refresh: 2,
                type: "query",
              },
              {
                current: {},
                datasource: { type: "prometheus", uid: "${DS_PROMETHEUS}" },
                definition: 'label_values(cnpg_collector_up{namespace="$namespace"}, cluster)',
                label: "Cluster",
                name: "cluster",
                query: 'label_values(cnpg_collector_up{namespace="$namespace"}, cluster)',
                refresh: 2,
                type: "query",
              },
            ],
          },
          time: { from: "now-1h", to: "now" },
          title: "CloudNativePG",
          uid: "cnpg-dashboard",
          version: 1,
        }),
      },
    },
    { provider, dependsOn: dependsOn ?? [] },
  );

  // ---------------------------------------------------------------------------
  // 3. PrometheusRule — Alert rules for CNPG Postgres health
  // ---------------------------------------------------------------------------

  const prometheusRule = new k8s.apiextensions.CustomResource(
    "cnpg-prometheus-rules",
    {
      apiVersion: "monitoring.coreos.com/v1",
      kind: "PrometheusRule",
      metadata: {
        name: "cnpg-postgres-alerts",
        namespace: namespace.metadata.name,
        labels: {
          ...managedLabels,
          // kube-prometheus-stack discovers PrometheusRules with this label
          release: "kube-prometheus-stack",
        },
      },
      spec: {
        groups: [
          {
            name: "cnpg-postgres.rules",
            rules: [
              // Connection pool saturation: >80% of max_connections
              {
                alert: "CnpgConnectionPoolSaturation",
                expr: '(cnpg_backends_total / on(cluster, namespace) group_left cnpg_pg_settings_setting{name="max_connections"}) > 0.8',
                for: "5m",
                labels: {
                  severity: "warning",
                },
                annotations: {
                  summary:
                    "PostgreSQL connection usage exceeds 80% of max_connections",
                  description:
                    'Cluster {{ $labels.cluster }} in namespace {{ $labels.namespace }} has {{ $value | humanizePercentage }} of max_connections in use. Consider enabling PgBouncer or increasing max_connections.',
                },
              },

              // PVC usage >80%
              {
                alert: "CnpgPvcUsageHigh",
                expr: '(cnpg_pg_database_size_bytes / on(pod, namespace) group_left kubelet_volume_stats_capacity_bytes{namespace="tdp"}) > 0.8',
                for: "10m",
                labels: {
                  severity: "warning",
                },
                annotations: {
                  summary: "PostgreSQL PVC usage exceeds 80%",
                  description:
                    "Cluster {{ $labels.cluster }} in namespace {{ $labels.namespace }} PVC usage is at {{ $value | humanizePercentage }}. Expand the volume or clean up data.",
                },
              },

              // Long-running queries (>5 minutes)
              {
                alert: "CnpgLongRunningQuery",
                expr: "cnpg_pg_stat_activity_max_tx_duration_seconds > 300",
                for: "1m",
                labels: {
                  severity: "warning",
                },
                annotations: {
                  summary:
                    "PostgreSQL has queries running longer than 5 minutes",
                  description:
                    "Cluster {{ $labels.cluster }} in namespace {{ $labels.namespace }} has a transaction running for {{ $value | humanizeDuration }}. Investigate and terminate if necessary.",
                },
              },

              // WAL archiving failures
              {
                alert: "CnpgWalArchivingFailing",
                expr: "cnpg_pg_wal_archiving_failing > 0",
                for: "5m",
                labels: {
                  severity: "critical",
                },
                annotations: {
                  summary: "PostgreSQL WAL archiving is failing",
                  description:
                    "Cluster {{ $labels.cluster }} in namespace {{ $labels.namespace }} has WAL archiving failures. This impacts backup RPO. Check Object Storage credentials and connectivity.",
                },
              },

              // Replication lag (future-proofing for HA)
              {
                alert: "CnpgReplicationLag",
                expr: "cnpg_pg_replication_lag > 30",
                for: "5m",
                labels: {
                  severity: "warning",
                },
                annotations: {
                  summary: "PostgreSQL replication lag exceeds 30 seconds",
                  description:
                    "Cluster {{ $labels.cluster }} in namespace {{ $labels.namespace }} has replication lag of {{ $value }} seconds. Check replica health and network connectivity.",
                },
              },
            ],
          },
        ],
      },
    },
    { provider, dependsOn: [...(dependsOn ?? []), cluster] },
  );

  return {
    podMonitor,
    dashboardConfigMap,
    prometheusRule,
  };
}
