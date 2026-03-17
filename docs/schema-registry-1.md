# Schema Registry — What to Register & Registration Strategy

> Research notes from schema registry design discussions. Builds on `schema_registry.md`
> (sourcing & registration research) with concrete recommendations on scope, governance,
> and the hybrid manual/auto registration model.

---

## Core Principle: Schemas Drive Implementation

The platform's schema registry is not a passive catalog — it is the source of truth from which
implementations are generated. Schemas are authored first, registered, and then code (database
models, API interfaces, event types, workflow contracts) is generated from them.

This means registration is a deliberate design act, not a collection step. The registry answers:
"what are the contracts in this system, and what is their shape?"

---

## What to Register

### The Registration Rule

**Register a schema when its shape is materialized or when it forms a contract between
independently deployable components.**

Two heuristics reinforce each other:

1. **Contract surface** — if changing the schema can break something other than the service
   that owns it, register it.
2. **Materialization** — if data is persisted in durable storage, its shape is worth defining.
   Materialized data has readers you don't know about yet.

### Tier 1 — Mandatory (Cross-Boundary Contracts)

| Category | Why | Feed Reader Examples |
|---|---|---|
| **Event schemas** (CloudEvents payloads) | Multiple independent consumers; breakage is silent and runtime | `feed.content.ingested`, `feed.subscription.created` |
| **Cross-service API contracts** | Other services call these; SDK generation depends on them | Feed service public API request/response models |
| **gRPC service definitions** | Protobuf contracts consumed by generated clients | gRPC definitions if applicable |
| **Workflow input/output** (Temporal) | Other services start workflows or receive results | `IngestFeedInput`, `SummarizationResult` |
| **Workflow signal/query schemas** | External callers send signals or query state | `PauseFeedSignal`, `FeedStatusQuery` |
| **Broker transformation schemas** | The intelligent broker requires known source/target shapes | Raw RSS content model → normalized content model |
| **Dagster asset I/O schemas** crossing boundaries | Downstream assets and sensors depend on the shape | `daily_digest` output schema consumed by the serving layer |

### Tier 2 — Register When Exposed (Materialized + Visible)

