import * as pulumi from "@pulumi/pulumi";
import * as linode from "@pulumi/linode";
import * as command from "@pulumi/command";
import { K3dClusterResult } from "./k3d";

/**
 * Linode k3s cluster provider for production Kubernetes.
 *
 * Creates a Linode instance with k3s installed via the official installer,
 * configures firewall rules for HTTP (80), HTTPS (443), and K8s API (6443),
 * and exports a kubeconfig for cluster access.
 */

/** Re-use the same result interface so the dispatch in index.ts is uniform. */
export type LinodeK3sClusterResult = K3dClusterResult;

export function createLinodeK3sCluster(): LinodeK3sClusterResult {
  const config = new pulumi.Config();
  const clusterName = config.get("clusterName") || "tdp-production";
  const region = config.get("linodeRegion") || "us-east";
  const instanceType = config.get("linodeInstanceType") || "g6-standard-2"; // Linode 4GB/2CPU
  const image = config.get("linodeImage") || "linode/ubuntu22.04";
  const rootPassword = config.requireSecret("linodeRootPassword");

  // ── Firewall ──────────────────────────────────────────────────────────
  // Allow inbound traffic on ports required by the cluster:
  //   80  – HTTP ingress
  //  443  – HTTPS ingress
  // 6443  – Kubernetes API server
  const firewall = new linode.Firewall("k3s-firewall", {
    label: `${clusterName}-fw`,
    inbounds: [
      {
        // TODO: restrict to known IPs (CI/CD, VPN) before production use
        label: "allow-ssh",
        action: "ACCEPT",
        protocol: "TCP",
        ports: "22",
        ipv4s: ["0.0.0.0/0"],
        ipv6s: ["::/0"],
      },
      {
        label: "allow-http",
        action: "ACCEPT",
        protocol: "TCP",
        ports: "80",
        ipv4s: ["0.0.0.0/0"],
        ipv6s: ["::/0"],
      },
      {
        label: "allow-https",
        action: "ACCEPT",
        protocol: "TCP",
        ports: "443",
        ipv4s: ["0.0.0.0/0"],
        ipv6s: ["::/0"],
      },
      {
        // TODO: restrict to known IPs (CI/CD, VPN) before production use
        label: "allow-k8s-api",
        action: "ACCEPT",
        protocol: "TCP",
        ports: "6443",
        ipv4s: ["0.0.0.0/0"],
        ipv6s: ["::/0"],
      },
    ],
    inboundPolicy: "DROP",
    outboundPolicy: "ACCEPT",
  });

  // ── Linode Instance ───────────────────────────────────────────────────
  const instance = new linode.Instance(
    "k3s-server",
    {
      label: clusterName,
      region: region,
      type: instanceType,
      image: image,
      rootPass: rootPassword,
      authorizedUsers: [],
      firewallId: firewall.id.apply((id) => Number(id)),
      tags: ["k3s", "tdp"],
    },
  );

  // ── Install k3s via remote command ────────────────────────────────────
  const installK3s = new command.remote.Command(
    "install-k3s",
    {
      connection: {
        host: instance.ipAddress,
        user: "root",
        password: rootPassword,
      },
      create: pulumi.interpolate`curl -sfL https://get.k3s.io | sh -s - --tls-san ${instance.ipAddress}`,
    },
    { dependsOn: [instance] },
  );

  // ── Retrieve kubeconfig ───────────────────────────────────────────────
  // Read the k3s kubeconfig and rewrite the server address to the public IP
  // so it is usable from outside the node.
  const kubeconfig = new command.remote.Command(
    "get-kubeconfig",
    {
      connection: {
        host: instance.ipAddress,
        user: "root",
        password: rootPassword,
      },
      create: pulumi.interpolate`for i in $(seq 1 30); do [ -f /etc/rancher/k3s/k3s.yaml ] && systemctl is-active --quiet k3s && break; sleep 2; done && cat /etc/rancher/k3s/k3s.yaml | sed "s/127.0.0.1/${instance.ipAddress}/g"`,
    },
    { dependsOn: [installK3s] },
  );

  return {
    kubeconfig: kubeconfig.stdout,
    // No local registry in production — return empty string.
    registryUrl: pulumi.output(""),
    clusterName: pulumi.output(clusterName),
  };
}
