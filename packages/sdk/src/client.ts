import type {
  ChatRequest,
  ComputerAgent,
  ComputerAgentConnectInput,
  ComputerAgentConnectResult,
  ComputerAgentRegisterInput,
  ComputerAgentSession,
  ComputerCommand,
  ComputerCommandResultInput,
  ComputerCommandSubmitInput,
  ComputerPairingSessionClaimResult,
  ComputerPairingSessionCreateInput,
  ComputerPairingSessionCreateResult,
  HealthResponse,
  KioskCreateOrderFromMenuInput,
  KioskCreateOrderInput,
  KioskGetMenuOptions,
  KioskListOrdersOptions,
  KioskMenuItem,
  KioskMenuResponse,
  KioskOrderListResponse,
  KioskOrderResponse,
  KioskUpdateOrderStatusInput,
  Platform,
  Recipe,
  RecipeExtractionInput,
  RecipeSaveInput,
  Session,
  SessionSyncInput,
  ShoppingItem,
  ShoppingList,
  ShoppingListInput
} from "./types.js";

export class SallyClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey?.trim() || undefined;
  }

  async health(): Promise<HealthResponse> {
    return this.requestJson<HealthResponse>("/health");
  }

  async syncSession(
    platform: Platform,
    userId: string,
    deviceId: string,
    context: Record<string, unknown>
  ): Promise<Session> {
    const payload: SessionSyncInput = { platform, userId, deviceId, context };
    return this.requestJson<Session>("/session/sync", {
      body: payload,
      method: "POST"
    });
  }

  async getShoppingList(userId: string): Promise<ShoppingList> {
    return this.requestJson<ShoppingList>(`/shopping/list/${encodeURIComponent(userId)}`);
  }

  async addShoppingItems(userId: string, items: ShoppingItem[]): Promise<void> {
    const payload: ShoppingListInput = { userId, items };
    await this.requestJson<unknown>("/shopping/list", {
      body: payload,
      method: "POST"
    });
  }

  async extractRecipe(url: string, userId: string): Promise<Recipe> {
    const payload: RecipeExtractionInput = { url, userId };
    return this.requestJson<Recipe>("/recipes/extract", {
      body: payload,
      method: "POST"
    });
  }

  async saveRecipe(userId: string, recipe: Recipe): Promise<void> {
    const payload: RecipeSaveInput = { userId, recipe };
    await this.requestJson<unknown>("/recipes", {
      body: payload,
      method: "POST"
    });
  }

  async getKioskMenu(options: KioskGetMenuOptions = {}): Promise<KioskMenuResponse> {
    return this.requestJson<KioskMenuResponse>(withQuery("/api/menu", {
      meal: options.meal
    }));
  }

  async listKioskOrders(options: KioskListOrdersOptions = {}): Promise<KioskOrderListResponse> {
    return this.requestJson<KioskOrderListResponse>(withQuery("/api/orders", {
      view: options.view ?? "active"
    }));
  }

  async getKioskOrder(orderId: number | string): Promise<KioskOrderResponse> {
    return this.requestJson<KioskOrderResponse>(`/api/orders/${encodeURIComponent(String(orderId))}`);
  }

  async createKioskOrder(input: KioskCreateOrderInput): Promise<KioskOrderResponse> {
    return this.requestJson<KioskOrderResponse>("/api/orders", {
      body: input,
      method: "POST"
    });
  }

  async createKioskOrderFromMenu(input: KioskCreateOrderFromMenuInput): Promise<KioskOrderResponse> {
    const menu = await this.getKioskMenu(input.meal ? { meal: input.meal } : {});
    const menuItems = indexMenuItems(menu);
    const items = input.items.map((item) => {
      const menuItem = menuItems.get(item.menuItemId);
      if (!menuItem) {
        throw new Error(`Menu item ${item.menuItemId} was not found in the Sally kiosk menu.`);
      }

      const quantity = item.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`Quantity for menu item ${item.menuItemId} must be a positive integer.`);
      }

      return {
        item_name: menuItem.name,
        menu_item_id: menuItem.id,
        quantity,
        unit_price: menuItem.price
      };
    });

    const payload: KioskCreateOrderInput = {
      items,
      table_number: input.tableNumber
    };
    if (input.notes) {
      payload.notes = input.notes;
    }
    if (input.paymentReference) {
      payload.payment_reference = input.paymentReference;
    }

    return this.createKioskOrder(payload);
  }

  async updateKioskOrderStatus(
    orderId: number | string,
    input: KioskUpdateOrderStatusInput
  ): Promise<KioskOrderResponse> {
    return this.requestJson<KioskOrderResponse>(`/api/orders/${encodeURIComponent(String(orderId))}/status`, {
      body: input,
      method: "PATCH"
    });
  }

  async *chat(
    message: string,
    userId: string,
    sessionId: string
  ): AsyncGenerator<string, void, unknown> {
    const payload: ChatRequest = { message, userId, sessionId };
    const response = await this.request("/chat", {
      body: payload,
      method: "POST"
    });

    if (!response.ok) {
      throw await this.makeHttpError(response);
    }

    if (!response.body) {
      throw new Error("Chat response did not include a streaming body.");
    }

    yield* streamSse(response.body);
  }

  async createComputerPairingSession(
    input: ComputerPairingSessionCreateInput = {}
  ): Promise<ComputerPairingSessionCreateResult> {
    return this.requestJson<ComputerPairingSessionCreateResult>("/computers/pairing-sessions", {
      body: input,
      method: "POST"
    });
  }

  async claimComputerPairingSession(code: string): Promise<ComputerPairingSessionClaimResult> {
    return this.requestJson<ComputerPairingSessionClaimResult>(
      "/computers/pairing-sessions/claim",
      { body: { code }, method: "POST" }
    );
  }

  async registerComputerAgent(input: ComputerAgentRegisterInput): Promise<ComputerAgent> {
    const response = await this.requestJson<{ item: ComputerAgent }>("/computers/agents", {
      body: input,
      method: "POST"
    });
    return response.item;
  }

  async connectComputerAgent(
    input: ComputerAgentConnectInput
  ): Promise<ComputerAgentConnectResult> {
    return this.requestJson<ComputerAgentConnectResult>("/computers/link/connect", {
      body: input,
      method: "POST"
    });
  }

  async listComputerAgents(): Promise<ComputerAgent[]> {
    const response = await this.requestJson<{ items: ComputerAgent[] }>("/computers/agents");
    return response.items;
  }

  async revokeComputerAgent(agentId: string): Promise<ComputerAgent> {
    const response = await this.requestJson<{ item: ComputerAgent }>(
      `/computers/agents/${encodeURIComponent(agentId)}/revoke`,
      { method: "POST" }
    );
    return response.item;
  }

  async submitComputerCommand(
    agentId: string,
    input: ComputerCommandSubmitInput
  ): Promise<ComputerCommand> {
    const response = await this.request(
      `/computers/agents/${encodeURIComponent(agentId)}/commands`,
      { body: input, method: "POST" }
    );
    // A denied command is a meaningful outcome (403 with the command record), not an error.
    if (!response.ok && response.status !== 403) {
      throw await this.makeHttpError(response);
    }
    const payload = (await response.json()) as { item?: ComputerCommand };
    if (!payload.item) {
      throw new Error("Computer command response did not include a command record.");
    }
    return payload.item;
  }

  async pollComputerCommands(session: ComputerAgentSession): Promise<ComputerCommand[]> {
    const response = await this.requestJson<{ items: ComputerCommand[] }>(
      "/computers/link/commands",
      { headers: agentSessionHeaders(session) }
    );
    return response.items;
  }

  async completeComputerCommand(
    session: ComputerAgentSession,
    commandId: string,
    input: ComputerCommandResultInput
  ): Promise<ComputerCommand> {
    const response = await this.requestJson<{ item: ComputerCommand }>(
      `/computers/link/commands/${encodeURIComponent(commandId)}/result`,
      { body: input, headers: agentSessionHeaders(session), method: "POST" }
    );
    return response.item;
  }

  private async requestJson<T>(
    path: string,
    init: JsonRequestInit = {}
  ): Promise<T> {
    const response = await this.request(path, init);
    if (!response.ok) {
      throw await this.makeHttpError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async request(
    path: string,
    init: JsonRequestInit = {}
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json, text/event-stream");

    if (this.apiKey) {
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }

    const requestInit: RequestInit = { headers };
    if (init.method) {
      requestInit.method = init.method;
    }

    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
      requestInit.body = JSON.stringify(init.body);
    }

    return fetch(new URL(path, this.baseUrl), requestInit);
  }

  private async makeHttpError(response: Response): Promise<Error> {
    const fallback = `Sally request failed with status ${response.status}`;
    try {
      const text = await response.text();
      return new Error(text || fallback);
    } catch {
      return new Error(fallback);
    }
  }
}

