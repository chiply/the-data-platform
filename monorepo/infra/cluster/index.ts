import * as pulumi from "@pulumi/pulumi";
import { createK3dCluster, K3dClusterResult } from "./providers/k3d";
import { createLinodeK3sCluster } from "./providers/linode-k3s";
import { createDatabaseCredentials, DatabaseCredentialsResult } from "./database-credentials";

const config = new pulumi.Config();
const clusterType = config.require("clusterType");

let result: K3dClusterResult;

switch (clusterType) {
  case "k3d":
    result = createK3dCluster();
    break;
  case "linode-k3s":
    result = createLinodeK3sCluster();
    break;
  default:
    throw new Error(`Unsupported cluster type: ${clusterType}. Supported: k3d, linode-k3s`);
}

export const kubeconfig = result.kubeconfig;
export const registryUrl = result.registryUrl;
export const clusterName = result.clusterName;

// ---------------------------------------------------------------------------
// Database credentials (non-local only)
// ---------------------------------------------------------------------------
// Creates Object Storage bucket + keys for CNPG WAL archiving and generates
// random passwords for per-service databases. The platform stack consumes
// these outputs via stack references.

let dbCreds: DatabaseCredentialsResult | undefined;
if (clusterType !== "k3d") {
  dbCreds = createDatabaseCredentials();
}

export const walArchiveBucket = dbCreds?.walArchiveBucket;
export const walArchiveEndpoint = dbCreds?.walArchiveEndpoint;
export const walArchiveAccessKey = dbCreds?.walArchiveAccessKey;
export const walArchiveSecretKey = dbCreds?.walArchiveSecretKey
  ? pulumi.secret(dbCreds.walArchiveSecretKey)
  : undefined;
export const schemaRegistryDbPassword = dbCreds?.servicePasswords["schema-registry"]
  ? pulumi.secret(dbCreds.servicePasswords["schema-registry"])
  : undefined;
export const feedServiceDbPassword = dbCreds?.servicePasswords["feed-service"]
  ? pulumi.secret(dbCreds.servicePasswords["feed-service"])
  : undefined;
