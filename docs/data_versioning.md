# Data Versioning — Research Notes

> Research notes on data versioning technologies and how they fit into the platform.
> Covers lake-level versioning (LakeFS) and open table formats (Delta Lake, Apache Iceberg).

---

## The Problem

Data pipelines lack the version control guarantees that software development takes for granted.
Without data versioning:

- A bad ingestion run can corrupt production data with no easy rollback
- Reproducing a pipeline run from last week requires manual snapshot management
- Testing a new transformation against production data means copying it or risking production
- There is no audit trail of what data looked like at a given point in time
- Schema evolution and data migration happen without safety nets

Data versioning brings Git-like semantics — commits, branches, rollback, time-travel — to data.

---

## Two Layers of Versioning

Data versioning operates at two distinct layers that are complementary, not competing:

| Layer | Scope | Tools |
|-------|-------|-------|
| **Table format** | Individual tables — ACID transactions, time-travel queries, schema evolution | Delta Lake, Apache Iceberg, Apache Hudi |
| **Lake versioning** | Entire data lake — branching, merging, CI/CD for data across all files/formats | LakeFS |

You can (and often should) use both: a lake versioning layer managing a collection of tables
stored in an open table format.

---

## Open Table Formats

### Delta Lake

An open table format originally created by Databricks, now under the Linux Foundation.

- **How it works:** A `_delta_log/` directory alongside Parquet files tracks every commit
  (file additions, removals, schema changes, metadata). Readers replay the log to reconstruct
  any prior table version.
- **Key features:** ACID transactions, time-travel queries, schema enforcement/evolution,
  audit history, streaming read/write support.
- **Governance:** Linux Foundation, but Databricks drives the roadmap. The most capable
  runtime features (e.g., liquid clustering) often land in Databricks-managed runtimes first.
- **Ecosystem:** Strong Spark integration, good Dagster support via `dagster-deltalake`.
- **License:** Apache 2.0

### Apache Iceberg

An open table format created at Netflix, now an Apache Software Foundation project.

- **How it works:** A metadata layer (manifest lists → manifests → data files) tracks table
  state. Each snapshot is an immutable, complete picture of the table.
- **Key features:** ACID transactions, time-travel, schema evolution, hidden partitioning
  (users don't need to know the partition scheme), partition evolution (change partitioning
  without rewriting data).
- **Governance:** Apache Foundation — fully community-governed with no single-vendor control.
- **Ecosystem:** Broadest compute engine support — Spark, Trino, Flink, DuckDB, Snowflake,
  BigQuery all have native Iceberg readers/writers.
- **License:** Apache 2.0

### Apache Hudi

An open table format originally created at Uber for incremental data processing.

- **Strength:** Optimized for upsert-heavy and CDC workloads.
- **Narrower adoption** than Iceberg or Delta Lake for general-purpose analytics.
- Not evaluated further for this platform.

### Comparison

| Concern | Delta Lake | Apache Iceberg |
|---------|-----------|----------------|
| **Vendor neutrality** | Linux Foundation, but Databricks-driven | Apache Foundation, fully community-governed |
| **Compute engine support** | Strongest in Spark/Databricks ecosystem | Broadest — Spark, Trino, Flink, DuckDB, Snowflake, BigQuery |
| **Partitioning** | User-managed | Hidden partitioning + partition evolution |
| **Streaming** | Better streaming read/write story | Catching up, but improving |
| **Dagster integration** | `dagster-deltalake` (mature) | `dagster-iceberg` (newer, maturing) |
| **Local development** | Works with DuckDB, local Spark | Works with DuckDB (zero-infra), local Spark |

---

## Lake-Level Versioning — LakeFS

LakeFS provides Git-like version control for an entire data lake, independent of file format.

- **How it works:** Acts as an S3-compatible gateway in front of object storage. Tools (Spark,
  Dagster, any S3 client) interact with LakeFS as if it's S3. LakeFS manages versioning
  metadata without duplicating data (copy-on-write).
- **Key features:** Branching, commits, merges, diffs, rollback, tags — all at the
  repository/lake level across every file and format.
- **Use cases:**
  - Branch data for testing a new pipeline, validate, merge to main
  - Atomic rollback of a bad ingestion across multiple tables
  - CI/CD for data — run quality checks on a branch before promoting
  - Reproducible environments — tag a data snapshot for a specific experiment or report
