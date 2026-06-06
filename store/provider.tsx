"use client";

import { Provider } from "react-redux";
import { store } from "./store";

/**
 * Redux Provider — делает store доступным для всех компонентов.
 *
 * "use client" — обязательно. Provider использует React Context,
 * который работает только на клиенте.
 *
 * Этот компонент оборачивает children в <Provider store={store}>.
 * После этого любой Client Component внутри может использовать
 * useAppSelector и useAppDispatch.
 *
 * Подключается в root layout (app/layout.tsx) —
 * чтобы ВСЕ страницы имели доступ к store.
 *
 * Важно: Provider — Client Component, но это НЕ значит,
 * что все children станут Client Components.
 * Server Components внутри Provider продолжают работать на сервере.
 * Только компоненты, которые ИСПОЛЬЗУЮТ хуки Redux, должны быть Client.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
