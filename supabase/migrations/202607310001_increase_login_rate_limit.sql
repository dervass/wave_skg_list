-- Increase login rate limit from 5 to 100 failed attempts per 15 minutes
create or replace function public.check_login_rate_limit(p_username text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select count(*) < 100
  from public.login_attempts
  where username = lower(p_username)
    and succeeded = false
    and attempted_at > now() - interval '15 minutes';
$$;
