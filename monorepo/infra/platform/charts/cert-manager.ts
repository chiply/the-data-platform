import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Installs cert-manager via Helm chart.
 *
 * cert-manager automates the management and issuance of TLS certificates.
 *
 * This module only installs the cert-manager chart and its CRDs; it does not
 * create any Issuer or ClusterIssuer resources. Those must be defined
 * separately if needed.
 *
 * installCRDs is set to true so that Certificate, Issuer, and ClusterIssuer
 * CRDs are created automatically during the Helm install.
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

/** Resource presets keyed by tier. */
const resourcePresets: Record<string, { controller: ResourceSpec; webhook: ResourceSpec; cainjector: ResourceSpec }> = {
  minimal: {
    controller: {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
    webhook: {
      requests: { cpu: "25m", memory: "32Mi" },
      limits: { cpu: "100m", memory: "128Mi" },
    },
    cainjector: {
      requests: { cpu: "25m", memory: "64Mi" },
      limits: { cpu: "100m", memory: "256Mi" },
    },
  },
  standard: {
    controller: {
      requests: { cpu: "100m", memory: "128Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    webhook: {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
    cainjector: {
      requests: { cpu: "50m", memory: "128Mi" },
      limits: { cpu: "200m", memory: "512Mi" },
    },
  },
};

export interface CertManagerArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
}

export function installCertManager(args: CertManagerArgs): k8s.helm.v3.Release {
  const { provider } = args;

  const config = new pulumi.Config();
  const resourceTier = config.get("resourceTier") || "minimal";
  const preset = resourcePresets[resourceTier] ?? resourcePresets["minimal"];

  const certManager = new k8s.helm.v3.Release(
    "cert-manager",
    {
      chart: "cert-manager",
      version: "v1.17.1",
      repositoryOpts: {
        repo: "https://charts.jetstack.io",
      },
      namespace: "cert-manager",
      createNamespace: true,
      values: {
        installCRDs: true,
        resources: preset.controller,
        webhook: {
          resources: preset.webhook,
        },
        cainjector: {
          resources: preset.cainjector,
        },
      },
    },
    { provider },
  );

  return certManager;
}
