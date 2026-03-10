# Sample Service — Economic Analysis

> Cost modeling and data economics for the feed reader sample service at various scales.
> Companion to [SAMPLE-SERVICE.md](SAMPLE-SERVICE.md).

---

## Key Architectural Property

The feed reader's cost profile is defined by one property from the design:

> "There are a finite number of RSS feeds, and the vast majority are requested by multiple users.
> The platform exploits this by ingesting each unique feed once, on a schedule, regardless of how
> many users subscribe to it."

**Feeds scale sub-linearly with users.** This is the single most important cost property of the
system. Per-user cost decreases as the platform grows because feed overlap increases.

---

## Feed Universe & Upper Bounds

### Feeds per User

Historical data from RSS readers (Google Reader, Feedly):

| User Type  | Feeds/User |
|------------|------------|
| Casual     | 10–30      |
| Moderate   | 30–100     |
| Power      | 100–500    |
| **Median** | **~50**    |

### Feed Popularity Distribution

Feed subscriptions follow a **Zipf/power-law distribution**. The top 1% of feeds (major news
outlets, popular YouTube channels, top subreddits) account for 50%+ of all subscriptions. This
drives the overlap that makes shared ingestion effective.

### The Feed Universe Has a Ceiling

The total number of actively publishing RSS feeds on the internet is approximately **10–30 million**:

| Source Category   | Estimated Active Feeds |
|-------------------|------------------------|
| News sites        | 1,000–5,000            |
| Blogs             | 50,000–100,000         |
| YouTube channels  | 100,000–500,000        |
| Reddit subreddits | ~100,000               |
| Podcasts          | ~500,000               |
| Academic journals | ~50,000                |
| Newsletters       | ~100,000               |
| Long tail / other | 5,000,000–20,000,000   |

This ceiling means the system is **fundamentally bounded** — even at infinite users, there is a
finite amount of content to ingest.

### Unique Feeds as a Function of Users

Because of overlap, unique feeds grow sub-linearly. The growth follows a saturation model:

```
unique_feeds(users) ≈ F_max × (1 - e^(-k × users))
```

Where `F_max ≈ 20M` (total reachable feed universe) and `k` controls saturation rate.

In practice:

| Users       | Avg Feeds/User | Overlap | Unique Feeds |
|-------------|---------------|---------|--------------|
| 10          | 30            | 30%     | ~210         |
| 100         | 40            | 50%     | ~2,000       |
| 1,000       | 50            | 65%     | ~17,500      |
| 10,000      | 50            | 75%     | ~125,000     |
| 100,000     | 50            | 85%     | ~750,000     |
| 1,000,000   | 50            | 92%     | ~4,000,000   |
| 10,000,000  | 50            | 96%     | ~20,000,000  |

Overlap increases with user count because popular feeds accumulate many subscribers. At small
scales, users tend to be early adopters with niche interests (lower overlap). At large scales, you
approach saturation of the total feed universe.

---

## Publications per Feed

Publication rates vary enormously by source type:

| Feed Type          | Posts/Day  | Typical Item Size |
|--------------------|------------|-------------------|
| Major news site    | 50–200     | 5–20 KB           |
| Active blog        | 0.5–2      | 3–10 KB           |
| YouTube channel    | 0.1–3      | 1–3 KB (metadata) |
| Reddit subreddit   | 1–500+     | 1–5 KB            |
| Newsletter         | 0.1–0.5    | 5–20 KB           |
| Academic (PubMed)  | 1–50       | 2–10 KB           |
| Podcast            | 0.1–1      | 2–5 KB            |

**Weighted average across a typical feed mix: ~3 posts/day/feed.**

### RSS Windowing

RSS feeds typically expose only the most recent 10–50 items — they are a sliding window, not an
archive. This means:

- If you poll frequently enough, you capture every item as it appears
- You do not retroactively backfill years of history
- Polling frequency should be adaptive: high-velocity feeds need more frequent polling

---

## Storage Model

### Per-Item Storage Breakdown

After full processing, each content item requires:

