-- Migration 022: Allow booking service deletion
--
-- Problem: booking_requests.booking_service_id has ON DELETE RESTRICT,
-- which prevents deleting a booking_service that has associated requests.
--
-- Fix: change to ON DELETE CASCADE — deleting a service also removes its
-- associated booking requests. The column is NOT NULL so SET NULL is not
-- an option without also altering the column.

ALTER TABLE public.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_booking_service_id_fkey;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_booking_service_id_fkey
    FOREIGN KEY (booking_service_id)
    REFERENCES public.booking_services(id)
    ON DELETE CASCADE;
