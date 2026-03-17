# Schema Registry: Schema Sourcing & Registration Research

## What's Already Decided

- **Custom FastAPI service** (not Confluent Schema Registry)
- **Explicit registration** — schemas are registered deliberately, not auto-extracted from Pydantic models
- **Schema languages**: Avro and Protobuf
- **Data model** (from TDP-007-03): `Subject` → `SchemaVersion` → `SchemaReference` with compatibility modes and fingerprinting
- Services publish their schemas via REST API

## Research Questions

### 1. What schemas should we track?

The architecture already says schemas for **important interfaces** — not every internal model. The natural candidates are:

- **Event schemas** — anything published to the message broker (CloudEvents payloads)
- **API contracts** — shared data types consumed across service boundaries
- **Database models that cross boundaries** — e.g., if CDC streams a table's changes, the downstream schema matters
- **Transformation schemas** — the intelligent broker needs to know source/target shapes

Internal-only models (e.g., a service's private DB tables that nobody else reads) probably don't belong in the registry.

### 2. Register-first vs pull-from-source?

Two patterns exist in the wild:

| Approach | How it works | Tradeoffs |
|---|---|---|
| **Schema-first (register before use)** | Define schema in registry → generate code from it | Strong contracts, but adds friction to development |
| **Code-first (push after implement)** | Write code → extract/register schema as CI step | Lower friction, but risk of breaking changes shipping before registration |
| **Pull/discover** | Registry scrapes schemas from running services or repos | Least friction, but weakest guarantees |

The architecture already leans toward **explicit registration** ("services are responsible for publishing their schemas"). The question is *when* in the lifecycle.

### 3. Version control integration?

The `monorepo/schemas/` directory already exists. A practical model:

- **Schema definitions live in the monorepo** (`.avsc`, `.proto` files) — version controlled via git like any other code
- **Schema registry is the runtime authority** — services query it at runtime for serialization/deserialization
- **CI enforces compatibility** — on PR, check that schema changes are compatible with the registry's rules before merging

This means git provides the audit trail and review process, while the registry provides runtime lookup and compatibility enforcement. You don't need to build a separate versioning system inside the registry itself — git already does that well.

## Suggested Research Scope for a Design Doc

1. **Registration lifecycle**: Should schema registration happen in CI (automated on merge) or be a manual/deliberate developer action? The CI approach keeps the registry in sync with the monorepo automatically.

2. **Compatibility checking**: When does it run — at PR time (shift-left) or at registration time? Both?

3. **Schema ownership model**: Does each service own its schemas in `monorepo/schemas/<service>/`, or is there a shared schemas area for cross-cutting types?

4. **What's NOT tracked**: Explicitly define what stays out of the registry to avoid scope creep.

5. **Bootstrap ordering**: For a new service, what comes first — the schema or the code? This affects developer workflow significantly.
