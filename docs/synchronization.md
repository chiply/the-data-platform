# Data Synchronization — Research & Strategy

> Research notes on synchronizing data exhaust from services and orchestrations into
> downstream systems that power analytics, lineage, backup, and other platform use cases.

---

## The Problem

A data platform produces data exhaust from many sources: services writing to databases,
orchestration workflows producing derived datasets, schema changes, lineage metadata,
observability signals, and more. These all need to reach downstream systems — analytics
warehouses, lineage stores, audit logs, search indices, caches — without requiring each
producing service to know about every consumer.

The core question: how do you synchronize all this data into the right places, and is
there a single destination or multiple?

---

## Strategy: Unified Backbone, Purpose-Built Destinations

Not a single location, but a small number of purpose-built destinations fed by a unified
synchronization backbone. "Sync" is not one problem — it's several, and forcing all data
exhaust into one system optimizes for nothing.

### The Synchronization Backbone: CDC + Event Bus

The backbone is Change Data Capture feeding a durable event bus:

```
Service writes to its own Postgres
    → Debezium captures WAL changes
    → Redpanda provides durable, fan-out event stream
    → Multiple consumers subscribe for different purposes
```

The producing service only writes to its own database. Everything downstream is a
**consumer of the change stream**. Adding a new downstream system never requires
modifying the producing service.

### Destinations

Each destination exists because it answers a fundamentally different class of query:

| Destination | Purpose | Feeds From | Answers |
|---|---|---|---|
| **ClickHouse** | Analytical queries, OLAP | CDC via Redpanda | "What are the trends? Show me aggregates." |
| **Iceberg on Object Storage** | Long-term history, time-travel, audit | CDC via Redpanda + Dagster batch | "What did this data look like last Tuesday?" |
| **Marquez** | Lineage graph | OpenLineage events (HTTP or Kafka) | "Where did this data come from? What breaks if this changes?" |
| **Redpanda topics** (themselves) | Real-time reactions | CDC, application events | "Something just changed — who needs to react?" |

These four categories are distinct and irreplaceable — you cannot serve time-travel audit
queries from ClickHouse efficiently, and you cannot serve sub-second analytical dashboards
from Iceberg.

---

## Synchronization Strategies

### Strategy 1: CDC as the Universal Sync Mechanism (Primary)

For all **operational/transactional data** produced by services. Services write to
Postgres, Debezium streams changes out. This covers the vast majority of data exhaust.

- **Pro:** Zero application code changes, total order from WAL, decoupled consumers
- **Con:** Only captures database state changes, not application semantics

CDC handles the "what changed" problem. Every row-level insert, update, and delete in
every service database is captured and made available to all downstream consumers without
the producing service doing anything beyond its normal database writes.

### Strategy 2: Application-Level Event Emission (Supplementary)

For **metadata and context** that does not live in the database — lineage events,
observability signals, and domain events that are not row mutations.

| Signal | Mechanism | Destination |
|---|---|---|
| Data lineage | OpenLineage RunEvents via Python client | Marquez |
| Observability | OpenTelemetry spans, metrics, logs | OTel Collector → ClickHouse (long-term) + Grafana (dashboards) |
| Domain events | CloudEvents on Redpanda topics | Temporal workflows, Dagster sensors, other consumers |

Application-level emission handles the "why it changed" problem — causal relationships
between datasets, cross-system lineage, schema evolution context, and column-level
provenance. CDC and OpenLineage are complementary layers, not substitutes.

### Strategy 3: Dagster as the Batch Synchronization Layer

For **derived datasets and cross-service joins** that do not make sense as streaming
consumers:

- Dagster sensors watch Redpanda/CDC topics and trigger asset materializations
- Dagster assets materialize into Iceberg tables (via LakeFS branches for safe promotion)
- Dagster provides the glue for cross-service data products — joining data from services
  A, B, and C into a warehouse table without any of those services knowing about each
  other or the derived dataset

Dagster is the orchestrator for batch sync, not a data transport. It reacts to events
(via sensors) and produces derived assets, but the raw sync is CDC.

---

## End-to-End Architecture

```
┌─────────────────────────────────────────────────────┐
│  Services (write to their own Postgres)             │
└──────────┬──────────────────────┬───────────────────┘
           │ CDC (Debezium)       │ App-level emission
           ▼                      ▼
┌──────────────────┐   ┌──────────────────────────────┐
│  Redpanda        │   │  OpenLineage → Marquez       │
│  (event bus)     │   │  OTel → Collector → backends │
└──┬───┬───┬───┬───┘   └──────────────────────────────┘
   │   │   │   │
   │   │   │   └──→ Temporal (real-time workflow triggers)
   │   │   └──────→ ClickHouse (OLAP analytics)
   │   └──────────→ Dagster sensors → Iceberg/LakeFS (batch, history)
   └──────────────→ Other consumers (cache invalidation, search index)
```

