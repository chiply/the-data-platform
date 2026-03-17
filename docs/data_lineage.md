# Data Lineage — OpenLineage Research

> Research notes on adopting OpenLineage as the data lineage standard for the platform.
> OpenLineage is already listed as the Data Lineage standard in ARCHITECTURE.md.

---

## What Is OpenLineage

OpenLineage is a CNCF open standard that defines a JSON event model for recording data lineage.
It specifies how to describe what data a job consumes and produces, enabling lineage tracking
across heterogeneous tools without vendor lock-in.

- **Spec:** https://openlineage.io/
- **License:** Apache 2.0
- **Governance:** Linux Foundation AI & Data

---

## Core Concepts

| Concept     | Description                                                                 |
|-------------|-----------------------------------------------------------------------------|
| **Job**     | A unit of work — a Dagster asset, Temporal workflow, SQL query, etc.        |
| **Run**     | A specific execution of a job, identified by a UUID (preferably UUIDv7).    |
| **Dataset** | An input or output data container — a Postgres table, Kafka topic, S3 key. |
| **Facet**   | Extensible metadata attached to any of the above.                           |

### RunEvent State Machine

Every lineage observation is a **RunEvent** with one of:

- `START` — job execution begins
- `RUNNING` — intermediate progress update
- `COMPLETE` — job finished successfully
- `FAIL` — job failed (includes error facets)
- `ABORT` — job was cancelled

Events are additive — metadata can be attached at any state.

### Event Types

OpenLineage defines three event types:

1. **RunEvent** — emitted at runtime, describes a job execution with inputs/outputs.
2. **JobEvent** — design-time metadata (source code location, declared inputs/outputs).
3. **DatasetEvent** — dataset metadata changes outside job context (schema, ownership).

---

## Facets

Facets are the extension mechanism — atomic pieces of metadata identified by name.

### Standard Facet Categories

**Job Facets** (what kind of activity ran):

| Facet                 | Description                              |
|-----------------------|------------------------------------------|
| `sourceCodeLocation`  | Git repo, file path, commit SHA          |
| `sourceCode`          | Language and complete source code         |
| `sql`                 | SQL query executed by the job            |

**Run Facets** (how it ran):

| Facet            | Description                                        |
|------------------|----------------------------------------------------|
| `nominalTime`    | Scheduled execution time                           |
| `parent`         | Parent job/run relationship (workflow → activity)  |
| `errorMessage`   | Failure details with optional stack traces         |

**Dataset Facets** (static metadata about data):

| Facet                    | Description                                           |
|--------------------------|-------------------------------------------------------|
| `schema`                 | Column names, types, descriptions                     |
| `dataSource`             | Database instance, bucket, connection info             |
| `lifecycleStateChange`   | CREATE, ALTER, DROP, OVERWRITE, RENAME, TRUNCATE       |
| `version`                | Dataset version (e.g., Iceberg snapshot ID)            |

**Input Dataset Facets** (what was consumed):

| Facet                      | Description                                    |
|----------------------------|------------------------------------------------|
| `dataQualityMetrics`       | Row counts, null counts, byte sizes, stats     |
| `dataQualityAssertions`    | Test results from data quality frameworks      |

**Output Dataset Facets** (what was produced):

| Facet              | Description                            |
|--------------------|----------------------------------------|
| `outputStatistics` | Row count, byte size of output         |

### Custom Facets

Custom facets use a naming convention to avoid conflicts:

- **Class name:** `{prefix}{name}{entity}Facet` (PascalCase)
- **Key:** `{prefix}_{name}` (snake_case)
- **Schema:** Must point to a versioned, immutable JSON Schema

Platform-specific custom facets we would define:
- Schema registry version references
- Broker transformation rules and mapping metadata
- Feed metadata (source URL, poll frequency, subscriber count)

---

## What Lineage Data We Would Track

### Dagster Pipeline Lineage (Richest Source)

- Asset materializations: which assets produced, from what inputs
- Schema facets on each dataset (ties to our schema registry)
- Data quality metrics from Great Expectations integration
- SQL facets for SQL-based assets
- Run duration and error messages on failure

### Temporal Workflow Lineage

- Feed ingestion workflows: job = `ingest-feed`, input = RSS source URL, output = `postgres:feeds.raw_content`
- Summarization workflows: input = raw content table, output = summaries table
- Parent-child run relationships (workflow → activities via `parent` facet)

### Intelligent Broker Transformations

- Job = schema-to-schema transformation
- Input dataset = source schema version, output dataset = target schema version
- Custom facets for mapping rules applied

### Service-Level Operations

- Database migrations via `lifecycleStateChange` facets (CREATE, ALTER, DROP)
- Schema registry changes via `version` facets tied to Avro/Protobuf schema versions

### Data Quality

- `dataQualityMetrics` input facets (row counts, byte sizes, null percentages)
- `dataQualityAssertions` from contract tests and Great Expectations

---

## How Lineage Events Get Created

### Emission Strategy by Component

