import * as pulumi from "@pulumi/pulumi";
import * as linode from "@pulumi/linode";
import * as random from "@pulumi/random";

/**
 * Provisions Linode Object Storage resources for CNPG WAL archiving
 * and generates random database passwords for per-service databases.
 *
 * These outputs are consumed by the platform stack (Layer 2) via
 * Pulumi stack references, eliminating manual secret configuration.
 *
 * Skipped for local (k3d) clusters where WAL archiving is not used
 * and database passwords are hardcoded for development.
 */

/** Per-service database that needs a generated password. */
const SERVICE_DATABASES = ["schema-registry", "feed-service"] as const;

export interface DatabaseCredentialsResult {
  /** Object Storage bucket name. */
  walArchiveBucket?: pulumi.Output<string>;
  /** Object Storage endpoint URL. */
  walArchiveEndpoint?: pulumi.Output<string>;
  /** Object Storage access key. */
  walArchiveAccessKey?: pulumi.Output<string>;
  /** Object Storage secret key (secret). */
  walArchiveSecretKey?: pulumi.Output<string>;
  /** Per-service database passwords (secret). */
  servicePasswords: Record<string, pulumi.Output<string>>;
}

export function createDatabaseCredentials(): DatabaseCredentialsResult {
  const config = new pulumi.Config();
  const clusterName = config.require("clusterName");
  const stackName = pulumi.getStack();

  // ── Object Storage for WAL archiving ──────────────────────────────────

  const objectStorageRegion = config.get("objectStorageRegion") || "us-east-1";
  const bucketName = `${clusterName}-wal-archive`;

  const bucket = new linode.ObjectStorageBucket("wal-archive-bucket", {
    label: bucketName,
    region: objectStorageRegion,
    // Linode Object Storage doesn't require explicit cluster parameter
    // with the new region-based API
  });

  const objectStorageKey = new linode.ObjectStorageKey("wal-archive-key", {
    label: `${clusterName}-cnpg-wal-archive`,
    bucketAccesses: [
      {
        region: objectStorageRegion,
        bucketName: bucketName,
        permissions: "read_write",
      },
    ],
  });

  // ── Per-service database passwords ────────────────────────────────────

  const servicePasswords: Record<string, pulumi.Output<string>> = {};
  for (const svc of SERVICE_DATABASES) {
    const password = new random.RandomPassword(`${svc}-db-password`, {
      length: 32,
      special: false, // Avoid SQL quoting issues
    });
    servicePasswords[svc] = password.result;
  }

  return {
    walArchiveBucket: bucket.label,
    walArchiveEndpoint: pulumi.output(
      `https://${objectStorageRegion}.linodeobjects.com`,
    ),
    walArchiveAccessKey: objectStorageKey.accessKey,
    walArchiveSecretKey: objectStorageKey.secretKey,
    servicePasswords,
  };
}
