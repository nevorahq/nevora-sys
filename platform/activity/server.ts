import "server-only";

/**
 * Stable platform port for publishing product lifecycle changes to the shared
 * activity/attention surface. Product modules should not import Action Center
 * internals directly.
 */
export { recordTaskDeletionInActionCenter as recordTaskDeletionActivity } from "@/modules/action-center/services/record-task-deletion";
