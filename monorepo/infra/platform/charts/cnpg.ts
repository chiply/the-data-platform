import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Installs CloudNativePG operator and provisions a PostgreSQL Cluster CRD.
 *
 * CloudNativePG is a CNCF Sandbox Kubernetes operator for PostgreSQL lifecycle
 * management (provisioning, failover, backup, monitoring). It provides WAL
 * archiving, base backups, and point-in-time recovery as native CRD configuration.
 *
 * This module handles:
 * 1. CNPG operator Helm chart deployment (into cnpg-system namespace)
 * 2. Cluster CRD creation (into tdp namespace) with:
 *    - Per-service databases via initdb
 *    - WAL archiving to Linode Object Storage (dev/production)
 *    - WAL and data encryption (AES256)
 *    - Data checksums enabled
 *    - pg_hba.conf with hostssl entries only
 *    - PostgreSQL tuning parameters
 * 3. Per-service database user K8s Secrets
 * 4. ScheduledBackup CRD for daily base backups
 *
 * Resource sizing is controlled by the `resourceTier` config key:
 * - minimal: 100m/500m CPU, 256Mi/512Mi RAM (local, dev)
 * - standard: 500m/1 CPU, 1Gi/2Gi RAM (early production)
 */

/** Resource preset for the Postgres instance. */
interface ResourceSpec {
  requests: { cpu: string; memory: string };
  limits: { cpu: string; memory: string };
}

/** PostgreSQL tuning parameters derived from resource tier. */
interface PgTuning {
  shared_buffers: string;
  effective_cache_size: string;
  max_connections: string;
}

interface CnpgPresets {
  postgres: ResourceSpec;
  operator: ResourceSpec;
  tuning: PgTuning;
}