| Layer                     | Size/Item   |
|---------------------------|-------------|
| Raw RSS/XML               | 2–20 KB     |
| Parsed & normalized       | 1–5 KB      |
| AI-generated summary      | 0.5–2 KB    |
| Vector embedding (search) | 3–6 KB      |
| Metadata & indices        | 0.5–1 KB    |
| **Total**                 | **~15 KB**  |

Vector embeddings are a fixed cost per item (determined by embedding dimensionality, typically
768–1536 dimensions × 4 bytes for float32) regardless of content size.

### Daily Ingestion & Annual Storage

`daily_storage = unique_feeds × 3 posts/day × 15 KB/item`

| Users       | Unique Feeds | New Items/Day | Storage/Day | Storage/Year |
|-------------|-------------|---------------|-------------|--------------|
| 10          | 210         | 630           | 9 MB        | 3.3 GB       |
| 100         | 2,000       | 6,000         | 90 MB       | 32 GB        |
| 1,000       | 17,500      | 52,500        | 788 MB      | 281 GB       |
| 10,000      | 125,000     | 375,000       | 5.6 GB      | 2 TB         |
| 100,000     | 750,000     | 2,250,000     | 34 GB       | 12 TB        |
| 1,000,000   | 4,000,000   | 12,000,000    | 180 GB      | 64 TB        |
| 10,000,000  | 20,000,000  | 60,000,000    | 900 GB      | 320 TB       |

### Historical Change Tracking

Tracking content changes in feeds (edits, corrections, metadata updates) does **not** significantly
add to the storage burden:

1. **RSS items are mostly immutable** after publication — perhaps 5–10% receive any edit
2. Edits are typically minor (typo fixes, metadata corrections) — diffs are < 1 KB
3. Storing diffs rather than full copies keeps overhead to **~5–10% of content storage**
4. Feed-level changes (title, description updates) are even rarer

The real storage drivers are **embeddings** (fixed size per item) and **retention period** (how many
years of history to keep).

### Tiered Storage Strategy

| Tier | Data Age    | Cost/GB/Month | Use Case                    |
|------|-------------|---------------|-----------------------------|
| Hot  | < 30 days   | $0.10–0.15    | Database / cache            |
| Warm | 30–365 days | $0.023        | Object storage (S3 / MinIO) |
| Cold | > 1 year    | $0.004        | Archive (S3 Glacier)        |

Monthly storage costs (blended, assuming 30-day hot / 1-year warm / archive after):

| Users       | Storage/Year | Est. Monthly Storage Cost |
|-------------|-------------|--------------------------|
| 10          | 3.3 GB      | ~$1                      |
| 100         | 32 GB       | ~$5                      |
| 1,000       | 281 GB      | ~$30                     |
| 10,000      | 2 TB        | ~$100                    |
| 100,000     | 12 TB       | ~$500                    |
| 1,000,000   | 64 TB       | ~$2,000                  |
| 10,000,000  | 320 TB      | ~$10,000                 |

---

## Compute Costs

### Cost Components

1. **Feed fetching** — HTTP requests to pull RSS feeds (lightweight)
2. **Parsing & normalization** — CPU to process XML/JSON (lightweight)
3. **AI summarization** — LLM inference per content item (**dominant cost**)
4. **Embedding generation** — Vector encoding for search
5. **API serving** — User-facing request handling
6. **Search queries** — Vector similarity search

### AI Summarization — The Cost Driver

Summarization is **40–90% of total cost** at every scale.

Per-item LLM cost (cloud API, Haiku/GPT-4o-mini class):
- Input: ~1,000 tokens/item
- Output: ~200 tokens/summary
- Cost: **~$0.00027/item**

#### Cloud LLM API Costs

| Users       | Items/Day   | LLM Cost/Day | LLM Cost/Month |
|-------------|-------------|-------------|----------------|
| 10          | 630         | $0.17       | $5             |
| 100         | 6,000       | $1.62       | $49            |
| 1,000       | 52,500      | $14         | $425           |
| 10,000      | 375,000     | $101        | $3,038         |
| 100,000     | 2,250,000   | $608        | $18,225        |
| 1,000,000   | 12,000,000  | $3,240      | $97,200        |
| 10,000,000  | 60,000,000  | $16,200     | $486,000       |

