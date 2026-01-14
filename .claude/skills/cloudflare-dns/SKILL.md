---
description: Manage DNS records for freshwaterfutures.com subdomains via Cloudflare API. Use when user asks to "add subdomain", "create DNS record", "point subdomain to IP", "add A record", "add CNAME", or manage freshwaterfutures.com DNS.
---

# Cloudflare DNS Management Skill

Manage DNS records for `freshwaterfutures.com` using the Cloudflare API with a scoped API token.

## Quick Reference

**Add a subdomain pointing to an IP:**
```bash
.claude/skills/cloudflare-dns/scripts/dns.sh add <subdomain> <ip>
# Example: .claude/skills/cloudflare-dns/scripts/dns.sh add finn 209.38.31.46
```

**Add a CNAME record:**
```bash
.claude/skills/cloudflare-dns/scripts/dns.sh cname <subdomain> <target>
# Example: .claude/skills/cloudflare-dns/scripts/dns.sh cname www freshwaterfutures.com
```

**List all DNS records:**
```bash
.claude/skills/cloudflare-dns/scripts/dns.sh list
```

**Delete a record:**
```bash
.claude/skills/cloudflare-dns/scripts/dns.sh delete <subdomain>
```

## Environment Variables

The script reads from `.env` in the project root:
- `CLOUDFLARE_API_TOKEN` - Scoped API token with Zone:Read and DNS:Edit permissions
- `CLOUDFLARE_ZONE_ID` - Zone ID for freshwaterfutures.com

## Common Patterns

### Point subdomain to a server
```bash
# Add an A record for finn.freshwaterfutures.com -> server IP
.claude/skills/cloudflare-dns/scripts/dns.sh add finn 209.38.31.46
```

### Add proxied subdomain (orange cloud)
```bash
# Proxied through Cloudflare (default)
.claude/skills/cloudflare-dns/scripts/dns.sh add finn 209.38.31.46

# DNS only (grey cloud) - bypasses Cloudflare proxy
.claude/skills/cloudflare-dns/scripts/dns.sh add-direct finn 209.38.31.46
```

## API Token Permissions

The token is scoped to:
- **Zone:Read** - List zones and records
- **DNS:Edit** - Create, update, delete DNS records
- **Resource**: freshwaterfutures.com zone only
