import {
  SallyClient,
  type KioskCreateOrderFromMenuInput,
  type KioskMenuResponse,
  type KioskOrder,
  type KioskOrderStatus
} from "@heysalad/sally-sdk";
import { Command } from "commander";

import { readConfig } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const ORDER_STATUSES: KioskOrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled"
];

interface ClientOptions {
  apiBaseUrl?: string;
  token?: string;
}

interface JsonOptions extends ClientOptions {
  json?: boolean;
}

interface MenuOptions extends JsonOptions {
  meal?: string;
}

interface ListOrdersOptions extends JsonOptions {
  view?: "active" | "history";
}

interface CreateOrderOptions extends JsonOptions {
  item?: string[];
  meal?: string;
  notes?: string;
  paymentReference?: string;
  table: string;
}

interface UpdateStatusOptions extends JsonOptions {
  estimatedMinutes?: string;
  status: string;
}

export function registerKioskCommand(program: Command): void {
  const command = program
    .command("kiosk")
    .description("Use Sally kiosk menu and ordering APIs");

  addClientOptions(command.command("menu"))
    .description("List available kiosk menu items")
    .option("--meal <meal>", "Filter menu by meal period")
    .option("--json", "Print JSON output", false)
    .action(async (options: MenuOptions) => {
      await listMenu(options);
    });

  addClientOptions(command.command("orders"))
    .description("List kiosk orders")
    .option("--view <view>", "Order view: active or history", "active")
    .option("--json", "Print JSON output", false)
    .action(async (options: ListOrdersOptions) => {
      await listOrders(options);
    });

  addClientOptions(command.command("order"))
    .description("Create a kiosk order from menu item IDs")
    .requiredOption("--table <number>", "Kiosk table number")
    .option("--item <id[:qty]>", "Menu item ID and optional quantity. Can be repeated.", collectValues, [])
    .option("--meal <meal>", "Menu meal period to resolve item IDs from")
    .option("--notes <text>", "Order notes")
    .option("--payment-reference <ref>", "External payment reference")
    .option("--json", "Print JSON output", false)
    .action(async (options: CreateOrderOptions) => {
      await createOrder(options);
    });

  addClientOptions(command.command("status <orderId>"))
    .description("Read kiosk order status")
    .option("--json", "Print JSON output", false)
    .action(async (orderId: string, options: JsonOptions) => {
      await readOrderStatus(orderId, options);
    });

  addClientOptions(command.command("update-status <orderId>"))
    .description("Update kiosk order status")
    .requiredOption("--status <status>", `One of: ${ORDER_STATUSES.join(", ")}`)
    .option("--estimated-minutes <number>", "Updated preparation estimate")
    .option("--json", "Print JSON output", false)
    .action(async (orderId: string, options: UpdateStatusOptions) => {
      await updateOrderStatus(orderId, options);
    });
}

async function listMenu(options: MenuOptions): Promise<void> {
  const client = await createClient(options);
  const menu = await client.getKioskMenu(options.meal ? { meal: options.meal } : {});

  if (options.json) {
    console.log(JSON.stringify(menu, null, 2));
    return;
  }

  printMenu(menu);
}

async function listOrders(options: ListOrdersOptions): Promise<void> {
  const client = await createClient(options);
  const view = options.view ?? "active";
  if (view !== "active" && view !== "history") {
    throw new Error("Order view must be active or history.");
  }

  const response = await client.listKioskOrders({ view });
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const logger = createLogger();
  if (response.orders.length === 0) {
    logger.warn(`No ${view} kiosk orders found.`);
    return;
  }

  for (const order of response.orders) {
    printOrderSummary(order);
  }
}

async function createOrder(options: CreateOrderOptions): Promise<void> {
  const client = await createClient(options);
  const input: KioskCreateOrderFromMenuInput = {
    items: parseOrderItems(options.item ?? []),
    tableNumber: parsePositiveInteger(options.table, "table")
  };

  if (options.meal) {
    input.meal = options.meal;
  }
  if (options.notes) {
    input.notes = options.notes;
  }
  if (options.paymentReference) {
    input.paymentReference = options.paymentReference;
  }

  const response = await client.createKioskOrderFromMenu(input);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  printOrderDetail(response.order);
}

