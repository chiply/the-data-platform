# Data Catalogue — Federated Metadata Discovery

> Research notes on adding a data catalogue / discovery layer to the platform. The recommended
> approach is a thin, federated catalogue that delegates to existing metadata subsystems rather
> than duplicating their data.

---

## The Problem

As the platform grows, metadata becomes scattered across subsystems:

- **Schema structure** lives in the schema registry
- **Lineage** lives in Marquez (OpenLineage)
- **Asset dependencies** live in Dagster
- **Operational metrics** live in OpenTelemetry / Grafana
- **Workflow state** lives in Temporal

No single system can answer cross-cutting questions like "what data do we have, who owns it,
where did it come from, and is it healthy?" A data catalogue provides a unified discovery and
governance layer on top of these subsystems.

---

## Prescriptive vs Descriptive Metadata

A critical distinction shapes the architecture:

| | Prescriptive (Design-Time) | Descriptive (Runtime) |
|---|---|---|
| **Direction** | Schema → system | System → metadata |
| **Purpose** | Define what SHOULD exist | Record what DOES exist |
| **Authority** | The schema is the source of truth | The running system is the source of truth |
| **Platform example** | Schema registry → codegen → deployed services | Catalogue crawls deployed services |
| **Change flow** | Change the schema, regenerate the system | System changes, catalogue re-discovers |

The platform's schema registry is **prescriptive** — schemas are authored first, registered, and
then code is generated from them. This is fundamentally different from tools like OpenMetadata
that **describe** what already exists by crawling systems.

A data catalogue for this platform must respect the prescriptive registry as the authoritative
source for contract definitions, not attempt to replace or duplicate it.

---

## What the Platform Already Has

| Concern | Existing Component | What It Knows |
|---|---|---|
| **Shape** | Schema Registry | Every contract's structure, version, compatibility level, governance tier |
| **Lineage** | OpenLineage / Marquez | What produces and consumes each dataset, run history, impact analysis |
| **Operations** | OpenTelemetry | Latency, errors, throughput of jobs and services |
| **Batch Assets** | Dagster | Asset dependency graph, materialization history, partitions |
| **Workflows** | Temporal | Workflow types, execution state, signal/query contracts |

Each subsystem is the authoritative source for its own metadata domain. The catalogue should
**federate** queries to these systems, not crawl and copy their data.

---

## What a Catalogue Adds

The catalogue owns only the metadata that doesn't live anywhere else:

1. **Unified search & discovery** — "find all datasets related to feed ingestion" across
   schemas, lineage, assets, and tables in one query
2. **Ownership & stewardship** — who owns this schema/dataset/pipeline? Who do I ask when
   something breaks?
3. **Business context & documentation** — human-readable descriptions, domain tags, glossary
   terms that are not derivable from code
4. **Data quality dashboard** — aggregated view of quality assertions from OpenLineage
   `dataQualityAssertions` facets and Great Expectations results
5. **Access policies** — who can read/write which datasets (ties into OPA)
6. **Usage statistics** — which datasets are most queried, which are stale/orphaned

---

## Recommended Architecture: Thin Federated Catalogue

A lightweight FastAPI service that federates metadata from existing subsystems and stores only
the organizational/business layer itself.

```
Schema Registry ──┐
Marquez (Lineage)──┤
Dagster ───────────┤──→  Catalogue API  ──→  Catalogue UI
Temporal ──────────┤     (FastAPI)           (search, browse,
OTel (Grafana) ────┘                         ownership, docs)
                         │
                         ▼
                    PostgreSQL
                    (ownership, tags,
                     descriptions,
                     glossary — ONLY
                     metadata not held
                     elsewhere)
```

### What the Catalogue Stores (Its Own PostgreSQL Tables)

- **Ownership** — entity → owner (team or individual) mapping
- **Business descriptions** — human-readable context for any entity
- **Domain tags** — business domain classification (e.g., ingestion, content, user-facing)
- **Glossary terms** — business vocabulary linked to technical assets
- **Classification tags** — PII, sensitive, public, deprecated, etc.
- **Usage statistics** — query frequency, consumer count, staleness metrics

