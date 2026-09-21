# API Integration Guide

This document explains how to use the external API system for this project and how to integrate it from other applications (backend services, frontends, or external tools).

## 1) Overview & concepts

- **API Customer**: a logical client (external app, partner, etc.).
- **API Key**: secret token used by that customer to call the API.
- **Category**: a data collection (your dynamic table).
- **Lifetime limit**: total number of rows that can be read from a category by a given key.

Flow:

- Admin creates an **API Customer**.
- Admin creates one or more **API Keys** for that customer.
- On key creation, all current categories are auto-added as **allowed** with default limit `1000` rows per category.
- Admin can then configure category access per key from the admin panel:
  - `allow/disallow`
  - `lifetime_limit` per category (lifetime max)
- External app calls the API with `x-api-key`.
- On each successful read, usage is incremented for that key+category.

## 2) Base URL & environment

In most setups the base URL is:

- Local development:
  - `http://localhost:3000`
- Production:
  - `https://your-domain.com` (depends on how you deploy the Node app)

All examples in this document use `http://localhost:3000`. In another project, **replace it with your real host**.

## 3) Authentication

Send your key in request header:

```http
x-api-key: YOUR_API_KEY
```

If key is invalid/inactive, request is rejected with `401` or `403`.

## 4) Public endpoints

### Get allowed categories for current API key

- Method: `GET`
- URL: `/external-api/categories`

Example:

```bash
curl -X GET "http://localhost:3000/external-api/categories" \
  -H "x-api-key: YOUR_API_KEY"
```

Response includes category ids and remaining lifetime quota per category.

### Get all categories (and see which are allowed)

- Method: `GET`
- URL: `/external-api/categories-all`

Example:

```bash
curl -X GET "http://localhost:3000/external-api/categories-all" \
  -H "x-api-key: YOUR_API_KEY"
```

Response:

```json
{
  "categories": [
    {
      "id": 1,
      "name": "Users",
      "is_allowed": 1,
      "lifetime_limit": 1000,
      "usage_count": 120,
      "remaining": 880
    },
    {
      "id": 2,
      "name": "Orders",
      "is_allowed": 0,
      "lifetime_limit": 0,
      "usage_count": 0,
      "remaining": 0
    }
  ]
}
```

Use this endpoint when you need to discover **all** categories in the system and also know which ones are currently usable for a given API key.

### Get category data (with limit control)

- Method: `GET`
- URL: `/external-api/categories/:categoryId/data`
- Query:
  - `limit` (optional): number of rows requested (default 100)

Important quota behavior:
- `limit` is the maximum number of rows to return for **this request**.
- The API will cap your request by the key+category remaining quota (`remaining`).
- Each successful request increases usage by the **returned** row count (`meta.returned`).

Example:

```bash
curl -X GET "http://localhost:3000/external-api/categories/1/data?limit=50" \
  -H "x-api-key: YOUR_API_KEY"
```

Quick checklist before testing:
1. Create API customer from `/dashboard/apis`
2. Create API key for that customer
3. Confirm category row exists in "Category Access" table for your category id
4. Ensure key status is `active` and category is allowed

## 5) Response format

Success response:

```json
{
  "data": [
    {
      "row_id": 123,
      "created_at": "2026-03-31T10:20:00.000Z",
      "Name": "Alice",
      "Email": "alice@company.com"
    }
  ],
  "meta": {
    "categoryId": 1,
    "limit": 1000,
    "requestedLimit": 50,
    "used": 120,
    "remaining": 880,
    "returned": 50,
    "rowIdRange": {
      "from": 1,
      "to": 100
    }
  }
}
```

Notes:
- Returned row keys are dynamic based on category column names.
- `used` increases by `returned`.
- `remaining` is calculated from `lifetime_limit - usage_count`.

## 6) Error responses

- `401` Missing/invalid key
  - `{"error":"Missing API key"}`
  - `{"error":"Invalid API key"}`
- `403` Key/customer disabled or category not allowed
  - `{"error":"API key is not active"}`
  - `{"error":"API customer is not active"}`
  - `{"error":"Category not allowed for this API key"}`
  - `{"error":"Category is disabled for this API key"}`
- `429` Lifetime limit exceeded
  - `{"error":"Category lifetime limit exceeded","meta":{"limit":100,"used":100,"remaining":0}}`
- `500` Internal server error

## 7) Admin API management endpoints

These endpoints are for logged-in admin panel sessions (not API key auth).

- `GET /api/admin/apis/customers`
- `POST /api/admin/apis/customers`
- `PUT /api/admin/apis/customers/:id`
- `GET /api/admin/apis/customers/:id/keys`
- `POST /api/admin/apis/customers/:id/keys` (returns raw key once)
- `PUT /api/admin/apis/keys/:id/status`
- `GET /api/admin/apis/keys/:id/accesses`
- `PUT /api/admin/apis/keys/:id/categories/:categoryId`

### Configure category lifetime limit for a key

- Endpoint: `PUT /api/admin/apis/keys/:id/categories/:categoryId`
- Body example:

```json
{
  "is_allowed": true,
  "lifetime_limit": 500,
  "from_row_id": 1,
  "to_row_id": 100
}
```

When `is_allowed` is `false`, the key cannot read data for that category.

Row range behavior:
- `from_row_id` (optional): minimum `category_rows.id` allowed (empty = no lower bound)
- `to_row_id` (optional): maximum `category_rows.id` allowed (empty = no upper bound)
- If both are set, API will only return rows whose `category_rows.id` is inside the range.

## 8) JavaScript integration example (Node / Browser)

```javascript
async function fetchCategoryData(categoryId, apiKey, baseUrl = "http://localhost:3000", limit = 100) {
  const res = await fetch(
    `${baseUrl.replace(/\\/+$/, "")}/external-api/categories/${categoryId}/data?limit=${limit}`,
    {
      method: "GET",
      headers: { "x-api-key": apiKey }
    }
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || "API request failed");
  }
  return body;
}
```

Notes for browser apps:
- If your frontend is served from **the same origin** as the API (e.g. `https://your-domain.com`), you can call the endpoint directly.
- If you call from a different origin, make sure CORS is configured appropriately on the API host.

## 9) Python integration example

```python
import requests

def fetch_category_data(category_id, api_key, base_url="http://localhost:3000", limit=100):
    base = base_url.rstrip("/")
    url = f"{base}/external-api/categories/{category_id}/data"
    headers = {"x-api-key": api_key}
    params = {"limit": limit}
    r = requests.get(url, headers=headers, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

```

## 10) Typical integration patterns

- **Backend service** (Node, Python, etc.):
  - Store the API key in environment variables or secrets manager.
  - Use the JS/Python examples above to fetch data and map into your domain models.

- **Frontend SPA / mobile app**:
  - Prefer calling your own backend, and let your backend talk to this API using the key.
  - Only expose the raw API key on the client if you fully trust the environment, as it is equivalent to a password.

- **ETL / data pipelines**:
  - Run a scheduled job (cron, GitHub Action, CI, etc.) that:
    - Calls `/external-api/categories` to list categories and remaining quota.
    - For each category, calls `/external-api/categories/:id/data?limit=N` to pull data.


