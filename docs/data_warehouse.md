# Data Warehouse — Research & Recommendations

> **PARTIALLY SUPERSEDED** — The ClickHouse OLAP warehouse has been replaced by a
> **lakehouse approach** (Apache Iceberg + Trino). See `data_lakehouse.md` for the current
> analytical layer recommendation.
>
> The **CDC pipeline architecture** (Debezium → Redpanda) described in this document **remains
> valid and necessary** — CDC is a platform capability for event-driven workflows, cross-service
> data sync, and schema registry integration. It is not used to sink data into the lakehouse
> (Dagster reads Postgres directly for batch analytics), but the infrastructure serves its own
> purposes independently.
>
> The ClickHouse research is retained in case a dedicated warehouse is needed in the future for
> specific hot-path workloads (e.g., high-concurrency dashboards, real-time analytics, or
> observability at scale).

## Summary

This document captures research into adding a data warehouse layer to the data platform. The
warehouse provides OLAP (analytical) capabilities separate from the OLTP (transactional) PostgreSQL
databases that services use for operational state. Data flows from Postgres into the warehouse via
CDC (change data capture), enabling analytical queries, trending/popularity computations, and
long-term observability without impacting transactional workloads.

## Technology Recommendation: ClickHouse Everywhere

### Why ClickHouse

