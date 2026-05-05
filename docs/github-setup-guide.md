# Bardo GitHub Operating Guide

This guide describes how Bardo uses GitHub as a small professional open-source organization while staying on the GitHub Free plan.

## Repository Roles

- `bardo`: public open-source and community repository.
- `bardo-app`: private hosted product repository for billing, customer data paths, deployment configuration, and business-sensitive code.

Do not move secrets, customer data, private deployment settings, or private product logic from `bardo-app` into `bardo`.

## Work Flow

1. Open or find an issue.
2. Create a branch from the latest `main`.
3. Make focused changes.
4. Run checks.
5. Open a pull request.
6. Review, squash merge, and delete the branch.

Maintainers may use organization branches. Outside contributors should use forks.

Never push directly to `main`.

The normal path is always branch -> pull request -> squash merge -> delete branch. This applies even when the owner is working alone.

## Issues And Discussions

Use Issues for actionable work. Use Discussions for questions, ideas, playtesting notes, showcases, and community conversation.

Current public discussion categories:

- Announcements
- General
- Q&A
- Ideas
- Polls
- Show and Tell

Use General for playtesting notes until GitHub exposes a dedicated Playtesting category in the repository settings UI.

## Branch Protection

For the public `bardo` repository, `main` should require pull requests, passing CI, conversation resolution, linear history, and no force pushes or branch deletion.

Admins may bypass only for emergencies. If that happens, document why in the related issue or pull request.

For the private `bardo-app` repository on GitHub Free, do not rely on private branch protection. Use the same human workflow anyway: no direct pushes to `main`, open a pull request, squash merge, and delete the branch.

## Security On GitHub Free

Keep these enabled for the public `bardo` repository:

- Dependency graph
- Dependabot alerts
- Dependabot security updates
- Secret scanning
- Push protection
- CodeQL or other code scanning

Keep these enabled for the private `bardo-app` repository when GitHub Free exposes them:

- Dependency graph
- Dependabot alerts
- Dependabot security updates

Ignore private-repo features that GitHub Free does not expose. Do not design the workflow around unavailable private branch protection, private secret scanning, private push protection, or org-level repository rules.

## Custom Properties

Custom Properties are structured repository metadata for organization governance. They are not public-facing repo topics.

Custom Properties are optional for Bardo right now. If the organization UI allows setting them on GitHub Free, use the values below. If the UI does not expose them, skip them for now and keep using topics, labels, README docs, and this guide.

Current custom properties:

- `repo_type`: `public-core`, `private-app`
- `data_sensitivity`: `public`, `internal`, `confidential`
- `criticality`: `low`, `medium`, `high`
- `deploy_target`: `none`, `vercel`

Current values:

- `bardo`: `repo_type=public-core`, `data_sensitivity=public`, `criticality=medium`, `deploy_target=none`
- `bardo-app`: `repo_type=private-app`, `data_sensitivity=confidential`, `criticality=high`, `deploy_target=vercel`

## Third-Party Access

Install GitHub Apps and OAuth integrations only when needed. Prefer least privilege, review access regularly, and remove integrations that are no longer used.

Avoid self-hosted runners until there is a clear reason to operate them.

Do not add paid-only security or governance features just to make the setup look more enterprise. The goal is a clean Free-plan workflow that is easy to follow.
