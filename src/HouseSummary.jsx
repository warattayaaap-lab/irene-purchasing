import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import { fmt } from './lib.js'

export default function HouseSummary({ onBack }) {
  const [houses, setHouses] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    // ดึงงานที่ไม่ยกเลิก + รายการเพื่อแยกยอดตามร้าน
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, project, status, total, chosen_shop, job_items(name, qty, price, compare, shop, quotes)')
    if (error) { setErr(error.message); return }

    const map = {}
    ;(jobs||[]).forEach(j => {
      if (j.status === 'ยกเลิก') return
      const proj = (j.project||'').trim() || '(ไม่ระบุบ้าน)'
      if (!map[proj]) map[proj] = { project: proj, jobs: 0, total: 0, shops: {} }
      map[proj].jobs++
      map[proj].total += Number(j.total)||0
      ;(j.job_items||[]).forEach(it => {
        const qty = Number(it.qty)||0
        let shop = '', price = 0
        if (it.compare && j.chosen_shop) { shop = j.chosen_shop; price = Number((it.quotes||{})[j.chosen_shop])||0 }
        else if (!it.compare) { shop = (it.shop||'').trim(); price = Number(it.price)||0 }
        if (shop && price) map[proj].shops[shop] = (map[proj].shops[shop]||0) + qty*price
      })
    })
    const arr = Object.values(map).map(h => ({
      ...h,
      shopList: Object.entries(h.shops).map(([shop,total])=>({shop,total})).sort((a,b)=>b.total-a.total)
    })).sort((a,b)=>b.total-a.total)
    setHouses(arr)
  }

  if (err) return <div className="wrap"><div className="top"><h1>สรุปต่อบ้าน</h1><button className="btn ghost" onClick={onBack}>← กลับ</button></div><p className="empty" style={{color:'var(--danger)'}}>{err}</p></div>
  if (!houses) return <div className="wrap"><p className="loading">กำลังรวมยอด…</p></div>

  const grand = houses.reduce((a,h)=>a+h.total,0)

  return (
    <div className="wrap">
      <div className="top">
        <h1>สรุปยอดซื้อต่อบ้าน</h1>
        <button className="btn ghost" onClick={onBack}>← กลับ</button>
      </div>

      {houses.length===0 ? <p className="empty">ยังไม่มีข้อมูล</p> : (
        <>
          <div className="panel" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <b>รวมทุกบ้าน ({houses.length} บ้าน)</b>
            <b style={{fontSize:18}}>{fmt(grand)} ฿</b>
          </div>
          {houses.map(h => (
            <div className="panel" key={h.project} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <b style={{fontSize:15}}>{h.project}</b>
                <b style={{fontSize:16}}>{fmt(h.total)} ฿</b>
              </div>
              <div className="cnt" style={{margin:'2px 0 8px'}}>{h.jobs} งาน</div>
              {h.shopList.map(sp => (
                <div key={sp.shop} style={{display:'flex',justifyContent:'space-between',fontSize:13.5,padding:'3px 0',borderTop:'1px solid var(--line)'}}>
                  <span>{sp.shop}</span><span>{fmt(sp.total)} ฿</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
