# Data Lakehouse — Unified Analytical Layer

> Research notes on the lakehouse as the **primary analytical layer** for the platform. The
> lakehouse replaces the previously considered ClickHouse data warehouse (see
> `data_warehouse.md`), removing the need for a dedicated OLAP engine while keeping the CDC
> pipeline (Debezium + Redpanda) for its own merits — event-driven workflows, cross-service
> sync, and future real-time materialization.

---

## Decision: Lakehouse-Only (No Separate Data Warehouse)

An earlier research document (`data_warehouse.md`) proposed ClickHouse as a dedicated OLAP
warehouse fed by a CDC pipeline (Debezium → Redpanda → ClickHouse). After evaluating the
platform's actual workloads, a lakehouse-only approach was chosen instead.

### Why Not Both

Every feed reader analytical workload is **batch-computed** — popularity rankings, search
relevance weighting, daily/weekly/monthly digests, content analytics. None require millisecond
query latency or real-time ingestion. Adding ClickHouse would mean:

- **Two analytical systems** to deploy, operate, and maintain
- **Boundary decisions** — constant "does this belong in ClickHouse or Iceberg?" with risk of
  duplication
- **Two schema registration paths** — warehouse tables and lakehouse tables both need schema
  governance
- **Two lineage paths** — CDC-based lineage through the warehouse and Dagster-based lineage
  through the lakehouse

### CDC Remains — Just Not as a Lakehouse Sink

The CDC pipeline (Debezium → Redpanda) is a platform capability in its own right, independent
of the analytical layer. It is **not** eliminated by choosing a lakehouse over a warehouse. The
distinction is that CDC data does not need to flow into the lakehouse for analytical workloads
— Dagster reads from Postgres directly for batch analytics.

CDC serves its own use cases:

- **Event-driven workflows** — Postgres changes trigger Temporal workflows (e.g., new feed
  registration triggers ingestion, content update triggers re-summarization)
- **Cross-service data sync** — streaming changes between independently deployed services
- **Schema registry integration** — CDC change event schemas are auto-registered by Debezium
  (STANDARD governance, as described in `schema-registry-1.md`)
- **Future real-time lakehouse ingestion** — if a workload eventually needs sub-minute data
  freshness in the lakehouse, CDC → Flink → Iceberg is the path, and the CDC infrastructure
  is already in place

The `data_warehouse.md` research on the CDC pipeline architecture (Debezium → Redpanda) and
the `change_data_capture.md` research remain fully applicable — they describe infrastructure
the platform needs regardless of the analytical layer choice.

### What the Lakehouse Provides Instead

The lakehouse handles both the structured analytical workloads that were planned for ClickHouse
**and** the raw/ML workloads that only a lakehouse can serve:

| Workload | Previously Planned For | Lakehouse Viable? |
|---|---|---|
| Feed popularity rankings | ClickHouse | **Yes** — Dagster asset, query via Trino |
| Search relevance weighting | ClickHouse | **Yes** — Dagster asset |
| Daily/weekly/monthly digests | ClickHouse | **Yes** — Dagster asset |
| Content analytics & metrics | ClickHouse | **Yes** — seconds-latency acceptable for dashboards |
| Raw RSS/HTML content archival | N/A (no plan) | **Yes** — needed for reprocessing |
| ML training on content corpus | N/A (no plan) | **Yes** — time travel for reproducibility |
| Semantic embedding generation | N/A (no plan) | **Yes** — large-scale batch processing |
| Ad-hoc exploration of raw feeds | N/A (no plan) | **Yes** — Trino SQL over Parquet |

### Low-Latency API Serving Pattern

For workloads that need millisecond API responses (e.g., "get trending feeds" from the feed
reader UI), the pattern is:

```
Dagster materializes analytical result in Iceberg
       │
       ▼ (downstream Dagster asset)
Writes pre-computed result to Postgres serving table
       │
       ▼
API reads from Postgres (millisecond latency)
```

Postgres is already deployed and can serve small, pre-computed result sets with no additional
infrastructure. ClickHouse's query speed advantage is irrelevant when the hot path reads from
a Postgres table that was populated by a batch pipeline.

### Observability: Not a Warehouse Concern

The original `data_warehouse.md` proposed ClickHouse as an OTel backend. This is better
handled by dedicated observability tools already in the platform's stack:

