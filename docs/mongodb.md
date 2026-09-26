# MongoDB Atlas in HomeSwipe

MongoDB Atlas is HomeSwipe's system of record *and* its learning substrate. Every
interaction, every prediction made before an interaction, every learned memory, every
evaluation run, every experiment and every policy version is a document in Atlas.
Retrieval runs on Atlas Vector Search and `$geoNear`.

Database: `MONGODB_DB_NAME` (default `homeswipe`).

## Collections

| Collection | What it holds | Written by |
| --- | --- | --- |
| `users` | Hard constraints, explicit preferences, persisted preference state (working memory), preference summary + embedding, active policy version, counters, evolution lock | onboarding, preference updates, harness |
| `properties` | Normalized listings: facts, financials, GeoJSON `address.location`, `ai.features`, `ai.featureVector`, optional `ai.embedding` + `ai.embeddingModel` | `pnpm seed` (provider ingestion) |
| `interactions` | Every signal (like, dislike, super_like, save, unsave, detail_open, image_view, compare_add, find_similar, preference_correction) with dwell, surface, impression link and a `simulated` flag | `/api/interactions`, saved, similar, corrections, simulator |
| `property_impressions` | Every feed card shown, with rank, generators, score breakdown and the **prediction made before display** (`predictedLikeScore`, `predictedLabel`, `policyVersion`, optional calibrated probability) | recommendation feed |
| `recommendation_predictions` | Resolved predictions: predicted vs. actual, correct, policy version, exploration flag, `simulated` | interaction recording |
| `recommendation_sessions` | Feed sessions (new after 30 min idle): policy version, retrieval mode actually used, generator counts | recommendation feed |
| `preference_dimensions` | Machine-readable per-dimension state: effective / long-term / recent strength, confidence, evidence counts and interaction IDs, source (inferred / onboarding / correction) | batched preference update |
| `preference_memories` | Typed memories (`hard_constraint`, `explicit_positive`, `explicit_negative`, `inferred_positive`, `inferred_negative`, `behavioral`, `recent`, `uncertainty`, `experiment_learning`). Stale ones are archived, never deleted | batched preference update, harness |
| `harness_policies` | Immutable, versioned policy documents (`active` / `retired` / `rejected`) with parent version, diff, changes (+ evidence, expected effect, backtestable flag) and evaluation summary | harness |
| `evaluation_runs` | One per evolution attempt: data scope, real/simulated counts, training & holdout ranges, current vs. candidate metrics, promotion checks, explanation | harness |
| `harness_experiments` | `policy_backtest` (every candidate tried and its training metrics) and `exploration_probe` (uncertain-dimension probes with confidence before/after) | harness, feed |
| `saved_properties` | Saved homes and their collections | saved |
| `collections` | Favorites, Dream Homes, Tour, custom | saved |
| `saved_searches` | Saved filters/queries with alert settings | search, profile |
| `conversations` | Command-bar commands, parsed action and result | command bar |

## Regular indexes

Created by `pnpm setup:indexes` (and idempotently by `pnpm seed`), see `lib/mongodb/indexes.ts`:

- `properties`: `{status, listingType}`, `financial.price`, `facts.bedrooms`, `address.borough`, `address.neighborhood`, `address.location` (**2dsphere**), `listedAt`
- `interactions`: `{userId, createdAt}`, `{userId, propertyId}`, `{userId, simulated, createdAt}`
- `property_impressions`: `{userId, shownAt}`, `{userId, policyVersion}`, `{userId, propertyId, resolved, shownAt}`
- `recommendation_predictions`: `{userId, resolvedAt}`, `{userId, policyVersion, simulated}`, unique `impressionId`
- `preference_memories`: `{userId, type}`, unique `{userId, type, key}`
- `preference_dimensions`: unique `{userId, dimension}`
- `harness_policies`: unique `{userId, version}`, `{userId, status}`, and a **partial unique index on `userId` where `status: "active"`** — the database itself guarantees one active policy per user
- `evaluation_runs`: `{userId, createdAt}`; `harness_experiments`: `{userId, kind, createdAt}`, `impressionId`
- `saved_properties`: unique `{userId, propertyId}`; `collections`, `saved_searches`, `conversations`: `{userId, …}`

## Atlas Vector Search indexes

HomeSwipe defines **two** vector indexes on `properties`. `pnpm setup:indexes` creates them with
`createSearchIndex`, then **polls `listSearchIndexes()` until both report `queryable: true`**
(5-minute timeout, configurable with `VECTOR_INDEX_TIMEOUT_MS`). Index builds are asynchronous
on Atlas, so querying before they are queryable would fail.