#### Self-Hosted LLM (Open Source)

Aligned with the platform's "open source everything" principle. A single A100 GPU can process
~800 items/hour for summarization. GPU costs are ~$1–2/hour (cloud) or ~$0.30–0.50/hour
(amortized owned hardware).

Self-hosting reduces AI costs by **5–10x** at scale, with better economics as utilization improves.

### Velocity & GPU Sizing

| Users       | Items/sec (avg) | Items/sec (peak 5x) | GPUs Required (self-hosted) |
|-------------|-----------------|----------------------|-----------------------------|
| 10          | 0.007           | 0.03                 | None (CPU sufficient)       |
| 1,000       | 0.6             | 3                    | 1 GPU, part-time            |
| 10,000      | 4.3             | 20                   | 1–2 GPUs                    |
| 100,000     | 26              | 130                  | 5–10 GPUs                   |
| 1,000,000   | 139             | 700                  | 30–50 GPUs                  |
| 10,000,000  | 694             | 3,500                | 150–250 GPUs                |

### Feed Fetching at Scale

At 20M feeds polled on average every 30 minutes:
- 20M / 1,800 seconds = ~11,111 HTTP requests/second
- Requires 50–100 concurrent fetching workers
- CPU cost: modest (10–20 cores)
- Network: ~1–5 TB/day of raw RSS XML

---

## Total Monthly Cost by Scale

### With Cloud LLM API

| Users       | Unique Feeds | Compute  | Storage  | AI Summarization | Network  | **Total/Month** |
|-------------|-------------|----------|----------|------------------|----------|-----------------|
| 10          | 210         | $5       | $1       | $5               | $1       | **~$12**        |
| 100         | 2,000       | $20      | $5       | $49              | $5       | **~$79**        |
| 1,000       | 17,500      | $100     | $30      | $425             | $25      | **~$580**       |
| 10,000      | 125,000     | $500     | $100     | $3,038           | $100     | **~$3,740**     |
| 100,000     | 750,000     | $2,000   | $500     | $18,225          | $500     | **~$21,200**    |
| 1,000,000   | 4,000,000   | $8,000   | $2,000   | $97,200          | $2,000   | **~$109,200**   |
| 10,000,000  | 20,000,000  | $30,000  | $10,000  | $486,000         | $10,000  | **~$536,000**   |

### With Self-Hosted LLM

| Users       | Cloud LLM Total | Self-Hosted Total | Savings |
|-------------|-----------------|-------------------|---------|
| 1,000       | $580            | $230              | 60%     |
| 10,000      | $3,740          | $1,300            | 65%     |
| 100,000     | $21,200         | $5,800            | 73%     |
| 1,000,000   | $109,200        | $28,000           | 74%     |
| 10,000,000  | $536,000        | $110,000          | 79%     |

Self-hosting becomes more cost-effective at scale because GPU utilization improves — fixed
hardware costs are amortized across more items.

### Per-User Economics

| Users       | Cost/Month (Cloud) | Cost/User/Month (Cloud) | Cost/User/Month (Self-Hosted) |
|-------------|-------------------|------------------------|-------------------------------|
| 10          | $12               | $1.20                  | $0.80                         |
| 100         | $79               | $0.79                  | $0.45                         |
| 1,000       | $580              | $0.58                  | $0.23                         |
| 10,000      | $3,740            | $0.37                  | $0.13                         |
| 100,000     | $21,200           | $0.21                  | $0.06                         |
| 1,000,000   | $109,200          | $0.11                  | $0.03                         |
| 10,000,000  | $536,000          | $0.05                  | $0.01                         |

Per-user cost drops dramatically with scale due to the shared ingestion model.

---

## The Three V's of Data-Intensive Applications

### Volume — Bounded and Manageable

Volume is the **least challenging** V for this application because of the shared ingestion
architecture and the finite feed universe.

