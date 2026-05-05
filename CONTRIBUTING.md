# Contributing to Bardo

Thanks for helping Bardo grow. This project should be easy to approach, careful with security, and kind to both new contributors and long-term maintainers.

## Where Work Belongs

- Use Issues for actionable work: bugs, features, docs, release tasks, and security-hardening tasks.
- Use Discussions for questions, ideas, playtesting notes, showcases, and community conversation.
- Do not put secrets, private customer data, private deployment configuration, or proprietary `bardo-app` details in the public repo.

## Recommended Flow

1. Search existing issues and discussions.
2. Open or comment on an issue before starting larger work.
3. Create a small branch from the latest `main`.
4. Make focused changes.
5. Run relevant checks.
6. Open a pull request with a clear summary, linked issue, and verification notes.
7. Respond to review, keep the branch updated, and squash merge after approval.

Never push directly to `main`.

Use branch -> pull request -> squash merge -> delete branch. This keeps history clean, gives CI and review a chance to catch mistakes, and makes it easy to understand why each change happened.

## Maintainer Workflow

Maintainers may branch directly in the organization repository:

```bash
gh repo clone bardo-ttrpg/bardo
cd bardo
git checkout main
git pull --ff-only
git checkout -b feat/short-description
```

Push the branch, open a pull request, squash merge it after checks pass, then delete the branch.

## Outside Contributor Workflow

Outside contributors should use a fork:

```bash
gh repo fork bardo-ttrpg/bardo --clone
cd bardo
git fetch upstream
git checkout -b feat/short-description upstream/main
```

Push your branch to your fork and open a pull request against `bardo-ttrpg/bardo:main`.

## Pull Request Expectations

- Keep pull requests small and focused.
- Link the issue the PR addresses.
- Fill out the PR template.
- Run `bun run check` and targeted tests when possible.
- Add or update docs when behavior changes.
- Never include real secrets, tokens, private file paths, or customer data.

## Development Commands

```bash
bun install
bun run check
bun run test
bun run build
```

Use targeted package scripts when you are working in a specific package.

## License And Content

By contributing code, you agree that your contribution is provided under the MIT License. Creative content, names, setting text, art, and branding are handled separately in [CONTENT_LICENSE.md](CONTENT_LICENSE.md).
