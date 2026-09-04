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

export default function JobList({ onOpen, onPrice, onSettings, backupSignal }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState({ 'สั่งแล้ว': true, 'ยกเลิก': true })
  const [backing, setBacking] = useState(false)
  const [dateFilter, setDateFilter] = useState('')  // YYYY-MM-DD

  useEffect(() => { loadJobs() }, [])
  useEffect(() => { if (backupSignal) handleBackup() }, [backupSignal])

  async function loadJobs() {
    setLoading(true); setError('')
    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_no, job_date, requester, project, purpose, status, chosen_shop, eta, total, unpaid, unpaid_reason, job_items(count)')
      .order('job_no', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setJobs(data || []); setLoading(false)
  }

  function toggleAll() {
    const anyOpen = STATUS_ORDER.some(st => !collapsed[st])
    const next = {}
    STATUS_ORDER.forEach(st => { next[st] = anyOpen })  // ถ้ามีเปิดอยู่ = ยุบหมด, ถ้ายุบหมด = กางหมด
    setCollapsed(next)
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
      const CELL_MAX = 32000  // ลิมิต Excel 32767 เผื่อ margin
      const clean = (rows) => (rows||[]).map(r => {
        const o = {}
        for (const k in r) {
          let v = (typeof r[k]==='object' && r[k]!==null) ? JSON.stringify(r[k]) : r[k]
          // ตัดข้อความที่ยาวเกินลิมิต Excel (เช่น รูป base64 เก่า, quotes ใหญ่)
          if (typeof v === 'string' && v.length > CELL_MAX) {
            v = v.slice(0, CELL_MAX) + '…[ตัดเพราะยาวเกิน]'
          }
          o[k] = v
        }
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
    setJobs(arr => arr.map(x => x.id === job.id ? { ...x, status: newStatus } : x))
    try {
      await supabase.from('jobs').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', job.id)
      if (newStatus === 'สั่งแล้ว' || newStatus === 'ยกเลิก') {
        const { data: full } = await supabase.from('jobs').select('*').eq('id', job.id).single()
        const { data: its } = await supabase.from('job_items').select('*').eq('job_id', job.id).order('sort_order')
        await notifyLine('order', full, its || [])
      }
    } catch (err) {
      alert('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message)
      loadJobs()
    }
  }

  async function handleDelete(e, job) {
    e.stopPropagation()
    if (!confirm('ลบงาน ' + job.job_no + (job.requester ? ' (' + job.requester + ')' : '') + ' ถาวร?\nเอาคืนไม่ได้')) return
    try {
      await deleteJob(job.id)
      setJobs(arr => arr.filter(x => x.id !== job.id))
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
    }
  }

  const kw = q.trim().toLowerCase()
  const filtered = jobs.filter(j => {
    if (filter && j.status !== filter) return false
    if (dateFilter && (j.job_date || '').slice(0,10) !== dateFilter) return false
    if (!kw) return true
    return `${j.job_no} ${j.requester} ${j.project} ${j.purpose || ''} ${j.chosen_shop || ''}`.toLowerCase().indexOf(kw) !== -1
  })
  const groups = {}
  filtered.forEach(j => { const st = j.status || 'ใหม่'; (groups[st] = groups[st] || []).push(j) })
  const forceOpen = !!(kw || filter)
  const staleCount = jobs.filter(j => (j.status==='ใหม่'||j.status==='กำลังขอราคา') && daysSince(j.job_date) >= 2).length
  const newCount = jobs.filter(j => j.status === 'ใหม่').length
  const waitCount = jobs.filter(j => j.status === 'กำลังขอราคา').length

  return (
    <div className="wrap">
      <div className="top">
        <h1>งานจัดซื้อ</h1>
        <button className="btn" onClick={() => onOpen('new')}>+ งานใหม่</button>
      </div>

      <div className="stat-cards">
        <div className="stat-c stat-danger" onClick={()=>setFilter('')}>
          <div className="stat-c-label">ค้างนาน</div>
          <div className="stat-c-num">{staleCount}</div>
        </div>
        <div className="stat-c stat-new" onClick={()=>setFilter('ใหม่')}>
          <div className="stat-c-label">งานใหม่</div>
          <div className="stat-c-num">{newCount}</div>
        </div>
        <div className="stat-c stat-wait" onClick={()=>setFilter('กำลังขอราคา')}>
          <div className="stat-c-label">กำลังขอราคา</div>
          <div className="stat-c-num">{waitCount}</div>
        </div>
      </div>

      <input className="search" placeholder="ค้นหา ผู้ขอ / ของ / โปรเจกต์…" value={q} onChange={e => setQ(e.target.value)} />

      <div className="chips-row">
        <div className="chips">
          <span className={'chip' + (filter === '' ? ' on' : '')} onClick={() => setFilter('')}>ทั้งหมด</span>
          {STATUS_ORDER.map(s => (
            <span key={s} className={'chip' + (filter === s ? ' on' : '')} onClick={() => setFilter(s)}>{s}</span>
          ))}
        </div>
        <div className="list-tools">
          <button className="mini-btn" onClick={toggleAll}>ยุบ/กางทั้งหมด</button>
          <input type="date" className="date-filter" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} title="กรองวันที่สั่ง" />
          {dateFilter && <button className="mini-btn" onClick={()=>setDateFilter('')}>ล้างวันที่</button>}
        </div>
      </div>

      {loading && <p className="loading">กำลังโหลดงาน…</p>}
      {error && <p className="empty" style={{ color: 'var(--danger)' }}>โหลดไม่สำเร็จ: {error}</p>}
      {!loading && !error && filtered.length === 0 && <p className="empty">ไม่พบงานที่ค้นหา</p>}

      {!loading && !error && STATUS_ORDER.map(st => {
        const arr = groups[st]; if (!arr || !arr.length) return null
        const isCollapsed = !forceOpen && collapsed[st]
        return (
          <div key={st}>
            <div className="grp-head" onClick={() => setCollapsed(c => ({ ...c, [st]: !c[st] }))}>
              <span className="caret">{isCollapsed ? '▸ กาง' : '▾ ยุบ'}</span>
              <span className={'grp-dot s-' + st}></span>
              <b style={{fontSize:14}}>{st}</b>
              <span className="cnt">{arr.length} งาน</span>
            </div>
            {!isCollapsed && arr.map(j => {
              const stale = (j.status === 'ใหม่' || j.status === 'กำลังขอราคา') && daysSince(j.job_date) >= 2
              const itemCount = j.job_items?.[0]?.count ?? 0
              return (
                <div key={j.id} className="card" onClick={() => onOpen(j.id)}>
                  <div className="l">
                    <b>{j.requester || '(ไม่ระบุผู้ขอ)'}</b>
                    {j.unpaid && <span className="unpaid-tag" title={j.unpaid_reason||''}>🚫 ไม่จ่าย</span>}
                    {stale && !j.unpaid && <span className="stale"> ⚠ ค้าง {daysSince(j.job_date)} วัน</span>}
                    {j.project && ' · ' + j.project}
                    {j.purpose && ' — ' + j.purpose}
                    <small>{j.job_no} · สั่ง {fmtDate(j.job_date)} · {itemCount} รายการ
                      {j.eta && ' · ของถึง ' + fmtDate(j.eta)}
                      {j.chosen_shop && ' · ' + j.chosen_shop}</small>
                  </div>
                  <div className="r">
                    {j.total > 0 && <div className="amt">{fmt(j.total)} ฿</div>}
                    <div className="r-actions">
                      <select className={'status-sel s-' + j.status} value={j.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => quickStatus(e, j, e.target.value)}>
                        {STATUS_ORDER.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                      <button className="card-del" onClick={(e) => handleDelete(e, j)} title="ลบงาน">🗑 ลบ</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {!loading && !error && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>
          ทั้งหมด {jobs.length} งาน
        </p>
      )}
    </div>
  )
}
