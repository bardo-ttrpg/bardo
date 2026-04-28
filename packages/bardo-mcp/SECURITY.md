# Security Policy

## Supported version

Bardo MCP `0.1.x` receives security fixes while the public preview is active.

## Local-first boundary

Bardo MCP runs locally over stdio. The local bridge reads and writes only inside the active workspace root and the generated `.bardo/` prep layer. The hosted Bardo website handles account workflows only: sign-in, browser approval, billing, entitlements, token refresh, and runtime status.

## Secrets and credentials

Do not paste Clerk, Stripe, Convex, Vercel, or Bardo internal secrets into MCP client configuration. Users authenticate with `bardo login`, which opens a browser approval flow and stores local bridge credentials in the user's Bardo config.

Marketplace manifests must not contain shared secrets, paid-user bypass flags, or internal service tokens.

## Paid access

Bardo is free to download but requires an active Bardo Pro subscription or the 3-day trial for use. If entitlement cannot be verified, Bardo fails closed.

## Remote MCP policy

Bardo is not published as a remote MCP endpoint in this release. Any future remote endpoint must use Streamable HTTP plus standards-compliant OAuth 2.1 authorization code with PKCE, audience/resource validation, per-client consent, CSRF protection, and no token passthrough.

## Reporting vulnerabilities

Report security issues privately by emailing security@bardo.gg or by opening a private advisory in the GitHub listing repository if enabled. Please include reproduction steps, affected version, operating system, and whether the issue requires an authenticated Bardo account.
