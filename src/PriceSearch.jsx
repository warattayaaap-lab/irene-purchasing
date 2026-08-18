import React from 'react'
import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import { fmt, fmtDate } from './lib.js'

// หมวดงานก่อสร้าง
const WORK_CATEGORIES = [
  { cat: 'งานโครงสร้าง', keys: ['เหล็ก','rb','db','ปูน','คอนกรีต','หิน','ทราย','อิฐ','บล็อก','เสาเข็ม','ตะปู','ลวด','ตะแกรง','ไวร์เมช','wire','วายเมช','แผ่นพื้น','คาน','เข็ม'] },
  { cat: 'งานประปา', keys: ['ท่อ','pvc','ppr','ข้อต่อ','ข้องอ','สามทาง','วาล์ว','ก๊อก','ปั๊ม','ถังน้ำ','สุขภัณฑ์','ชักโครก','อ่าง','ฝักบัว','สายฉีด','กันซึม','ประปา','สต๊อป'] },
  { cat: 'งานไฟฟ้า', keys: ['สายไฟ','thw','vaf','nyy','หลอด','led','โคม','สวิตช์','สวิทช์','ปลั๊ก','เต้ารับ','เบรกเกอร์','ตู้ไฟ','ราง','ท่อร้อยสาย','เทปพันสาย','ดาวน์ไลท์','สปอตไลท์','ไฟฟ้า'] },
  { cat: 'งานสี', keys: ['สี','toa','เบเยอร์','นิปปอน','แลคเกอร์','ทินเนอร์','แปรง','ลูกกลิ้ง','โป๊ว','รองพื้น','แม่สี','พู่กัน','เกรียง','กระดาษทราย'] },
]
function catOf(name) {
  const low = String(name||'').toLowerCase()
  for (const wc of WORK_CATEGORIES) for (const k of wc.keys) if (low.indexOf(k.toLowerCase())!==-1) return wc.cat
  return 'อื่น ๆ'
}
function priceKey(name) {
  let s = String(name||'').toLowerCase().replace(/[\s.\-_"'()\/]+/g,'')
  ;['ซุปเปอร์','ซูเปอร์','super','พิเศษ','เกรดเอ','อย่างดี','ทั่วไป','ธรรมดา'].forEach(x=>{s=s.split(x).join('')})
  return s
}
const CAT_ORDER = ['งานโครงสร้าง','งานประปา','งานไฟฟ้า','งานสี','อื่น ๆ']

export default function PriceSearch({ onBack }) {
  const [raw, setRaw] = useState(null)
  const [q, setQ] = useState('')
  const [openCat, setOpenCat] = useState({})
  const [openItem, setOpenItem] = useState({})
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    const { data, error } = await supabase.from('price_history')
      .select('item_name, unit, shop, unit_price, hist_date')
      .order('hist_date', { ascending: false })
    if (error) { setErr(error.message); return }
    setRaw(data || [])
  }

  if (err) return <div className="wrap"><div className="top"><h1>ค้นราคาของ</h1><button className="btn ghost" onClick={onBack}>← กลับ</button></div><p className="empty" style={{color:'var(--danger)'}}>{err}</p></div>
  if (!raw) return <div className="wrap"><p className="loading">กำลังโหลดประวัติราคา…</p></div>

  // จัดกลุ่ม: รวมของชื่อคล้าย > หมวด
  const items = {}
  raw.forEach(r => {
    const name = String(r.item_name||'').trim(); if (!name) return
    const key = priceKey(name)
    if (!items[key]) items[key] = { names:{}, records:[] }
    items[key].names[name] = (items[key].names[name]||0)+1
    items[key].records.push({ shop: r.shop||'(ไม่ระบุร้าน)', price: Number(r.unit_price)||0, date: r.hist_date })
  })
  const cats = {}
  Object.values(items).forEach(it => {
    it.records.sort((a,b)=> new Date(b.date)-new Date(a.date))
    const display = Object.keys(it.names).sort((a,b)=> it.names[b]-it.names[a] || a.length-b.length)[0]
    const aliases = Object.keys(it.names).filter(n=>n!==display)
    const c = catOf(display)
    ;(cats[c]=cats[c]||[]).push({ name: display, aliases, records: it.records, latest: it.records[0] })
  })

  const kw = q.trim().toLowerCase()
  let catList = CAT_ORDER.filter(c=>cats[c]).map(c => {
    let arr = cats[c].sort((a,b)=>a.name.localeCompare(b.name,'th'))
    if (kw) arr = arr.filter(it => it.name.toLowerCase().indexOf(kw)!==-1 || c.toLowerCase().indexOf(kw)!==-1 || it.aliases.some(a=>a.toLowerCase().indexOf(kw)!==-1))
    return arr.length ? { cat: c, items: arr } : null
  }).filter(Boolean)

  const forceOpen = !!kw

  return (
    <div className="wrap">
      <div className="top">
        <h1>ค้นราคาของ</h1>
        <button className="btn ghost" onClick={onBack}>← กลับ</button>
      </div>
      <div className="toolbar">
        <input placeholder="พิมพ์ชื่อของ เช่น เหล็ก, ปูน, สี" value={q} onChange={e=>setQ(e.target.value)} />
      </div>

      {catList.length===0 && <p className="empty">{kw?`ไม่พบ "${q}"`:'ยังไม่มีประวัติราคา'}</p>}

      {catList.map(({cat, items}) => {
        const co = forceOpen || openCat[cat]
        return (
          <div className="acc" key={cat}>
            <div className="acc-head" onClick={()=>setOpenCat(o=>({...o,[cat]:!o[cat]}))}>
              <div><b>{cat}</b> <span className="cnt">{items.length} อย่าง</span></div>
              <span className="caret">{co?'▾':'▸'}</span>
            </div>
            {co && (
              <div style={{padding:'0 10px 10px', overflowX:'auto'}}>
                <table className="ptable">
                  <thead><tr><th style={{textAlign:'left'}}>รายการ</th><th>ร้านล่าสุด</th><th>วันที่</th><th style={{textAlign:'right'}}>ราคาล่าสุด</th><th></th></tr></thead>
                  <tbody>
                    {items.map((it,ii) => {
                      const io = forceOpen || openItem[cat+'|'+it.name]
                      const L = it.latest
                      return (
                        <React.Fragment key={it.name}>
                          <tr className="prow" onClick={()=>setOpenItem(o=>({...o,[cat+'|'+it.name]:!o[cat+'|'+it.name]}))}>
                            <td style={{textAlign:'left'}}><b>{it.name}</b>{it.aliases.length>0 && <span className="cnt"> (รวม {it.aliases.length+1})</span>}</td>
                            <td>{L.shop}</td><td>{fmtDate(L.date)}</td>
                            <td style={{textAlign:'right',color:'var(--accent)',fontWeight:600}}>{fmt(L.price)} ฿</td>
                            <td style={{textAlign:'right',color:'var(--muted)'}}>{it.records.length>1?(io?'▴':'▾'):''}</td>
                          </tr>
                          {io && it.records.length>1 && (
                            <tr><td colSpan={5} style={{padding:0,background:'#f7faf9'}}>
                              <table className="ptable" style={{margin:0}}><tbody>
                                {it.records.slice(0,15).map((r,ri)=>(
                                  <tr key={ri}><td style={{textAlign:'left',color:'var(--muted)'}}>{r.shop}</td><td style={{color:'var(--muted)'}}>{fmtDate(r.date)}</td><td style={{textAlign:'right',color:'var(--muted)'}}>{fmt(r.price)} ฿</td></tr>
                                ))}
                              </tbody></table>
                            </td></tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
