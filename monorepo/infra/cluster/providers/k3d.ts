import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";

export interface K3dClusterArgs {
  clusterName: string;
}

/**
 * Provisions a local k3d Kubernetes cluster using the Pulumi Command provider.
 */
export function createK3dCluster(args: K3dClusterArgs): command.local.Command {
  const cluster = new command.local.Command("k3d-cluster", {
    create: `k3d cluster create ${args.clusterName} --wait`,
    delete: `k3d cluster delete ${args.clusterName}`,
  });

  return cluster;
}
