# Sally Developer Platform Hackathon Track

This track gives participants one simple developer product: build on top of Sally, the HeySalad autonomous shopping and kiosk ordering agent.

## Developer Surface

- SDK: `@heysalad/sally-sdk`
- CLI: `@heysalad/sally`
- MCP server: `sally mcp`
- API contract: kiosk-compatible `/api/menu` and `/api/orders`

The immediate use case is agentic ordering: a participant can build a web app, assistant, workflow, or agent that reads the menu, creates an order for a table, and tracks or updates the order status.

## Environment

Set the kiosk API base URL:

```bash
export SALLY_KIOSK_BASE_URL=https://YOUR_KIOSK_API_BASE_URL
```

For local kiosk development:

```bash
export SALLY_KIOSK_BASE_URL=http://localhost:3000
```

If an API token is required:

```bash
export SALLY_API_TOKEN=your-token-here
```

## CLI Quickstart

```bash
npx -y @heysalad/sally kiosk menu --json
npx -y @heysalad/sally kiosk order --table 7 --item 12:2 --item 18
npx -y @heysalad/sally kiosk status 1 --json
```

Before npm publish, use the local built CLI:

```bash
pnpm --dir packages/sdk build
pnpm --dir packages/cli build
SALLY_KIOSK_BASE_URL=http://localhost:3000 node packages/cli/dist/index.js kiosk menu --json
```

## SDK Quickstart

```ts
import { SallyClient } from "@heysalad/sally-sdk";

const sally = new SallyClient(process.env.SALLY_KIOSK_BASE_URL ?? "http://localhost:3000");

const menu = await sally.getKioskMenu({ meal: "lunch" });
const firstItem = menu.categories[0]?.items[0];

if (!firstItem) {
  throw new Error("No menu items available.");
}

const order = await sally.createKioskOrderFromMenu({
  tableNumber: 7,
  items: [
    {
      menuItemId: firstItem.id,
      quantity: 1
    }
  ],
  notes: "Built during the HeySalad hackathon"
});

console.log(order.order.status);
```

## MCP Quickstart

Use this in Claude Desktop, Cursor, Codex-style MCP clients, or any stdio MCP client:

```json
{
  "mcpServers": {
    "sally": {
      "command": "npx",
      "args": ["-y", "@heysalad/sally", "mcp"],
      "env": {
        "SALLY_KIOSK_BASE_URL": "https://YOUR_KIOSK_API_BASE_URL"
      }
    }
  }
}
```

Local development config:

```json
{
  "mcpServers": {
    "sally": {
      "command": "node",
      "args": ["/path/to/heysalad-sally/packages/cli/dist/index.js", "mcp"],
      "env": {
        "SALLY_KIOSK_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

MCP tools:

- `sally_menu_list`: list menu categories and items
- `sally_order_create`: create a kiosk order from menu item IDs
- `sally_order_get`: get an order and its current status
- `sally_order_update_status`: update an order status

## API Contract

### `GET /api/menu`

Optional query:

- `meal`: meal period filter

Response:

```json
{
  "categories": [
    {
      "category": "Mains",
      "items": [
        {
          "id": 12,
          "name": "Chicken Salad",
          "description": "Fresh salad bowl",
          "price": 8.5,
          "category": "Mains",
          "image_url": null,
          "dietary_tags": "high-protein",
          "calories": 420,
          "is_halal": 1,
          "meal_period": "lunch",
          "available": 1,
          "sort_order": 1
        }
      ]
    }
  ]
}
```

### `POST /api/orders`

Payload:

```json
{
  "table_number": 7,
  "items": [
    {
      "menu_item_id": 12,
      "item_name": "Chicken Salad",
      "quantity": 2,
      "unit_price": 8.5
    }
  ],
  "notes": "No onions",
  "payment_reference": "demo-payment-ref"
}
```

Response:

```json
{
  "order": {
    "id": 1,
    "order_number": "HS-1001",
    "table_number": 7,
    "status": "confirmed",
    "total_amount": 17,
    "payment_status": "paid",
    "payment_reference": "demo-payment-ref",
    "notes": "No onions",
    "estimated_minutes": 15,
    "created_at": "2026-07-03T12:00:00.000Z",
    "updated_at": "2026-07-03T12:00:00.000Z"
  }
}
```

### `GET /api/orders/:id`

Returns:

```json
{
  "order": {
    "id": 1,
    "status": "confirmed",
    "items": []
  }
}
```

### `PATCH /api/orders/:id/status`

Payload:

```json
{
  "status": "ready",
  "estimated_minutes": 0
}
```

Valid statuses:

- `pending`
- `confirmed`
- `preparing`
- `ready`
- `delivered`
- `cancelled`

## Launch Checklist

1. Confirm the public kiosk API base URL for participants.
2. Build the SDK and CLI: `pnpm --dir packages/sdk build && pnpm --dir packages/cli build`.
3. Publish `@heysalad/sally-sdk` and `@heysalad/sally` to npm.
4. Put this guide behind `docs.heysalad.ai` or `developer.heysalad.ai`.
5. Add one sample v0 starter app that calls the CLI/SDK/MCP surface.
6. Verify one end-to-end flow: menu lookup, order creation, order status read.