### What the Catalogue Federates (Queried Live from Subsystems)

| Query | Delegated To |
|---|---|
| Schema structure & versions | Schema Registry REST API |
| Compatibility rules & governance tier | Schema Registry REST API |
| Lineage graph traversal | Marquez REST API |
| Impact analysis ("what breaks if I change X?") | Marquez REST API |
| Asset materialization status | Dagster GraphQL API |
| Workflow execution history | Temporal API |
| Operational metrics & health | OTel / Grafana API |

### Data Model Sketch

```
CatalogueEntry
├── catalogue_id: UUID (canonical identifier across all systems)
├── entity_type: schema | dataset | pipeline | workflow | service
├── owner: team or individual
├── domain: business domain tag
├── description: human-readable business context
├── tags: [pii, tier-1, deprecated, ...]
├── glossary_terms: links to business glossary
├── quality_score: aggregated from OpenLineage quality facets
└── usage_stats: query frequency, consumer count

EntityRef (cross-reference map — see Entity Resolution below)
├── catalogue_id: UUID (FK to CatalogueEntry)
├── system: "schema-registry" | "marquez" | "dagster" | "temporal" | "postgres"
├── external_ref: identifier in that system
└── entity_type: "dataset" | "job" | "workflow" | "schema"
```

### Entity Resolution

The central challenge of the federated approach is that every subsystem names the same entity
differently:

| System | How it refers to the same table |
|---|---|
| Schema Registry | `db.feed-service.content_items` (namespace convention) |
| Marquez | `postgres://feeds-db/feeds.content_items` (OpenLineage dataset namespace) |
| Dagster | `content_items` (asset key) |
| Postgres | `feeds.content_items` (schema.table) |
| CDC / Debezium | `cdc.feed-service.content_items` (topic name) |

When a user asks "show me the lineage of `content_items`", the catalogue must:

1. Know this entity's Marquez identifier to fetch lineage
2. Know each upstream/downstream node's schema registry identifier to fetch structure
3. Know each node's Dagster/Temporal identifier to fetch operational status

Without a cross-reference map, federation cannot work. This is the load-bearing piece of the
architecture.

#### The Entity Reference Table

```sql
CREATE TABLE entity_ref (
    catalogue_id   UUID NOT NULL,
    system         TEXT NOT NULL,
    external_ref   TEXT NOT NULL,
    entity_type    TEXT NOT NULL,
    PRIMARY KEY (catalogue_id, system),
    UNIQUE (system, external_ref)
);
```

Example for `content_items`:

| catalogue_id | system | external_ref |
|---|---|---|
| `uuid-abc` | schema-registry | `db.feed-service.content_items` |
| `uuid-abc` | marquez | `postgres://feeds-db/feeds.content_items` |
| `uuid-abc` | dagster | `content_items` |
| `uuid-abc` | postgres | `feeds.content_items` |
| `uuid-abc` | cdc | `cdc.feed-service.content_items` |

#### Population Strategies

Three approaches, not mutually exclusive:

**1. Derived from schema registry at registration time (recommended primary)**

Schemas already declare what they produce via `x-` custom properties. At registration time,
the catalogue generates all cross-references deterministically:

```python
# Schema registered: db.feed-service.content_items
# x-schema-kind: database-table
# x-table-name: content_items

catalogue_id = uuid7()
refs = [
    ("schema-registry", "db.feed-service.content_items"),
    ("postgres",        "feeds.content_items"),
    ("marquez",         "postgres://feeds-db/feeds.content_items"),
    ("cdc",             "cdc.feed-service.content_items"),
]
```

This works because the platform's naming conventions are well-defined — the schema registry
namespace convention (`db.<service>.*`, `events.<service>.*`, `asset.<service>.*`) provides
a deterministic mapping to every other system's naming scheme.

The schema could also carry explicit references for non-derivable mappings:

```json
{
  "name": "ContentItems",
  "namespace": "db.feed-service",
  "x-schema-kind": "database-table",
  "x-table-name": "content_items",
  "x-dagster-asset": "content_items",
  "x-openlineage-dataset": "postgres://feeds-db/feeds.content_items"
}
```

