import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import { fmt, fmtDate, daysSince } from './lib.js'

export default function MonthSummary({ onBack, onOpen }) {
  const [data, setData] = useState(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, job_no, job_date, project, requester, status, total, chosen_shop, job_items(name,qty,price,compare,shop,quotes)')
    if (error) { setErr(error.message); return }
    setData(jobs || [])
  }

  if (err) return <div className="wrap"><div className="top"><h1>สรุปรายเดือน</h1><button className="btn ghost" onClick={onBack}>← กลับ</button></div><p className="empty" style={{color:'var(--danger)'}}>{err}</p></div>
  if (!data) return <div className="wrap"><p className="loading">กำลังรวมยอด…</p></div>

  // งานในเดือนที่เลือก (ไม่รวมยกเลิก) นับตามวันที่งาน
  const inMonth = data.filter(j => j.status !== 'ยกเลิก' && (j.job_date || '').slice(0,7) === month)
  const totalMonth = inMonth.reduce((a,j)=>a+(Number(j.total)||0), 0)

  // แยกตามบ้าน
  const byHouse = {}
  inMonth.forEach(j => {
    const p = (j.project||'').trim() || '(ไม่ระบุบ้าน)'
    if (!byHouse[p]) byHouse[p] = { project: p, jobs: 0, total: 0 }
    byHouse[p].jobs++; byHouse[p].total += Number(j.total)||0
  })
  const houses = Object.values(byHouse).sort((a,b)=>b.total-a.total)

  // งานค้างนาน (ใหม่/กำลังขอราคา เกิน 3 วัน) — ทุกเดือน
  const stale = data.filter(j => (j.status==='ใหม่'||j.status==='กำลังขอราคา') && daysSince(j.job_date) >= 3)
    .sort((a,b)=>daysSince(b.job_date)-daysSince(a.job_date))

  // รายชื่อเดือนย้อนหลัง 12 เดือน
  const months = []
  const now = new Date()
  for (let i=0;i<12;i++){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push(d.toISOString().slice(0,7)) }
  const monthLabel = (m) => {
    const [y,mo]=m.split('-'); const names=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
    return names[parseInt(mo)-1]+' '+((parseInt(y)+543)%100)
  }

  return (
    <div className="wrap">
      <div className="top">
        <h1>สรุปรายเดือน</h1>
        <button className="btn ghost" onClick={onBack}>← กลับ</button>
      </div>

      {/* งานค้างนาน */}
      {stale.length > 0 && (
        <div className="card-box" style={{borderColor:'#e6c9c9', background:'#fdf6f6'}}>
          <div className="box-title" style={{color:'var(--danger)'}}>⚠ งานค้างนาน ({stale.length})</div>
          {stale.slice(0,10).map(j => (
            <div key={j.id} className="stale-row" onClick={()=>onOpen(j.id)}>
              <span><b>{j.requester||'(ไม่ระบุ)'}</b>{j.project?' · '+j.project:''} <span className="cnt">{j.job_no}</span></span>
              <span className="stale">ค้าง {daysSince(j.job_date)} วัน</span>
            </div>
          ))}
        </div>
      )}

      {/* เลือกเดือน */}
      <div className="toolbar" style={{gap:6,overflowX:'auto',flexWrap:'nowrap'}}>
        {months.map(m => (
          <span key={m} className={'chip'+(month===m?' on':'')} onClick={()=>setMonth(m)} style={{whiteSpace:'nowrap'}}>{monthLabel(m)}</span>
        ))}
      </div>

      {/* ยอดรวมเดือน */}
      <div className="panel" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <b>{monthLabel(month)} · {inMonth.length} งาน</b>
        <b style={{fontSize:20,color:'var(--accent)'}}>{fmt(totalMonth)} ฿</b>
      </div>

      {houses.length===0 ? <p className="empty">เดือนนี้ยังไม่มีงาน</p> : houses.map(h => (
        <div className="panel" key={h.project} style={{marginBottom:8,display:'flex',justifyContent:'space-between'}}>
          <span><b>{h.project}</b> <span className="cnt">· {h.jobs} งาน</span></span>
          <b>{fmt(h.total)} ฿</b>
        </div>
      ))}
    </div>
  )
}
