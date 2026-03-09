import * as k8s from "@pulumi/kubernetes";

/**
 * Installs cert-manager via Helm chart.
 *
 * cert-manager automates the management and issuance of TLS certificates.
 * - Local: uses self-signed issuers (no external DNS or ACME needed)
 * - Production: uses Let's Encrypt via ACME HTTP-01 or DNS-01 challenges
 *
 * installCRDs is set to true so that Certificate, Issuer, and ClusterIssuer
 * CRDs are created automatically during the Helm install.
 */
export interface CertManagerArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
  /** Environment name ("local" or "production") for resource sizing. */
  environment: string;
}

export function installCertManager(args: CertManagerArgs): k8s.helm.v3.Release {
  const { provider, environment } = args;

  const isLocal = environment === "local";

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
        resources: isLocal
          ? {
              requests: { cpu: "50m", memory: "64Mi" },
              limits: { cpu: "200m", memory: "256Mi" },
            }
          : {
              requests: { cpu: "100m", memory: "128Mi" },
              limits: { cpu: "500m", memory: "512Mi" },
            },
        webhook: {
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
        cainjector: {
          resources: isLocal
            ? {
                requests: { cpu: "25m", memory: "64Mi" },
                limits: { cpu: "100m", memory: "256Mi" },
              }
            : {
                requests: { cpu: "50m", memory: "128Mi" },
                limits: { cpu: "200m", memory: "512Mi" },
              },
        },
      },
    },
    { provider },
  );

  return certManager;
}
