import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "./store";

/**
 * Типизированные хуки для Redux.
 *
 * Зачем: стандартные useSelector и useDispatch из react-redux
 * не знают типы нашего store. Каждый раз нужно писать:
 *
 *   const filter = useSelector((state: RootState) => state.todoUi.filter);
 *   const dispatch = useDispatch<AppDispatch>();
 *
 * С типизированными хуками:
 *
 *   const filter = useAppSelector((state) => state.todoUi.filter);
 *   const dispatch = useAppDispatch();
 *
 * TypeScript автоматически знает:
 * - state имеет поле todoUi с filter, searchQuery, selectedTodoId
 * - dispatch принимает actions из наших slices
 *
 * Это рекомендация официальной документации Redux Toolkit.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
