# Arcade API migration baseline

This branch replaces the legacy Social Hub Arcade call pattern with the current Arcade API endpoints:

- Provider authorization: `POST /v1/auth/authorize`
- Tool execution: `POST /v1/tools/execute`

Legacy tool names removed from the Social Hub publishing path:

- `Twitter.CreatePost` → `X.PostTweet`
- `Reddit.SubmitPost` → `Reddit.SubmitTextPost`

The implementation keeps compatibility with an older `ARCADE_BASE_URL` value ending in `/v1` by normalizing the suffix before constructing current endpoint paths.
