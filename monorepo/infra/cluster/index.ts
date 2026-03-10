import * as pulumi from "@pulumi/pulumi";
import { createK3dCluster, K3dClusterResult } from "./providers/k3d";
import { createLinodeK3sCluster } from "./providers/linode-k3s";

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
