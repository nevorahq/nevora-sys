import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type GraphType = "cashflow" | "by_category" | "balance_trend";

interface GraphifyRequest {
  org_id: string;
  type: GraphType;
  months?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: GraphifyRequest = await req.json();
    const { org_id, type, months = 6 } = body;

    if (!org_id || !type) {
      return Response.json(
        { error: "org_id and type are required" },
        { status: 400 },
      );
    }

    let result;
    switch (type) {
      case "cashflow":
        result = await getCashflow(supabase, org_id, months);
        break;
      case "by_category":
        result = await getByCategory(supabase, org_id);
        break;
      case "balance_trend":
        result = await getBalanceTrend(supabase, org_id, months);
        break;
      default:
        return Response.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    return Response.json(result, { headers: CORS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});

// ── Cashflow: monthly income vs expenses ──────────────────────────────────────

async function getCashflow(
  supabase: SupabaseClient,
  orgId: string,
  months: number,
) {
  const windowStart = monthsAgo(months);

  const { data, error } = await supabase
    .from("money_transactions")
    .select("type, amount, transaction_date")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .gte("transaction_date", windowStart);

  if (error) return { labels: [], income: [], expenses: [] };

  const map = buildMonthMap(months);

  for (const tx of data ?? []) {
    const key = tx.transaction_date.slice(0, 7);
    const slot = map.get(key);
    if (!slot) continue;
    if (tx.type === "income") slot.income += Number(tx.amount);
    else slot.expenses += Number(tx.amount);
  }

  return {
    labels: [...map.keys()].map(labelFromKey),
    income: [...map.values()].map((v) => round2(v.income)),
    expenses: [...map.values()].map((v) => round2(v.expenses)),
  };
}

// ── By category: current-month expense breakdown ──────────────────────────────

async function getByCategory(supabase: SupabaseClient, orgId: string) {
  const now = new Date();
  const startOfMonth = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));

  const { data, error } = await supabase
    .from("money_transactions")
    .select("amount, category:money_categories(name, color)")
    .eq("organization_id", orgId)
    .eq("type", "expense")
    .is("deleted_at", null)
    .gte("transaction_date", startOfMonth);

  if (error) return { labels: [], values: [], colors: [] };

  const catMap = new Map<string, { color: string | null; total: number }>();

  for (const tx of data ?? []) {
    const cat = tx.category as unknown as { name: string; color: string | null } | null;
    const name = cat?.name ?? "Uncategorized";
    const color = cat?.color ?? null;
    const existing = catMap.get(name);
    if (existing) existing.total += Number(tx.amount);
    else catMap.set(name, { color, total: Number(tx.amount) });
  }

  const sorted = [...catMap.entries()]
    .sort((a, b) => b[1].total - a[1].total);

  return {
    labels: sorted.map(([name]) => name),
    values: sorted.map(([, v]) => round2(v.total)),
    colors: sorted.map(([, v]) => v.color),
  };
}

// ── Balance trend: cumulative balance per month ───────────────────────────────

async function getBalanceTrend(
  supabase: SupabaseClient,
  orgId: string,
  months: number,
) {
  const windowStart = monthsAgo(months);

  const [{ data: accounts }, { data: txns }] = await Promise.all([
    supabase
      .from("money_accounts")
      .select("initial_balance")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("deleted_at", null),
    supabase
      .from("money_transactions")
      .select("type, amount, transaction_date")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: true }),
  ]);

  // Sum of all initial balances as the baseline
  let base = (accounts ?? []).reduce(
    (sum, a) => sum + Number(a.initial_balance),
    0,
  );

  // Apply all transactions before the window to baseline
  for (const tx of txns ?? []) {
    if (tx.transaction_date >= windowStart) break;
    base += tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
  }

  // Aggregate deltas per month within the window
  const map = buildMonthMap(months, () => ({ delta: 0 }));

  for (const tx of txns ?? []) {
    if (tx.transaction_date < windowStart) continue;
    const key = tx.transaction_date.slice(0, 7);
    const slot = map.get(key);
    if (!slot) continue;
    slot.delta += tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
  }

  // Convert to cumulative balance
  let running = base;
  const balance: number[] = [];
  for (const slot of map.values()) {
    running += slot.delta;
    balance.push(round2(running));
  }

  return { labels: [...map.keys()].map(labelFromKey), balance };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMonthMap<T>(months: number, init?: () => T) {
  const map = new Map<string, T & { income: number; expenses: number }>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, { income: 0, expenses: 0, ...(init?.() ?? {}) } as T & {
      income: number;
      expenses: number;
    });
  }
  return map;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n + 1);
  return isoDate(d);
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function labelFromKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en", {
    month: "short",
    year: "2-digit",
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