**2. OpenLineage events carry the mapping (automatic at runtime)**

When Dagster or Temporal emit OpenLineage events, a custom facet includes the schema registry
reference:

```json
{
  "platformSchemaRef": {
    "_producer": "https://platform.internal/lineage/facets/schemaRef",
    "_schemaURL": "https://platform.internal/lineage/facets/schemaRef/v1",
    "subject": "db.feed-service.content_items",
    "version": 3
  }
}
```

The catalogue listens to these events (same Marquez endpoint or a Kafka topic) and builds
the cross-reference automatically. More resilient to naming convention changes, but requires
instrumenting every producer.

**3. Convention-based resolution at query time (no storage)**

If naming conventions are strict enough, the catalogue can compute mappings on the fly without
storing them:

```python
def resolve_to_marquez(schema_ref: str) -> str:
    # "db.feed-service.content_items" → "postgres://feeds-db/feeds.content_items"
    parts = schema_ref.split(".")
    service, table = parts[1], parts[2]
    db_name = SERVICE_DB_MAP[service]
    return f"postgres://{db_name}/feeds.{table}"
```

No state to sync, but brittle if conventions aren't perfectly followed. Best used as a
fallback, not the primary strategy.

#### Difficulty Assessment

| Aspect | Difficulty | Notes |
|---|---|---|
| The `entity_ref` table | Trivial | One table, simple CRUD |
| Populating from schema registry | Easy | `x-` properties are already designed for this |
| Convention-based derivation | Easy | Naming conventions are well-structured |
| Entities not in the schema registry | Moderate | External sources, ad-hoc tables need manual or crawler-based mapping |
| Keeping refs in sync on renames | Moderate | Schema renames, service renames, table migrations require ref updates |
| Lineage query fan-out + enrichment | Moderate | Parallel async calls to 3-5 systems, caching, graceful degradation |
| **Full-text search** | **Hard** | See Search section below |

#### Lineage Query Flow

When a user clicks "show lineage" on an entity in the catalogue UI:

```
1. Look up entity's Marquez ref via entity_ref table
2. GET Marquez /api/v1/lineage?nodeId=<ref>&depth=3
3. Marquez returns lineage DAG (nodes + edges)
4. For each node in the DAG:
   a. Look up catalogue_id via entity_ref (system="marquez", external_ref=node.id)
   b. Fetch enrichment in parallel:
      - Schema Registry: schema structure, version, governance tier
      - Catalogue DB: owner, tags, description
      - Dagster/Temporal: operational status (based on entity type)
5. Return enriched lineage graph to UI
```

Each node in the rendered lineage DAG shows:

- Name and type (from Marquez)
- Schema version and governance tier (from Schema Registry)
- Owner and business description (from Catalogue DB)
- Operational health (from Dagster/Temporal/OTel)

Partial failures should degrade gracefully — if the schema registry is unreachable, show
lineage without schema details rather than failing entirely.

---

## How the Feed Reader Would Use It

| Discovery Question | Catalogue Answers Via |
|---|---|
| "What schemas does feed-service own?" | Schema Registry (namespace `*.feed-service.*`) |
| "What happens downstream if I change the `feeds` table?" | Marquez impact analysis (lineage graph) |
| "Who owns the summarization pipeline?" | Catalogue's own ownership metadata |
| "What does `content_items` actually contain?" | Schema Registry (structure) + Catalogue (business description) |
| "Which feeds are stale / never ingested?" | Dagster asset status + OTel metrics |
| "Show me all datasets tagged `PII`" | Catalogue tags (ties into OPA policies for access control) |

---

## Why Not OpenMetadata

OpenMetadata (Apache 2.0, open source) was evaluated as an off-the-shelf alternative. It is the
most architecturally aligned catalogue product available — Postgres-backed, K8s-deployable,
simple ops (4 components, no Elasticsearch/Neo4j required), 84+ connectors.

### Architecture

