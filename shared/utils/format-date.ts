/**
 * Форматирует дату в человекочитаемый вид.
 *
 * Почему не moment.js или date-fns на старте:
 * Intl.DateTimeFormat — встроен в браузер, 0 KB бандла.
 * Подключим библиотеку, только если нужна сложная логика (relative time и т.д.)
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

/**
 * Форматирует время (часы:минуты) — для отметки «когда проведено».
 * Берётся из created_at (timestamp), т.к. transaction_date — это DATE без времени.
 */
export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
