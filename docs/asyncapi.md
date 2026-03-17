# AsyncAPI and The Data Platform

## What AsyncAPI Is

AsyncAPI is the event-driven counterpart to OpenAPI. It's a spec for describing **message-driven interfaces** — what channels exist, what messages flow through them, what the payloads look like, and which protocol carries them. Key concepts:

- **Channels** — named pathways (e.g., `feed/items/new`)
- **Operations** — send or receive actions on channels
- **Messages** — payload schemas (Avro, Protobuf, JSON Schema)
- **Bindings** — protocol-specific config (Kafka, AMQP, NATS, etc.)
- **Servers** — connection endpoints

## Where It Fits

AsyncAPI is an **interface description language**, not an orchestration framework. It answers: "what messages does service X publish/consume, on what channels, with what schema?"

### Schema Registry Integration

AsyncAPI docs reference Avro/Protobuf schemas. Each service publishes an `asyncapi.yaml` describing its event contracts.

### CloudEvents + AsyncAPI

CloudEvents defines the envelope; AsyncAPI defines the full channel/message contract including those envelopes.

### Intelligent Broker

The broker's schema-to-schema transformation mappings could be documented/validated against AsyncAPI definitions on both sides.

### Contract Testing

AsyncAPI specs become the basis for consumer/producer contract tests.

### SDK Generation

The AsyncAPI Generator + Modelina can produce typed message classes from specs, similar to how we generate client SDKs from OpenAPI.

## Where It Does NOT Fit

AsyncAPI describes interfaces, it doesn't execute them.

- **Dagster ops/assets** — Batch computations with inputs/outputs defined by Dagster's type system. Dagster has its own metadata, lineage (OpenLineage), and IO managers. AsyncAPI doesn't have a concept of "batch asset materialization."
- **Temporal workflows/activities** — Temporal uses code-defined workflow/activity interfaces with typed inputs/outputs. Temporal's contract is the workflow/activity function signature, not a message channel.

### Boundary Layer

The overlap is at the **boundaries** where orchestrators interact with the message layer:

- A **Temporal activity** that publishes an event to Kafka → the Kafka topic's contract is described by AsyncAPI
- A **Dagster sensor** that triggers on a Kafka message → the message it consumes is described by AsyncAPI
- A **Temporal workflow** triggered by an incoming event → the event's contract is AsyncAPI

```
┌──────────────┐    AsyncAPI     ┌──────────────┐    AsyncAPI     ┌──────────────┐
│  Service A   │───describes────▶│  Kafka/NATS  │◀───describes────│  Service B   │
│  (publishes) │    contract     │   Channel    │    contract     │  (consumes)  │
└──────────────┘                 └──────────────┘                 └──────────────┘
       │                                                                 │
  Could be a                                                       Could be a
  Temporal activity                                               Dagster sensor
  or Dagster asset                                                or Temporal workflow
```

## Practical Application

1. **Put `asyncapi.yaml` files alongside services in `monorepo/services/<name>/`** — each service declares what it publishes/consumes
2. **Reference schemas from `monorepo/schemas/`** — AsyncAPI supports `$ref` to external Avro/Protobuf schemas
3. **Use AsyncAPI for contract tests** — validate that a service's actual messages conform to its declared AsyncAPI spec
4. **Use Modelina for codegen** — generate typed Python message classes from AsyncAPI specs
5. **Don't shoehorn Dagster/Temporal internals into AsyncAPI** — use it only at the message boundary layer

## Decision

AsyncAPI describes the "wires" between services. Dagster and Temporal are the "engines" inside services. They interact at the boundary (events in/out), but AsyncAPI doesn't replace or wrap their internal interfaces. Given that the platform primarily uses Dagster and Temporal for orchestration directly rather than relying on message brokers like Kafka, AsyncAPI's applicability is limited to the cases where services do communicate via message channels.
