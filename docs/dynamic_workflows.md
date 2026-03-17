# Dynamic Workflows: Dagster vs Temporal

## Core Question

Do Dagster and Temporal assume the shapes of DAGs of computation are known upfront?

## Dagster: Declarative Graphs

Dagster's core model assumes **static DAG shapes** — you define assets and ops with their
dependencies at definition time, and the graph is resolved before execution.

Escape hatches for dynamism:

- **Dynamic outputs** (`DynamicOut` / `DynamicOutput`) — an op can yield a variable number of
  outputs at runtime, and downstream ops fan out over them. The fan-out/fan-in shape isn't known
  until execution.
- **Asset checks and sensors** can trigger runs dynamically, but each run still executes a
  statically-defined graph.
- **Graph-backed assets** can compose ops with dynamic outputs for more complex patterns.

Key limitation: the *types* of computations and their dependency relationships are still declared
upfront. You're parameterizing a known shape, not constructing an arbitrary one at runtime.

## Temporal: Imperative Durable Execution

Temporal takes a fundamentally different approach — **workflows are imperative code**, not
declarative DAGs. A workflow can:

- Call activities conditionally based on results of prior activities
- Loop an unknown number of times
- Spawn child workflows dynamically
- Use signals/queries to change behavior mid-execution
- Branch arbitrarily based on runtime data

The "DAG" emerges from execution, not from declaration. Temporal doesn't think in terms of DAGs —
it thinks in terms of **durable execution of code**. The workflow function *is* the control flow.

## Two Independent Dimensions

The batch-vs-record heuristic is useful but incomplete. There are two orthogonal axes:

1. **Granularity**: batch vs. record-level
2. **Dynamism**: static shape vs. emergent shape

| | Static shape | Dynamic shape |
|---|---|---|
| **Batch** | Dagster sweet spot | Dagster can stretch (dynamic outputs), but gets awkward |
| **Record-level** | Either works | Temporal sweet spot |

A simple "Dagster for batch, Temporal for record-level" heuristic collapses the diagonal and
misses two quadrants.

### Where the simple heuristic breaks down

**Dynamic batch workflows** — e.g., an ingestion pipeline where the set of sources is discovered at
runtime, each source requires different transformation logic, and failure handling varies per source.
Dagster's dynamic outputs can handle the fan-out, but if the *type* of processing differs per branch
(not just parameterization), you're fighting the model.

**Static record-level workflows** — e.g., an event-driven pipeline where every record follows the
same validate -> enrich -> store path. Temporal works fine here but you're paying for durable
execution machinery you may not need. A simple consumer with retries might suffice.

## Refined Heuristic

Pick based on what you need from the system:

- **Dagster** when: you want lineage, cataloging, observability of data assets, scheduling, and the
  graph shape is known or varies only in fan-out degree.
- **Temporal** when: control flow depends on runtime data, workflows are long-running or
  human-in-the-loop, you need durable execution guarantees across steps that may take hours/days, or
  the computation shape is genuinely emergent.
- **Neither** when: the workflow is simple enough that a queue consumer with retries handles it.

The batch/record distinction is really a proxy for the deeper question: **do you need to reason
about the workflow as a data dependency graph, or as a program?**