- **Grafana Tempo** — distributed tracing backend, purpose-built for OTel traces
- **Grafana Loki** — log aggregation, designed for OTel structured logs
- **Grafana** — dashboards and alerting on top of both

If trace/log volumes eventually exceed what Tempo/Loki can handle, ClickHouse can be
introduced for **just observability** — a narrow, well-scoped use case rather than a
general-purpose warehouse.

### When to Reconsider ClickHouse

The trigger to introduce a dedicated warehouse would be:

- **Scale** — Trino query latency becomes unacceptable for interactive dashboards (billions of
  rows, many concurrent users)
- **Real-time analytics** — a workload emerges that needs data queryable within seconds of
  creation, not minutes
- **Observability at scale** — trace/log volumes exceed Tempo/Loki capacity

At that point, ClickHouse can be added for the specific hot-path workload. Trino already
supports federated queries across ClickHouse and Iceberg, so the migration path is smooth.
The platform is not locked out — it's deferring complexity until it's justified.

---

## Data Warehouse vs Data Lake vs Lakehouse

| | Data Warehouse | Data Lake | Lakehouse |
|---|---|---|---|
| **Data shape** | Structured, schema-on-write | Raw/semi-structured, schema-on-read | Both — schema enforcement available but not required |
| **Storage** | Columnar tables in a purpose-built engine | Files on object storage (S3, MinIO) | Open table format on object storage |
| **Query pattern** | Fast aggregations, dashboards, known questions | Exploratory, ML training, ad-hoc | Both analytical SQL and ML/exploratory |
| **Data quality** | High — validated on ingestion | Variable — raw and cleaned coexist | Managed — ACID transactions, schema evolution |
| **Cost model** | Compute-heavy (always-on nodes) | Storage-heavy (cheap object storage) | Storage-cheap, compute scales independently |
| **Typical users** | Analysts, dashboards, applications | Data scientists, ML engineers | Everyone |
| **Example tech** | ClickHouse, BigQuery, Snowflake | S3 + Spark, MinIO + Hive | Iceberg + Trino, Delta Lake + Spark |

The lakehouse merges data lake and data warehouse: open file formats on cheap object storage,
with warehouse-grade features (ACID transactions, schema evolution, time travel, partition
pruning). A single storage layer serves both SQL analytics and ML workloads.

---

## Technology: Apache Iceberg

Apache Iceberg is the recommended table format. It is already referenced in `data_versioning.md`
as a candidate for versioned data storage.

- **Spec:** https://iceberg.apache.org/
- **License:** Apache 2.0
- **Governance:** Apache Software Foundation

### Why Iceberg

| Property | Detail |
|---|---|
| **Open standard** | Aligns with core principle #1 (open source everything) |
| **Engine-agnostic** | Works with Trino, Spark, Flink, Dremio, DuckDB, and others |
| **ACID transactions** | Serializable isolation — no partial reads or corrupt tables |
| **Schema evolution** | Add, drop, rename, reorder columns without rewriting data |
| **Partition evolution** | Change partitioning strategy without rewriting existing data |
| **Time travel** | Query any historical snapshot — enables reproducible ML training |
| **Hidden partitioning** | Users write standard SQL; the engine handles partition pruning |
| **Open file formats** | Data stored as Parquet (or Avro/ORC) on object storage |

### Iceberg vs Alternatives

| | Apache Iceberg | Delta Lake | Apache Hudi |
|---|---|---|---|
| Governance | Apache Foundation | Databricks (open source core) | Apache Foundation |
| Engine support | Broadest (Trino, Spark, Flink, DuckDB, etc.) | Best with Spark/Databricks | Spark-centric |
| Community momentum | Largest open community | Large, Databricks-driven | Smaller |
| Catalog interop | REST catalog spec (open standard) | Unity Catalog (Databricks) | Limited |
| Streaming ingest | Via Flink or Spark Structured Streaming | Native with Spark | Native (designed for upserts) |

Iceberg wins on engine breadth and open governance. Delta Lake is strong but tied to the
Databricks ecosystem. Hudi is designed for upsert-heavy workloads but has narrower adoption.

---

## Architecture

### Storage Layer

Object storage (S3, MinIO, or equivalent) serves as the durable storage backend. Iceberg
manages the table format — metadata files, manifest lists, and data files (Parquet).