function agentSessionHeaders(session: ComputerAgentSession): Record<string, string> {
  return {
    "X-Sally-Agent-Id": session.agentId,
    "X-Sally-Agent-Session": session.sessionToken
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function indexMenuItems(menu: KioskMenuResponse): Map<number, KioskMenuItem> {
  const index = new Map<number, KioskMenuItem>();
  for (const category of menu.categories) {
    for (const item of category.items) {
      index.set(item.id, item);
    }
  }

  return index;
}

type JsonRequestInit = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: RequestInit["headers"];
};

async function* streamSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        yield* flushBuffer(buffer);
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const split = buffer.split(/\r?\n/);
      buffer = split.pop() ?? "";

      for (const line of split) {
        const token = parseSseLine(line);
        if (token === null) {
          continue;
        }
        if (token === "[DONE]") {
          return;
        }
        yield token;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* flushBuffer(buffer: string): AsyncGenerator<string, void, unknown> {
  for (const line of buffer.split(/\r?\n/)) {
    const token = parseSseLine(line);
    if (token === null) {
      continue;
    }
    if (token === "[DONE]") {
      return;
    }
    yield token;
  }
}

function parseSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) {
    return null;
  }

  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const payload = trimmed.slice(5).trimStart();
  if (!payload) {
    return null;
  }

  const parsed = tryParseJson(payload);
  if (parsed === null) {
    return payload;
  }

  if (typeof parsed === "string") {
    return parsed;
  }

  if (!isRecord(parsed)) {
    return payload;
  }

  const token =
    readString(parsed, ["delta", "content"]) ??
    readChoiceDelta(parsed) ??
    readAssistantMessage(parsed) ??
    readString(parsed, ["text"]) ??
    readString(parsed, ["message"]);

  return token ?? payload;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readChoiceDelta(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const choices = value.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) {
    return null;
  }

  const delta = firstChoice.delta;
  if (isRecord(delta)) {
    return readString(delta, ["content"]);
  }

  return null;
}

function readAssistantMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const message = value.message;
  if (isRecord(message)) {
    return readString(message, ["content"]);
  }

  return null;
}

function readString(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.length > 0) {
      return entry;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
