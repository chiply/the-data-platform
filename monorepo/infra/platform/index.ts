import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

const config = new pulumi.Config();
const clusterStackRef = config.require("clusterStackRef");

const clusterStack = new pulumi.StackReference(clusterStackRef);

const kubeconfig = clusterStack.getOutput("kubeconfig");

const k8sProvider = new k8s.Provider("k8s-provider", {
  kubeconfig: kubeconfig.apply((kc) => kc as string),
});

export { kubeconfig, k8sProvider };
