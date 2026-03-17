# Change Data Capture (CDC)

> Research notes on adopting CDC as a platform capability for the data platform.

---

## Overview

Change Data Capture captures row-level changes (inserts, updates, deletes) from a database's
write-ahead log (WAL) and streams them as events. Any application that writes to a database
produces a CDC stream — no application code changes required.

---

## Tooling

### Debezium

[Debezium](https://debezium.io/) is the industry-standard open-source CDC platform. It reads
PostgreSQL's WAL via logical replication slots and emits structured change events.

Key properties:

- Emits CloudEvents-compatible envelopes (aligns with platform standards)
- Supports Avro and Protobuf schema encoding (aligns with platform schema languages)
- Integrates with schema registries for schema evolution
- Runs as Kafka Connect connectors or as a standalone embedded engine
- Supports PostgreSQL, MySQL, MongoDB, SQL Server, and others

### PostgreSQL Native Logical Replication

PostgreSQL supports logical replication natively via `pgoutput` or `wal2json` output plugins.
This is lower-level than Debezium — you'd build your own consumer and transformation layer.
Debezium is preferred unless there's a specific reason to go lower-level.

---

## Storage Backends

CDC data has different query patterns at different time horizons. A two-tier approach serves
both real-time and historical needs.

### Real-Time Tier: Kafka / Redpanda

| Property | Detail |
|----------|--------|
| Role | Durable log for CDC events with fan-out to multiple consumers |
| Retention | Hours to days (configurable) |
| Query pattern | Stream consumption, real-time reactions |
| Open-source option | [Redpanda](https://redpanda.com/) — Kafka API-compatible, single binary, no ZooKeeper |

### Historical / Analytical Tier

| Backend | Best For | Notes |
|---------|----------|-------|
| **Apache Iceberg** (on object storage) | Long-term analytical queries, time-travel, temporal joins | Open table format, works with any query engine (Spark, Trino, DuckDB) |
| **ClickHouse** | Real-time analytical queries, high-cardinality filtering | Excellent for event-style data, columnar storage |
| **PostgreSQL** (separate instance) | Simple queryable audit log without analytical scale | Simplest option but least scalable |

### Recommended Architecture

```
PostgreSQL (app DB)
    | WAL
    v
Debezium (CDC connector)
    | CloudEvents + Avro schemas
    v
Redpanda / Kafka (real-time tier)
    |---> Dagster sensors (trigger pipelines on data changes)
    |---> Temporal workflows (react to changes)
    |---> Iceberg sink on object storage (long-term queryable history)
    \---> ClickHouse (real-time analytical queries)
```

---

## CDC vs. Application-Level Lineage

### What CDC Provides (Overlaps with Lineage)

- Complete history of what changed in every table, with timestamps
- Before/after snapshots of every row mutation
- Ability to reconstruct the state of any table at any point in time
- Tracing which rows were affected and when

### What CDC Does NOT Provide (OpenLineage Still Required)

- **Causal relationships between datasets** — CDC tells you table A changed at T1 and table B
  changed at T2, but not that a Dagster job read from A and wrote to B. OpenLineage captures
  the job that connects them.
- **Cross-system lineage** — CDC is per-database. OpenLineage tracks lineage across Dagster,
  Temporal, APIs, and any other system.
- **Schema evolution context** — CDC captures data changes but not why a transformation was
  applied or what business logic drove it.
- **Column-level lineage** — OpenLineage can track which input columns contributed to which
  output columns. CDC only shows before/after at the row level.

### Conclusion

CDC and OpenLineage are complementary layers, not substitutes:

| Layer | Tool | Answers |
|-------|------|---------|
| **Data lineage** | OpenLineage | Where did this data come from? What jobs produced it? (provenance and causality) |
| **Change history** | CDC -> Iceberg | What was the value of this row at time T? What changed? (audit and temporal queries) |
| **Event stream** | CDC -> Kafka | What just changed? Who needs to react? (real-time integration) |

CDC **reduces** the need for application-level audit logging and some temporal queries, but it
does not replace OpenLineage's graph of transformations and dependencies. Applications do not
need to maintain their own historical change tables — CDC externalizes that concern — but they
still need to emit OpenLineage events to capture the why and how of data movement.

---

## Applications for Querying CDC Data

1. **Audit / compliance** — "Show me every change to user X's record in the last 90 days"
2. **Debugging** — "What was the state of this feed subscription before the bug occurred?"
3. **Event sourcing reconstruction** — Replay changes to rebuild derived state
4. **Analytics** — Track entity lifecycle metrics (time-to-first-action, churn patterns)
5. **Data backfill** — Replay CDC events to populate a new downstream system without touching
   the source database
6. **Temporal joins** — Join fact tables as-of a specific point in time (Iceberg time-travel
   makes this straightforward)
7. **Cache invalidation** — React to database changes to invalidate or refresh caches
8. **Search index sync** — Keep search indices (e.g., Elasticsearch) in sync with the source
   database without polling

---

## Use Cases: Orchestrator-Driven Reactions to Database Events

The most powerful pattern CDC unlocks is **turning database writes into orchestration triggers**.
Instead of orchestrators polling databases or services pushing notifications after writes, the
database itself becomes the event source. This decouples the writer from all downstream
consequences — the application writes a row, and the platform takes it from there.

### Temporal: Real-Time Workflow Triggers

CDC events on a Kafka/Redpanda topic can start or signal Temporal workflows without the
writing application knowing anything about the downstream workflow.

**Feed ingestion example:** When the feed service inserts a new row into the `feeds` table, a
CDC event fires. A lightweight consumer (or Temporal's own Kafka interceptor) starts an
ingestion workflow for that feed — scheduling its first poll, extracting metadata, and
registering it with the schema registry. The feed service's only job is the INSERT; it has no
knowledge of the ingestion pipeline.

**Saga coordination:** When a row in an `orders` table transitions to `payment_received`, a
CDC event triggers a Temporal workflow that coordinates fulfillment across multiple services
(inventory reservation, shipping, notification). The order service never calls these systems
directly — the database state change is the contract.

**Long-running reactions:** A CDC event on a `documents` table triggers a Temporal workflow
that runs OCR, entity extraction, and classification — activities that may take minutes or
hours. The writing service returns immediately; the durable workflow handles retries, timeouts,
and compensation if any step fails.

### Dagster: Event-Driven Batch Pipelines

Dagster sensors can consume CDC topics and materialize assets in response to upstream data
changes, replacing time-based schedules with data-driven triggers.

**Derived table refresh:** Instead of running a daily job to rebuild a summary table, a Dagster
sensor watches the CDC stream for the source table. When it detects changes, it triggers an
asset materialization that incrementally updates the summary. Freshness goes from "up to 24
hours stale" to "minutes behind the source."

**Cross-service data products:** Service A writes to its database. CDC streams the changes to
Kafka. A Dagster sensor picks them up and materializes a joined/enriched dataset that combines
data from services A, B, and C — without any of those services knowing about each other or the
derived dataset.

**Backfill orchestration:** When a new Dagster asset is added that depends on historical data,
CDC events stored in Iceberg can be replayed through the pipeline to backfill the asset from
the beginning of time, without putting any load on the source database.

### Combined Patterns

The real power emerges when both orchestrators react to the same CDC stream for different
purposes:

```
INSERT INTO content_items (feed_id, raw_html, ...)
    |
    | CDC event
    v
Kafka / Redpanda topic: db.public.content_items
    |
    |---> Temporal: start summarization workflow for this content item
    |       (real-time, per-row, durable execution with retries)
    |
    |---> Dagster sensor: mark content_items asset as stale
    |       (batch, triggers periodic re-materialization of aggregates)
    |
    |---> Dagster sensor: trigger search index sync job
    |       (batch, re-indexes changed content for semantic search)
    |
    \---> Direct consumer: invalidate CDN cache for affected feed pages
            (real-time, stateless, fire-and-forget)
```

### What This Changes About Application Design

With CDC as the integration backbone, application services become simpler:

- **Services only write to their own database.** They don't call other services, emit events,
  or trigger workflows after writes. The database write *is* the event.
- **New downstream consumers are added without modifying the producer.** Need a new search
  index? Add a CDC consumer. Need a new analytics pipeline? Add a Dagster sensor. The writing
  service is never touched.
- **Ordering guarantees come from the WAL.** The database's write-ahead log provides a total
  order of changes per table partition. Consumers process events in the same order they were
  committed — no need for application-level sequencing or distributed clocks.
- **Exactly-once semantics are achievable at the sink.** Debezium provides at-least-once from
  the WAL. Combined with idempotent consumers or transactional sinks (e.g., Iceberg's
  transactional commits), the pipeline achieves effectively-once processing.

### Feed Reader Examples

Concrete use cases for the sample service:

| Database Event | Temporal Reaction | Dagster Reaction |
|---------------|-------------------|------------------|
| New row in `feeds` | Start ingestion workflow (schedule polling, extract metadata) | Materialize feed catalog asset |
| New row in `content_items` | Start summarization workflow (extract, summarize, classify) | Trigger search index sync, update daily digest aggregates |
| Update to `user_subscriptions` | — | Re-materialize personalized feed rankings |
| Update to `feeds.last_error_at` | Start alerting workflow (notify feed owner, back off polling) | Update feed health dashboard asset |
| Delete from `user_subscriptions` | — | Re-materialize subscription count aggregates, trigger cleanup if feed has zero subscribers |

---

## Platform Integration

### Alignment with Existing Standards

| Platform Standard | CDC Integration |
|-------------------|-----------------|
| CloudEvents | Debezium emits CloudEvents-compatible envelopes |
| Avro / Protobuf | CDC events encoded in platform schema languages |
| OpenTelemetry | Trace/span IDs can be propagated through CDC events |
| Schema Registry | CDC schemas registered and versioned alongside application schemas |
| OpenLineage | CDC complements (does not replace) lineage tracking |

### Integration Points

- **Dagster** — Sensors on CDC topics trigger batch pipelines when upstream data changes,
  replacing polling-based scheduling with event-driven triggers
- **Temporal** — Workflows react to CDC events for real-time orchestration (e.g., trigger a
  summarization workflow when new feed content is ingested)
- **Schema Registry** — CDC schemas (the structure of change events) are registered alongside
  application schemas, with the same compatibility guarantees
- **Intelligent Broker** — CDC events can flow through the brokering layer for schema-to-schema
  transformation before reaching downstream consumers

---

## Open Questions

- [ ] Kafka vs. Redpanda — evaluate operational complexity, performance, and community support
- [ ] Iceberg sink connector — evaluate options (Debezium server, custom Dagster asset, Kafka Connect Iceberg sink)
- [ ] CDC schema evolution — how to handle application schema migrations in the CDC stream
- [ ] Retention policies — how long to keep CDC data in each tier
- [ ] Multi-database support — strategy for services that use databases other than PostgreSQL
- [ ] Exactly-once semantics — evaluate guarantees across the CDC pipeline
