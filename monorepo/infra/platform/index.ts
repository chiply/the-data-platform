import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

import { installCertManager } from "./charts/cert-manager";
import { installMonitoring } from "./charts/monitoring";
import { installArgoCD } from "./charts/argocd";
import { installCnpg } from "./charts/cnpg";
import { installCnpgMonitoring } from "./charts/cnpg-monitoring";
import { installTempo } from "./charts/tempo";
import { installAlloy } from "./charts/alloy";
import { createAppSecrets } from "./app-secrets";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const config = new pulumi.Config();
const clusterStackRef = config.require("clusterStackRef");

// ---------------------------------------------------------------------------
// Cluster stack reference — imports kubeconfig from the cluster layer
// ---------------------------------------------------------------------------

const clusterStack = new pulumi.StackReference(clusterStackRef);

const kubeconfig = clusterStack.getOutput("kubeconfig");

const k8sProvider = new k8s.Provider("k8s-provider", {
  kubeconfig: kubeconfig.apply((kc) => kc as string),
});

// ---------------------------------------------------------------------------
// Traefik Ingress Controller
// ---------------------------------------------------------------------------
//
// Traefik is **bundled with k3s/k3d** and deployed automatically as part of
// the cluster provisioning (Layer 1). There is no need to install a separate
// ingress controller in the platform layer.
//
// k3s deploys Traefik via its built-in HelmChart controller into the
// kube-system namespace. It is available immediately after cluster creation.
//
// ### Defining Ingress resources that work with Traefik
//
// Traefik supports standard Kubernetes Ingress resources. To expose a service:
//
//   apiVersion: networking.k8s.io/v1
//   kind: Ingress
//   metadata:
//     name: my-service
//     annotations:
//       # Traefik-specific annotations (optional):
//       traefik.ingress.kubernetes.io/router.entrypoints: web,websecure
//       traefik.ingress.kubernetes.io/router.tls: "true"
//   spec:
//     rules:
//       - host: my-service.localhost   # Use *.localhost for local dev
//         http:
//           paths:
//             - path: /
//               pathType: Prefix
//               backend:
//                 service:
//                   name: my-service
//                   port:
//                     number: 80
//
// For local development with k3d, the cluster is configured with port mappings
// on 80 and 443, so *.localhost domains resolve to the Traefik ingress
// controller automatically.
//
// Traefik also supports its own IngressRoute CRD for advanced routing:
//
//   apiVersion: traefik.io/v1alpha1
//   kind: IngressRoute
//   metadata:
//     name: my-service
//   spec:
//     entryPoints:
//       - web
//     routes:
//       - match: Host(`my-service.localhost`)
//         kind: Rule
//         services:
//           - name: my-service
//             port: 80
//
// For production, replace *.localhost with your real domain and configure
// cert-manager to issue Let's Encrypt certificates.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Application Secrets (must run before ArgoCD syncs apps)
// ---------------------------------------------------------------------------
//
// Creates the "tdp" namespace and populates it with K8s Secrets sourced from
// Pulumi ESC. ArgoCD-managed Helm charts reference these secrets via
// secretKeyRef — they never store secret values in Git.
// ---------------------------------------------------------------------------

const appSecrets = createAppSecrets({
  provider: k8sProvider,
});

// ---------------------------------------------------------------------------
// Platform Charts
// ---------------------------------------------------------------------------

const certManager = installCertManager({
  provider: k8sProvider,
});

const monitoring = installMonitoring({
  provider: k8sProvider,
});

// ---------------------------------------------------------------------------
// Tempo (distributed tracing backend)
// ---------------------------------------------------------------------------

const tempo = installTempo({
  provider: k8sProvider,
  dependsOn: [monitoring],
});

// ---------------------------------------------------------------------------
// Grafana Alloy (OTLP collector — DaemonSet)
// ---------------------------------------------------------------------------

const alloy = installAlloy({
  provider: k8sProvider,
  dependsOn: [tempo],
});

// ---------------------------------------------------------------------------
// CloudNativePG (operator + Postgres Cluster)
// ---------------------------------------------------------------------------
//
// Deploys the CNPG operator into cnpg-system namespace, then creates a
// Cluster CRD in the tdp namespace with per-service databases, WAL archiving
// (non-local), and scheduled backups. Must complete before ArgoCD syncs
// application deployments that depend on database connectivity.
// ---------------------------------------------------------------------------

const cnpg = installCnpg({
  provider: k8sProvider,
  namespace: appSecrets.namespace,
  dependsOn: [appSecrets.namespace],
  clusterStackRef: clusterStack,
});

// ---------------------------------------------------------------------------
// CNPG Monitoring (PodMonitor, Grafana dashboard, PrometheusRule alerts)
// ---------------------------------------------------------------------------
//
// Wires CNPG Prometheus metrics into the monitoring stack with alerts for
// connection saturation, PVC usage, long queries, WAL archiving, and
// replication lag. Depends on both the monitoring stack and CNPG cluster.
// ---------------------------------------------------------------------------

const cnpgMonitoring = installCnpgMonitoring({
  provider: k8sProvider,
  namespace: appSecrets.namespace,
  cluster: cnpg.cluster,
  dependsOn: [monitoring, cnpg.cluster],
});

const argocd = installArgoCD({
  provider: k8sProvider,
  dependsOn: [appSecrets.namespace, cnpg.cluster],
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { kubeconfig, k8sProvider };
export const tdpNamespace = appSecrets.namespace.metadata.name;
export const dbSecretName = appSecrets.dbSecretName;
export const appSecretName = appSecrets.appSecretName;
export const certManagerStatus = certManager.status;
export const monitoringStatus = monitoring.status;
export const tempoStatus = tempo.status;
export const alloyStatus = alloy.status;
export const argocdStatus = argocd.status;
export const cnpgOperatorStatus = cnpg.operator.status;
export const cnpgClusterName = cnpg.cluster.metadata.name;
export const cnpgServiceSecrets = cnpg.serviceSecretNames;
export const cnpgPodMonitorName = cnpgMonitoring.podMonitor.metadata.name;
export const cnpgPrometheusRuleName = cnpgMonitoring.prometheusRule.metadata.name;
