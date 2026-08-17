import { createClient } from '@supabase/supabase-js'

// ค่าเชื่อมต่อ Supabase — แก้ 2 บรรทัดนี้ถ้าย้ายโปรเจกต์
const SUPABASE_URL = 'https://urzwqgzclnssmbhalzqh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_1A3FX0Xg2MeI4Fs0ENDGCw_HTqTwt73'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
