import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import { fmt, fmtDate } from './lib.js'

// หน้ารายละเอียดของชิ้นเดียว: เคยสั่งที่ไหน วันไหน ราคาเท่าไร
// รับ itemName (ชื่อหลัก) + aliases (ชื่อที่เคยพิมพ์ต่าง) เพื่อดึงประวัติครบ
export default function ItemDetail({ itemName, aliases = [], onBack, onOpenJob }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [itemName])

  async function load() {
    const names = [itemName, ...aliases]
    // ดึงประวัติของทุกชื่อที่เป็นของชิ้นเดียวกัน
    const { data, error } = await supabase
      .from('price_history')
      .select('item_name, unit, shop, unit_price, qty, hist_date, job_no')
      .in('item_name', names)
      .order('hist_date', { ascending: false })
    if (error) { setErr(error.message); return }
    setRows(data || [])
  }

  if (err) return <div className="wrap"><div className="top"><h1 style={{fontSize:18}}>{itemName}</h1><button className="btn ghost" onClick={onBack}>← กลับ</button></div><p className="empty" style={{color:'var(--danger)'}}>{err}</p></div>
  if (!rows) return <div className="wrap"><p className="loading">กำลังโหลด…</p></div>

  // สรุปภาพรวม
  const prices = rows.map(r => Number(r.unit_price)).filter(p => p > 0)
  const latest = rows[0]
  const minP = prices.length ? Math.min(...prices) : 0
  const maxP = prices.length ? Math.max(...prices) : 0
  const shops = [...new Set(rows.map(r => r.shop).filter(Boolean))]

  // แยกตามร้าน (ราคาล่าสุดของแต่ละร้าน)
  const byShop = {}
  rows.forEach(r => {
    const s = r.shop || '(ไม่ระบุร้าน)'
    if (!byShop[s]) byShop[s] = { shop: s, count: 0, latest: r, prices: [] }
    byShop[s].count++
    if (Number(r.unit_price) > 0) byShop[s].prices.push(Number(r.unit_price))
  })
  const shopList = Object.values(byShop).map(s => ({
    ...s, min: s.prices.length ? Math.min(...s.prices) : 0
  })).sort((a,b) => a.min - b.min)

  return (
    <div className="wrap">
      <div className="top">
        <button className="btn ghost" onClick={onBack}>← กลับ</button>
        <h1 style={{fontSize:18}}>{itemName}</h1>
      </div>
      {aliases.length > 0 && <p className="hint" style={{marginBottom:12}}>ชื่อที่เคยพิมพ์: {[itemName,...aliases].join(', ')}</p>}

      {rows.length === 0 ? <p className="empty">ยังไม่มีประวัติการสั่งซื้อ</p> : (
        <>
          {/* สรุปภาพรวม */}
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-label">ราคาล่าสุด</div><div className="stat-val">{fmt(latest.unit_price)} ฿</div><div className="hint">{latest.shop} · {fmtDate(latest.hist_date)}</div></div>
            <div className="stat-card"><div className="stat-label">ต่ำสุด–สูงสุด</div><div className="stat-val">{fmt(minP)}–{fmt(maxP)}</div><div className="hint">ต่างกัน {fmt(maxP-minP)} ฿</div></div>
            <div className="stat-card"><div className="stat-label">เคยซื้อ</div><div className="stat-val">{rows.length} ครั้ง</div><div className="hint">{shops.length} ร้าน</div></div>
          </div>

          {/* แยกตามร้าน */}
          <div className="section-title">ราคาแต่ละร้าน (ถูก→แพง)</div>
          <div style={{marginBottom:8}}>
            {shopList.map(s => (
              <div key={s.shop} className="panel" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,padding:'10px 14px'}}>
                <span><b>{s.shop}</b> <span className="cnt">· {s.count} ครั้ง</span></span>
                <span><b style={{color:'var(--accent)'}}>{fmt(s.min)} ฿</b> <span className="hint">ล่าสุด {fmt(s.latest.unit_price)}</span></span>
              </div>
            ))}
          </div>

          {/* ประวัติทุกครั้ง เรียงล่าสุด→เก่า */}
          <div className="section-title">ประวัติการสั่งซื้อ ({rows.length} ครั้ง)</div>
          <div style={{overflowX:'auto'}}>
            <table className="ptable">
              <thead><tr><th>วันที่</th><th style={{textAlign:'left'}}>ร้าน</th><th>จำนวน</th><th style={{textAlign:'right'}}>ราคา/หน่วย</th><th>งาน</th></tr></thead>
              <tbody>
                {rows.map((r,i) => (
                  <tr key={i} className={r.job_no ? 'prow' : ''} onClick={()=> r.job_no && onOpenJob && onOpenJob(r.job_no)}>
                    <td>{fmtDate(r.hist_date)}</td>
                    <td style={{textAlign:'left'}}>{r.shop||'-'}</td>
                    <td>{r.qty ? fmt(r.qty)+' '+(r.unit||'') : '-'}</td>
                    <td style={{textAlign:'right',fontWeight:600,color:'var(--accent)'}}>{fmt(r.unit_price)} ฿</td>
                    <td>{r.job_no ? <span style={{color:'var(--accent)',fontSize:12}}>{r.job_no} ›</span> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
