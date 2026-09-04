import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase.js'

export const STATUSES = ['ใหม่', 'กำลังขอราคา', 'สั่งแล้ว', 'ยกเลิก']
export const ETA_TIMES = ['', 'ช่วงเช้า', 'ช่วงบ่าย', 'ช่วงเย็น (ไม่เกิน 17.00)', 'รอร่วมเที่ยว', 'เข้าไปรับได้เลย']

export const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

export function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d); if (isNaN(dt)) return d
  const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return `${dt.getDate()} ${m[dt.getMonth()]} ${(dt.getFullYear() + 543) % 100}`
}
export function fmtDateLong(d) {
  if (!d) return ''
  const dt = new Date(d); if (isNaN(dt)) return d
  const m = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
  return `${dt.getDate()} ${m[dt.getMonth()]} ${dt.getFullYear() + 543}`
}
export function daysSince(d) {
  if (!d) return 0
  const dt = new Date(d); if (isNaN(dt)) return 0
  return Math.floor((Date.now() - dt.getTime()) / 86400000)
}

// โหลด settings เป็น object { key: value }
export async function loadSettings() {
  const { data } = await supabase.from('settings').select('key, value')
  const s = {}
  ;(data || []).forEach(r => { s[r.key] = r.value })
  return s
}

// บันทึกค่า setting (upsert รายคีย์)
export async function saveSetting(key, value) {
  const { data: existing } = await supabase.from('settings').select('key').eq('key', key).maybeSingle()
  if (existing) await supabase.from('settings').update({ value }).eq('key', key)
  else await supabase.from('settings').insert({ key, value })
}

// สร้างเลขงานใหม่ PJ-YYMM-NNN
export async function nextJobNo() {
  const { data } = await supabase.from('jobs').select('job_no').order('job_no', { ascending: false }).limit(1)
  const now = new Date()
  const ym = String((now.getFullYear() + 543) % 100).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0')
  let n = 1
  if (data && data.length) {
    const m = data[0].job_no.match(/PJ-(\d{4})-(\d+)/)
    if (m && m[1] === ym) n = parseInt(m[2]) + 1
  }
  return `PJ-${ym}-${String(n).padStart(3, '0')}`
}

// คำนวณยอดรวมของงาน
export function calcTotal(items, chosenShop) {
  let total = 0
  items.forEach(it => {
    const qty = Number(it.qty) || 0
    if (it.compare) {
      const q = chosenShop ? Number((it.quotes || {})[chosenShop] || 0) : 0
      total += qty * q
    } else {
      total += qty * (Number(it.price) || 0)
    }
  })
  return total
}

// เก็บงาน + รายการ ลง Supabase (ทั้งงานใหม่และแก้ไข)
export async function saveJob(job, items) {
  const chosen = job.chosen_shop || ''
  const total = calcTotal(items, chosen)
  const jobData = {
    job_no: job.job_no, job_date: job.job_date || null, requester: job.requester || '',
    requester_id: job.requester_id || '', project: job.project || '', purpose: job.purpose || '',
    note: job.note || '', status: job.status || 'ใหม่', po_no: job.po_no || '', chosen_shop: chosen,
    eta: job.eta || null, eta_time: job.eta_time || '', delivery: job.delivery || '',
    order_by: job.order_by || '', need_by: job.need_by || null, total,
    images: job.images || [], shop_eta: job.shop_eta || {}, no_po_shops: job.no_po_shops || [], shop_delivery: job.shop_delivery || {}, unpaid: !!job.unpaid, unpaid_reason: job.unpaid_reason || '', updated_at: new Date().toISOString(),
  }

  let jobId = job.id
  if (jobId) {
    const { error } = await supabase.from('jobs').update(jobData).eq('id', jobId)
    if (error) throw error
    await supabase.from('job_items').delete().eq('job_id', jobId)
  } else {
    const { data, error } = await supabase.from('jobs').insert(jobData).select('id').single()
    if (error) throw error
    jobId = data.id
  }

  // เขียนรายการใหม่
  const rows = items.filter(it => String(it.name || '').trim()).map((it, i) => ({
    job_id: jobId, name: it.name, qty: Number(it.qty) || 0, unit: it.unit || '',
    compare: !!it.compare, shop: it.shop || '', price: Number(it.price) || 0,
    quotes: it.quotes || {}, sort_order: i, ship_date: it.ship_date || null, self_buy: !!it.self_buy,
  }))
  if (rows.length) {
    const { error } = await supabase.from('job_items').insert(rows)
    if (error) throw error
  }

  // บันทึกประวัติราคาเมื่อสั่งแล้ว
  if (job.status === 'สั่งแล้ว') {
    await logPriceHistory(job, items, chosen)
  }
  return jobId
}

