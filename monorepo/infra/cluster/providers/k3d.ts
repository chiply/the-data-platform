import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";

/**
 * k3d cluster provider for local Kubernetes development.
 *
 * Creates a k3d cluster with:
 * - A local container registry (k3d-{name}-registry on port 5111)
 * - Port mappings for Traefik ingress (80, 443)
 * - Configurable worker node count (default: 2)
 *
 * The cluster uses k3s under the hood, which bundles Traefik as its
 * ingress controller and Klipper as its service load balancer.
 */

export interface K3dClusterResult {
  /** The kubeconfig for connecting to the cluster */
  kubeconfig: pulumi.Output<string>;
  /** The URL of the local container registry */
  registryUrl: pulumi.Output<string>;
  /** The name of the created cluster */
  clusterName: pulumi.Output<string>;
}

export function createK3dCluster(): K3dClusterResult {
  const config = new pulumi.Config();
  const clusterName = config.get("clusterName") || "tdp-local";
  const workerCount = config.getNumber("workerCount") ?? 2;
  const registryName = `${clusterName}-registry`;
  const registryPort = 5111;

  // Create the local container registry.
  // k3d registry create creates a Docker container running a registry on the specified port.
  const registry = new command.local.Command("k3d-registry", {
    create: `k3d registry create ${registryName} --port ${registryPort}`,
    delete: `k3d registry delete k3d-${registryName}`,
  });

  // Create the k3d cluster with the registry connected and port mappings for ingress.
  // Port 80 and 443 are mapped from the host to the k3d load balancer (serverlb)
  // so that Traefik ingress is accessible on localhost:80 and localhost:443.
  const cluster = new command.local.Command(
    "k3d-cluster",
    {
      create: pulumi.interpolate`k3d cluster create ${clusterName} \
        --agents ${workerCount} \
        --registry-use k3d-${registryName}:${registryPort} \
        --port "80:80@loadbalancer" \
        --port "443:443@loadbalancer" \
        --wait`,
      delete: `k3d cluster delete ${clusterName}`,
    },
    { dependsOn: [registry] },
  );

  // Retrieve the kubeconfig for the created cluster.
  // k3d kubeconfig get outputs the kubeconfig YAML that can be used
  // by kubectl and other Kubernetes clients to connect to the cluster.
  const kubeconfig = new command.local.Command(
    "k3d-kubeconfig",
    {
      create: `k3d kubeconfig get ${clusterName}`,
      // No delete needed — kubeconfig is ephemeral and removed when the cluster is deleted.
    },
    { dependsOn: [cluster] },
  );

  return {
    kubeconfig: kubeconfig.stdout,
    registryUrl: pulumi.output(`k3d-${registryName}:${registryPort}`),
    clusterName: pulumi.output(clusterName),
  };
}