At runtime, `lib/mongodb/vector-readiness.ts` caches index status for 60 s and `$vectorSearch`
is only issued against queryable indexes. Otherwise the same query runs as in-process cosine
over the constraint-filtered catalog, and the session records `retrievalMode:
"in_app_cosine"`. The fallback is never silent: `/lab` shows the mode and index status.

### 1. `property_embedding_index` — semantic embeddings

| Setting | Value |
| --- | --- |
| Collection | `properties` |
| Vector path | `ai.embedding` |
| Dimensions | `1024` |
| Similarity | `cosine` |
| Filter fields | `status`, `listingType`, `financial.price`, `facts.bedrooms`, `facts.bathrooms`, `facts.propertyType`, `address.borough`, `address.neighborhood`, `ai.embeddingModel` |

```json
{
  "name": "property_embedding_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      { "type": "vector", "path": "ai.embedding", "numDimensions": 1024, "similarity": "cosine" },
      { "type": "filter", "path": "status" },
      { "type": "filter", "path": "listingType" },
      { "type": "filter", "path": "financial.price" },
      { "type": "filter", "path": "facts.bedrooms" },
      { "type": "filter", "path": "facts.bathrooms" },
      { "type": "filter", "path": "facts.propertyType" },
      { "type": "filter", "path": "address.borough" },
      { "type": "filter", "path": "address.neighborhood" },
      { "type": "filter", "path": "ai.embeddingModel" }
    ]
  }
}
```

**Supported embedding configurations** (both are 1024-dimensional, so one index serves either):

| Provider | Model | How |
| --- | --- | --- |
| Voyage AI (preferred) | `voyage-4` (default) or `voyage-4-lite` via `VOYAGE_MODEL` | `output_dimension: 1024`, `input_type: document` for listings / `query` for preferences and searches |
| OpenAI (fallback) | `text-embedding-3-small` | `dimensions: 1024`; stored as `openai/text-embedding-3-small@1024` |

Vectors from different models never mix. Every `$vectorSearch` on this index filters on
`ai.embeddingModel`, and ranking only uses the embedding space when **every** active listing
has an embedding from the same model. If you switch models, re-run `pnpm seed` to re-embed.

If you want a different dimensionality (e.g. OpenAI's native 1536), change
`EMBEDDING_DIMENSIONS` in `lib/mongodb/vector-indexes.ts`, re-seed, and re-run
`pnpm setup:indexes` (it updates definitions that changed).

### 2. `property_feature_index` — deterministic local feature vectors

Always available, even with no API keys. Every listing has a 36-dimensional feature vector
(`ai.featureVector`, fixed order defined in `lib/features/dimensions.ts`). The user's
learned preference is expressed in the same space as a signed weight vector, so Atlas Vector
Search does preference retrieval without any embedding provider.

```json
{
  "name": "property_feature_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      { "type": "vector", "path": "ai.featureVector", "numDimensions": 36, "similarity": "cosine" },
      { "type": "filter", "path": "status" },
      { "type": "filter", "path": "listingType" },
      { "type": "filter", "path": "financial.price" },
      { "type": "filter", "path": "facts.bedrooms" },
      { "type": "filter", "path": "facts.bathrooms" },
      { "type": "filter", "path": "facts.propertyType" },
      { "type": "filter", "path": "address.borough" },
      { "type": "filter", "path": "address.neighborhood" }
    ]
  }
}
```

### Hard constraints are prefilters

A user's budget, bedrooms, bathrooms, property types and geography are passed as the
`$vectorSearch` `filter` (see `toVectorSearchFilter` in `lib/engine/constraints.ts`). So
personalization never ranks a home outside them. The ranker asserts the same rule again in
code (`satisfiesHardConstraints`) as defense in depth.

```js
{
  $vectorSearch: {
    index: "property_feature_index",
    path: "ai.featureVector",
    queryVector: userPreferenceVector,     // or the anchor home's vector for "find similar"
    numCandidates: 400,
    limit: 40,
    filter: { $and: [
      { status: { $eq: "active" } },
      { listingType: { $eq: "sale" } },
      { "financial.price": { $lte: 800000 } },
      { "facts.bedrooms": { $gte: 2 } }
    ] }
  }
}
```

## Geospatial

`address.location` is a GeoJSON point with a 2dsphere index. The optional `geo` candidate
generator (off in v1; the harness may enable it) runs `$geoNear` around the centroid of the
homes a user liked, with the hard-constraint query applied.

## Creating the indexes manually

If your cluster tier or permissions don't allow creating search indexes from code, go to Atlas UI,
then **Atlas Search → Create Search Index → JSON Editor → Vector Search**. Select `properties`
and paste each definition above. Then run `pnpm setup:indexes` once more to confirm both are
queryable. See also `scripts/setup-vector-search.md`.
