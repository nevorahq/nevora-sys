import { z } from "zod";
import { TASK_SORTS, DEFAULT_TASK_SORT, type TaskSort } from "../constants/task-sort.constants";

/**
 * Validates a sort value from any untrusted source (URL search params, server
 * action input, API route). Unknown/empty values fall back to smart_default —
 * we never pass a raw string into the query layer.
 */
export const taskSortSchema = z.enum(TASK_SORTS).catch(DEFAULT_TASK_SORT).default(DEFAULT_TASK_SORT);

/** Parse an unknown value (e.g. searchParams.sort) into a safe TaskSort. */
export function parseTaskSort(value: unknown): TaskSort {
  return taskSortSchema.parse(value);
}
