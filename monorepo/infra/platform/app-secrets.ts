import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Application Secrets Management
 *
 * Creates Kubernetes Secrets in the application namespace ("tdp") from values
 * stored in Pulumi ESC. This is a Layer 2 concern — Pulumi owns the Secret
 * objects; ArgoCD does not manage them.
 *
 * Secret lifecycle:
 *   1. Secrets are defined in Pulumi ESC environments (tdp/dev, tdp/production)
 *      using fn::secret for encryption at rest.
 *   2. Stack configs (Pulumi.dev.yaml, Pulumi.production.yaml) import the ESC
 *      environment, making secrets available via pulumi.Config.
 *   3. This module reads those secrets and creates K8s Secret resources in the
 *      "tdp" namespace during `pulumi up` (platform bootstrap).
 *   4. Helm charts deployed by ArgoCD reference the secrets via secretKeyRef.
 *
 * For local development, all secrets fall back to sensible defaults so
 * developers can run without ESC.
 */

export interface AppSecretsArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
}

export interface AppSecretsResult {
  /** The "tdp" namespace resource (other components can depend on this). */
  namespace: k8s.core.v1.Namespace;
  /** Name of the K8s Secret containing database credentials. */
  dbSecretName: pulumi.Output<string>;
  /** Name of the K8s Secret containing application credentials. */
  appSecretName: pulumi.Output<string>;
  /** Name of the K8s Secret for GHCR image pulls (undefined if not configured). */
  ghcrSecretName?: pulumi.Output<string>;
}

export function createAppSecrets(args: AppSecretsArgs): AppSecretsResult {
  const { provider } = args;
  const config = new pulumi.Config();

  // ---------------------------------------------------------------------------
  // Application namespace
  // ---------------------------------------------------------------------------

  const tdpNamespace = new k8s.core.v1.Namespace(
    "tdp-namespace",
    {
      metadata: {
        name: "tdp",
        labels: {
          "app.kubernetes.io/managed-by": "pulumi",
          "app.kubernetes.io/part-of": "the-data-platform",
        },
      },
    },
    { provider },
  );

  // ---------------------------------------------------------------------------
  // Read secrets from config (with local-friendly defaults)
  // ---------------------------------------------------------------------------
  // Uses config.getSecret() to avoid leaking secret values to plaintext state.
  // For local development, all secrets fall back to hardcoded defaults.

  // Database credentials
  const dbHost = config.get("dbHost") || "localhost";
  const dbPort = config.get("dbPort") || "5432";
  const dbName = config.get("dbName") || "tdp";
  const dbUsername = config.get("dbUsername") || "tdp";
  const dbPassword = config.getSecret("dbPassword") ?? "local-dev-password";

  // Application-level secrets
  const apiKey = config.getSecret("appApiKey") ?? "local-dev-api-key";
  const sessionSecret =
    config.getSecret("appSessionSecret") ?? "local-dev-session-secret";

  // ---------------------------------------------------------------------------
  // Kubernetes Secrets
  // ---------------------------------------------------------------------------

  const managedLabels = {
    "app.kubernetes.io/managed-by": "pulumi",
    "app.kubernetes.io/part-of": "the-data-platform",
  };

  const dbSecret = new k8s.core.v1.Secret(
    "tdp-db-credentials",
    {
      metadata: {
        name: "tdp-db-credentials",
        namespace: tdpNamespace.metadata.name,
        labels: managedLabels,
      },
      type: "Opaque",
      stringData: {
        host: dbHost,
        port: dbPort,
        database: dbName,
        username: dbUsername,
        password: pulumi.output(dbPassword),
      },
    },
    { provider, dependsOn: [tdpNamespace] },
  );

  const appSecret = new k8s.core.v1.Secret(
    "tdp-app-credentials",
    {
      metadata: {
        name: "tdp-app-credentials",
        namespace: tdpNamespace.metadata.name,
        labels: managedLabels,
      },
      type: "Opaque",
      stringData: {
        apiKey: pulumi.output(apiKey),
        sessionSecret: pulumi.output(sessionSecret),
      },
    },
    { provider, dependsOn: [tdpNamespace] },
  );

  // GHCR image pull secret for non-local environments.
  // In dev/production, ArgoCD-deployed pods need credentials to pull from ghcr.io.
  const ghcrToken = config.getSecret("ghcrToken");
  const ghcrUsername = config.get("ghcrUsername") || "";

  let ghcrSecretName: pulumi.Output<string> | undefined;
  if (ghcrUsername && ghcrToken) {
    const dockerConfigJson = pulumi.output(ghcrToken).apply((token) =>
      JSON.stringify({
        auths: {
          "ghcr.io": {
            username: ghcrUsername,
            password: token,
            auth: Buffer.from(`${ghcrUsername}:${token}`).toString("base64"),
          },
        },
      }),
    );

    const ghcrSecret = new k8s.core.v1.Secret(
      "ghcr-credentials",
      {
        metadata: {
          name: "ghcr-credentials",
          namespace: tdpNamespace.metadata.name,
          labels: managedLabels,
        },
        type: "kubernetes.io/dockerconfigjson",
        stringData: {
          ".dockerconfigjson": dockerConfigJson,
        },
      },
      { provider, dependsOn: [tdpNamespace] },
    );
    ghcrSecretName = ghcrSecret.metadata.name;
  }

  return {
    namespace: tdpNamespace,
    dbSecretName: dbSecret.metadata.name,
    appSecretName: appSecret.metadata.name,
    ghcrSecretName,
  };
}
