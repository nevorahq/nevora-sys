import "server-only";

import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Курсы каждой валюты к базовой через SQL-функцию fn_get_exchange_rate.
 *
 * Возвращает rate[currency] = «сколько base за 1 currency» и флаг complete:
 * complete=false, если хотя бы для одной валюты курс не найден (NULL из БД) —
 * тогда итог в базовой валюте неполный, и UI это показывает.
 *
 * Конвертация по ТЕКУЩЕМУ курсу (p_on_date по умолчанию = сегодня): корректно
 * для «сколько мои остатки стоят сегодня». Пер-транзакционные исторические
 * курсы (на дату операции) — отдельный, более глубокий шаг.
 */
export async function getRatesToBase(
  supabase: SupabaseServerClient,
  currencies: readonly string[],
  baseCurrency: string,
): Promise<{ rates: Map<string, number>; complete: boolean }> {
  const distinct = [...new Set(currencies)];

  const entries = await Promise.all(
    distinct.map(async (currency): Promise<readonly [string, number | null]> => {
      if (currency === baseCurrency) return [currency, 1] as const;

      const { data, error } = await supabase.rpc("fn_get_exchange_rate", {
        p_from: currency,
        p_to: baseCurrency,
      });

      if (error) {
        console.error("fn_get_exchange_rate error:", error);
        return [currency, null] as const;
      }
      return [currency, data == null ? null : Number(data)] as const;
    }),
  );

  const rates = new Map<string, number>();
  let complete = true;
  for (const [currency, rate] of entries) {
    if (rate == null) {
      complete = false;
      continue;
    }
    rates.set(currency, rate);
  }

  return { rates, complete };
}

/**
 * Суммирует величины по валютам в базовую валюту, применяя курсы.
 * Валюты без курса пропускаются (их недостаток уже отражён в `complete`).
 */
export function sumInBase(
  amountsByCurrency: ReadonlyMap<string, number>,
  rates: ReadonlyMap<string, number>,
): number {
  let total = 0;
  for (const [currency, amount] of amountsByCurrency) {
    const rate = rates.get(currency);
    if (rate != null) total += amount * rate;
  }
  return total;
}
