-- Supabase RLS baseline. Run only after confirming the Data API exposure model.
alter table public.user_profiles enable row level security;
alter table public.homestays enable row level security;
alter table public.rooms enable row level security;
alter table public.amenities enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_services enable row level security;
alter table public.payments enable row level security;
alter table public.articles enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_logs enable row level security;

create policy "public can read published inventory"
on public.homestays for select
to anon, authenticated
using (true);

create policy "public can read rooms"
on public.rooms for select
to anon, authenticated
using (active = true);

create policy "public can read active services"
on public.services for select
to anon, authenticated
using (active = true);

create policy "users can read own profile"
on public.user_profiles for select
to authenticated
using ((select auth.uid())::text = auth_id);

create policy "customers can read own bookings"
on public.bookings for select
to authenticated
using (customer_id in (select id from public.user_profiles where auth_id = (select auth.uid())::text));