- **At 1K users**: 281 GB/year — a single PostgreSQL instance handles this comfortably
- **At 100K users**: 12 TB/year — distributed storage, but not extreme
- **At 10M users**: 320 TB/year — significant, but well within what object storage handles
  routinely
- **Hard ceiling**: even at infinite users, daily ingestion caps at ~900 GB/day because there are
  only ~20M active feeds publishing ~3 items/day

The deduplication architecture (ingest each feed once) is what makes volume manageable. Without it,
volume would scale linearly with users × feeds/user — roughly 25x worse at 1M users.

### Velocity — The Cost Multiplier

Velocity is the **biggest cost driver**, not because raw throughput is extreme (it's modest compared
to IoT or financial data), but because:

1. **Each item requires expensive AI processing** — summarization + embedding generation means high
   cost per item, and throughput is GPU-bound
2. **Freshness expectations** — users expect summaries within minutes of publication, ruling out
   overnight batch processing for recent content
3. **Bursty patterns** — news events cause correlated spikes across many feeds simultaneously. A
   major event can drive 3–5x sustained peak over average
4. **Sustained rates at scale are real**: 60M items/day at 10M users = ~700 items/second average,
   with peaks of 3,500/second

The summarization pipeline is the velocity bottleneck. The adaptive polling strategy (poll
high-frequency feeds more often) adds complexity but is necessary to balance freshness against
resource usage.

**Velocity management strategies:**
- Prioritize summarization by feed popularity (more subscribers = higher priority)
- Use tiered summarization quality (quick summary immediately, deeper summary in batch)
- Buffer non-urgent items for off-peak processing
- Auto-scale GPU workers based on queue depth

### Variety — The Engineering Challenge

Variety is the **hardest engineering problem** and maps directly to the platform's "intelligent
brokering" layer.

**Format variety:**
- RSS 2.0, Atom, RSS 1.0 (RDF), JSON Feed — four distinct XML/JSON dialects
- Non-standard extensions and malformed feeds are common

**Content variety:**
- Text articles, HTML fragments, video metadata, podcast audio links, academic abstracts, social
  media posts — each requires different extraction and summarization logic

**Source variety:**
- YouTube, Reddit, PubMed, blogs, newsletters, X — each has its own RSS quirks, rate limits,
  authentication requirements, and content structure

**Language variety:**
- Feeds in dozens of languages, affecting summarization model choice and embedding quality

**Schema evolution:**
- Feeds change their structure over time without warning or versioning

**Quality variety:**
- Well-formed XML to broken HTML pretending to be RSS — the parser must be extremely tolerant

This is where the platform's schema registry + intelligent broker architecture earns its keep. The
content normalization layer (heterogeneous feed formats → common content model) is where the bulk of
engineering complexity lives. Every new source type requires understanding its specific RSS
dialect, content structure, and metadata conventions.

### Summary: Which V Matters Most?

| V        | Challenge Level | Why                                                       |
|----------|----------------|-----------------------------------------------------------|
| Volume   | Low            | Bounded by finite feed universe; shared ingestion deduplicates |
| Velocity | Medium-High    | GPU-bound AI processing is expensive; freshness requirements add urgency |
| Variety  | High           | Heterogeneous formats, content types, and source behaviors are the core engineering problem |

---

## Assumptions & Caveats

- **Feed overlap model** is estimated from RSS reader industry data; actual overlap depends heavily
  on the user base (a niche community will have different overlap than a general-purpose reader)
- **LLM pricing** is based on early 2026 rates for Haiku/GPT-4o-mini class models; prices trend
  downward over time
- **Self-hosted GPU costs** assume cloud GPU rental; owned hardware amortized over 3 years is
  cheaper but requires capital expenditure
- **Storage costs** use AWS S3 pricing as a baseline; self-hosted object storage (MinIO) can be
  significantly cheaper at scale
- **3 posts/day/feed** is a weighted average — the actual distribution has high variance (news sites
  at 200/day vs newsletters at 0.1/day)
- All estimates assume the platform's "open source everything" principle is followed — managed
  service equivalents would significantly increase compute and storage costs
