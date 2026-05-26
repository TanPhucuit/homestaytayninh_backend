create type "UserRole" as enum ('CUSTOMER', 'OWNER', 'OWNER_STAFF', 'STAFF', 'ADMIN');
create type "BookingStatus" as enum ('PENDING', 'CONFIRMED', 'IN_STAY', 'COMPLETED', 'CANCELLED');
create type "ServiceOrderStatus" as enum ('PREPARING', 'SERVED');
create type "PaymentStatus" as enum ('INITIATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED');
create type "ArticleStatus" as enum ('DRAFT', 'PUBLISHED');
create type "ViolationReportStatus" as enum ('OPEN', 'RESOLVED');

create table public.user_profiles (
  id text primary key,
  "authId" uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null unique,
  phone text,
  role "UserRole" not null default 'CUSTOMER',
  banned boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.homestays (
  id text primary key,
  "ownerId" text not null references public.user_profiles(id),
  name text not null,
  type text not null,
  location text not null,
  description text not null,
  "priceFrom" integer not null check ("priceFrom" >= 0),
  capacity integer not null check (capacity > 0),
  rating double precision not null default 0 check (rating between 0 and 5),
  "imageUrl" text not null,
  latitude double precision,
  longitude double precision,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.owner_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  "homestayId" text not null references public.homestays(id) on delete cascade,
  "staffId" text not null references public.user_profiles(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  unique ("homestayId", "staffId")
);

create table public.rooms (
  id text primary key,
  "homestayId" text not null references public.homestays(id) on delete cascade,
  name text not null,
  "roomType" text not null,
  "pricePerNight" integer not null check ("pricePerNight" >= 0),
  capacity integer not null check (capacity > 0),
  "totalUnits" integer not null default 1 check ("totalUnits" > 0),
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.room_rates (
  id uuid primary key default gen_random_uuid(),
  "roomId" text not null references public.rooms(id) on delete cascade,
  "startDate" date not null,
  "endDate" date not null,
  "pricePerNight" integer not null check ("pricePerNight" >= 0),
  "createdAt" timestamptz not null default now(),
  check ("endDate" >= "startDate")
);

create table public.homestay_images (
  id uuid primary key default gen_random_uuid(),
  "homestayId" text not null references public.homestays(id) on delete cascade,
  url text not null,
  alt text not null default '',
  position integer not null default 0,
  "createdAt" timestamptz not null default now()
);

create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  "homestayId" text not null references public.homestays(id) on delete cascade,
  name text not null,
  unique ("homestayId", name)
);

create table public.services (
  id text primary key,
  "homestayId" text not null references public.homestays(id) on delete cascade,
  name text not null,
  description text,
  "unitPrice" integer not null check ("unitPrice" >= 0),
  included boolean not null default false,
  active boolean not null default true,
  "createdAt" timestamptz not null default now()
);

create table public.bookings (
  id text primary key,
  "customerId" text not null references public.user_profiles(id),
  "homestayId" text not null references public.homestays(id),
  "roomId" text not null references public.rooms(id),
  "guestName" text not null,
  "guestPhone" text not null,
  "guestCount" integer not null check ("guestCount" > 0),
  "checkIn" date not null,
  "checkOut" date not null,
  status "BookingStatus" not null default 'PENDING',
  "roomTotal" integer not null check ("roomTotal" >= 0),
  "serviceTotal" integer not null default 0 check ("serviceTotal" >= 0),
  "taxTotal" integer not null default 0 check ("taxTotal" >= 0),
  "grandTotal" integer not null check ("grandTotal" >= 0),
  "proxyCreatedBy" text references public.user_profiles(id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  check ("checkOut" > "checkIn")
);

create table public.booking_services (
  id text primary key,
  "bookingId" text not null references public.bookings(id) on delete cascade,
  "serviceId" text not null references public.services(id),
  name text not null,
  quantity integer not null check (quantity > 0),
  "unitPrice" integer not null check ("unitPrice" >= 0),
  total integer not null check (total >= 0),
  status "ServiceOrderStatus" not null default 'PREPARING',
  "createdAt" timestamptz not null default now()
);

create table public.payments (
  id text primary key,
  "bookingId" text not null unique references public.bookings(id) on delete cascade,
  provider text not null,
  "providerRef" text,
  status "PaymentStatus" not null default 'INITIATED',
  amount integer not null check (amount >= 0),
  "checkoutUrl" text,
  "rawPayload" jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.articles (
  id text primary key,
  "authorId" text not null references public.user_profiles(id),
  title text not null,
  slug text not null unique,
  excerpt text not null,
  content text not null,
  status "ArticleStatus" not null default 'DRAFT',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.reviews (
  id text primary key,
  "userId" text not null references public.user_profiles(id),
  "homestayId" text not null references public.homestays(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  "createdAt" timestamptz not null default now()
);

create table public.violation_reports (
  id text primary key,
  "reporterId" text not null references public.user_profiles(id),
  "reportedUserId" text not null references public.user_profiles(id),
  reason text not null,
  status "ViolationReportStatus" not null default 'OPEN',
  "createdAt" timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  "actorId" text references public.user_profiles(id),
  action text not null,
  entity text not null,
  "entityId" text not null,
  metadata jsonb,
  "createdAt" timestamptz not null default now()
);

create index user_profiles_role_idx on public.user_profiles (role);
create index homestays_owner_idx on public.homestays ("ownerId");
create index homestays_search_idx on public.homestays (type, "priceFrom", capacity);
create index owner_staff_assignments_staff_idx on public.owner_staff_assignments ("staffId");
create index rooms_homestay_idx on public.rooms ("homestayId");
create index room_rates_room_dates_idx on public.room_rates ("roomId", "startDate", "endDate");
create index homestay_images_homestay_position_idx on public.homestay_images ("homestayId", position);
create index services_homestay_idx on public.services ("homestayId");
create index bookings_customer_idx on public.bookings ("customerId");
create index bookings_homestay_status_idx on public.bookings ("homestayId", status);
create index bookings_room_idx on public.bookings ("roomId");
create index bookings_dates_idx on public.bookings ("checkIn", "checkOut");
create index booking_services_booking_idx on public.booking_services ("bookingId");
create index booking_services_service_idx on public.booking_services ("serviceId");
create index payments_status_idx on public.payments (status);
create index articles_status_idx on public.articles (status);
create index articles_author_idx on public.articles ("authorId");
create index reviews_homestay_idx on public.reviews ("homestayId");
create index reviews_user_idx on public.reviews ("userId");
create index violation_reports_status_idx on public.violation_reports (status);
create index violation_reports_reporter_idx on public.violation_reports ("reporterId");
create index violation_reports_reported_user_idx on public.violation_reports ("reportedUserId");
create index audit_logs_entity_idx on public.audit_logs (entity, "entityId");
create index audit_logs_actor_idx on public.audit_logs ("actorId");

alter table public.user_profiles enable row level security;
alter table public.homestays enable row level security;
alter table public.owner_staff_assignments enable row level security;
alter table public.rooms enable row level security;
alter table public.room_rates enable row level security;
alter table public.homestay_images enable row level security;
alter table public.amenities enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_services enable row level security;
alter table public.payments enable row level security;
alter table public.articles enable row level security;
alter table public.reviews enable row level security;
alter table public.violation_reports enable row level security;
alter table public.audit_logs enable row level security;

create policy "public read homestays"
on public.homestays for select to anon, authenticated using (true);
create policy "public read active rooms"
on public.rooms for select to anon, authenticated using (active = true);
create policy "public read active services"
on public.services for select to anon, authenticated using (active = true);
create policy "public read amenities"
on public.amenities for select to anon, authenticated using (true);
create policy "public read homestay images"
on public.homestay_images for select to anon, authenticated using (true);
create policy "public read room rates"
on public.room_rates for select to anon, authenticated using (true);
create policy "public read reviews"
on public.reviews for select to anon, authenticated using (true);
create policy "public read published articles"
on public.articles for select to anon, authenticated using (status = 'PUBLISHED');

create policy "users read own profile"
on public.user_profiles for select to authenticated
using ("authId" = (select auth.uid()));
create policy "customers read own bookings"
on public.bookings for select to authenticated
using ("customerId" in (select id from public.user_profiles where "authId" = (select auth.uid())));
create policy "customers read own booking services"
on public.booking_services for select to authenticated
using ("bookingId" in (select id from public.bookings where "customerId" in (select id from public.user_profiles where "authId" = (select auth.uid()))));
create policy "customers read own payments"
on public.payments for select to authenticated
using ("bookingId" in (select id from public.bookings where "customerId" in (select id from public.user_profiles where "authId" = (select auth.uid()))));
