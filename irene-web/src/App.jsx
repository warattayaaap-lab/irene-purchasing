import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'

const STATUS_ORDER = ['ใหม่', 'กำลังขอราคา', 'สั่งแล้ว', 'ยกเลิก']
const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return `${dt.getDate()} ${m[dt.getMonth()]} ${(dt.getFullYear() + 543) % 100}`
}

function daysSince(d) {
  if (!d) return 0
  const dt = new Date(d)
  if (isNaN(dt)) return 0
  return Math.floor((Date.now() - dt.getTime()) / 86400000)
}

export default function App() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState({ 'สั่งแล้ว': true, 'ยกเลิก': true })

  useEffect(() => { loadJobs() }, [])

  async function loadJobs() {
    setLoading(true)
    setError('')
    // ดึงแค่คอลัมน์ที่ใช้บนการ์ด + นับจำนวนรายการ — เร็วกว่าดึงทุกอย่าง
    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_no, job_date, requester, project, purpose, status, chosen_shop, eta, total, job_items(count)')
      .order('job_no', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setJobs(data || [])
    setLoading(false)
  }

  const kw = q.trim().toLowerCase()
  const filtered = jobs.filter(j => {
    if (filter && j.status !== filter) return false
    if (!kw) return true
    const hay = `${j.job_no} ${j.requester} ${j.project} ${j.purpose || ''} ${j.chosen_shop || ''}`.toLowerCase()
    return hay.indexOf(kw) !== -1
  })

  const groups = {}
  filtered.forEach(j => {
    const st = j.status || 'ใหม่'
    ;(groups[st] = groups[st] || []).push(j)
  })

  const forceOpen = !!(kw || filter)

  return (
    <div className="wrap">
      <div className="top">
        <h1>ระบบจัดซื้อ</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={loadJobs}>รีเฟรช</button>
          <button className="btn">+ งานใหม่</button>
        </div>
      </div>

      <div className="toolbar">
        <input placeholder="ค้นหา ผู้ขอ / ของ / โปรเจกต์…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="toolbar">
        <span className={'chip' + (filter === '' ? ' on' : '')} onClick={() => setFilter('')}>ทั้งหมด</span>
        {STATUS_ORDER.map(s => (
          <span key={s} className={'chip' + (filter === s ? ' on' : '')} onClick={() => setFilter(s)}>{s}</span>
        ))}
      </div>

      {loading && <p className="loading">กำลังโหลดงาน…</p>}
      {error && <p className="empty" style={{ color: 'var(--danger)' }}>โหลดไม่สำเร็จ: {error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="empty">ไม่พบงานที่ค้นหา</p>
      )}

      {!loading && !error && STATUS_ORDER.map(st => {
        const arr = groups[st]
        if (!arr || !arr.length) return null
        const isCollapsed = !forceOpen && collapsed[st]
        return (
          <div key={st}>
            <div className="grp-head" onClick={() => setCollapsed(c => ({ ...c, [st]: !c[st] }))}>
              <span className="caret">{isCollapsed ? '▸' : '▾'}</span>
              <span className={'status s-' + st}>{st}</span>
              <span className="cnt">{arr.length} งาน</span>
            </div>
            {!isCollapsed && arr.map(j => {
              const stale = (j.status === 'ใหม่' || j.status === 'กำลังขอราคา') && daysSince(j.job_date) >= 2
              const itemCount = j.job_items?.[0]?.count ?? 0
              return (
                <div key={j.id} className="card">
                  <div className="l">
                    <b>{j.requester || '(ไม่ระบุผู้ขอ)'}</b>
                    {stale && <span className="stale"> ⚠ ค้าง {daysSince(j.job_date)} วัน</span>}
                    {j.project && ' · ' + j.project}
                    {j.purpose && ' — ' + j.purpose}
                    <small>
                      {j.job_no} · {fmtDate(j.job_date)} · {itemCount} รายการ
                      {j.eta && ' · ของถึง ' + fmtDate(j.eta)}
                      {j.chosen_shop && ' · ' + j.chosen_shop}
                    </small>
                  </div>
                  <div className="r">
                    {j.total > 0 && <div className="amt">{fmt(j.total)} ฿</div>}
                    <span className={'status s-' + j.status}>{j.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {!loading && !error && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 20 }}>
          ทั้งหมด {jobs.length} งาน · เชื่อม Supabase สำเร็จ ✓
        </p>
      )}
    </div>
  )
}
