/**
 * Booking domain event registry.
 *
 * Документирует все события модуля booking.
 * Типы payloads определены в lib/events/domain-event.types.ts.
 *
 * P0 события (обязательны):
 *   booking.requested                  — клиент отправил запрос
 *   crm.lead.created_from_booking      — CRM лид создан из booking request
 *   booking.request.linked_to_crm_lead — booking_request.lead_id заполнен
 *
 * Опциональные события:
 *   booking.request.accepted           — менеджер принял запрос
 *   booking.request.rejected           — менеджер отклонил запрос
 *   booking.request.canceled           — запрос отменён
 *   booking.host_profile.created       — создан профиль хоста
 *   booking.host_profile.updated       — профиль хоста обновлён
 *   booking.service.created            — создана услуга
 *   booking.availability.updated       — обновлено расписание
 *
 * Все P0 события создаются внутри create_booking_request_public() RPC.
 * Остальные — через emitDomainEvent() в Server Actions.
 */
export const BOOKING_EVENTS = {
  REQUESTED:                  "booking.requested",
  REQUEST_ACCEPTED:           "booking.request.accepted",
  REQUEST_REJECTED:           "booking.request.rejected",
  REQUEST_CANCELED:           "booking.request.canceled",
  HOST_PROFILE_CREATED:       "booking.host_profile.created",
  HOST_PROFILE_UPDATED:       "booking.host_profile.updated",
  SERVICE_CREATED:            "booking.service.created",
  AVAILABILITY_UPDATED:       "booking.availability.updated",
  CRM_LEAD_CREATED:           "crm.lead.created_from_booking",
  REQUEST_LINKED_TO_CRM_LEAD: "booking.request.linked_to_crm_lead",
} as const;