```
┌─────────────────────────────────────────┐
│             UI (TypeScript)             │
└──────────────────┬──────────────────────┘
┌──────────────────▼──────────────────────┐
│         Metadata APIs (Java)            │
│    700+ JSON Schemas define the model   │
└──────────────────┬──────────────────────┘
┌──────────────────▼──────────────────────┐
│       Metadata Store (PostgreSQL)       │
│    Unified metadata graph — entities,   │
│    relationships, lineage, tags         │
└──────────────────┬──────────────────────┘
┌──────────────────▼──────────────────────┐
│     Ingestion Framework (Python)        │
│    84+ connectors, pull-based crawling  │
└─────────────────────────────────────────┘
```

### What OpenMetadata Provides

| Capability | Detail |
|---|---|
| Discovery | Full-text search across all data assets |
| Lineage | Column-level lineage visualization with no-code editor |
| Quality | Built-in data quality test framework |
| Governance | Glossary terms, classification tags, tiered policies, RBAC |
| Collaboration | Conversations/threads on any data asset, task assignments |
| Observability | Schema change tracking, freshness, volume anomaly detection |

### Why It Was Not Chosen

The fundamental mismatch is that OpenMetadata is **descriptive** — it crawls existing systems
and stores a copy of their metadata. This conflicts with the platform's prescriptive,
schema-first architecture:

1. **Metadata duplication** — The schema registry already has versioned, compatibility-checked
   schemas. OpenMetadata would crawl Postgres and store its own copy of table schemas, which
   could drift from what the registry says.

2. **Authority conflict** — If someone updates a description or tag in OpenMetadata, it's
   unclear whether that overrides what's in the schema registry. Two sources of truth is worse
   than one.

3. **Pull-based ingestion model** — OpenMetadata's connectors crawl systems on a schedule,
   producing eventually-consistent metadata. The federated approach queries authoritative
   sources in real-time.

4. **Concern overlap** — OpenMetadata has built-in systems for data quality, lineage,
   observability, and access control. The platform already has dedicated tools for each of
   these (Great Expectations + OpenLineage facets for quality, Marquez for lineage, OTel +
   Grafana for observability, OPA for access control). There is no way to selectively disable
   these features in OpenMetadata — they are baked into its entity model and UI. Adopting
   OpenMetadata means either ignoring built-in features (creating confusion about which system
   is authoritative) or letting OpenMetadata win on those concerns and retiring the standalone
   tools.

5. **Java backend in a Python-first platform** — OpenMetadata's API server is Java. Extending
   it to integrate more deeply with the schema registry or other platform subsystems means
   maintaining a Java service outside the platform's build system, libraries, and patterns.

6. **Operational overhead** — Despite being simpler than DataHub, the full deployment is:
   Java API server, Python ingestion framework (running on Airflow or externally),
   Elasticsearch (for search), PostgreSQL (metadata store), and N scheduled ingestion
   pipelines. This is significant for a discovery layer.

7. **Not composable** — OpenMetadata is a coherent product, not a composable library. You
   cannot adopt "just entity resolution and search" while bringing your own lineage and
   quality. It is all or nothing.

OpenMetadata could work as a read-only view, but the federated approach is simpler and avoids
the sync/drift problem entirely.

### Landscape Context

| | OpenMetadata | DataHub (LinkedIn) | Amundsen (Lyft) |
|---|---|---|---|
| Status | Active, growing | Active, mature | Maintenance mode |
| Architecture | Simple (Postgres) | Complex (Kafka, ES, Neo4j, MySQL) | Moderate (Neo4j, ES) |
| Lineage | Column-level, built-in | Column-level, event-driven | Basic |
| Quality | Built-in test framework | Via integrations | None |
| Self-hosting | Straightforward | Operationally heavy | Moderate |

---

## Relationship to Other Platform Subsystems

