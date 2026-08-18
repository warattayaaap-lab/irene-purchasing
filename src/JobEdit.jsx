import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import { STATUSES, ETA_TIMES, fmt, nextJobNo, saveJob, deleteJob, calcTotal, notifyLine } from './lib.js'

const blankItem = () => ({ _k: Math.random().toString(36).slice(2), name: '', qty: '', unit: '', compare: false, shop: '', price: '', quotes: {} })

export default function JobEdit({ jobId, onBack, onOpenPO }) {
  const [job, setJob] = useState(null)
  const [items, setItems] = useState([])
  const [shops, setShops] = useState([])       // ร้านสำหรับเทียบราคา
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [newShop, setNewShop] = useState('')
  const [origStatus, setOrigStatus] = useState('')

  useEffect(() => { init() }, [jobId])

  async function init() {
    setLoading(true); setErr('')
    if (jobId === 'new') {
      const no = await nextJobNo()
      setJob({ job_no: no, job_date: new Date().toISOString().slice(0,10), requester:'', project:'', purpose:'', note:'', status:'ใหม่', po_no:'', chosen_shop:'', eta:'', eta_time:'', delivery:'', order_by:'', need_by:'', images:[], shop_eta:{} })
      setItems([blankItem()]); setShops([]); setLoading(false); return
    }
    const { data: j, error: e1 } = await supabase.from('jobs').select('*').eq('id', jobId).single()
    if (e1) { setErr(e1.message); setLoading(false); return }
    const { data: its } = await supabase.from('job_items').select('*').eq('job_id', jobId).order('sort_order')
    const rows = (its || []).map(it => ({ ...it, _k: String(it.id), quotes: it.quotes || {} }))
    // รวมร้านจาก quotes + chosen
    const shopSet = new Set()
    rows.forEach(it => Object.keys(it.quotes || {}).forEach(s => shopSet.add(s)))
    if (j.chosen_shop) shopSet.add(j.chosen_shop)
    setJob({ ...j, job_date: j.job_date || '', eta: j.eta || '', need_by: j.need_by || '' })
    setOrigStatus(j.status)
    setItems(rows.length ? rows : [blankItem()])
    setShops([...shopSet])
    setLoading(false)
  }

  const set = (k, v) => setJob(j => ({ ...j, [k]: v }))
  const setItem = (k, field, v) => setItems(arr => arr.map(it => it._k === k ? { ...it, [field]: v } : it))
  const setQuote = (k, shop, v) => setItems(arr => arr.map(it => it._k === k ? { ...it, quotes: { ...it.quotes, [shop]: v } } : it))
  const addItem = () => setItems(arr => [...arr, blankItem()])
  const delItem = (k) => setItems(arr => arr.filter(it => it._k !== k))

  function addShop() {
    const s = newShop.trim()
    if (!s || shops.includes(s)) return
    setShops([...shops, s]); setNewShop('')
  }
  function removeShop(s) {
    setShops(shops.filter(x => x !== s))
    setItems(arr => arr.map(it => { const q = { ...it.quotes }; delete q[s]; return { ...it, quotes: q } }))
    if (job.chosen_shop === s) set('chosen_shop', '')
  }

  async function doSave() {
    setSaving(true); setErr('')
    try {
      const id = await saveJob(job, items)
      // ยิงแจ้งเตือน LINE เมื่อสถานะเปลี่ยนเป็น สั่งแล้ว/ยกเลิก (และไม่ใช่หน้างานสั่งเอง)
      const statusChanged = job.status !== origStatus
      const shouldNotify = statusChanged && (job.status === 'สั่งแล้ว' || job.status === 'ยกเลิก')
      let notifyMsg = ''
      if (shouldNotify) {
        const r = await notifyLine('order', { ...job, id }, items)
        if (r.ok) notifyMsg = ' · แจ้งกลุ่มไลน์แล้ว 📨'
        else if (r.skipped) notifyMsg = ''
        else notifyMsg = ' · (แจ้งไลน์ไม่สำเร็จ)'
      }
      setSaving(false)
      alert('บันทึกงานแล้ว ✓ ' + job.job_no + notifyMsg)
      onBack(true)
    } catch (e) { setSaving(false); setErr(e.message || String(e)) }
  }
  async function doDelete() {
    if (!job.id) return
    if (!confirm('ลบงาน ' + job.job_no + ' ถาวร?\nเอาคืนไม่ได้')) return
    try { await deleteJob(job.id); alert('ลบแล้ว'); onBack(true) }
    catch (e) { setErr(e.message) }
  }

  if (loading) return <div className="wrap"><p className="loading">กำลังโหลด…</p></div>
  if (!job) return <div className="wrap"><p className="empty" style={{color:'var(--danger)'}}>{err}</p><button className="btn ghost" onClick={()=>onBack()}>← กลับ</button></div>

  const total = calcTotal(items, job.chosen_shop)
  const hasCompareItems = items.some(it => it.compare)

  return (
    <div className="wrap">
      <div className="top">
        <button className="btn ghost" onClick={()=>onBack()}>← กลับ</button>
        <h1 style={{fontSize:18}}>{job.id ? job.job_no : 'งานใหม่ ' + job.job_no}</h1>
      </div>

      {err && <div className="panel" style={{color:'var(--danger)', marginBottom:12}}>{err}</div>}

      {/* ข้อมูลงาน */}
      <div className="grid2">
        <Field label="ผู้ขอ"><input value={job.requester} onChange={e=>set('requester',e.target.value)} placeholder="ช่าง / ชื่อคนขอ" /></Field>
        <Field label="โปรเจกต์ / บ้าน"><input value={job.project} onChange={e=>set('project',e.target.value)} placeholder="เช่น บ้านเจมส์" /></Field>
        <Field label="สถานะ">
          <select value={job.status} onChange={e=>set('status',e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="เลข PO / บิล (ถ้ามี)"><input value={job.po_no} onChange={e=>set('po_no',e.target.value)} placeholder="จาก PEAK" /></Field>
        <Field label="ใช้ทำอะไร"><input value={job.purpose} onChange={e=>set('purpose',e.target.value)} placeholder="เช่น งานก่อฉาบชั้น 2" /></Field>
        <Field label="หมายเหตุ"><input value={job.note} onChange={e=>set('note',e.target.value)} placeholder="เช่น ของด่วน" /></Field>
        <Field label="ของถึงประมาณ"><input type="date" value={job.eta||''} onChange={e=>set('eta',e.target.value)} /></Field>
        <Field label="ช่วงเวลา">
          <select value={job.eta_time} onChange={e=>set('eta_time',e.target.value)}>
            <option value="">ไม่ระบุ</option>{ETA_TIMES.filter(Boolean).map(t=><option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="การรับของ">
          <select value={job.delivery} onChange={e=>set('delivery',e.target.value)}><option value="">ร้านจัดส่ง</option><option>ไปรับเอง</option></select>
        </Field>
        <Field label="ใครเป็นคนสั่ง">
          <select value={job.order_by} onChange={e=>set('order_by',e.target.value)}><option value="">จัดซื้อสั่ง</option><option>หน้างานสั่งเอง</option></select>
        </Field>
      </div>

      {/* ร้านเทียบราคา */}
      <div className="section-title">ร้านสำหรับเทียบราคา</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
        {shops.map(s => (
          <span key={s} className="chip on" style={{display:'flex',gap:6,alignItems:'center'}}>
            {s}<b style={{cursor:'pointer'}} onClick={()=>removeShop(s)}>×</b>
          </span>
        ))}
        <input value={newShop} onChange={e=>setNewShop(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addShop()} placeholder="เพิ่มร้าน…" style={{maxWidth:160}} />
        <button className="btn ghost" onClick={addShop}>+ ร้าน</button>
      </div>

      {/* รายการของ */}
      <div className="section-title">รายการของ</div>
      <div style={{overflowX:'auto'}}>
        <table className="etable">
          <thead>
            <tr>
              <th style={{textAlign:'left',minWidth:160}}>ชื่อของ</th>
              <th style={{width:70}}>จำนวน</th><th style={{width:70}}>หน่วย</th>
              <th style={{width:56}}>เทียบ</th>
              {shops.map(s => <th key={s} style={{width:90}}>{s}</th>)}
              <th style={{width:110}}>ร้าน/ราคา (สั่งตรง)</th>
              <th style={{width:36}}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it._k}>
                <td><input value={it.name} onChange={e=>setItem(it._k,'name',e.target.value)} placeholder="เช่น ปูนก่อ" /></td>
                <td><input value={it.qty} onChange={e=>setItem(it._k,'qty',e.target.value)} type="number" style={{textAlign:'right'}} /></td>
                <td><input value={it.unit} onChange={e=>setItem(it._k,'unit',e.target.value)} placeholder="ถุง" /></td>
                <td style={{textAlign:'center'}}><input type="checkbox" checked={!!it.compare} onChange={e=>setItem(it._k,'compare',e.target.checked)} /></td>
                {shops.map(s => (
                  <td key={s}>{it.compare ? <input value={it.quotes[s]||''} onChange={e=>setQuote(it._k,s,e.target.value)} type="number" style={{textAlign:'right'}} placeholder="-" /> : <span style={{color:'var(--muted)'}}>—</span>}</td>
                ))}
                <td>{!it.compare ? (
                  <div style={{display:'flex',gap:4}}>
                    <input value={it.shop} onChange={e=>setItem(it._k,'shop',e.target.value)} placeholder="ร้าน" style={{width:'52%'}} />
                    <input value={it.price} onChange={e=>setItem(it._k,'price',e.target.value)} type="number" placeholder="฿" style={{width:'44%',textAlign:'right'}} />
                  </div>
                ) : <span style={{color:'var(--muted)'}}>ใช้ราคาเทียบ</span>}</td>
                <td style={{textAlign:'center'}}><b style={{cursor:'pointer',color:'var(--muted)'}} onClick={()=>delItem(it._k)}>×</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn ghost" onClick={addItem} style={{marginTop:8}}>+ เพิ่มรายการ</button>

      {/* เลือกร้านสุดท้าย (ถ้ามีเทียบ) */}
      {hasCompareItems && shops.length > 0 && (
        <>
          <div className="section-title">เลือกร้านที่สั่ง</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {shops.map(s => {
              const sum = items.reduce((a,it)=> it.compare ? a + Number(it.quotes[s]||0)*Number(it.qty||0) : a, 0)
              const on = job.chosen_shop === s
              return <span key={s} className={'chip'+(on?' on':'')} onClick={()=>set('chosen_shop',s)}>{s} · {fmt(sum)} ฿</span>
            })}
          </div>
        </>
      )}

      <p style={{fontSize:18,fontWeight:600,marginTop:16}}>ยอดรวม {fmt(total)} ฿</p>

      {/* ปุ่มล่าง */}
      <div style={{display:'flex',gap:8,marginTop:20,flexWrap:'wrap'}}>
        <button className="btn" onClick={doSave} disabled={saving}>{saving?'กำลังบันทึก…':'บันทึกงาน'}</button>
        {job.id && <button className="btn ghost" onClick={()=>onOpenPO(job, items, shops)}>📄 ใบขอซื้อ / PO</button>}
        {job.id && <button className="btn ghost" style={{color:'var(--danger)',borderColor:'#e6c9c9'}} onClick={doDelete}>ลบงาน</button>}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:5,color:'var(--muted)'}}>{label}</label>{children}</div>
}
