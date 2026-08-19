import { useState, useEffect } from 'react'
import { loadSettings, loadVendor, fmt, fmtDateLong } from './lib.js'

// สร้างเอกสารใบสั่งซื้อ (PO) แล้วเปิดหน้าต่างพิมพ์
export default function PODoc({ job, items, onClose }) {
  const [cfg, setCfg] = useState(null)
  const [vendor, setVendor] = useState(null)
  useEffect(() => {
    loadSettings().then(setCfg)
    const poShop = job.chosen_shop || (items.find(i=>!i.compare && String(i.shop||'').trim())?.shop || '').trim()
    if (poShop) loadVendor(poShop).then(v => setVendor(v || {}))
    else setVendor({})
  }, [])
  if (!cfg || vendor === null) return <div className="wrap"><p className="loading">กำลังเตรียมเอกสาร…</p></div>

  const chosen = job.chosen_shop || (items.find(i=>!i.compare && String(i.shop||'').trim())?.shop || '').trim()

  const rows = items.filter(it => String(it.name||'').trim()).map(it => {
    let price = ''
    if (it.compare && chosen) { const q = (it.quotes||{})[chosen]; if (q!==''&&q!=null) price = Number(q) }
    else if (!it.compare && it.price) price = Number(it.price)
    const qty = Number(it.qty)||0
    return { name: it.name, qty, unit: it.unit||'', price, amount: (price!==''&&qty)?price*qty:'' }
  })
  const hasPrice = rows.some(r => r.amount !== '')
  const subtotal = rows.reduce((a,r)=> a + (r.amount||0), 0)

  const vatMode = cfg.vat_mode || 'included'
  let beforeVat = subtotal, vat = 0, grand = subtotal
  if (vatMode === 'included') { beforeVat = subtotal/1.07; vat = subtotal-beforeVat; grand = subtotal }
  else if (vatMode === 'add') { beforeVat = subtotal; vat = subtotal*0.07; grand = subtotal+vat }

  function printDoc() {
    const w = window.open('', '_blank')
    const today = fmtDateLong(new Date().toISOString().slice(0,10))
    const vendorName = (vendor && vendor.full_name) || chosen || (items.find(i=>!i.compare)?.shop) || ''

    const itemsHtml = rows.map((r,i)=>`<tr>
      <td class="c">${i+1}</td><td>${esc(r.name)}</td>
      <td class="r">${fmt(r.qty)}</td><td class="c">${esc(r.unit)}</td>
      <td class="r">${r.price!==''?fmt(r.price):'-'}</td>
      <td class="r">${r.amount!==''?fmt(r.amount):'-'}</td></tr>`).join('')

    const sumHtml = hasPrice
      ? `<tr class="sum"><td colspan="5" class="r">มูลค่าก่อนภาษี</td><td class="r">${fmt(beforeVat)}</td></tr>
         ${vatMode!=='none'?`<tr class="sum"><td colspan="5" class="r">ภาษีมูลค่าเพิ่ม 7%</td><td class="r">${fmt(vat)}</td></tr>`:''}
         <tr class="sum grand"><td colspan="5" class="r">ยอดสุทธิ${vatMode!=='none'?' (รวม VAT)':''}</td><td class="r">${fmt(grand)}</td></tr>`
      : ''

    const buyerBlock = `<div class="head" style="margin-top:26px;">
      <div><b>ผู้ซื้อ:</b> <b>${esc(cfg.company_name||'')}</b><br>
      <span class="muted">(${esc(cfg.company_branch||'สำนักงานใหญ่')})</span><br>
      <b>ที่อยู่:</b> ${esc(cfg.company_address||'')}<br>
      <b>เลขที่ภาษี:</b> ${esc(cfg.company_tax_id||'')}</div></div>`

    const vendorBlock = vendorName ? `<div class="head" style="margin-top:10px;"><div>
      <b>ผู้ขาย:</b> <b>${esc(vendorName)}</b>${vendor&&vendor.branch?` <span class="muted">(${esc(vendor.branch)})</span>`:''}
      ${vendor&&vendor.address?`<br><b>ที่อยู่:</b> ${esc(vendor.address)}`:''}
      ${vendor&&vendor.tax_id?`<br><b>เลขที่ภาษี:</b> ${esc(vendor.tax_id)}`:''}</div></div>` : ''

    const signBlock = `<div class="sign">
      <div class="sign-col">
        <div class="sign-name" style="font-family:'${cfg.sig_font||'Itim'}',cursive;">${esc(cfg.po_signer||'')}</div>
        <div class="l">ผู้สั่งซื้อ (${esc(cfg.po_signer||'')})</div>
        <span class="muted">วันที่ ${today}</span>
      </div>
      <div class="sign-col">
        <div class="sign-name">&nbsp;</div>
        <div class="l">ผู้อนุมัติ</div>
        <span class="muted">วันที่ ___/___/___</span>
      </div></div>`

    w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
      <title>PO ${esc(job.job_no)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600&family=Itim&display=swap" rel="stylesheet">
      <style>
        body{font-family:'Noto Sans Thai',sans-serif;color:#1a2b26;font-size:14px;max-width:760px;margin:24px auto;padding:0 20px;}
        h1{font-size:20px;text-align:center;margin:14px 0 8px;}
        .head{display:flex;justify-content:space-between;gap:16px;}
        .muted{color:#64756f;font-size:12.5px;}
        .meta{text-align:right;font-size:13px;}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13.5px;}
        th,td{border:1px solid #b8c4bf;padding:7px 9px;}th{background:#eef3f1;font-weight:500;}
        .c{text-align:center}.r{text-align:right}.sum td{border:none;padding:5px 9px;}
        .grand td{font-weight:600;font-size:15px;border-top:2px solid #1a2b26;}
        .sign{display:flex;justify-content:space-around;margin-top:64px;text-align:center;font-size:13px;}
        .sign-col{width:240px;display:flex;flex-direction:column;align-items:center;}
        .sign-name{font-size:26px;height:34px;line-height:34px;margin-bottom:4px;}
        .sign .l{border-top:1px solid #1a2b26;padding-top:6px;width:100%;}
        @media print{body{margin:0 auto;}}
      </style></head><body>
      <div class="head"><div><b>${esc(cfg.company_name||'')}</b></div>
      <div class="meta">เลขที่: <b>${esc(job.po_no||job.job_no)}</b><br>วันที่: ${today}</div></div>
      <h1>ใบสั่งซื้อ / PURCHASE ORDER</h1>
      ${buyerBlock}${vendorBlock}
      ${job.project?`<div style="margin-top:8px;"><b>โปรเจกต์:</b> ${esc(job.project)}</div>`:''}
      <table><tr><th style="width:42px">ลำดับ</th><th>รายการ</th><th style="width:70px">จำนวน</th>
      <th style="width:60px">หน่วย</th><th style="width:90px">ราคา/หน่วย</th><th style="width:100px">จำนวนเงิน</th></tr>
      ${itemsHtml}${sumHtml}</table>
      <p class="muted">* ราคาต่อหน่วยรวมภาษีมูลค่าเพิ่มแล้ว</p>
      ${signBlock}
      <script>window.onload=function(){window.print();}<\/script></body></html>`)
    w.document.close()
  }

  return (
    <div className="wrap">
      <div className="top">
        <button className="btn ghost" onClick={onClose}>← กลับ</button>
        <h1 style={{fontSize:18}}>ใบสั่งซื้อ (PO) · {job.job_no}</h1>
      </div>
      <div className="panel">
        <p style={{marginBottom:12}}>เอกสาร PO พร้อมพิมพ์ — ใช้ส่งร้าน (ต้องเลือกร้านและมีราคาก่อน)</p>
        {!chosen && <p style={{color:'var(--danger)',marginBottom:12}}>⚠ ยังไม่ได้เลือกร้าน — PO อาจไม่มีชื่อผู้ขาย</p>}
        <button className="btn" onClick={printDoc}>🖨️ พิมพ์ PO</button>
      </div>
    </div>
  )
}

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
