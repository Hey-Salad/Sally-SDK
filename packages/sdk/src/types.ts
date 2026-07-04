export type Platform = "macos" | "ios" | "android" | "web";

export type ConnectionState = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ShoppingItem {
  name: string;
  qty: number;
  store: string;
  checked?: boolean;
}

export interface ShoppingList {
  id: string;
  userId: string;
  items: ShoppingItem[];
  createdAt?: number;
  updatedAt?: number;
}

export interface Recipe {
  id?: string;
  userId?: string;
  url?: string;
  title: string;
  ingredients: string[];
  steps: string[];
  time: string;
  calories: number | string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface Session {
  id: string;
  platform: Platform;
  userId: string;
  deviceId: string;
  context: Record<string, unknown>;
  updatedAt: number;
}

export interface Device {
  id: string;
  name: string;
  platform: Platform;
  status?: string;
  lastSeen?: number | null;
  tunnelUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ConnectionStatus {
  name: string;
  state: ConnectionState;
  statusText: string;
  latencyMs: number | null;
  updatedAt: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  id?: string;
  createdAt?: number;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  ts: string;
  db: "ok" | "error";
  version: string;
}

export interface SessionSyncInput {
  platform: Platform;
  userId: string;
  deviceId: string;
  context: Record<string, unknown>;
}

export interface ShoppingListInput {
  userId: string;
  items: ShoppingItem[];
}

export interface RecipeExtractionInput {
  url: string;
  userId: string;
}

export interface RecipeSaveInput {
  userId: string;
  recipe: Recipe;
}

export interface ChatRequest {
  message: string;
  userId: string;
  sessionId: string;
}

export type KioskOrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export type KioskPaymentStatus = "unpaid" | "processing" | "paid" | "failed";

export interface KioskMenuItem {
  id: number;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  dietary_tags: string | null;
  calories: number | null;
  is_halal: number;
  meal_period: string;
  available: number;
  sort_order: number;
}

export interface KioskMenuCategory {
  category: string;
  items: KioskMenuItem[];
}

export interface KioskMenuResponse {
  categories: KioskMenuCategory[];
}

export interface KioskOrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
}

export interface KioskOrder {
  id: number;
  order_number: string;
  table_number: number;
  status: KioskOrderStatus;
  total_amount: number;
  payment_status: KioskPaymentStatus;
  payment_reference: string | null;
  notes: string | null;
  estimated_minutes: number;
  created_at: string;
  updated_at: string;
  items?: KioskOrderItem[];
}

export interface KioskOrderResponse {
  order: KioskOrder;
}

export interface KioskOrderListResponse {
  orders: KioskOrder[];
}

export interface KioskOrderStatsResponse {
  stats: Record<string, unknown>;
}

export interface KioskGetMenuOptions {
  meal?: string;
}

export interface KioskListOrdersOptions {
  view?: "active" | "history";
}

export interface KioskCreateOrderItemInput {
  menu_item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
}

export interface KioskCreateOrderInput {
  table_number: number;
  items: KioskCreateOrderItemInput[];
  notes?: string;
  payment_reference?: string;
}

export interface KioskCreateOrderFromMenuItemInput {
  menuItemId: number;
  quantity?: number;
}

export interface KioskCreateOrderFromMenuInput {
  tableNumber: number;
  items: KioskCreateOrderFromMenuItemInput[];
  meal?: string;
  notes?: string;
  paymentReference?: string;
}

export interface KioskUpdateOrderStatusInput {
  status: KioskOrderStatus;
  estimated_minutes?: number;
}
