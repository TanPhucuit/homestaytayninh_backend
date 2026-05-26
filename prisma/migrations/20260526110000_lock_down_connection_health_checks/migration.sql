drop policy if exists "connection_health_checks_insert_public" on public.connection_health_checks;
revoke insert on public.connection_health_checks from anon, authenticated;
