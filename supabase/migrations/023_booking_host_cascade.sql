-- Migration 023: Allow booking host deletion when requests exist
--
-- booking_requests.booking_host_profile_id has ON DELETE RESTRICT which
-- prevents deleting a host that has associated booking requests.
-- Change to ON DELETE CASCADE so host deletion removes its requests too.

ALTER TABLE public.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_booking_host_profile_id_fkey;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_booking_host_profile_id_fkey
    FOREIGN KEY (booking_host_profile_id)
    REFERENCES public.booking_host_profiles(id)
    ON DELETE CASCADE;