| Category | Trigger for Registration |
|---|---|
| **Database tables with CDC enabled** | Debezium streams the table — its row schema becomes a public contract. Downstream Temporal workflows, Dagster sensors, and consumers all depend on it. |
| **Database tables directly read by other services** | Should be rare (it's coupling), but if it exists, the schema is a contract. |

### Tier 3 — Register for Completeness (Materialized, Internal)

| Category | Why |
|---|---|
| **Private database tables** (no CDC, no cross-service reads) | The shape is worth defining even if no external consumer exists today. Enables future CDC enablement without scrambling to define a schema after the fact. |
| **Internal Dagster assets** | Consistent schema-driven development across all materialized data. |

### Do NOT Register

- In-memory data structures and ephemeral processing state
- Test fixtures and development-only schemas
- Schemas that are 1:1 derivations of an already-registered schema (duplicates)
- Temporary staging tables used within a single pipeline run

### Feed Reader Concrete Examples

| Artifact | Register? | Governance | Rationale |
|---|---|---|---|
| `feeds` table | Yes | STANDARD | CDC-streamed, triggers ingestion workflows |
| `content_items` table | Yes | STANDARD | CDC-streamed, triggers summarization + search indexing |
| `user_subscriptions` table | Yes | STANDARD | CDC-streamed, triggers re-ranking |
| `CreateFeedRequest` API model | Yes | STRICT | Public API consumed by clients and generated SDKs |
| `FeedIngestedEvent` payload | Yes | STRICT | CloudEvents payload consumed by multiple services |
| `IngestFeedInput` workflow schema | Yes | STRICT | Other services start this workflow |
| `_feed_poll_cursor` tracking table | Yes | ADVISORY | Internal bookkeeping, but materialized — worth tracking |
| `FeedParserState` (in-memory) | No | — | Ephemeral, lives only during workflow execution |

---

## Tiered Governance Model

Registration does not imply strict compatibility enforcement. The governance level is a
property of the subject, not a consequence of registration.

| Governance Level | Compatibility Rule | What Goes Here | On Breaking Change |
|---|---|---|---|
| **STRICT** | FULL or BACKWARD | Event schemas, API contracts, workflow I/O, broker schemas | CI fails, PR blocked |
| **STANDARD** | BACKWARD | CDC-streamed tables, cross-boundary Dagster assets | CI fails, PR blocked |
| **ADVISORY** | NONE (track only) | Private tables, internal assets, staging state | Warning only, recorded in registry |

This means:
- At **STRICT**, a breaking change fails CI. Full compatibility review required.
- At **STANDARD**, backward compatibility is checked. The scope of impact is smaller but real.
- At **ADVISORY**, the registry records the schema with no gates. The shape is known, searchable,
  and available for lineage correlation and impact analysis.

### Promotion Path

When an ADVISORY schema gains an external consumer (e.g., CDC is enabled on a private table),
promote it to STANDARD or STRICT. The schema already exists in the registry — no scramble to
define it after the fact.

---

## Hybrid Registration: Manual + Auto

### Guiding Principle

**Manual registration for schemas that ARE the source of truth. Auto-registration for schemas
that are DERIVED from a different source of truth.**

This preserves "schemas drive implementation" for everything except cases where duplicating a
schema manually would be pure overhead that drifts.

### Manual Registration (Schema-First) — Primary

Schemas in `monorepo/schemas/` are hand-authored Avro (or Protobuf for gRPC). They are the
source of truth. Code is generated FROM them.

Covers:
- Event schemas
- API request/response contracts
- Workflow input/output contracts
- Broker transformation schemas

**Lifecycle:**

```
Author schema in monorepo/schemas/
        │
        ▼
PR opened → CI runs compatibility check against registry
        │
        ▼
PR merged → CI registers schema in registry
        │
        ▼
Codegen runs → produces implementation artifacts
```

### Auto-Registration (Derived Schemas) — Secondary

Auto-registration is appropriate **only when the schema is derived from a different
authoritative source** and manually authoring it would create duplication that drifts.

**1. CDC change event schemas**

The source of truth is the database migration (DDL), not a hand-authored Avro file. Debezium
generates Avro schemas from the WAL. Auto-registering these:

- Eliminates the double-write problem (update migration AND schema file)
- Lets the compatibility checker flag migrations that would break downstream CDC consumers
  before they run
- Registration is still guarded by STANDARD compatibility rules

**2. Drift detection (verification, not registration)**

For manually-registered schemas, CI extracts the actual schema from build artifacts (OpenAPI
spec from FastAPI, Protobuf descriptors) and compares against the registry. Drift = build
failure. This audits that the implementation matches the contract.

### The Hybrid Visualized

```
Schema-First (manual)              Derived (auto)
─────────────────────              ──────────────
Source:  monorepo/schemas/         Database DDL (migrations)
Truth:   The schema file           The migration file
Flow:    Schema → codegen →        Migration → DDL → Debezium → schema
         implementation
Registry: CI registers on merge   Debezium registers on connect
Guard:   Compat check at PR time   Compat check at registration time
Governance: STRICT                 STANDARD

         Verification (auto-extraction)
         ──────────────────────────────
Source:  Build artifacts (OpenAPI, descriptors)
Purpose: Detect drift between registered schema and actual implementation
Flow:    Build → extract → compare to registry → fail if mismatch
```

---

## Using Avro as the Universal Schema Language

### The Proposal

Use Avro as the single canonical schema language for all registered schemas — database tables,
API interfaces, event payloads, workflow contracts. Each schema carries metadata (via Avro's
custom properties) that tells codegen what to produce.

### What Avro Provides

Avro schemas define record structures with fields, types, defaults, nullability, logical types
(dates, timestamps, UUIDs, decimals), unions, enums, nested records, and arrays. This is
sufficient to describe the **shape** of any data structure.

### What Avro Doesn't Express (The Convention Layer)

Domain-specific semantics are expressed via `x-` custom properties:

| Concern | Database | API | Avro native? | Convention |
|---|---|---|---|---|
| Field types | Yes | Yes | Yes | — |
| Nullability | Yes | Yes | Yes (unions with null) | — |
| Defaults | Yes | Yes | Yes | — |
| Primary keys | Yes | No | **No** | `x-primary-key` |
| Indexes | Yes | No | **No** | `x-index` |
| Foreign keys | Yes | No | **No** | `x-foreign-key` |
| Constraints | Yes | Sometimes | **No** | `x-unique`, `x-check`, `x-max-length` |
| HTTP method/path | No | Yes | **No** | `x-http-method`, `x-http-path` |
| Query vs body vs path | No | Yes | **No** | `x-param-location` |

### Schema Kind Annotation

Every registered schema carries an `x-schema-kind` that dispatches to the correct codegen
backend:

**Database table example:**

```json
{
  "type": "record",
  "name": "Feed",
  "namespace": "com.platform.feedservice",
  "x-schema-kind": "database-table",
  "x-table-name": "feeds",
  "fields": [
    {
      "name": "id",
      "type": {"type": "string", "logicalType": "uuid"},
      "x-primary-key": true
    },
    {
      "name": "url",
      "type": "string",
      "x-unique": true,
      "x-max-length": 2048
    },
    {
      "name": "title",
      "type": ["null", "string"],
      "default": null
    },
    {
      "name": "created_at",
      "type": {"type": "long", "logicalType": "timestamp-micros"},
      "x-default": "now()"
    }
  ]
}
```

**API request example:**

```json
{
  "type": "record",
  "name": "CreateFeedRequest",
  "namespace": "com.platform.feedservice.api",
  "x-schema-kind": "api-request",
  "x-http-method": "POST",
  "x-http-path": "/feeds",
  "fields": [
    {
      "name": "url",
      "type": "string"
    },
    {
      "name": "title",
      "type": ["null", "string"],
      "default": null
    }
  ]
}
```

### The Codegen Pipeline

```
monorepo/schemas/feed-service/
├── feed.avsc                    # Database table schema
├── feed_api.avsc                # API request/response schemas
├── feed_ingested_event.avsc     # Event schema
└── ingest_feed_workflow.avsc    # Workflow I/O schema
          │
          ▼  (codegen dispatches on x-schema-kind)
          │
   ┌──────┴──────────────────────────────────────┐
   │  x-schema-kind: database-table              │
   │  → SQLAlchemy model + Alembic migration     │
   │                                             │
   │  x-schema-kind: api-request / api-response  │
   │  → Pydantic model + FastAPI route stub      │
   │                                             │
   │  x-schema-kind: event                       │
   │  → Pydantic model + CloudEvents envelope    │
   │                                             │
   │  x-schema-kind: workflow-input / output     │
   │  → dataclass + Temporal type stubs          │
   └─────────────────────────────────────────────┘
```

### Why Avro Over Protobuf for This Use Case

- Custom metadata is simpler (arbitrary JSON keys vs proto extension registry)
- Schema compatibility checking is well-understood (the registry already implements this)
- The platform is Python-first, where Avro tooling is solid
- Schemas are the artifact that gets registered — Avro is already the registry format
- If gRPC services are needed, Protobuf can be supported for those specifically while Avro
  remains the canonical registry format

### Important: The Convention Layer Is Load-Bearing

The `x-*` properties carry all domain-specific semantics, and Avro itself doesn't validate
them. This requires:

1. **A schema for your schema metadata** — a JSON Schema or OPA policy that validates `x-schema-kind`,
   `x-primary-key`, etc. are used correctly
2. **Codegen that understands the conventions** — custom tooling in `monorepo/tools/`
3. **Documentation of the conventions** — what `x-` properties exist, what values are valid,
   what each codegen backend expects

This is the same pattern as CloudEvents (standard envelope + custom extensions) and OpenLineage
(standard events + custom facets).

---

## Open Standard Schemas (OpenLineage, FHIR, OTel, CloudEvents, etc.)

Open standard schemas are schemas you **consume** rather than **author**. The governance model
is fundamentally different: you don't control their evolution, they're often huge, versioning
is external, and you use a subset.

### Do NOT Register Full Upstream Schemas

Registering all of FHIR R4 or the complete OTel semantic conventions would be bloat. The
registry should track **your relationship to the standard**, not the standard itself.

### Three Layers of Standard Schema Tracking

#### Layer 1: Version Pinning (Platform Configuration)

Track which version of each standard the platform targets. This is platform configuration,
not schema registration per se.

| Standard | Pinned Version | Governs |
|---|---|---|
| OpenLineage | 2.x.x | Lineage event structure, facet names |
| CloudEvents | 1.0.2 | Event envelope format |
| OTel Semantic Conventions | 1.x.x | Span/metric attribute names |
| AsyncAPI | 3.0.x | Async contract spec format |

Could live in the registry as metadata, or in a `monorepo/standards.yaml` that CI enforces.

#### Layer 2: Custom Extensions and Facets (Register These — STRICT)

When you **extend** a standard, the extension is yours and belongs in the registry with full
compatibility governance:

- **Custom OpenLineage facets** — `platform_schemaRegistryVersion`, `platform_brokerTransformation`,
  `platform_feedMetadata`. Downstream consumers (Marquez queries, alerting) depend on their shape.
- **Custom CloudEvents extension attributes** — any `x-platform-*` attributes added to the
  envelope beyond the spec.
- **Custom OTel attributes** — platform-specific span attributes beyond the semantic conventions.

#### Layer 3: Usage Profiles / Subsets (Register If Codegen Depends on Them — STANDARD)

If you use a subset of a standard and generate code from that subset, register the profile:

```json
{
  "type": "record",
  "name": "PlatformRunEvent",
  "namespace": "com.platform.lineage",
  "x-schema-kind": "standard-profile",
  "x-standard": "openlineage",
  "x-standard-version": "2.x.x",
  "x-profile-doc": "Platform subset of OpenLineage RunEvent",
  "fields": [
    // only the fields and facets the platform actually uses
  ]
}
```

This enables:
- **Codegen** — generate typed models for only the parts of the standard you use
- **Upgrade impact analysis** — when OpenLineage ships v3, diff upstream changes against your
  registered profile to know exactly what breaks
- **Developer clarity** — teams know "which parts of OpenLineage do we actually emit?"

If you're just passing through standard-shaped data without codegen, a profile isn't necessary
— the version pin is enough.

### Summary

```
What                          Where It Lives              Governance
────                          ──────────────              ──────────
Standard version pins         Platform config /           Manual update when
                              registry metadata           upgrading standards

Custom extensions/facets      Registry (STRICT)           Schema-first, compat
you author                                                checked, codegen'd

Usage profiles (subsets        Registry (STANDARD)        Tracks your subset,
you consume)                                              validated against
                                                          upstream on upgrade
```

---

## Namespace Convention

Clear namespacing distinguishes schema categories and ownership:

| Prefix | Contents | Registration | Governance |
|---|---|---|---|
| `events.<service>.*` | CloudEvents payloads | Manual | STRICT |
| `api.<service>.*` | API request/response models | Manual | STRICT |
| `workflow.<service>.*` | Temporal I/O, signals, queries | Manual | STRICT |
| `broker.*` | Transformation source/target schemas | Manual | STRICT |
| `db.<service>.*` | Database table schemas | Manual | STANDARD or ADVISORY |
| `cdc.<service>.*` | CDC change event schemas | Auto (Debezium) | STANDARD |
| `asset.<service>.*` | Dagster asset I/O schemas | Manual | STANDARD |
| `standard.<name>.*` | Custom extensions and profiles of open standards | Manual | STRICT or STANDARD |

---

## Open Questions

- [ ] Avro `x-*` convention spec — define the full set of custom properties, valid values,
      and validation rules
- [ ] Codegen tooling — design the dispatch-on-`x-schema-kind` pipeline in `monorepo/tools/`
- [ ] Migration codegen — can Alembic migrations be generated from schema diffs?
- [ ] Protobuf coexistence — if gRPC services are needed, how does Protobuf registration
      coexist with the Avro-primary model?
- [ ] Standard profile maintenance — process for updating profiles when upstream standards
      release new versions
- [ ] CDC schema compatibility — what compatibility mode is appropriate for auto-registered
      CDC schemas (FORWARD vs BACKWARD)?
- [ ] ADVISORY schema extraction — tooling for auto-extracting internal schemas from
      SQLAlchemy models, Pydantic models, etc. for ADVISORY-level registration