```
DESIGN TIME (prescriptive)              RUNTIME (descriptive)
────────────────────────                ────────────────────

Schema Registry                         Data Catalogue
  "What SHOULD exist"                     "What DOES exist + who owns it"
       │                                       ▲
       ▼                                       │
  Codegen → DB tables, APIs,            Federates from schema registry,
            events, workflows            Marquez, Dagster, OTel, Temporal
       │                                       ▲
       ▼                                       │
  Deployed systems ────────────────────────────┘
       │
       ▼
  OpenLineage events → Marquez (lineage)
  OTel spans/metrics → Grafana (operations)
  Dagster assets → Dagster UI (batch)
```

The catalogue sits at the top of this stack as an aggregation layer. It does not participate in
the prescriptive flow (schema → codegen → deployment) — it observes the result and enriches it
with business context.

---

## Federated Search

Search is the hardest problem in the federated approach. When someone types "feed ingestion"
into the catalogue, the system must search across schema names (schema registry), dataset and
job names (Marquez), asset names (Dagster), and ownership/tags (catalogue DB).

Fanning out a full-text search to 5 APIs in real-time and merge-ranking the results is not
viable. The catalogue will need a **local search index** — a lightweight copy of entity names,
descriptions, tags, and cross-references from all systems.

This is the closest the federated approach comes to metadata duplication. The key difference
from OpenMetadata's crawler model is scope: the search index contains only searchable metadata
(names, descriptions, tags, refs) — not full schema structures, lineage graphs, or quality
metrics. Those are still fetched live from authoritative sources when a user drills into a
specific entity.

### Index Population Options

- **Event-driven** — Schema registry emits events on registration, Marquez emits change events,
  Dagster emits asset events. The catalogue subscribes and keeps the index current.
- **Periodic sync** — Lightweight sweep of each subsystem's list endpoints on a schedule.
  Simpler, but introduces staleness.
- **Hybrid** — Event-driven for systems that support it, periodic sync as a fallback.

### Search Technology

PostgreSQL full-text search (`tsvector`/`tsquery`) may be sufficient given the index only
contains entity metadata — not document-scale content. This avoids adding Elasticsearch as
a dependency. If search quality or scale requirements grow, Elasticsearch/OpenSearch can be
added later as a dedicated search backend.

---

## Caching and Partial Failure

Federated queries fan out to multiple subsystems. Two concerns follow:

### Caching Strategy

Enrichment data (schema structure, operational status) should be cached with short TTLs to
avoid hammering subsystem APIs on every page view. Suggested approach:

- **Schema structure**: Cache for minutes (schemas change infrequently, and changes go through
  CI — they are not surprising)
- **Lineage graph**: Cache for minutes (lineage changes only when jobs run or are reconfigured)
- **Operational status**: Cache for seconds or fetch live (this is the most time-sensitive)
- **Ownership, tags, descriptions**: Served from catalogue's own DB (no caching needed)

### Graceful Degradation

If a subsystem is unreachable, the catalogue should show what it can rather than failing
entirely:

| Subsystem Down | Degraded Experience |
|---|---|
| Schema Registry | Show entity without schema structure or version info |
| Marquez | Show entity without lineage graph |
| Dagster / Temporal | Show entity without operational status |
| Catalogue DB | Nothing works — this is the catalogue's own store |

The UI should clearly indicate when data is stale (served from cache) or unavailable.

---

## Open Questions

- [ ] Entity ref population — which combination of strategies (schema-derived, OpenLineage
      facets, convention-based) to implement first
- [ ] Search technology — is Postgres full-text search sufficient, or is Elasticsearch needed
      from day one?
- [ ] Search index sync — event-driven, periodic, or hybrid?
- [ ] Cache implementation — in-process (e.g., TTL dict), Redis, or HTTP cache headers?
- [ ] Glossary management — how to define and maintain business glossary terms, and how they
      relate to schema registry namespaces
- [ ] OPA integration — how catalogue classification tags (PII, sensitive) feed into OPA
      policies for access control
- [ ] UI scope — purpose-built UI vs. extending an existing UI (Dagster, Marquez, Grafana)
      with catalogue metadata
- [ ] Entity lifecycle — how to detect and surface orphaned entities (schemas registered but
      no longer deployed, assets that haven't materialized in weeks)
- [ ] Entities without schemas — how to handle external data sources and ad-hoc tables that
      are not registered in the schema registry
