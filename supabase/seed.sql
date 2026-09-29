-- Local development only (runs on `supabase db reset`; not pushed to the hosted project).
insert into public.allowed_users (email, mrcs) values
  ('admin@example.test', 'all'),
  ('bala@example.test', '38'),
  ('lango@example.test', 'Aboke, Bala, Otwal, Akokoro, Aduku, Apwori');

update public.mrc set target_hh = 60 where active;
