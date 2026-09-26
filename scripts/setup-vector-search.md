# Setting up Atlas Vector Search

`pnpm setup:indexes` creates both vector indexes and waits until they are queryable. Use these
steps only if index creation from code is not permitted on your cluster.

1. Atlas UI → your cluster → **Atlas Search** → **Create Search Index**.
2. Choose **Atlas Vector Search → JSON Editor**, database `homeswipe` (or your `MONGODB_DB_NAME`), collection `properties`.
3. Create `property_feature_index` and `property_embedding_index` using the exact JSON in [`docs/mongodb.md`](../docs/mongodb.md#atlas-vector-search-indexes).
4. Wait until both show **READY**, then run `pnpm setup:indexes`. It should print `Vector Search indexes are queryable.`

Until the indexes are queryable, HomeSwipe keeps working with in-process cosine similarity, and
`/lab` shows `retrieval: in_app_cosine`.
