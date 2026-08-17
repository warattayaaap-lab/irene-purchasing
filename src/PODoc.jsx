import { useState, useEffect } from 'react'
import { loadSettings, fmt, fmtDateLong } from './lib.js'

// สร้างเอกสาร PO หรือ ใบขอซื้อ แล้วเปิดหน้าต่างพิมพ์
export default function PODoc({ job, items, shops, mode, onClose }) {
  const [cfg, setCfg] = useState(null)
  useEffect(() => { loadSettings().then(setCfg) }, [])
  if (!cfg) return <div className="wrap"><p className="loading">กำลังเตรียมเอกสาร…</p></div>

  const isPR = mode === 'pr'  // ใบขอซื้อ
  const chosen = job.chosen_shop

  // สร้างรายการพร้อมราคา
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
    const vendorName = !isPR ? (chosen || (rows[0] && items.find(i=>!i.compare)?.shop) || '') : ''

    const itemsHtml = rows.map((r,i)=>`<tr>
      <td class="c">${i+1}</td><td>${esc(r.name)}</td>
      <td class="r">${fmt(r.qty)}</td><td class="c">${esc(r.unit)}</td>
      <td class="r">${r.price!==''?fmt(r.price):'-'}</td>
      <td class="r">${r.amount!==''?fmt(r.amount):'-'}</td></tr>`).join('')

    const sumHtml = hasPrice ? (isPR
      ? `<tr class="sum grand"><td colspan="5" class="r">ประมาณการรวม</td><td class="r">${fmt(subtotal)}</td></tr>`
      : `<tr class="sum"><td colspan="5" class="r">มูลค่าก่อนภาษี</td><td class="r">${fmt(beforeVat)}</td></tr>
         ${vatMode!=='none'?`<tr class="sum"><td colspan="5" class="r">ภาษีมูลค่าเพิ่ม 7%</td><td class="r">${fmt(vat)}</td></tr>`:''}
         <tr class="sum grand"><td colspan="5" class="r">ยอดสุทธิ${vatMode!=='none'?' (รวม VAT)':''}</td><td class="r">${fmt(grand)}</td></tr>`
    ) : ''

    const buyerBlock = `<div class="head" style="margin-top:26px;">
      <div><b>ผู้ซื้อ:</b> <b>${esc(cfg.company_name||'')}</b><br>
      <span class="muted">(${esc(cfg.company_branch||'สำนักงานใหญ่')})</span><br>
      <b>ที่อยู่:</b> ${esc(cfg.company_address||'')}<br>
      <b>เลขที่ภาษี:</b> ${esc(cfg.company_tax_id||'')}</div></div>`

    const vendorBlock = (!isPR && vendorName) ? `<div style="margin-top:10px;">
      <b>ผู้ขาย:</b> <b>${esc(vendorName)}</b></div>` : ''

    const signBlock = isPR
      ? `<div class="sign"><div><div class="l">ผู้ขอซื้อ${job.requester?' ('+esc(job.requester)+')':''}</div>
         <span class="muted">วันที่ ___/___/___</span></div>
         <div><div class="l">ผู้อนุมัติ</div><span class="muted">วันที่ ___/___/___</span></div></div>`
      : `<div class="sign"><div>
         <div style="font-family:'${cfg.sig_font||'Itim'}',cursive;font-size:26px;margin-bottom:2px;">${esc(cfg.po_signer||'')}</div>
         <div class="l">ผู้สั่งซื้อ (${esc(cfg.po_signer||'')})</div>
         <span class="muted">วันที่ ${today}</span></div>
         <div><div class="l" style="margin-top:44px;">ผู้อนุมัติ</div><span class="muted">วันที่ ___/___/___</span></div></div>`

    w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
      <title>${isPR?'ใบขอซื้อ':'PO'} ${esc(job.job_no)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600&family=Itim&family=Charmonman&display=swap" rel="stylesheet">
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
        .sign{display:flex;justify-content:space-around;margin-top:56px;text-align:center;font-size:13px;}
        .sign div{width:220px;}.sign .l{border-top:1px solid #1a2b26;padding-top:6px;margin-top:30px;}
        @media print{body{margin:0 auto;}}
      </style></head><body>
      <div class="head"><div><b>${esc(cfg.company_name||'')}</b></div>
      <div class="meta">เลขที่: <b>${esc(job.po_no||job.job_no)}</b><br>วันที่: ${today}</div></div>
      <h1>${isPR?'ใบขอซื้อ / PURCHASE REQUISITION':'ใบสั่งซื้อ / PURCHASE ORDER'}</h1>
      ${buyerBlock}${vendorBlock}
      ${job.project?`<div style="margin-top:8px;"><b>โปรเจกต์:</b> ${esc(job.project)}</div>`:''}
      <table><tr><th style="width:42px">ลำดับ</th><th>รายการ</th><th style="width:70px">จำนวน</th>
      <th style="width:60px">หน่วย</th><th style="width:90px">ราคา/หน่วย</th><th style="width:100px">จำนวนเงิน</th></tr>
      ${itemsHtml}${sumHtml}</table>
      ${isPR&&hasPrice?'<p class="muted">* ราคาเป็นประมาณการ อาจเปลี่ยนตามผู้ขายจริง</p>':''}
      ${!isPR?'<p class="muted">* ราคาต่อหน่วยรวมภาษีมูลค่าเพิ่มแล้ว</p>':''}
      ${signBlock}
      <script>window.onload=function(){window.print();}<\/script></body></html>`)
    w.document.close()
  }

  return (
    <div className="wrap">
      <div className="top">
        <button className="btn ghost" onClick={onClose}>← กลับ</button>
        <h1 style={{fontSize:18}}>{isPR?'ใบขอซื้อ':'ใบสั่งซื้อ (PO)'} · {job.job_no}</h1>
      </div>
      <div className="panel">
        <p style={{marginBottom:12}}>เอกสารพร้อมพิมพ์แล้ว — {isPR
          ? 'ใบขอซื้อใช้ขออนุมัติภายใน (ราคาเป็นประมาณการ)'
          : 'ใบ PO ใช้ส่งร้าน (ต้องเลือกร้านและมีราคาก่อน)'}</p>
        {!isPR && !chosen && <p style={{color:'var(--danger)',marginBottom:12}}>⚠ ยังไม่ได้เลือกร้าน — PO อาจไม่มีชื่อผู้ขาย</p>}
        <button className="btn" onClick={printDoc}>🖨️ พิมพ์{isPR?'ใบขอซื้อ':' PO'}</button>
      </div>
    </div>
  )
}

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
