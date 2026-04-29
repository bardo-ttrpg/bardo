# Security Policy

## Supported version

Bardo MCP `0.1.x` receives security fixes while the public preview is active.

## Local-first boundary

Bardo MCP runs locally over stdio. The local bridge works from the active workspace root and the generated `.bardo/` prep layer. Bardo account services handle account workflows such as sign-in, browser approval, subscription or trial verification, token refresh, and account status.

Campaign truth, rulebook prep, current state, and committed canon should remain local unless a user explicitly chooses to share support material.

## Credentials

Do not paste Bardo internal service credentials, billing provider credentials, hosting provider credentials, storage provider credentials, or private API tokens into MCP client configuration.

Users authenticate with `bardo login`, which opens a browser approval flow and stores local bridge credentials in the user's Bardo config. Marketplace manifests and examples must not contain shared secrets, paid-user bypass flags, internal service tokens, or private environment variables.

## Paid access

Bardo is free to download but requires an active Bardo Pro subscription or the 3-day trial for use. If account access cannot be verified, Bardo fails closed.

## Remote MCP policy

Bardo is not published as a remote MCP endpoint in this release. Any future remote endpoint must use Streamable HTTP plus standards-compliant authorization, audience/resource validation, per-client consent, CSRF protection, and no token passthrough.

## Reporting vulnerabilities

Report security issues privately by emailing security@bardo.gg or by opening a private advisory in the public listing repository if enabled. Include reproduction steps, affected version, operating system, and whether the issue requires an authenticated Bardo account.
