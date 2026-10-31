/* =========================================================================
   SUPABASE: tek istemci; skor tablosu (snake_scores) ve çok oyunculu odalar (snake:room:KOD) bunu paylaşır.
   Sitedeki bütün oyunlar aynı Supabase projesindedir; çakışmasın diye bu oyunun tablo ve kanal adları "snake" önekli.
   Adres ve anahtar derlemede VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ile verilir (yerelde .env.local).
   Anahtar "publishable" (anon) anahtardır, tarayıcıda durması güvenli; yetki supabase/schema.sql'deki RLS kurallarında.
   Değerler yoksa istemci kurulmaz (null): skorlar bu cihazda kalır, çok oyunculu düğmesi gizlenir.
   ========================================================================= */
import { createClient } from '@supabase/supabase-js';

const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_OK = !!(URL_ && KEY_);
export const supabase = SUPABASE_OK ? createClient(URL_, KEY_, { realtime: { params: { eventsPerSecond: 20 } } }) : null;
if (!SUPABASE_OK && import.meta.env.DEV) console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY yok: skor tablosu yerel, çok oyunculu kapalı.');