async function readOrderStatus(orderId: string, options: JsonOptions): Promise<void> {
  const client = await createClient(options);
  const response = await client.getKioskOrder(orderId);

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  printOrderDetail(response.order);
}

async function updateOrderStatus(orderId: string, options: UpdateStatusOptions): Promise<void> {
  const client = await createClient(options);
  const status = parseOrderStatus(options.status);
  const payload = { status };

  if (options.estimatedMinutes !== undefined) {
    Object.assign(payload, {
      estimated_minutes: parsePositiveInteger(options.estimatedMinutes, "estimated minutes")
    });
  }

  const response = await client.updateKioskOrderStatus(orderId, payload);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  printOrderDetail(response.order);
}

function addClientOptions(command: Command): Command {
  return command
    .option("--api-base-url <url>", "Sally or kiosk API base URL")
    .option("--token <token>", "Bearer token for protected Sally APIs");
}

async function createClient(options: ClientOptions): Promise<SallyClient> {
  const config = await readConfig();
  const baseUrl =
    options.apiBaseUrl ??
    process.env.SALLY_KIOSK_BASE_URL ??
    process.env.SALLY_API_BASE_URL ??
    config.apiBaseUrl;
  const token =
    options.token ??
    process.env.SALLY_API_TOKEN ??
    process.env.SALLY_API_KEY ??
    process.env.SALLY_AUTH_TOKEN ??
    config.authToken;

  return new SallyClient(baseUrl, token);
}

function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseOrderItems(values: string[]): KioskCreateOrderFromMenuInput["items"] {
  const entries = values.flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (entries.length === 0) {
    throw new Error("Pass at least one --item value, for example --item 12:2.");
  }

  return entries.map((entry) => {
    const [idRaw, quantityRaw] = entry.split(":");
    if (!idRaw) {
      throw new Error(`Invalid order item "${entry}". Use id or id:quantity.`);
    }

    return {
      menuItemId: parsePositiveInteger(idRaw, "menu item ID"),
      quantity: quantityRaw ? parsePositiveInteger(quantityRaw, "quantity") : 1
    };
  });
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function parseOrderStatus(value: string): KioskOrderStatus {
  if (ORDER_STATUSES.includes(value as KioskOrderStatus)) {
    return value as KioskOrderStatus;
  }

  throw new Error(`Status must be one of: ${ORDER_STATUSES.join(", ")}.`);
}

function printMenu(menu: KioskMenuResponse): void {
  const logger = createLogger();
  for (const category of menu.categories) {
    logger.info(category.category);
    for (const item of category.items) {
      const flags = [
        item.meal_period,
        item.is_halal ? "halal" : "",
        item.available ? "" : "unavailable",
        item.dietary_tags ?? ""
      ].filter(Boolean).join(", ");
      const suffix = flags ? ` (${flags})` : "";
      console.log(`  ${item.id}  ${item.name}  ${formatMoney(item.price)}${suffix}`);
      if (item.description) {
        console.log(`      ${item.description}`);
      }
    }
  }
}

function printOrderSummary(order: KioskOrder): void {
  console.log(
    `${order.id}  ${order.order_number}  table ${order.table_number}  ${order.status}  ${formatMoney(order.total_amount)}`
  );
}

function printOrderDetail(order: KioskOrder): void {
  printOrderSummary(order);
  if (order.items?.length) {
    for (const item of order.items) {
      console.log(`  ${item.quantity}x ${item.item_name}  ${formatMoney(item.unit_price)}`);
    }
  }
  if (order.notes) {
    console.log(`  notes: ${order.notes}`);
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    currency: "GBP",
    style: "currency"
  }).format(value);
}
