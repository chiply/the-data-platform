# Sample Service — Feed Reader

> This document describes the sample service used to drive the reference implementation of the data
> platform. It is not intended to be production-ready — it exists to exercise the platform's
> capabilities across a realistic, non-trivial use case.

---

## Overview

A feed reader that ingests content from RSS feeds, summarizes it, and presents users with a single
pane of glass — a custom front page aggregating all their publications in one place. Sources include
YouTube, Reddit, X, PubMed, blogs, newsletters, and any other RSS-compatible publication.

---

## Why This Service

This service is a good reference implementation for the data platform because it touches a wide
range of platform concerns:

| Platform Concern           | How the Feed Reader Exercises It                                  |
|----------------------------|-------------------------------------------------------------------|
| Scheduled workflows        | RSS feeds pulled on configurable intervals                        |
| Event-driven orchestration | New feed submissions trigger ingestion workflows                  |
| Batch orchestration        | Periodic summarization (daily/weekly/monthly digests)             |
| Schema registry            | Feed content schemas, summary schemas, user preference schemas    |
| Intelligent brokering      | Normalizing heterogeneous feed formats into a common content model|
| Search                     | Semantic search across ingested content and summaries             |
| Complex UI                 | Feed discovery, registration, summary views, search interface     |
| SDK generation             | Client SDK for the feed reader API                                |
| Observability              | Tracing across ingestion → summarization → serving pipeline       |
| Testing                    | Property-based testing of feed parsing, summarization contracts   |

---

## Core Concept

There are a finite number of RSS feeds, and the vast majority are requested by multiple users. The
platform exploits this by ingesting each unique feed once, on a schedule, regardless of how many
users subscribe to it. Per-user personalization happens at the presentation layer, not the ingestion
layer.

```
User submits feed URL
        │
        ▼
  Is feed already known?
   ┌─────┴──────┐
   │ Yes        │ No
   │            ▼
   │     Register new feed
   │     Map to ingestion workflow
   │            │
   └────────────┘
        │
        ▼
  Subscribe user to feed
        │
        ▼
  Feed ingested on schedule (shared across all subscribers)
        │
        ▼
  Content extraction & summarization pipeline
        │
        ▼
  Summaries available in user's custom front page
```

---

## Key Components

### Feed Registration & Discovery

- Users submit feed URLs or discover feeds through a search/browse interface
- The system deduplicates feeds — if a feed is already tracked, the user is simply subscribed
- Feed metadata (title, description, update frequency, category) is extracted on registration

### Ingestion Workflows

- Each registered feed is mapped to an ingestion workflow (Temporal)
- Workflows pull feed content on a configurable schedule
- The schedule may be adaptive — feeds that update frequently are polled more often

### Content Extraction & Summarization

- Raw feed content is parsed and normalized into a common content model
- Information extraction pulls out key entities, topics, and metadata
- Summarization generates concise digests of each piece of content
- This pipeline runs for every feed on its schedule, independent of individual users

### Summary Views

- **Daily/Weekly/Monthly digests** — aggregated summaries across all of a user's subscribed feeds
- **Custom front page** — a single view of the most recent and relevant content, personalized to the
  user's subscriptions

### Search

- Users can search semantically across all their ingested content and summaries
- Search may incorporate a relevance/weighting algorithm informed by:
  - User engagement data
  - Feed popularity (how many users subscribe)
  - Trending topics across the platform

### Popularity & Trending

- Aggregate data across users to surface which feeds are most popular or trending
- Weighting algorithms may blend user-specific preferences with platform-wide signals

---

## Scope & Boundaries

This service will **not** be fully production-ready. It is a reference implementation meant to:

- Validate the data platform's architecture end-to-end
- Exercise each major platform subsystem (orchestration, schema registry, brokering, search, SDK
  generation, observability, testing)
- Provide a concrete, realistic codebase for iterating on platform tooling and patterns

Areas that may be simplified or stubbed:
- Authentication / authorization
- Billing / rate limiting
- Full production deployment hardening
- Comprehensive feed format edge cases
