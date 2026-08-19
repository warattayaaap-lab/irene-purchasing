import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import { deleteJob, notifyLine } from './lib.js'
import * as XLSX from 'xlsx'

const STATUS_ORDER = ['ใหม่', 'กำลังขอราคา', 'สั่งแล้ว', 'ยกเลิก']
const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d); if (isNaN(dt)) return d
  const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return `${dt.getDate()} ${m[dt.getMonth()]} ${(dt.getFullYear() + 543) % 100}`
}
function daysSince(d) {
  if (!d) return 0
  const dt = new Date(d); if (isNaN(dt)) return 0
  return Math.floor((Date.now() - dt.getTime()) / 86400000)
}

export default function JobList({ onOpen, onPrice, onMonth }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState({ 'สั่งแล้ว': true, 'ยกเลิก': true })
  const [byReq, setByReq] = useState('')
  const [backing, setBacking] = useState(false)

  useEffect(() => { loadJobs() }, [])

  async function loadJobs() {
    setLoading(true); setError('')
    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_no, job_date, requester, project, purpose, status, chosen_shop, eta, total, job_items(count)')
      .order('job_no', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setJobs(data || []); setLoading(false)
  }

  async function handleBackup() {
    setBacking(true)
    try {
      const [jobsR, itemsR, histR, vendR] = await Promise.all([
        supabase.from('jobs').select('*').order('job_no'),
        supabase.from('job_items').select('*'),
        supabase.from('price_history').select('*'),
        supabase.from('vendors').select('*'),
      ])
      const wb = XLSX.utils.book_new()
      const clean = (rows) => (rows||[]).map(r => {
        const o = {}
        for (const k in r) o[k] = (typeof r[k]==='object' && r[k]!==null) ? JSON.stringify(r[k]) : r[k]
        return o
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clean(jobsR.data)), 'งาน')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clean(itemsR.data)), 'รายการของ')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clean(histR.data)), 'ประวัติราคา')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clean(vendR.data)), 'ผู้ขาย')
      const d = new Date()
      const stamp = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
      XLSX.writeFile(wb, 'backup-irene-' + stamp + '.xlsx')
    } catch (e) {
      alert('สำรองไม่สำเร็จ: ' + e.message)
    }
    setBacking(false)
  }

  async function quickStatus(e, job, newStatus) {
    e.stopPropagation()
    if (newStatus === job.status) return
    // อัปเดตหน้าจอทันที (optimistic)
    setJobs(arr => arr.map(x => x.id === job.id ? { ...x, status: newStatus } : x))
    try {
      await supabase.from('jobs').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', job.id)
      // ยิงไลน์ถ้าเปลี่ยนเป็นสั่งแล้ว/ยกเลิก
      if (newStatus === 'สั่งแล้ว' || newStatus === 'ยกเลิก') {
        const { data: full } = await supabase.from('jobs').select('*').eq('id', job.id).single()
        const { data: its } = await supabase.from('job_items').select('*').eq('job_id', job.id).order('sort_order')
        const r = await notifyLine('order', full, its || [])
        if (r && r.ok) {
          // แจ้งเบา ๆ ว่าเด้งไลน์แล้ว (ไม่ค้างจอ)
        }
      }
    } catch (err) {
      alert('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message)
      loadJobs()  // โหลดใหม่ถ้าพลาด
    }
  }

  async function handleDelete(e, job) {
    e.stopPropagation()  // กันเปิดงานตอนกดลบ
    if (!confirm('ลบงาน ' + job.job_no + (job.requester ? ' (' + job.requester + ')' : '') + ' ถาวร?\nเอาคืนไม่ได้')) return
    try {
      await deleteJob(job.id)
      setJobs(arr => arr.filter(x => x.id !== job.id))
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
    }
  }

  const requesters = [...new Set(jobs.map(j => (j.requester||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'))
  const kw = q.trim().toLowerCase()
  const filtered = jobs.filter(j => {
    if (filter && j.status !== filter) return false
    if (byReq && (j.requester || '') !== byReq) return false
    if (!kw) return true
    return `${j.job_no} ${j.requester} ${j.project} ${j.purpose || ''} ${j.chosen_shop || ''}`.toLowerCase().indexOf(kw) !== -1
  })
  const groups = {}
  filtered.forEach(j => { const st = j.status || 'ใหม่'; (groups[st] = groups[st] || []).push(j) })
  const forceOpen = !!(kw || filter)

  return (
    <div className="wrap">
      <div className="top">
        <h1>ระบบจัดซื้อ</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={onPrice}>🔍 ค้นราคา</button>
          <button className="btn ghost" onClick={onMonth}>📊 สรุปรายเดือน</button>
          <button className="btn ghost" onClick={handleBackup} disabled={backing}>{backing?'กำลังสำรอง…':'💾 สำรองข้อมูล'}</button>
          <button className="btn" onClick={() => onOpen('new')}>+ งานใหม่</button>
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
      {requesters.length > 0 && (
        <div className="toolbar">
          <span className="cnt" style={{alignSelf:'center'}}>ผู้ขอ:</span>
          <span className={'chip' + (byReq === '' ? ' on' : '')} onClick={() => setByReq('')}>ทุกคน</span>
          {requesters.map(r => (
            <span key={r} className={'chip' + (byReq === r ? ' on' : '')} onClick={() => setByReq(byReq === r ? '' : r)}>{r}</span>
          ))}
        </div>
      )}

      {loading && <p className="loading">กำลังโหลดงาน…</p>}
      {error && <p className="empty" style={{ color: 'var(--danger)' }}>โหลดไม่สำเร็จ: {error}</p>}
      {!loading && !error && filtered.length === 0 && <p className="empty">ไม่พบงานที่ค้นหา</p>}

      {!loading && !error && STATUS_ORDER.map(st => {
        const arr = groups[st]; if (!arr || !arr.length) return null
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
                <div key={j.id} className="card" onClick={() => onOpen(j.id)}>
                  <div className="l">
                    <b>{j.requester || '(ไม่ระบุผู้ขอ)'}</b>
                    {stale && <span className="stale"> ⚠ ค้าง {daysSince(j.job_date)} วัน</span>}
                    {j.project && ' · ' + j.project}
                    {j.purpose && ' — ' + j.purpose}
                    <small>{j.job_no} · {fmtDate(j.job_date)} · {itemCount} รายการ
                      {j.eta && ' · ของถึง ' + fmtDate(j.eta)}
                      {j.chosen_shop && ' · ' + j.chosen_shop}</small>
                  </div>
                  <div className="r">
                    {j.total > 0 && <div className="amt">{fmt(j.total)} ฿</div>}
                    <select className={'status-sel s-' + j.status} value={j.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => quickStatus(e, j, e.target.value)}>
                      {STATUS_ORDER.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                    <button className="card-del" onClick={(e) => handleDelete(e, j)} title="ลบงาน">🗑</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      {!loading && !error && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 20 }}>
          ทั้งหมด {jobs.length} งาน
        </p>
      )}
    </div>
  )
}