```
Object Storage (S3 / MinIO)
├── warehouse/
│   ├── raw/                          # Raw ingested content
│   │   ├── feeds/                    # Raw RSS/Atom XML by feed
│   │   └── articles/                 # Raw HTML from linked articles
│   ├── processed/                    # Cleaned, normalized content
│   │   ├── content/                  # Normalized content model
│   │   └── summaries/                # Generated summaries
│   ├── analytics/                    # Batch-computed analytical results
│   │   ├── popularity/               # Feed popularity scores
│   │   ├── trending/                 # Trending topics
│   │   └── digests/                  # Daily/weekly/monthly digest data
│   ├── ml/                           # ML artifacts
│   │   ├── embeddings/               # Semantic embeddings
│   │   └── training/                 # Training datasets (versioned via snapshots)
│   └── metadata/                     # Iceberg metadata files
```

### Catalog

Iceberg requires a **catalog** to track table locations and current snapshots. Options:

| Catalog | Fit |
|---|---|
| **REST catalog** (Iceberg spec) | Best — open standard, any engine can use it, self-hosted |
| **Hive Metastore** | Legacy, heavy, but widely supported |
| **AWS Glue** | Managed, but cloud-dependent (violates principle #1) |
| **Nessie** | Git-like branching for data — interesting for ML experimentation |
| **Polaris** | Snowflake's open-source REST catalog implementation |

The Iceberg REST catalog spec is the natural choice — it's an open standard that any compliant
engine can connect to, and several implementations exist (Polaris, Gravitino, custom).

### Query Engine

**Trino** is the recommended SQL query engine for the lakehouse:

- **License:** Apache 2.0
- Open source, self-hosted, K8s-deployable
- First-class Iceberg connector
- Federated queries — can join Iceberg tables with Postgres directly
- ANSI SQL — familiar to analysts
- Scales horizontally (coordinator + workers)

Trino also serves as a **federation layer** — querying both the lakehouse (Iceberg) and
operational databases (Postgres) from a single SQL interface. If ClickHouse is introduced
later for specific workloads, Trino federates across all three without changes to user queries.

### Deployment

```
                    ┌─────────────┐
                    │   Trino     │
                    │  (query)    │
                    └──────┬──────┘
                           │
                    ┌──────┼──────┐
                    ▼            ▼
            ┌──────────┐  ┌──────────┐
            │ Iceberg  │  │ Postgres │
            │(lakehouse)│  │ (OLTP)   │
            └────┬─────┘  └──────────┘
                 │
          ┌──────▼──────┐
          │   Object    │
          │   Storage   │
          │ (S3/MinIO)  │
          └─────────────┘
```

---

## Data Flow

### Ingestion Path

```
RSS Feed
  │
  ▼ (Temporal workflow: ingest-feed)
Fetch raw XML/HTML
  │
  ├──→ Postgres (structured metadata: feed URL, title, timestamps)
  │
  └──→ Object Storage (raw content files)
        │
        ▼ (Dagster asset: write Iceberg table)
     Lakehouse (raw.feeds, raw.articles)
        │
        ▼ (Dagster asset: normalize + summarize)
     Lakehouse (processed.content, processed.summaries)
        │
        ├──→ (Dagster asset: generate embeddings)
        │    Lakehouse (ml.embeddings)
        │
        └──→ (Dagster asset: compute analytics)
             Lakehouse (analytics.popularity, analytics.trending)
                │
                ▼ (Dagster asset: write serving tables)
             Postgres (pre-computed results for API serving)
```

### Query Patterns

| Query | Engine | Source |
|---|---|---|
| "Show trending feeds this week" | Postgres (pre-computed) | API reads serving table directly |
| "Dashboard: ingestion volume over time" | Trino | Lakehouse analytics tables |
| "Find articles semantically similar to X" | Vector DB / custom | Lakehouse embeddings |
| "Reprocess all raw content from feed Y" | Dagster + Trino | Lakehouse raw tables |
| "Train summarization model on last 6 months" | Spark / PyTorch | Lakehouse (time travel to snapshot) |
| "Join feed metadata with popularity score" | Trino (federated) | Lakehouse + Postgres |

### Lakehouse Ingestion: Dagster Batch Reads (Not CDC)

The lakehouse gets its data from Dagster assets that read directly from Postgres, not from
the CDC stream. This is a deliberate choice:

- All analytical workloads are batch-computed (hourly/daily), so real-time change streaming
  is unnecessary for the lakehouse
- Dagster batch reads are simpler — a `SELECT ... GROUP BY` against Postgres, written to
  Iceberg, with no intermediate infrastructure
- Avoids coupling the lakehouse ingestion to the CDC pipeline's availability

CDC data flows through Debezium → Redpanda for its own purposes (event-driven workflows,
cross-service sync) but does not sink into the lakehouse. If a future workload requires
sub-minute freshness in the lakehouse, the path is CDC → Flink → Iceberg — the CDC
infrastructure will already be in place.

---

## Relationship to Existing Platform Subsystems

| Subsystem | Relationship to Lakehouse |
|---|---|
| **Schema Registry** | Iceberg table schemas should be registered (STANDARD governance). Schema evolution in Iceberg must stay compatible with registered schemas. |
| **OpenLineage / Marquez** | Dagster assets writing to Iceberg emit lineage events. Iceberg snapshot IDs map to OpenLineage `version` dataset facets. |
| **Dagster** | Primary orchestrator for lakehouse writes. Assets model the raw → processed → analytics → serving pipeline. |
| **Data Catalogue** | Lakehouse tables are catalogue entities. Entity refs include Iceberg table identifiers. |
| **Postgres** | Complementary — OLTP operations stay in Postgres. Dagster reads from Postgres for batch analytics. Pre-computed results are written back to Postgres serving tables for low-latency API access. |
| **CDC (Debezium + Redpanda)** | Independent platform concern. CDC powers event-driven workflows and cross-service sync. Does not sink into the lakehouse — Dagster reads Postgres directly for analytics. Future option: CDC → Flink → Iceberg if real-time lakehouse ingestion is needed. |
| **Data Versioning** | Iceberg's snapshot-based time travel IS the versioning strategy for lakehouse data. Aligns with `data_versioning.md` research. |
| **Observability** | Handled by Grafana Tempo (traces) and Loki (logs), not the lakehouse. |

---

## Cost and Operational Comparison

| Concern | Warehouse + Lakehouse (rejected) | Lakehouse Only (chosen) |
|---|---|---|
| Analytical systems | ClickHouse + Iceberg/Trino | Iceberg/Trino only |
| Always-on compute | ClickHouse nodes + Trino workers | Trino workers only (can scale to zero) |
| Analytical data pipelines | Two sink paths (CDC → ClickHouse, Dagster → Iceberg) | One sink path (Dagster → Iceberg) |
| Schema management | Register schemas for both ClickHouse and Iceberg tables | Register once for Iceberg tables |
| Lineage complexity | Two analytical paths to track | Single lineage path |
| Storage cost | ClickHouse block storage (expensive) + object storage | Object storage only (cheap) |
| Boundary decisions | "Does this go in ClickHouse or Iceberg?" | Everything goes in Iceberg |
| CDC pipeline | Required (feeds ClickHouse) + separate event-driven uses | Independent platform concern (event-driven workflows, cross-service sync) |

Note: Debezium + Redpanda are platform infrastructure regardless of the analytical layer
choice. The difference is that with ClickHouse, the CDC pipeline is also load-bearing for
analytics. Without ClickHouse, the CDC pipeline serves only its own use cases and can be
deployed on its own timeline.

---

## Open Questions

- [ ] Object storage — S3 vs self-hosted MinIO (cost, operational overhead, principle #1)
- [ ] Iceberg catalog — REST catalog implementation choice (Polaris, Gravitino, custom)
- [ ] Trino deployment — sizing, K8s operator, autoscaling workers
- [ ] Local development — DuckDB with Iceberg support for local testing, or MinIO + Trino
      in the k3d cluster?
- [ ] Streaming ingest — should raw content land in Iceberg via Flink (real-time) or Dagster
      (batch)? Depends on latency requirements for reprocessing
- [ ] Embedding storage — Iceberg tables with vector columns vs dedicated vector database
      (pgvector, Qdrant, Weaviate)
- [ ] Iceberg schema registration — how to register Iceberg table schemas in the schema
      registry and enforce compatibility on evolution
- [ ] Nessie catalog — worth evaluating for ML experimentation (branch data like code,
      merge when experiment succeeds)
- [ ] Postgres serving table pattern — how to manage the Dagster assets that write back to
      Postgres, and how to keep them consistent with lakehouse source tables
