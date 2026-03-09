import * as pulumi from "@pulumi/pulumi";
import { createK3dCluster } from "./providers";

const config = new pulumi.Config();
const clusterType = config.require("clusterType");
const clusterName = config.require("clusterName");

switch (clusterType) {
  case "k3d":
    createK3dCluster({ clusterName });
    break;
  default:
    throw new Error(`Unsupported clusterType: ${clusterType}. Supported types: k3d`);
}

export { clusterType, clusterName };
