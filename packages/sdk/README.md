# @heysalad/sally-sdk

The Sally SDK exposes the reusable building blocks behind the CLI and host agent.

## Kiosk ordering quickstart

```bash
npm install @heysalad/sally-sdk
```

```ts
import { SallyClient } from "@heysalad/sally-sdk";

const sally = new SallyClient(
  process.env.SALLY_KIOSK_BASE_URL ?? "http://localhost:3000",
  process.env.SALLY_API_TOKEN
);

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
      quantity: 2
    }
  ],
  notes: "Hackathon demo order"
});

console.log(order.order.order_number);
```

Kiosk methods:

- `getKioskMenu({ meal })`
- `listKioskOrders({ view })`
- `getKioskOrder(orderId)`
- `createKioskOrder(payload)`
- `createKioskOrderFromMenu(payload)`
- `updateKioskOrderStatus(orderId, payload)`

## Modules

- device management
- Cloudflare tunnel orchestration
- team auth and permissions
- AI client wrappers and agent runners
- kiosk menu and ordering APIs

The SDK is TypeScript-first and ships declarations for the CLI, MCP server, and developer integrations.