const resourcePresets: Record<string, CnpgPresets> = {
  minimal: {
    postgres: {
      requests: { cpu: "100m", memory: "256Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    operator: {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "200m", memory: "256Mi" },
    },
    tuning: {
      shared_buffers: "128MB",        // ~25% of 512Mi limit
      effective_cache_size: "384MB",   // ~75% of 512Mi limit
      max_connections: "100",
    },
  },
  standard: {
    postgres: {
      requests: { cpu: "500m", memory: "1Gi" },
      limits: { cpu: "1000m", memory: "2Gi" },
    },
    operator: {
      requests: { cpu: "100m", memory: "128Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    tuning: {
      shared_buffers: "512MB",        // ~25% of 2Gi limit
      effective_cache_size: "1536MB",  // ~75% of 2Gi limit
      max_connections: "100",
    },
  },
};

/** Per-service database configuration. */
interface ServiceDatabase {
  /** Service name (e.g., "schema-registry"). */
  name: string;
  /** Database name (e.g., "schema_registry"). */
  database: string;
  /** Database user (e.g., "schema_registry_app"). */
  username: string;
}

export interface CnpgArgs {
  /** The Kubernetes provider to deploy into. */
  provider: k8s.Provider;
  /** The tdp namespace resource (Cluster CRD is deployed here). */
  namespace: k8s.core.v1.Namespace;
  /** Resources that must exist before CNPG is installed. */
  dependsOn?: pulumi.Resource[];
  /** Cluster stack reference for consuming WAL archive and password outputs. */
  clusterStackRef?: pulumi.StackReference;
}

export interface CnpgResult {
  /** The CNPG operator Helm release. */
  operator: k8s.helm.v3.Release;
  /** The CNPG Cluster CRD. */
  cluster: k8s.apiextensions.CustomResource;
  /** The ScheduledBackup CRD (undefined for local). */
  scheduledBackup?: k8s.apiextensions.CustomResource;
  /** Per-service database credential secret names. */
  serviceSecretNames: Record<string, pulumi.Output<string>>;
}

export function installCnpg(args: CnpgArgs): CnpgResult {
  const { provider, namespace, dependsOn, clusterStackRef } = args;

  const config = new pulumi.Config();
  const resourceTier = config.get("resourceTier") || "minimal";
  const stackName = pulumi.getStack();
  const isLocal = stackName === "local";

  const preset = resourcePresets[resourceTier] ?? resourcePresets["minimal"];

  // ---------------------------------------------------------------------------
  // CNPG configuration from stack config
  // ---------------------------------------------------------------------------

  const cnpgConfig = new pulumi.Config("cnpg");

  // Per-service databases to provision
  const serviceDatabases: ServiceDatabase[] = [
    {
      name: "schema-registry",
      database: "schema_registry",
      username: "schema_registry_app",
    },
    {
      name: "feed-service",
      database: "feed_service",
      username: "feed_service_app",
    },
  ];

  // Storage size for Postgres PVC
  const storageSize = cnpgConfig.get("storageSize") || "10Gi";

  // Backup retention (days)
  const backupRetentionDays = cnpgConfig.get("backupRetentionDays") || "7";

  // Object Storage configuration for WAL archiving (non-local only).
  // Prefer cluster stack reference outputs; fall back to cnpg config for
  // backwards compatibility or manual overrides.
  const objectStorageEndpoint = clusterStackRef
    ? clusterStackRef.getOutput("walArchiveEndpoint").apply((v) => (v as string) || "")
    : pulumi.output(cnpgConfig.get("objectStorageEndpoint") || "");
  const objectStorageBucket = clusterStackRef
    ? clusterStackRef.getOutput("walArchiveBucket").apply((v) => (v as string) || "")
    : pulumi.output(cnpgConfig.get("objectStorageBucket") || "");
  const objectStoragePath = cnpgConfig.get("objectStoragePath") || "cnpg";
  const objectStorageAccessKey = clusterStackRef
    ? clusterStackRef.getOutput("walArchiveAccessKey") as pulumi.Output<string> | undefined
    : cnpgConfig.getSecret("objectStorageAccessKey");
  const objectStorageSecretKey = clusterStackRef
    ? clusterStackRef.getOutput("walArchiveSecretKey") as pulumi.Output<string> | undefined
    : cnpgConfig.getSecret("objectStorageSecretKey");

  // Per-service database passwords.
  // Non-local: read from cluster stack reference (generated random passwords).
  // Local: use hardcoded defaults.
  const servicePasswords: Record<string, pulumi.Output<string> | string> = {};
  if (isLocal) {
    for (const svc of serviceDatabases) {
      servicePasswords[svc.name] =
        cnpgConfig.getSecret(`${svc.name}Password`) ?? `${svc.database}_local_password`;
    }
  } else if (clusterStackRef) {
    // Map service names to cluster stack output names
    const passwordOutputs: Record<string, string> = {
      "schema-registry": "schemaRegistryDbPassword",
      "feed-service": "feedServiceDbPassword",
    };
    for (const svc of serviceDatabases) {
      const outputName = passwordOutputs[svc.name];
      servicePasswords[svc.name] = clusterStackRef.getOutput(outputName).apply(
        (v) => v as string,
      );
    }
  } else {
    for (const svc of serviceDatabases) {
      servicePasswords[svc.name] = cnpgConfig.requireSecret(`${svc.name}Password`);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. CNPG Operator Helm Chart
  // ---------------------------------------------------------------------------

  const cnpgOperator = new k8s.helm.v3.Release(
    "cnpg-operator",
    {
      chart: "cloudnative-pg",
      version: "0.23.0",
      repositoryOpts: {
        repo: "https://cloudnative-pg.github.io/charts",
      },
      namespace: "cnpg-system",
      createNamespace: true,
      values: {
        resources: preset.operator,
      },
    },
    { provider, dependsOn },
  );

  // ---------------------------------------------------------------------------
  // 2. Object Storage credentials Secret (non-local only)
  // ---------------------------------------------------------------------------

  const managedLabels = {
    "app.kubernetes.io/managed-by": "pulumi",
    "app.kubernetes.io/part-of": "the-data-platform",
  };

  // Create Object Storage credentials Secret for non-local stacks.
  // When using a cluster stack reference, the bucket and keys are always
  // available (created by the cluster stack). When using manual config,
  // require the keys to be set explicitly.
  let objectStorageSecret: k8s.core.v1.Secret | undefined;
  const walArchivingEnabled = !isLocal && (clusterStackRef || cnpgConfig.get("objectStorageEndpoint"));

  if (walArchivingEnabled) {
    if (!objectStorageAccessKey || !objectStorageSecretKey) {
      throw new Error(
        "Object storage access and secret keys are required for WAL archiving. " +
        "Provide them via cluster stack reference or cnpg config.",
      );
    }
    objectStorageSecret = new k8s.core.v1.Secret(
      "cnpg-object-storage-credentials",
      {
        metadata: {
          name: "cnpg-object-storage-credentials",
          namespace: namespace.metadata.name,
          labels: managedLabels,
        },
        type: "Opaque",
        stringData: {
          ACCESS_KEY_ID: objectStorageAccessKey,
          ACCESS_SECRET_KEY: objectStorageSecretKey,
        },
      },
      { provider, dependsOn: [namespace] },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Build init SQL for per-service databases and users
  // ---------------------------------------------------------------------------

  // CNPG initdb postInitSQL creates additional databases and users
  // beyond the default database created by initdb.owner.
  const postInitSQL: pulumi.Output<string>[] = [];
  for (const svc of serviceDatabases) {
    const password = pulumi.output(servicePasswords[svc.name]);
    postInitSQL.push(
      password.apply((pw) => {
        // Use dollar-quoting to avoid SQL injection from passwords containing quotes
        const escaped = pw.replace(/'/g, "''");
        return [
          `CREATE DATABASE ${svc.database};`,
          `CREATE USER ${svc.username} WITH PASSWORD '${escaped}';`,
          `GRANT ALL PRIVILEGES ON DATABASE ${svc.database} TO ${svc.username};`,
          `ALTER DATABASE ${svc.database} OWNER TO ${svc.username};`,
        ].join("\n");
      }),
    );
  }

  const combinedPostInitSQL = pulumi.all(postInitSQL).apply((sqls) => sqls.join("\n"));

  // ---------------------------------------------------------------------------
  // 4. CNPG Cluster CRD
  // ---------------------------------------------------------------------------

  // Build pg_hba entries — hostssl only for non-local, host for local
  const pgHbaEntries = isLocal
    ? [
        "local all all peer",
        "host all all 0.0.0.0/0 md5",
        "host all all ::0/0 md5",
      ]
    : [
        "local all all peer",
        "hostssl all all 0.0.0.0/0 md5",
        "hostssl all all ::0/0 md5",
      ];

  // PostgreSQL parameters
  const pgParameters: Record<string, string> = {
    shared_buffers: preset.tuning.shared_buffers,
    effective_cache_size: preset.tuning.effective_cache_size,
    max_connections: preset.tuning.max_connections,
    wal_level: "logical",  // Enable CDC use cases
  };

  // Build the Cluster spec
  const clusterSpec: Record<string, unknown> = {
    instances: 1,
    imageName: "ghcr.io/cloudnative-pg/postgresql:16",

    postgresql: {
      parameters: pgParameters,
      pg_hba: pgHbaEntries,
    },

    bootstrap: {
      initdb: {
        dataChecksums: true,
        database: "tdp",
        owner: "tdp",
        postInitSQL: combinedPostInitSQL.apply((sql) =>
          sql.split("\n").filter((line) => line.trim() !== ""),
        ),
      },
    },

    storage: {
      size: storageSize,
    },

    resources: {
      requests: {
        cpu: preset.postgres.requests.cpu,
        memory: preset.postgres.requests.memory,
      },
      limits: {
        cpu: preset.postgres.limits.cpu,
        memory: preset.postgres.limits.memory,
      },
    },
  };

  // Add WAL archiving for non-local environments
  if (walArchivingEnabled && objectStorageSecret) {
    const barmanObjectStore: Record<string, unknown> = {
      destinationPath: pulumi.interpolate`s3://${objectStorageBucket}/${objectStoragePath}`,
      endpointURL: objectStorageEndpoint,
      s3Credentials: {
        accessKeyId: {
          name: objectStorageSecret.metadata.name,
          key: "ACCESS_KEY_ID",
        },
        secretAccessKey: {
          name: objectStorageSecret.metadata.name,
          key: "ACCESS_SECRET_KEY",
        },
      },
      wal: {
        compression: "gzip",
        encryption: "AES256",
      },
      data: {
        compression: "gzip",
        encryption: "AES256",
      },
    };

    (clusterSpec as Record<string, unknown>).backup = {
      barmanObjectStore,
      retentionPolicy: `${backupRetentionDays}d`,
    };
  }

  const cnpgCluster = new k8s.apiextensions.CustomResource(
    "cnpg-cluster",
    {
      apiVersion: "postgresql.cnpg.io/v1",
      kind: "Cluster",
      metadata: {
        name: "tdp-postgres",
        namespace: namespace.metadata.name,
        labels: managedLabels,
      },
      spec: clusterSpec,
    },
    { provider, dependsOn: [cnpgOperator, namespace] },
  );

  // ---------------------------------------------------------------------------
  // 5. Per-service database credential Secrets
  // ---------------------------------------------------------------------------

  const serviceSecretNames: Record<string, pulumi.Output<string>> = {};
  for (const svc of serviceDatabases) {
    const secretName = `tdp-${svc.name}-db-credentials`;
    const password = pulumi.output(servicePasswords[svc.name]);

    const svcSecret = new k8s.core.v1.Secret(
      secretName,
      {
        metadata: {
          name: secretName,
          namespace: namespace.metadata.name,
          labels: managedLabels,
        },
        type: "Opaque",
        stringData: {
          host: "tdp-postgres-rw.tdp.svc.cluster.local",
          port: "5432",
          database: svc.database,
          username: svc.username,
          password: password,
          sslmode: isLocal ? "disable" : "verify-full",
        },
      },
      { provider, dependsOn: [namespace, cnpgCluster] },
    );

    serviceSecretNames[svc.name] = svcSecret.metadata.name;
  }

  // ---------------------------------------------------------------------------
  // 6. ScheduledBackup CRD (non-local only)
  // ---------------------------------------------------------------------------

  let scheduledBackup: k8s.apiextensions.CustomResource | undefined;
  if (walArchivingEnabled) {
    scheduledBackup = new k8s.apiextensions.CustomResource(
      "cnpg-scheduled-backup",
      {
        apiVersion: "postgresql.cnpg.io/v1",
        kind: "ScheduledBackup",
        metadata: {
          name: "tdp-postgres-daily-backup",
          namespace: namespace.metadata.name,
          labels: managedLabels,
        },
        spec: {
          schedule: "0 0 2 * * *",  // Daily at 02:00 UTC
          backupOwnerReference: "cluster",
          cluster: {
            name: "tdp-postgres",
          },
        },
      },
      { provider, dependsOn: [cnpgCluster] },
    );
  }

  return {
    operator: cnpgOperator,
    cluster: cnpgCluster,
    scheduledBackup,
    serviceSecretNames,
  };
}
