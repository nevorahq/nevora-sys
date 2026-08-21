/** Compatibility facade for the extracted Tasks contract package. */
export {
  createFinancialTaskSchema,
  createFinancialTaskFromDocumentSchema,
  markFinancialTaskPaidSchema,
  skipFinancialTaskSchema,
  dismissFinancialTaskSchema,
  changeFinancialDueDateSchema,
  setFinancialTaskAmountSchema,
} from "@nevora/tasks-contracts";
export type {
  CreateFinancialTaskInput,
  CreateFinancialTaskFromDocumentInput,
  MarkFinancialTaskPaidInput,
  SkipFinancialTaskInput,
  DismissFinancialTaskInput,
  ChangeFinancialDueDateInput,
  SetFinancialTaskAmountInput,
} from "@nevora/tasks-contracts";