### Data Flow by Use Case

| Use Case | Source | Transport | Destination |
|---|---|---|---|
| Real-time analytics dashboard | Service DB | CDC → Redpanda → ClickHouse Kafka engine | ClickHouse |
| Historical audit / time-travel | Service DB | CDC → Redpanda → Dagster sink | Iceberg on Object Storage |
| Data lineage graph | Services, Dagster, Temporal | OpenLineage HTTP/Kafka transport | Marquez |
| Workflow triggers | Service DB | CDC → Redpanda topic | Temporal (consumer starts workflow) |
| Batch data products | Multiple service DBs | CDC → Redpanda → Dagster sensors | Iceberg tables (via LakeFS) |
| Search index sync | Service DB | CDC → Redpanda topic | Elasticsearch/search consumer |
| Cache invalidation | Service DB | CDC → Redpanda topic | Direct consumer (stateless) |
| Long-term observability | Services | OTel SDK → Collector | ClickHouse |

---

## Design Principles

1. **The event bus (Redpanda) is the synchronization primitive**, not any particular
   destination. Adding a new downstream system means adding a new consumer, not changing
   the pipeline.

2. **Each destination has a clear query pattern** it is optimized for. Do not make
   ClickHouse do time-travel (use Iceberg) or Iceberg do sub-second dashboards (use
   ClickHouse).

3. **CDC handles "what changed"; OpenLineage handles "why it changed."** Both are
   required — they are complementary, not substitutes.

4. **Dagster is the batch orchestrator**, not a data transport. It reacts to events (via
   sensors) and produces derived assets, but raw sync is CDC.

5. **LakeFS provides the safety layer** for batch promotions — materialize to a branch,
   validate, merge. This prevents bad syncs from corrupting analytical state.

6. **Services only write to their own database.** They do not call other services, emit
   events, or trigger workflows after writes. The database write is the event.

7. **New downstream consumers are added without modifying the producer.** Need a new
   search index? Add a CDC consumer. Need a new analytics pipeline? Add a Dagster sensor.
   The writing service is never touched.

---

## What This Eliminates

- **A monolithic "data lake" that tries to be everything** — the tiered approach with
  purpose-built destinations is more effective than a single store
- **ETL jobs that poll source databases** — CDC eliminates polling entirely
- **A centralized "data bus" service that every producer must call** — CDC makes the
  database itself the event source
- **Application-level change tracking tables** — CDC externalizes the change history
  concern so services do not need to maintain their own audit tables
- **Tight coupling between producers and consumers** — the event bus decouples them
  completely

---

## Relationship to Other Research

| Research Doc | Relationship |
|---|---|
| `change_data_capture.md` | CDC is Strategy 1 — the primary sync mechanism |
| `data_warehouse.md` | ClickHouse is the OLAP destination; CDC pipeline feeds it |
| `data_lineage.md` | OpenLineage/Marquez is Strategy 2 — the lineage destination |
| `data_versioning.md` | Iceberg + LakeFS is the historical/audit destination |

This document synthesizes these individual research areas into a unified synchronization
architecture. The individual docs remain the detailed references for each component.

---

## Open Questions

- [ ] **Redpanda topic naming conventions** — standardize topic names across CDC, domain
  events, and lineage events (e.g., `cdc.<service>.<table>`, `events.<domain>.<type>`,
  `lineage.<namespace>`)
- [ ] **Consumer group management** — strategy for managing consumer groups across
  Temporal, Dagster, ClickHouse, and ad-hoc consumers
- [ ] **Schema evolution across the bus** — when a source table schema changes, how do CDC
  consumers handle the new schema? Schema registry enforcement at the Redpanda level?
- [ ] **Backpressure and flow control** — what happens when a consumer falls behind? Dead
  letter topics, alerting, automatic pause?
- [ ] **Data contracts between producers and consumers** — should CDC topic schemas be
  treated as public APIs with compatibility guarantees?
- [ ] **Ordering guarantees across topics** — some use cases need cross-topic ordering
  (e.g., a join between two CDC streams). Strategy for handling this?
- [ ] **Monitoring the sync pipeline** — how to detect and alert on sync lag, consumer
  failures, and data freshness SLOs?
