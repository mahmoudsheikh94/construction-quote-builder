create table line_item_tags (
  id uuid primary key default gen_random_uuid(),
  trade text not null,
  raw_text text not null,
  tags jsonb not null,
  signature text not null,
  cost_model_id text,
  created_at timestamptz not null default now()
);
create index line_item_tags_sig on line_item_tags(trade, signature);

-- match_corpus: the deterministic fast-path. One row per (trade, signature) that has
-- resolved to a cost model, with a hit counter so frequent matches are trusted.
create table match_corpus (
  id uuid primary key default gen_random_uuid(),
  trade text not null,
  signature text not null,
  cost_model_id text not null,
  hit_count integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (trade, signature)
);

alter table line_item_tags enable row level security;
alter table match_corpus enable row level security;
grant all on line_item_tags, match_corpus to postgres, anon, authenticated, service_role;
