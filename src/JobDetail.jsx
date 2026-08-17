import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'

const STATUSES = ['ใหม่', 'กำลังขอราคา', 'สั่งแล้ว', 'ยกเลิก']
const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d); if (isNaN(dt)) return d
  const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return `${dt.getDate()} ${m[dt.getMonth()]} ${(dt.getFullYear() + 543) % 100}`
}

export default function JobDetail({ jobId, onBack }) {
  const [job, setJob] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => { load() }, [jobId])

  async function load() {
    setLoading(true); setError('')
    const { data: j, error: e1 } = await supabase.from('jobs').select('*').eq('id', jobId).single()
    if (e1) { setError(e1.message); setLoading(false); return }
    const { data: its, error: e2 } = await supabase.from('job_items').select('*').eq('job_id', jobId).order('sort_order')
    if (e2) { setError(e2.message); setLoading(false); return }
    setJob(j); setItems(its || []); setStatus(j.status); setLoading(false)
  }

  async function saveStatus() {
    setSaving(true)
    const { error } = await supabase.from('jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', jobId)
    setSaving(false)
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return }
    setJob({ ...job, status })
    alert('บันทึกสถานะแล้ว ✓')
  }

  if (loading) return <div className="wrap"><p className="loading">กำลังโหลด…</p></div>
  if (error) return <div className="wrap"><p className="empty" style={{ color: 'var(--danger)' }}>{error}</p><button className="btn ghost" onClick={onBack}>← กลับ</button></div>
  if (!job) return null

  // รวมร้านที่มีในงาน (จาก compare shops + quotes keys)
  const shopSet = new Set()
  items.forEach(it => {
    if (it.shop) shopSet.add(it.shop)
    Object.keys(it.quotes || {}).forEach(s => shopSet.add(s))
  })
  const shops = [...shopSet]
  const hasCompare = items.some(it => it.compare)

  // คำนวณราคาต่อร้าน (ผลรวม) เพื่อไฮไลต์ถูกสุด
  const shopTotals = {}
  shops.forEach(s => {
    let sum = 0, ok = false
    items.forEach(it => {
      const q = (it.quotes || {})[s]
      if (q !== undefined && q !== '' && q !== null) { sum += Number(q) * Number(it.qty || 0); ok = true }
    })
    shopTotals[s] = ok ? sum : null
  })
  const validTotals = Object.values(shopTotals).filter(v => v !== null)
  const cheapest = validTotals.length ? Math.min(...validTotals) : null

  return (
    <div className="wrap">
      <div className="top">
        <button className="btn ghost" onClick={onBack}>← กลับ</button>
        <span className={'status s-' + job.status}>{job.status}</span>
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 4 }}>{job.job_no}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        {job.requester && <>ผู้ขอ: <b>{job.requester}</b></>}
        {job.project && <> · {job.project}</>}
        {job.purpose && <> · {job.purpose}</>}
        {job.job_date && <> · {fmtDate(job.job_date)}</>}
      </p>

      {job.note && <div className="panel" style={{ marginBottom: 12 }}>หมายเหตุ: {job.note}</div>}

      {/* รายการของ */}
      <div className="section-title">รายการของ ({items.length})</div>
      {!hasCompare ? (
        <table className="dtable">
          <thead><tr><th style={{textAlign:'left'}}>รายการ</th><th>จำนวน</th><th>ร้าน</th><th style={{textAlign:'right'}}>ราคา/หน่วย</th><th style={{textAlign:'right'}}>รวม</th></tr></thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id}>
                <td style={{textAlign:'left'}}>{it.name}</td>
                <td>{fmt(it.qty)} {it.unit}</td>
                <td>{it.shop || '-'}</td>
                <td style={{textAlign:'right'}}>{it.price ? fmt(it.price) : '-'}</td>
                <td style={{textAlign:'right'}}>{it.price ? fmt(it.price * it.qty) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="dtable">
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>รายการ</th><th>จำนวน</th>
                {shops.map(s => (
                  <th key={s} style={{ background: shopTotals[s] === cheapest && cheapest !== null ? 'var(--accent-soft)' : undefined }}>
                    {s}{job.chosen_shop === s && ' ✓'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const prices = shops.map(s => (it.quotes || {})[s]).filter(v => v !== undefined && v !== '' && v !== null).map(Number)
                const min = prices.length ? Math.min(...prices) : null
                return (
                  <tr key={it.id}>
                    <td style={{textAlign:'left'}}>{it.name}</td>
                    <td>{fmt(it.qty)} {it.unit}</td>
                    {shops.map(s => {
                      const q = (it.quotes || {})[s]
                      const val = (q === undefined || q === '' || q === null) ? null : Number(q)
                      return <td key={s} style={{ color: val === min && val !== null ? 'var(--accent)' : undefined, fontWeight: val === min && val !== null ? 600 : 400 }}>{val !== null ? fmt(val) : '-'}</td>
                    })}
                  </tr>
                )
              })}
              <tr style={{ borderTop: '2px solid var(--ink)' }}>
                <td style={{textAlign:'left', fontWeight:600}} colSpan={2}>รวมต่อร้าน</td>
                {shops.map(s => (
                  <td key={s} style={{ fontWeight: 600, color: shopTotals[s] === cheapest && cheapest !== null ? 'var(--accent)' : undefined }}>
                    {shopTotals[s] !== null ? fmt(shopTotals[s]) : '-'}
                    {shopTotals[s] === cheapest && cheapest !== null && <div style={{fontSize:11}}>ถูกสุด</div>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {job.chosen_shop && <p style={{ marginTop: 10, color: 'var(--muted)' }}>ร้านที่เลือก: <b style={{color:'var(--accent)'}}>{job.chosen_shop}</b></p>}
      {job.total > 0 && <p style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>ยอดรวม {fmt(job.total)} ฿</p>}

      {/* รูปแนบ */}
      {job.images && job.images.length > 0 && (
        <>
          <div className="section-title">รูปแนบ ({job.images.length})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {job.images.map((im, i) => (
              <a key={i} href={im.url} target="_blank" rel="noreferrer">
                <img src={im.thumb || im.url} alt={'รูป ' + (i+1)} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
              </a>
            ))}
          </div>
        </>
      )}

      {/* แก้สถานะ */}
      <div className="section-title">สถานะงาน</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 200 }}>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn" onClick={saveStatus} disabled={saving || status === job.status}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกสถานะ'}
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>
        * เฟสนี้ดูข้อมูล + แก้สถานะได้ · การแก้รายการ/เทียบราคา/PO จะเพิ่มในเฟสถัดไป
      </p>
    </div>
  )
}
