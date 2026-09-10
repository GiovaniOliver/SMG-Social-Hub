# Arcade provider verification checklist

After the branch deploys to a preview or production environment with Arcade credentials:

## X

- Open Accounts and select Connect X.
- Complete X authorization.
- Confirm the callback returns to Accounts without an OAuth-state error.
- Confirm the authenticated X handle appears in `social_hub_accounts`.
- Confirm the account reports Connected + Auto publish.
- Repeat with another X account and confirm both identities remain in inventory.
- After brand assignment exists, publish a small test post and confirm `X.PostTweet` returns the expected post ID/URL.

## Reddit

- Open Accounts and select Connect Reddit.
- Complete Reddit authorization.
- Confirm the callback returns to Accounts without an OAuth-state error.
- Confirm `Reddit.GetMyUsername` resolves the expected account.
- Confirm the account reports Connected + Auto publish.
- Repeat with another Reddit account and confirm both identities remain in inventory.
- After brand assignment exists, publish a test text post to an approved test subreddit and confirm `Reddit.SubmitTextPost` returns the expected post ID/URL.

## Failure handling

- Invalid/expired OAuth state redirects back to Accounts with an error.
- Missing `ARCADE_API_KEY` redirects back to Accounts with a configuration error.
- Missing provider configuration in Arcade is surfaced to the operator instead of silently creating a disconnected account.
- If Arcade says authorization is required during publishing, Social Hub returns the authorization URL rather than reporting a false publish success.