| Component              | Approach                                                                                     |
|------------------------|----------------------------------------------------------------------------------------------|
| **Dagster**            | No official integration. Custom `IOManager` or event hook emitting RunEvents on materialization. |
| **Temporal**           | No native integration. Activity interceptors emit START/COMPLETE/FAIL RunEvents.             |
| **FastAPI services**   | Middleware or decorators for significant data operations (writes, transformations).           |
| **Intelligent broker** | Emit events on each schema transformation with input/output schema facets.                   |
| **SQL operations**     | OpenLineage SQL parser (Rust-based, Python bindings) extracts input/output datasets from SQL.|

### Python Client

The `openlineage-python` package is the primary SDK:

```bash
pip install openlineage-python
```

Optional extras:
- `openlineage-python[kafka]` — Kafka transport
- `openlineage-python[fsspec]` — remote filesystem support (S3, GCS, Azure)
- `openlineage-python[msk-iam]` — AWS MSK with IAM auth

Example emission:

```python
from openlineage.client import OpenLineageClient
from openlineage.client.run import RunEvent, RunState, Run, Job, Dataset

client = OpenLineageClient.from_environment()

client.emit(RunEvent(
    eventType=RunState.COMPLETE,
    job=Job(namespace="feed-reader", name="ingest-feed"),
    run=Run(runId="<uuidv7>"),
    inputs=[Dataset(namespace="rss", name="https://example.com/feed.xml")],
    outputs=[Dataset(namespace="postgres://db/feeds", name="raw_content")],
))
```

### Available Transports

The Python client supports configurable transport backends:

- **HTTP** — send directly to Marquez or any OpenLineage-compatible endpoint
- **Kafka** — emit to a Kafka topic for durability and fan-out
- **Console** — stdout logging for local development/debugging
- **File** — write events to local files
- **Custom** — implement your own transport

---

## Where Lineage Data Is Stored — Marquez

**Marquez** is the reference OpenLineage backend and the recommended choice for this platform.

- **Website:** https://marquezproject.ai/
- **License:** Apache 2.0
- **Governance:** LFAI&Data (same as OpenLineage)

### Why Marquez

| Property          | Detail                                                         |
|-------------------|----------------------------------------------------------------|
| **Open source**   | Aligns with core principle #1                                  |
| **Self-hosted**   | No managed service dependency                                  |
| **Postgres-backed** | Reuses our existing Postgres infrastructure (design doc 007) |
| **K8s-deployable** | Standard container, fits our compute model                    |
| **REST API**      | `/api/v1/lineage` endpoint for event ingestion and querying    |
| **Web UI**        | Visual lineage DAG browser for jobs, datasets, and runs        |

### Capabilities

- Real-time metadata collection via OpenLineage-compatible endpoint
- Lineage graph traversal and dependency queries via REST API
- Impact analysis: "if this dataset changes, what downstream jobs are affected?"
- Root cause analysis: "this job failed — what upstream datasets changed?"
- Job run history with duration, status, and error tracking

### Deployment Architecture

```
Dagster Assets ──────┐
Temporal Workflows ──┤  openlineage-python client
FastAPI Services ────┤  (emit RunEvents)
Intelligent Broker ──┘
        │
        ▼ (HTTP or Kafka transport)
   ┌──────────┐
   │ Marquez  │──→ PostgreSQL (lineage store)
   │  Server  │──→ Web UI (lineage visualization)
   └──────────┘
        │
        ▼ (REST API)
   Lineage queries, impact analysis,
   root cause analysis, governance
```

### Transport Options

For production, two patterns make sense:

1. **Direct HTTP** — services emit events straight to Marquez. Simpler, fewer moving parts.
2. **Via Kafka** — services emit to a Kafka topic, Marquez consumes from Kafka. Adds durability
   and allows other consumers (e.g., alerting, audit log) to process lineage events.

---

## OpenTelemetry Correlation

OpenLineage run UUIDs can be correlated with OpenTelemetry trace IDs. A custom facet or
baggage item linking the two gives lineage + observability in one picture:

- **Lineage** answers: "what data did this job read and write?"
- **Tracing** answers: "how long did each step take and where did errors occur?"
- **Together** they answer: "this dataset is stale because the upstream workflow failed at
  activity X, which timed out calling service Y."

---

## Existing Integrations (Not Directly Applicable)

OpenLineage has native integrations for Apache Airflow, Spark, Flink, Hive, dbt, Great
Expectations, and Trino. None of these are direct fits for our primary orchestrators (Dagster,
Temporal), meaning we will need custom integration code using the Python client.

The SQL parser integration is directly useful — it can extract lineage from SQL statements
executed by any component without requiring per-component integration work.

---

## Implementation Path

1. **Add Marquez** to `monorepo/deploy/` as a Helm chart or K8s manifest.
2. **Create a shared library** at `monorepo/libs/lineage/` wrapping the OpenLineage Python client
   with platform namespace conventions and standard facets.
3. **Instrument Dagster first** — richest dataset semantics, most valuable lineage graph.
4. **Add Temporal interceptors** for workflow-level lineage.
5. **Define custom facets** for platform-specific metadata (schema registry versions, broker
   transformation rules, feed metadata).
6. **Correlate with OpenTelemetry** by linking run IDs to trace IDs.
