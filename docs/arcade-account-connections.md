# Arcade Account Connections

SMG Social Hub uses Arcade-managed OAuth for X and Reddit account connections.

## X

- Authorization provider: `x`
- Requested scopes: `tweet.read`, `tweet.write`, `users.read`
- Identity tool: `X.WhoAmI`
- Publishing tool: `X.PostTweet`
- Publishing input: `{ text }`

## Reddit

- Authorization provider: `reddit`
- Requested scopes: `identity`, `read`, `submit`
- Identity tool: `Reddit.GetMyUsername`
- Publishing tool: `Reddit.SubmitTextPost`
- Publishing input: `{ subreddit, title, body }`

## Security

- Every authorization creates a unique Arcade user ID for the provider account being connected.
- The Arcade user ID is carried only inside HMAC-signed Social Hub OAuth state.
- Callbacks require an authenticated Social Hub operator session and a valid provider-bound state.
- Arcade retains provider OAuth credentials; Social Hub stores only an encrypted marker plus the Arcade user ID needed for future tool calls.

## Multiple accounts

Repeat the Connect flow for each X or Reddit account. Each authorization receives its own Arcade user ID, allowing Social Hub to address the correct provider account later.

Brand assignment and multi-account publishing selection are intentionally handled in a later phase after account inventory is complete.
