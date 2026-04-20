# Shenmay AI — Data API Reference (v1)

> Programmatic customer-data ingestion for tenants who don't want to upload
> CSVs through the dashboard. Push customer records from your CRM, backend,
> or nightly sync job. Data stays in your systems — Shenmay reads it at query
> time to answer questions about specific customers.

**Base URL:**
- SaaS: `https://api.pontensolutions.com`
- Self-hosted: `http(s)://<your-host>` (same origin as the widget)

## Authentication

Generate a key in the dashboard → Settings → Data API. The full key is shown
**once** at creation — store it somewhere safe. Shenmay only stores a bcrypt
hash, so the key is not recoverable if lost.

```
Authorization: Bearer nomii_da_<your-key>
```

All requests without a valid key return `401 Unauthorized`.

## Rate limits

- **Per IP:** 120 requests/minute (applied upstream, covers all traffic to the host).
- **Per API key:** 120 requests/minute (configurable via `DATA_API_RATE_LIMIT` env var on self-hosted).

Exceeding either returns `429 Too Many Requests`.

---

## Endpoints

### `POST /api/v1/customers` — upsert a customer

Idempotent. If a customer with this `external_id` already exists for this
tenant, it is updated.

**Request:**

```json
{
  "external_id": "client-123",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1-555-0100",
  "metadata": { "vip_tier": "gold" }
}
```

Required: `external_id`, `name`. All other fields are optional.

**Response (`201 Created`):**

```json
{
  "customer": {
    "id": "e3f1d2a0-...",
    "external_id": "client-123",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "created_at": "2026-04-18T10:00:00Z"
  }
}
```

### `GET /api/v1/customers` — list customers

Paginated. Supports search by name/email/external_id.

**Query params:**
- `limit` (default 50, max 200)
- `offset` (default 0)
- `search` (substring match, up to 200 chars)

**Response:**

```json
{ "customers": [ ... ], "limit": 50, "offset": 0 }
```

### `POST /api/v1/customers/:external_id/records` — bulk push records

Upserts data records by `(customer_id, category, label)`. Safe to call
repeatedly. Maximum 1000 records per request.

**Request:**

```json
{
  "records": [
    { "category": "portfolio", "label": "Total Value",        "value": "450000" },
    { "category": "portfolio", "label": "Retirement Account", "value": "200000" },
    { "category": "goals",     "label": "Retirement Target",  "value": "1200000" }
  ]
}
```

Each record requires `category` and `label`. `value` is stored as text
(categorical logic elsewhere handles numeric parsing).

Optional fields per record: `secondary_value`, `metadata` (JSON), `value_type`.

**Optional top-level:** `"replace_category": "portfolio"` — deletes all
existing records in that category before inserting. Use for full re-sync.

**Response:**

```json
{ "success": true, "inserted": 3, "customer_id": "e3f1d2a0-..." }
```

Returns `404` if the `external_id` doesn't exist — create the customer
first via `POST /api/v1/customers`.

### `GET /api/v1/customers/:external_id/records` — list records

Optional `?category=portfolio` filter.

### `DELETE /api/v1/customers/:external_id/records` — clear all records

Preserves the customer record itself; only records are deleted.

### `DELETE /api/v1/customers/:external_id/records/:category` — clear one category

Same as above, scoped to one category.

---

## Worked example — nightly CRM sync

```bash
#!/usr/bin/env bash
# nightly-sync.sh — push today's updated customers to Shenmay
set -euo pipefail

API_KEY="nomii_da_pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
BASE="https://api.pontensolutions.com"

# For each customer updated today in our CRM:
for cust in $(crm-cli list-updated --since 24h --format json); do
  external_id=$(echo "$cust" | jq -r .id)
  name=$(echo "$cust"         | jq -r .name)
  email=$(echo "$cust"        | jq -r .email)

  # Step 1 — upsert the customer
  curl -s -f -X POST "$BASE/api/v1/customers" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"external_id\":\"$external_id\",\"name\":\"$name\",\"email\":\"$email\"}"

  # Step 2 — push portfolio records (replace_category for clean state)
  records=$(crm-cli get-portfolio "$external_id" --format nomii-records)
  curl -s -f -X POST "$BASE/api/v1/customers/$external_id/records" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"records\":$records,\"replace_category\":\"portfolio\"}"
done
```

## Best practices

- **Generate one key per integration.** Revoke-and-regenerate has no side
  effects besides the API key itself, so keep one key per cron/backend/
  service for clean auditing.
- **Use `external_id` as the stable key.** Your CRM's customer ID is the
  source of truth; Shenmay's UUID should be treated as an opaque cache key.
- **Use `replace_category`** for full syncs of a logical group (e.g. the
  customer's whole portfolio), and plain upserts for incremental updates
  (e.g. one new goal added).
- **Respect rate limits.** 120 req/min per key is generous for sync jobs
  but not for real-time mirroring. Batch records (up to 1000 per request)
  instead of sending one record at a time.

## Support

Questions or issues: `support@pontensolutions.com`. Include your tenant
name and the request timestamp (UTC) — we can look up the exact request
in backend logs.
