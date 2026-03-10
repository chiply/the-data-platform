import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Resource limits/requests for a container.
 */
export interface ResourceRequirements {
    cpu: string;
    memory: string;
}

/**
 * Container resource configuration (requests and limits).
 */
export interface ContainerResources {
    requests: ResourceRequirements;
    limits: ResourceRequirements;
}

/**
 * Ingress configuration for a ServiceDeployment.
 */
export interface IngressConfig {
    host: string;
    tls?: boolean;
}

/**
 * Input arguments for the ServiceDeployment component.
 */
export interface ServiceDeploymentArgs {
    /** Container image (e.g. "nginx:1.25") */
    image: pulumi.Input<string>;
    /** Container port to expose */
    port: pulumi.Input<number>;
    /** Number of pod replicas (default: 1) */
    replicas?: pulumi.Input<number>;
    /** Environment variables as key-value pairs */
    env?: pulumi.Input<Record<string, pulumi.Input<string>>>;
    /** Container resource requests/limits */
    resources?: ContainerResources;
    /** Optional ingress configuration */
    ingress?: IngressConfig;
    /** Kubernetes provider to use */
    provider?: k8s.Provider;
}

/**
 * ServiceDeployment encapsulates a Kubernetes Deployment + Service +
 * optional Ingress as a reusable Pulumi ComponentResource.
 *
 * Applies consistent app.kubernetes.io/* labels across all resources.
 */
export class ServiceDeployment extends pulumi.ComponentResource {
    /** The underlying Kubernetes Deployment */
    public readonly deployment: k8s.apps.v1.Deployment;
    /** The underlying Kubernetes Service */
    public readonly service: k8s.core.v1.Service;
    /** The underlying Kubernetes Ingress (if configured) */
    public readonly ingress?: k8s.networking.v1.Ingress;

    constructor(
        name: string,
        args: ServiceDeploymentArgs,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super("tdp:components:ServiceDeployment", name, args, opts);

        const labels: Record<string, string> = {
            "app.kubernetes.io/name": name,
            "app.kubernetes.io/part-of": "the-data-platform",
            "app.kubernetes.io/managed-by": "pulumi",
        };

        const providerOpts: pulumi.CustomResourceOptions = {
            parent: this,
            ...(args.provider ? { provider: args.provider } : {}),
        };

        // Build environment variable array from the env map
        const envVars = args.env
            ? pulumi.output(args.env).apply((envMap) =>
                  Object.entries(envMap).map(([key, value]) => ({
                      name: key,
                      value,
                  })),
              )
            : undefined;

        // Build container resources spec
        const containerResources = args.resources
            ? {
                  requests: {
                      cpu: args.resources.requests.cpu,
                      memory: args.resources.requests.memory,
                  },
                  limits: {
                      cpu: args.resources.limits.cpu,
                      memory: args.resources.limits.memory,
                  },
              }
            : undefined;

        // --- Deployment ---
        this.deployment = new k8s.apps.v1.Deployment(
            `${name}-deployment`,
            {
                metadata: { labels },
                spec: {
                    replicas: args.replicas ?? 1,
                    selector: { matchLabels: labels },
                    template: {
                        metadata: { labels },
                        spec: {
                            containers: [
                                {
                                    name,
                                    image: args.image,
                                    ports: [
                                        { containerPort: args.port },
                                    ],
                                    env: envVars,
                                    resources: containerResources,
                                },
                            ],
                        },
                    },
                },
            },
            providerOpts,
        );

        // --- Service ---
        this.service = new k8s.core.v1.Service(
            `${name}-service`,
            {
                metadata: { labels },
                spec: {
                    selector: labels,
                    ports: [
                        {
                            port: args.port,
                            targetPort: args.port,
                        },
                    ],
                },
            },
            providerOpts,
        );

        // --- Ingress (optional) ---
        if (args.ingress) {
            const ingressTls = args.ingress.tls
                ? [
                      {
                          hosts: [args.ingress.host],
                          secretName: `${name}-tls`,
                      },
                  ]
                : undefined;

            this.ingress = new k8s.networking.v1.Ingress(
                `${name}-ingress`,
                {
                    metadata: {
                        labels,
                    },
                    spec: {
                        ingressClassName: "traefik",
                        tls: ingressTls,
                        rules: [
                            {
                                host: args.ingress.host,
                                http: {
                                    paths: [
                                        {
                                            path: "/",
                                            pathType: "Prefix",
                                            backend: {
                                                service: {
                                                    name: this.service.metadata.name,
                                                    port: {
                                                        number: args.port,
                                                    },
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
                providerOpts,
            );
        }

        this.registerOutputs({
            deployment: this.deployment,
            service: this.service,
            ingress: this.ingress,
        });
    }
}
