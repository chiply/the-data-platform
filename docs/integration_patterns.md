# Integration Patterns

## Communication Protocols in the Platform

### REST (Synchronous HTTP)

Used for service-to-service APIs. The schema registry is a FastAPI service with
OpenAPI contracts, and services communicate via K8s service discovery + Traefik
ingress. Standards specify **OpenAPI** for synchronous interfaces and **AsyncAPI**
for asynchronous/event-driven ones.

### gRPC

Not directly authored by platform services (yet), but used internally by both
orchestration engines:

- **Dagster**: gRPC internally between daemon, webserver, and user code servers.
  Exposes a GraphQL API externally for its web UI and programmatic access.
- **Temporal**: gRPC throughout. The server exposes a gRPC frontend service,
  workers poll for tasks over gRPC, and the Web UI connects via gRPC-Web. There
  is no REST API in the core path.

### Kafka

Not currently selected. The async/event-driven story is built around Temporal +
CloudEvents, not Kafka. Kafka would be introduced if the platform needs
high-throughput event streaming or fan-out to multiple independent consumers.

## Orchestration: Temporal vs Kafka

These represent fundamentally different coordination models.

### Temporal — Orchestration (Imperative)

| Aspect              | Detail                                                                                  |
|----------------------|----------------------------------------------------------------------------------------|
| **Model**            | Orchestration — a central workflow function defines the sequence of steps               |
| **Primitive**        | Workflow (a durable function)                                                           |
| **State**            | Workflow has durable local state, event-sourced via its execution history                |
| **Queue semantics**  | Task queues: server assigns tasks to polling workers. Tasks are dispatched, executed, and results recorded — they are not persistent messages |
| **Concurrency**      | Controlled per task queue (max concurrent activities/workflows per worker)               |
| **Retry / failure**  | Built-in: retry policies, timeouts, heartbeats, compensation (sagas) — declarative in workflow code |
| **Ordering**         | Workflow steps execute in defined order; parallelism is explicit (`Promise.all`, `asyncio.gather`) |
| **Use case**         | "Do X, then Y, if Y fails do Z, wait for human approval, then do W"                    |

Temporal replaces the pattern where you would use Kafka + a state machine + a
database + retry logic + a dead letter queue to coordinate multi-step work. It
provides durable execution — the workflow function suspends and resumes across
failures, deploys, and restarts. The "queue" in Temporal is a task dispatch
mechanism, not a message log.

### Kafka — Choreography (Reactive)

| Aspect              | Detail                                                                                  |
|----------------------|----------------------------------------------------------------------------------------|
| **Model**            | Choreography — no central coordinator; each consumer reacts independently               |
| **Primitive**        | Topic + Consumer Group                                                                  |
| **State**            | Stateless consumers; state lives in your DB or Kafka Streams state stores               |
| **Queue semantics**  | Partitioned commit log: messages are durably appended and consumers track offsets. Messages persist independent of consumption |
| **Concurrency**      | Controlled by partition count — max parallelism = number of partitions in a topic        |
| **Retry / failure**  | Application-managed: dead letter queues, retry topics, idempotent consumers              |
| **Ordering**         | Per-partition ordering only; cross-partition ordering requires application logic          |
| **Use case**         | "When event A happens, services B, C, D each react independently"                       |

Kafka is a distributed commit log. It excels at high-throughput event streaming,
fan-out to multiple independent consumers, and replay.

### How This Maps to the Platform

Temporal handles **coordinated multi-step processes** (e.g., fetch feed → extract
content → run summarization → store results, with retries and timeouts at each
step). If Kafka were added, it would serve **event streaming** — broadcasting
events like "new content ingested" to multiple independent consumers (search
indexer, notification service, analytics) without a central workflow coordinating
them.

The intelligent broker + CloudEvents layer could sit on top of either transport.
The current design uses Temporal as the primary async backbone.

## Enterprise Integration Patterns in Play

Mapped to the classic Hohpe/Woolf taxonomy:

| Pattern                    | Implementation                                                              |
|----------------------------|----------------------------------------------------------------------------|
| **Process Manager**        | Temporal workflows — stateful orchestration of multi-step processes          |
| **Message Translator**     | Intelligent broker — schema-to-schema transformation between services       |
| **Content-Based Router**   | Broker routing events based on schema/type                                  |
| **Canonical Data Model**   | Partial: schema registry + Avro/Protobuf, but the broker avoids requiring a single canonical schema in favor of pairwise mappings |
| **Request-Reply**          | REST/OpenAPI services (schema registry, feed reader API)                    |
| **Pipes and Filters**      | Dagster asset pipeline — each asset is a filter/transformation stage        |

### Patterns Not Yet in Play

These would arrive with Kafka or a similar message broker:

- **Publish-Subscribe** — fan-out to multiple independent consumers
- **Competing Consumers** — multiple instances consuming from the same partition/queue
- **Dead Letter Channel** — unprocessable message routing
