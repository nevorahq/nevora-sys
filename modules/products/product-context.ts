import { PRODUCT_IDS, ROUTES, type ProductId } from "@/shared/config/routes";

type ProductContextPath = typeof ROUTES.settings | typeof ROUTES.documents;

/**
 * Non-sensitive UI preference used only to keep a product-scoped sidebar stable
 * while the user visits shared Settings or Documents surfaces.
 */
export const PRODUCT_CONTEXT_COOKIE = "nevora_product_context";

export function parseProductContext(value: string | null | undefined): ProductId | undefined {
  return PRODUCT_IDS.find((product) => product === value);
}

export function productContextCookie(
  product: ProductId | undefined,
  path: ProductContextPath = ROUTES.settings,
): string {
  return product
    ? `${PRODUCT_CONTEXT_COOKIE}=${product}; Path=${path}; Max-Age=2592000; SameSite=Lax`
    : `${PRODUCT_CONTEXT_COOKIE}=; Path=${path}; Max-Age=0; SameSite=Lax`;
}