- **Open source** — self-hosted, no cloud vendor lock-in (aligns with core principle #1)
- **Columnar storage** optimized for analytical queries: aggregations, time-series, OLAP workloads
- **Kubernetes-native** — the [Altinity ClickHouse Operator](https://github.com/Altinity/clickhouse-operator) follows the same pattern as CloudNativePG for Postgres
- **OpenTelemetry support** — native OTel log/trace sink, aligns with the platform's observability standards
- **S3-compatible storage tiering** — cold data offloads to Linode Object Storage, reusing existing infrastructure
- **High ingestion throughput** — handles CDC event streams and batch loads efficiently

### Why ClickHouse Everywhere (Not DuckDB Locally)

An earlier consideration was to use DuckDB as a lightweight local substitute for ClickHouse. This
was rejected because:

- **DuckDB is embedded** — it has no server process listening for incoming CDC events. There is no
  way to stream Debezium CDC changes into DuckDB the way you would with ClickHouse.
- **Breaks environment parity** — using a different engine locally means the CDC pipeline cannot be
  tested end-to-end, violating the "local testing is first-class" principle.
- **Different query semantics** — ClickHouse SQL and DuckDB SQL are not identical. Tests passing
  against DuckDB locally could fail against ClickHouse in dev/production.

DuckDB still has a role for ad-hoc analysis, notebook exploration, and lightweight Dagster asset
tests, but it should not be the local substitute for ClickHouse.

### Alternatives Considered

| Alternative | Why Not |
|---|---|
| Snowflake / BigQuery / Redshift | Violates "open source everything" and "local testing first-class" |
| Apache Druid | More complex to operate, heavier footprint, less ecosystem momentum |
| Plain Postgres (analytical queries) | Mixing OLTP/OLAP on one instance is an anti-pattern; heavy analytical queries degrade transactional performance |
| Apache Spark | Overkill for expected scale; JVM-heavy; poor local dev story |
| DuckDB (as local ClickHouse substitute) | Embedded engine with no server process; cannot receive CDC streams; breaks environment parity |

## CDC Pipeline Architecture

Data flows from PostgreSQL into ClickHouse via a CDC pipeline using Debezium and Redpanda:

```
Postgres (CNPG)
       │ logical replication (wal_level=logical, already configured in 007)
       ▼
Debezium Connect (K8s pod)
       │ captures row-level changes from WAL
       ▼
Redpanda (lightweight Kafka-compatible broker)
       │ durable event stream
       ▼
ClickHouse (OLAP warehouse)
       │ ClickHouse Kafka engine reads from Redpanda topics
       ▼
Materialized views / analytical tables
```

### Why This Pipeline

- **wal_level=logical is already set** — design doc 007 configures this in the CNPG Cluster CRD
  for future CDC use cases. The foundation is in place.
- **Debezium** is the de facto open-source CDC connector for Postgres. It reads the logical
  replication stream and publishes structured change events.
- **Redpanda** replaces Apache Kafka as the event broker. It is a single binary, requires no JVM
  or ZooKeeper, starts in seconds, and is API-compatible with Kafka. This makes it far more
  practical for local development.
- **ClickHouse Kafka engine** natively consumes from Kafka-compatible brokers (including Redpanda),
  making the sink side zero-code configuration.

### How It Works End-to-End

1. A developer runs `POST /schemas` against the schema registry
2. The schema registry writes a row to its Postgres database
3. Debezium detects the new WAL entry via logical replication
4. Debezium publishes a change event to a Redpanda topic (e.g., `cdc.schema_registry.schemas`)
5. ClickHouse's Kafka engine reads the event from the topic
6. A ClickHouse materialized view transforms and inserts the data into an analytical table
7. The data is now queryable in ClickHouse for analytics, trending, dashboards, etc.

This works identically in local, dev, and production — the same pipeline, same components, same
data flow.

## Integration with Existing Architecture

### Architectural Fit

| Concern | Integration Point |
|---|---|
| **Data source** | PostgreSQL via CNPG (design doc 007) |
| **CDC trigger** | `wal_level=logical` already configured in 007 CNPG Cluster CRD |
| **Event transport** | Redpanda (Kafka-compatible, open source, lightweight) |
| **Batch orchestration** | Dagster assets in `monorepo/pipelines/` (already in repo structure) |
| **Data lineage** | OpenLineage — both Dagster and ClickHouse support it |
| **Schema management** | Schema registry manages Avro/Protobuf schemas for warehouse tables |
| **Observability** | ClickHouse can serve as an OTel backend for long-term log/trace storage |
| **Infrastructure as code** | Pulumi (Altinity operator + ClickHouse CRDs, same pattern as CNPG) |
| **Deployment** | Kubernetes via Helm/Pulumi, ArgoCD for GitOps |

### Repository Structure

```
monorepo/
├── pipelines/              # Dagster assets that read from/write to ClickHouse
├── schemas/                # Avro/Protobuf definitions for CDC events and warehouse tables
├── infra/
│   └── platform/
│       ├── clickhouse.ts   # Pulumi module: Altinity operator + ClickHouse cluster
│       ├── redpanda.ts     # Pulumi module: Redpanda cluster
│       └── debezium.ts     # Pulumi module: Debezium Connect worker
└── deploy/
    └── debezium/           # Debezium connector configurations (JSON)
```

## Per-Environment Deployment

### Environment Comparison

| Concern | Local (k3d) | Dev (Linode k3s) | Production (Linode k3s) |
|---|---|---|---|
| ClickHouse | Single node via Altinity operator | Single node via operator | Clustered (shards + replicas) via operator |
| Redpanda | Single node | Single node | 3-node cluster |
| Debezium | Single Connect worker | Single Connect worker | Connect cluster (2+ workers) |
| Storage (ClickHouse) | local-path provisioner | Linode Block Storage | Linode Block Storage + Object Storage tiering |
| Provisioning | Tiltfile | Pulumi | Pulumi |
| Operator | Altinity ClickHouse Operator via Tiltfile | Altinity operator via Pulumi | Same |

### Local Resource Footprint

The CDC + warehouse stack adds approximately 1GB of RAM to the local k3d cluster:

| Component | RAM (approximate) |
|---|---|
| Postgres (CNPG) | Already budgeted in design doc 007 |
| Debezium Connect | ~512MB |
| Redpanda | ~256MB |
| ClickHouse | ~256MB |
| **Total additional** | **~1GB** |

This is meaningful but manageable for local development.

## Backend Data Storage

| Data Tier | Storage | Details |
|---|---|---|
| **Hot data** (recent, frequently queried) | Linode Block Storage PVCs | Attached to ClickHouse pods, same pattern as CNPG Postgres |
| **Cold/archive data** | Linode Object Storage (S3-compatible) | ClickHouse storage tiering moves old partitions to object storage; same bucket infrastructure used for WAL archiving |
| **Local dev** | local-path provisioner on k3d | Ephemeral, fully disposable |

## Feed Reader Use Cases

From `SAMPLE-SERVICE.md`, the warehouse enables:

- **Popularity & trending** — aggregate subscription counts and engagement metrics across all users
- **Search relevance weighting** — pre-compute signals (feed popularity, topic trends) as Dagster
  assets materialized into ClickHouse, consumed by the search service
- **Daily/weekly/monthly digests** — batch summarization pipelines reading aggregated content from
  the warehouse
- **Platform observability** — store OpenTelemetry traces and logs in ClickHouse for long-term
  retention and cross-service analysis
- **Content analytics** — track ingestion volumes, feed health (error rates, staleness), and
  content categorization metrics

## Open Questions

- **Redpanda sizing for production** — how many brokers, what retention, what replication factor?
- **ClickHouse schema evolution** — how to handle DDL changes in analytical tables as source
  schemas evolve? Does the schema registry manage warehouse schemas or only OLTP schemas?
- **Exactly-once semantics** — Debezium provides at-least-once delivery. What deduplication
  strategy for ClickHouse? (ReplacingMergeTree, dedup in materialized views, or idempotent inserts)
- **Backfill strategy** — when a new analytical table is added, how to backfill historical data
  from Postgres into ClickHouse? Dagster batch job vs. Debezium snapshot mode?
- **Multi-tenancy** — one ClickHouse database per service (mirroring the Postgres pattern from
  design doc 007) or a shared analytical database with per-source-system schemas?