async function logPriceHistory(job, items, chosen) {
  const rows = []
  items.forEach(it => {
    if (!String(it.name || '').trim()) return
    let price = null, shop = ''
    if (it.compare && chosen) { shop = chosen; price = (it.quotes || {})[chosen] }
    else if (!it.compare) { shop = it.shop || ''; price = it.price }
    if (price === null || price === undefined || price === '') return
    rows.push({
      hist_date: job.job_date || new Date().toISOString().slice(0, 10),
      job_no: job.job_no, item_name: it.name, qty: Number(it.qty) || 0,
      unit: it.unit || '', shop, unit_price: Number(price) || 0,
    })
  })
  if (rows.length) await supabase.from('price_history').insert(rows)
}

export async function deleteJob(jobId) {
  const { error } = await supabase.from('jobs').delete().eq('id', jobId)
  if (error) throw error
}

// จำร้านประจำ + ราคาล่าสุดของแต่ละของ (ช่วยกรอก)
export async function suggestForItem(name) {
  if (!name || name.length < 2) return []
  const { data } = await supabase.from('price_history')
    .select('shop, unit_price, hist_date').ilike('item_name', `%${name}%`)
    .order('hist_date', { ascending: false }).limit(20)
  const seen = {}, out = []
  ;(data || []).forEach(r => {
    if (!seen[r.shop]) { seen[r.shop] = true; out.push({ shop: r.shop, price: r.unit_price, date: r.hist_date }) }
  })
  return out.slice(0, 5)
}

// เรียก Edge Function ยิงแจ้งเตือน LINE
// type: 'new' = คำขอใหม่ / 'order' = สั่งแล้ว/ยกเลิก
export async function notifyLine(type, job, items) {
  try {
    const url = SUPABASE_URL + '/functions/v1/notify-line'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
      body: JSON.stringify({ type, job, items }),
    })
    return await res.json()
  } catch (e) {
    console.error('notifyLine error', e)
    return { ok: false, error: String(e) }
  }
}

// โหลดข้อมูลร้าน (vendor) จากชื่อสั้น
export async function loadVendor(shortName) {
  if (!shortName) return null
  const { data } = await supabase.from('vendors').select('*').eq('short_name', shortName).maybeSingle()
  return data
}

// บันทึก/อัปเดตข้อมูลร้าน (จำไว้ใช้ครั้งหน้า)
export async function saveVendor(v) {
  if (!v.short_name) return
  const { data: existing } = await supabase.from('vendors').select('id').eq('short_name', v.short_name).maybeSingle()
  const payload = {
    short_name: v.short_name, full_name: v.full_name || '', branch: v.branch || '',
    address: v.address || '', tax_id: v.tax_id || '',
  }
  if (existing) await supabase.from('vendors').update(payload).eq('id', existing.id)
  else await supabase.from('vendors').insert(payload)
}

// โหลดรายชื่อผู้ที่เคยส่งฟอร์ม (มี requester_id) สำหรับเลือก tag ในไลน์
export async function loadRequesters() {
  const { data } = await supabase
    .from('jobs')
    .select('requester, requester_id, job_no')
    .not('requester_id', 'is', null)
    .neq('requester_id', '')
    .order('job_no', { ascending: true })  // เก่า→ใหม่ เพื่อให้ id ล่าสุดทับ
  if (!data) return []
  // รวมตาม "ชื่อ" (ไม่ใช่ id) กันชื่อซ้ำ — เก็บ id ล่าสุดของแต่ละชื่อ
  const map = {}
  data.forEach(r => {
    const id = (r.requester_id || '').trim()
    const name = (r.requester || '').trim()
    if (!id || !name) return
    map[name] = id  // job_no เรียงเก่า→ใหม่ ดังนั้นตัวหลังสุด = id ล่าสุด
  })
  // ถ้าเจอ id ซ้ำระหว่างคนต่างชื่อ ให้คงไว้ทั้งคู่ (ใช้ชื่อเป็นตัวแยก)
  // คืน key = ชื่อ (unique) เพื่อให้ React ใช้เป็น key ได้ไม่ชนกัน
  return Object.entries(map).map(([name, id]) => ({ id, name, key: name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
}

// โหลดรายชื่อคนไปรับของ/tag จากที่ตั้งค่าไว้ในหน้าตั้งค่า (buyer_tags)
export async function loadBuyerTags() {
  const { data } = await supabase.from('settings').select('value').eq('key', 'buyer_tags').maybeSingle()
  if (!data || !data.value) return []
  try {
    const arr = JSON.parse(data.value)
    return arr.filter(t => t && t.id && t.name).map(t => ({ id: t.id, name: t.name }))
  } catch { return [] }
}
