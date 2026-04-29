# Troubleshooting

## `bardo` Command Not Found

Open a new terminal after installing. If it still fails, confirm the installer's bin directory is on `PATH`.

## Browser Approval Fails

Run `bardo login` again and open the approval URL in a signed-in browser session. Direct unauthenticated approval API calls return `401 Unauthorized` by design.

## Trial or Subscription Required

Bardo is free to download, but use requires an active Bardo Pro subscription or the 3-day trial. If account access cannot be verified, Bardo fails closed.

## Client Does Not See Bardo

Restart the client after `bardo connect --client <client>`. Open the client from the same workspace where you ran `bardo init` and `bardo connect`.

## Workspace Is Not Ready

Run `bardo init` from the campaign workspace. If your rulebook is not at `./rulebook.md`, pass it explicitly:

```bash
bardo init --rulebook ./rules/core-rulebook.md
```