- **Governance:** Open source, Apache 2.0
- **Deployment:** Self-hosted, runs on Kubernetes, backed by PostgreSQL for metadata

### LakeFS vs Table Formats

LakeFS and table formats operate at different levels and complement each other:

- **LakeFS** = repository-level operations (branch the whole lake, merge across tables)
- **Table format** = table-level operations (ACID writes, time-travel within a single table)

Using both: LakeFS branches your lake, Iceberg provides transactional table semantics within
each branch.

---

## Recommendation for This Platform

**Apache Iceberg** (table format) + **LakeFS** (lake versioning).

### Why Iceberg Over Delta Lake

1. **Open source everything** (Principle #1) — Iceberg's Apache Foundation governance has no
   single-vendor gravity. Delta Lake is open source but Databricks controls the spec and the
   most advanced features land in their managed runtime first. This is the kind of vendor
   dependency the platform's first principle warns against.

2. **Standards all the way down** (Principle #2) — Iceberg has become the de facto open table
   format standard. AWS, GCP, Snowflake, and Databricks itself now support Iceberg as an
   interchange format. It is the convergence point, analogous to OpenTelemetry for
   observability.

3. **Local testing first-class** (Principle #3) — Iceberg's broad engine support means
   DuckDB can query Iceberg tables locally with zero infrastructure, while production uses
   Trino or Spark. Delta Lake ties you more tightly to the Spark ecosystem for local dev.

4. **Future-proofing** — If the platform ever swaps compute engines (e.g., Spark to Trino,
   or DuckDB for development), Iceberg tables work without migration. Delta Lake is more
   tightly coupled to Spark.

### Why LakeFS

- **Git-like model** aligns with the platform's Git-centric workflow and developer ergonomics
- **Self-hosted on K8s** with PostgreSQL metadata — fits existing infrastructure (design doc 007)
- **S3-compatible API** — no special client libraries needed; any S3-aware tool works
- **Format-agnostic** — works with Iceberg, Parquet, JSON, or any file type

### Recommended Stack

| Layer | Tool | Role |
|-------|------|------|
| Lake versioning | LakeFS | Git-like branching, rollback, CI/CD for data |
| Table format | Apache Iceberg | ACID transactions, time-travel, schema evolution per table |
| Orchestration | Dagster (already chosen) | Pipeline scheduling, asset lineage |
| Local query engine | DuckDB | Zero-infrastructure local development and testing |

---

## Integration Points With the Platform

### Dagster Pipelines (`pipelines/`)

The most natural fit. Dagster assets can read/write Iceberg tables, and LakeFS branching
enables safe data promotion workflows:

- Materialize assets to a LakeFS branch
- Run data quality checks
- Merge to main on success, discard on failure

### Schema Registry

The platform's schema registry tracks schema versions for Avro/Protobuf. Iceberg also
enforces schema at the storage layer. These can be wired together so schema registry
compatibility checks gate Iceberg table writes, providing defense in depth.

### Data Lineage (OpenLineage + Marquez)

Both Iceberg and LakeFS produce metadata compatible with OpenLineage. Iceberg snapshot IDs
map to the `version` dataset facet. LakeFS commit SHAs can be tracked as custom facets,
tying data versions to lineage events in Marquez.

### Feed Reader Sample Service

Concrete example with the reference implementation:

- **Branching for model changes:** Branch the data lake, run a new summarization model,
  compare output quality against main, merge if better
- **Time-travel for quality checks:** Compare today's summaries against last week's
- **Rollback:** A bad feed ingestion run can be rolled back atomically
- **Audit trail:** Every ingestion and summarization run is a versioned commit

---

## Open Questions

- [ ] **Dagster-Iceberg maturity:** `dagster-iceberg` is newer than `dagster-deltalake`. Evaluate
  whether it covers the platform's needs or if custom IOManager work is required.
- [ ] **Object storage selection:** LakeFS sits in front of S3-compatible storage. Evaluate MinIO
  (self-hosted, open source) vs cloud S3 for the backing store.
- [ ] **Iceberg catalog:** Iceberg requires a catalog (tracks which tables exist and their current
  metadata location). Options include REST catalog, Hive Metastore, Nessie, or AWS Glue.
  Evaluate which fits the open-source-first principle.
- [ ] **LakeFS + Iceberg integration depth:** LakeFS has specific Iceberg support — evaluate
  whether branching semantics compose cleanly with Iceberg's snapshot model.
