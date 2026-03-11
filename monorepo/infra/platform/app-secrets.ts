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

  // Database credentials
  const dbHost = config.get("dbHost") || "localhost";
  const dbPort = config.get("dbPort") || "5432";
  const dbName = config.get("dbName") || "tdp";
  const dbUsername = config.get("dbUsername") || "tdp";
  const dbPassword: pulumi.Output<string> | string = config.get("dbPassword")
    ? config.requireSecret("dbPassword")
    : "local-dev-password";

  // Application-level secrets
  const apiKey: pulumi.Output<string> | string = config.get("appApiKey")
    ? config.requireSecret("appApiKey")
    : "local-dev-api-key";
  const sessionSecret: pulumi.Output<string> | string = config.get(
    "appSessionSecret",
  )
    ? config.requireSecret("appSessionSecret")
    : "local-dev-session-secret";

  // ---------------------------------------------------------------------------
  // Kubernetes Secrets
  // ---------------------------------------------------------------------------

  const dbSecret = new k8s.core.v1.Secret(
    "tdp-db-credentials",
    {
      metadata: {
        name: "tdp-db-credentials",
        namespace: tdpNamespace.metadata.name,
        labels: {
          "app.kubernetes.io/managed-by": "pulumi",
          "app.kubernetes.io/part-of": "the-data-platform",
        },
      },
      type: "Opaque",
      stringData: {
        host: dbHost,
        port: dbPort,
        database: dbName,
        username: dbUsername,
        password: pulumi.output(dbPassword).apply((v) => v),
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
        labels: {
          "app.kubernetes.io/managed-by": "pulumi",
          "app.kubernetes.io/part-of": "the-data-platform",
        },
      },
      type: "Opaque",
      stringData: {
        apiKey: pulumi.output(apiKey).apply((v) => v),
        sessionSecret: pulumi.output(sessionSecret).apply((v) => v),
      },
    },
    { provider, dependsOn: [tdpNamespace] },
  );

  return {
    namespace: tdpNamespace,
    dbSecretName: dbSecret.metadata.name,
    appSecretName: appSecret.metadata.name,
  };
}
