-- Siklamen Akış — Supabase şeması
-- Sitenin PAYLAŞILAN Supabase projesinde çalışır (her oyun için ayrı proje yok); tablo adı bu yüzden "snake_" önekli.
-- Supabase panelinde: SQL Editor → New query → bu dosyanın tamamını yapıştırıp bir kez çalıştır.

-- ============================================================
-- Skor tablosu (herkese açık, ilk 10 gösterilir)
-- ============================================================
create table if not exists public.snake_scores (
  id         bigint generated always as identity primary key,
  name       text not null,
  score      integer not null,
  level      smallint not null default 0,       -- skorun kaydedildiği bölüm (0'dan)
  finished   boolean not null default false,    -- tüm bölümler bitirildi mi
  created_at timestamptz not null default now(),
  constraint snake_scores_name_len check (char_length(name) between 1 and 14),
  constraint snake_scores_score_range check (score >= 0 and score < 100000000),
  constraint snake_scores_level_range check (level between 0 and 63)
);

create index if not exists snake_scores_score_idx on public.snake_scores (score desc, id);

alter table public.snake_scores enable row level security;

drop policy if exists "snake_scores_select_all" on public.snake_scores;
create policy "snake_scores_select_all" on public.snake_scores
  for select using (true);

-- Herkes YENİ skor ekleyebilir; güncelleme/silme politikası yok (= varsayılan red).
-- Sunucu tarafında skor doğrulaması yok: yerel skor tablosuyla aynı güven seviyesi.
drop policy if exists "snake_scores_insert_anyone" on public.snake_scores;
create policy "snake_scores_insert_anyone" on public.snake_scores
  for insert with check (
    char_length(name) between 1 and 14
    and score >= 0
    and score < 100000000
    and level between 0 and 63
  );

-- ============================================================
-- Çok oyunculu: tablo YOK
-- ============================================================
-- Odalar yalnızca Realtime kanallarında ("snake:room:<KOD>") Presence + Broadcast ile yürür, hiçbir şey saklanmaz.
-- Realtime Supabase projelerinde varsayılan olarak açıktır.
