import { z } from "zod";
import {
  CATEGORY_TYPES,
  CATEGORY_NAME_MAX,
} from "../constants/moneyflow.constants";

/**
 * Zod-схема для MoneyCategory.
 *
 * color и icon — опциональны. Пользователь может не выбирать
 * цвет/иконку при создании категории. UI покажет дефолтные.
 */
export function getCategorySchemas(errors: {
  nameRequired: string;
  invalidType: string;
}) {
  const createCategorySchema = z.object({
    name: z
      .string()
      .min(1, errors.nameRequired)
      .max(CATEGORY_NAME_MAX),
    type: z.enum(CATEGORY_TYPES, {
      error: errors.invalidType,
    }),
    color: z
      .string()
      .nullable()
      .default(null),
    icon: z
      .string()
      .nullable()
      .default(null),
  });

  return { createCategorySchema };
}

type Schemas = ReturnType<typeof getCategorySchemas>;
export type CreateCategoryData = z.infer<Schemas["createCategorySchema"]>;
