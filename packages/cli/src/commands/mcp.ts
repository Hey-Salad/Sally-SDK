import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SallyClient,
  type KioskCreateOrderFromMenuInput,
  type KioskOrderStatus,
  type KioskUpdateOrderStatusInput
} from "@heysalad/sally-sdk";
import { Command } from "commander";
import * as z from "zod/v4";

import { readConfig } from "../utils/config.js";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled"
] as const satisfies readonly KioskOrderStatus[];

interface McpOptions {
  apiBaseUrl?: string;
  token?: string;
}

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Run Sally as a stdio MCP server")
    .option("--api-base-url <url>", "Sally or kiosk API base URL")
    .option("--token <token>", "Bearer token for protected Sally APIs")
    .action(async (options: McpOptions) => {
      await startSallyMcpServer(options);
    });
}

export async function startSallyMcpServer(options: McpOptions = {}): Promise<void> {
  const client = await createClient(options);
  const server = new McpServer({
    name: "heysalad-sally",
    version: "0.1.1"
  });

  server.registerTool(
    "sally_menu_list",
    {
      description: "List Sally kiosk menu categories and items.",
      inputSchema: {
        meal: z.string().optional().describe("Optional meal period filter, such as breakfast, lunch, or dinner.")
      }
    },
    async ({ meal }) => jsonResult(await client.getKioskMenu(meal ? { meal } : {}))
  );

  server.registerTool(
    "sally_order_create",
    {
      description: "Create a Sally kiosk order by resolving menu item IDs to item names and prices.",
      inputSchema: {
        items: z.array(z.object({
          menuItemId: z.number().int().positive().describe("Menu item ID from sally_menu_list."),
          quantity: z.number().int().positive().optional().describe("Quantity. Defaults to 1.")
        })).min(1),
        meal: z.string().optional().describe("Optional meal period used when resolving menu item IDs."),
        notes: z.string().optional().describe("Optional order notes."),
        paymentReference: z.string().optional().describe("Optional external payment reference."),
        tableNumber: z.number().int().positive().describe("Kiosk table number.")
      }
    },
    async ({ items, meal, notes, paymentReference, tableNumber }) => {
      const input: KioskCreateOrderFromMenuInput = {
        items: items.map((item) => {
          if (item.quantity === undefined) {
            return { menuItemId: item.menuItemId };
          }

          return {
            menuItemId: item.menuItemId,
            quantity: item.quantity
          };
        }),
        tableNumber
      };
      if (meal) {
        input.meal = meal;
      }
      if (notes) {
        input.notes = notes;
      }
      if (paymentReference) {
        input.paymentReference = paymentReference;
      }

      return jsonResult(await client.createKioskOrderFromMenu(input));
    }
  );

  server.registerTool(
    "sally_order_get",
    {
      description: "Get a Sally kiosk order and current status.",
      inputSchema: {
        orderId: z.union([
          z.number().int().positive(),
          z.string().min(1)
        ]).describe("Order ID.")
      }
    },
    async ({ orderId }) => jsonResult(await client.getKioskOrder(orderId))
  );

  server.registerTool(
    "sally_order_update_status",
    {
      description: "Update a Sally kiosk order status.",
      inputSchema: {
        estimatedMinutes: z.number().int().positive().optional().describe("Optional updated preparation estimate."),
        orderId: z.union([
          z.number().int().positive(),
          z.string().min(1)
        ]).describe("Order ID."),
        status: z.enum(ORDER_STATUSES).describe("New order status.")
      }
    },
    async ({ estimatedMinutes, orderId, status }) => {
      const payload: KioskUpdateOrderStatusInput = { status };
      if (estimatedMinutes !== undefined) {
        payload.estimated_minutes = estimatedMinutes;
      }

      return jsonResult(await client.updateKioskOrderStatus(orderId, payload));
    }
  );

  await server.connect(new StdioServerTransport());
}

async function createClient(options: McpOptions): Promise<SallyClient> {
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

function jsonResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        text: JSON.stringify(value, null, 2),
        type: "text"
      }
    ]
  };
}
