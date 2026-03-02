---
name: clerk-webhooks
description: Clerk webhooks for real-time events and data syncing. Listen for user creation, updates, deletion, and organization events. Build event-driven features like database sync, notifications, integrations.
allowed-tools: WebFetch
license: MIT
metadata:
  author: clerk
  version: "1.0.0"
---

# Webhooks

> **Prerequisite**: Webhooks are asynchronous. Use for background tasks, not synchronous flows.

## Documentation Reference

| Task | Link |
|------|------|
| Overview | https://clerk.com/docs/guides/development/webhooks/overview |
| Sync to database | https://clerk.com/docs/guides/development/webhooks/syncing |
| Debugging | https://clerk.com/docs/guides/development/webhooks/debugging |
| Event catalog | https://dashboard.clerk.com/~/webhooks |

## Quick Start

1. Create endpoint at `app/api/webhooks/route.ts`
2. Use `verifyWebhook(req)` from `@clerk/nextjs/webhooks`
3. Dashboard -> Webhooks -> Add Endpoint
4. Set `CLERK_WEBHOOK_SIGNING_SECRET` in env
5. Make route public

## Supported Events

**User**: `user.created` `user.updated` `user.deleted`

**Organization**: `organization.created` `organization.updated` `organization.deleted`

**Organization Domain**: `organizationDomain.created` `organizationDomain.updated` `organizationDomain.deleted`

**Organization Invitation**: `organizationInvitation.created` `organizationInvitation.accepted` `organizationInvitation.revoked`

**Organization Membership**: `organizationMembership.created` `organizationMembership.updated` `organizationMembership.deleted`

**Roles**: `role.created` `role.updated` `role.deleted`

**Permissions**: `permission.created` `permission.updated` `permission.deleted`

**Session**: `session.created` `session.updated` `session.ended` `session.removed` `session.revoked` `session.pending`

**Communication**: `email.created` `sms.created`

**Invitations**: `invitation.created` `invitation.accepted` `invitation.revoked`

**Waitlist**: `waitlistEntry.created` `waitlistEntry.updated`

## When to Sync

**Do sync when:**
- Need other users' data
- Storing extra custom fields
- Building notifications or integrations

**Don't sync when:**
- Only need current user data
- No custom fields
- Need immediate access

## Key Patterns

### Make Route Public

Ensure middleware does not protect `/api/webhooks(.*)`.

### Verify Webhook

```typescript
import { verifyWebhook } from '@clerk/nextjs/webhooks'
const evt = await verifyWebhook(req)
```

### Type-Safe Events

```typescript
if (evt.type === 'user.created') {
  // TypeScript knows evt.data structure
}
```

### Handle All Three Events

Don't only listen to `user.created`. Also handle `user.updated` and `user.deleted`.

### Queue Async Work

```typescript
await queue.enqueue('process-webhook', evt)
return new Response('Received', { status: 200 })
```

## Webhook Reliability

**Retries**: Svix retries failed webhooks for up to 3 days.

**Replay**: Failed webhooks can be replayed from Dashboard.

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Verification fails | Wrong import or usage | Use `@clerk/nextjs/webhooks`, pass `req` directly |
| Route not found (404) | Wrong path | Use `/api/webhooks` |
| Not authorized (401) | Route is protected | Make route public |
| No data in DB | Async job pending | Wait/check logs |
| Duplicate entries | Only handling `user.created` | Also handle `user.updated` |
| Timeouts | Handler too slow | Queue async work |

## Testing & Deployment

**Local**: Use ngrok to tunnel localhost and add the ngrok URL to Dashboard.

**Production**: Update webhook endpoint URL to production domain and copy the signing secret to production env vars.
