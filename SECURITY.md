# Security Policy

Security reports are welcome and should be handled privately.

## Supported Versions

The `main` branch and the latest published release are supported for security review.

## Reporting A Vulnerability

Do not open a public issue for a vulnerability.

Use GitHub's private vulnerability reporting or security advisory flow for this repository. If that is unavailable, open a minimal issue that says you need a private security contact, but do not include exploit details, secrets, tokens, logs, private URLs, or customer data.

Helpful private reports include:

- A short summary of the issue.
- Affected package, route, command, or workflow.
- Reproduction steps.
- Impact and likely severity.
- Whether a secret, token, or private URL may have been exposed.

## Maintainer Response

Maintainers should acknowledge valid reports as soon as possible, investigate privately, patch in a protected branch, and publish a security advisory or release note when disclosure is safe.

## Secrets

If you accidentally commit a secret, assume it is compromised. Revoke or rotate it first, then remove it from the repository history if needed.
