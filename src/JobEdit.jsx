import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import { STATUSES, ETA_TIMES, fmt, nextJobNo, saveJob, deleteJob, calcTotal, notifyLine, loadVendor, saveVendor, loadBuyerTags } from './lib.js'

const blankItem = () => ({ _k: Math.random().toString(36).slice(2), name: '', qty: '', unit: '', compare: false, shop: '', price: '', quotes: {}, ship_date: '', self_buy: false })

export default function JobEdit({ jobId, onBack, onOpenPO }) {
  const [job, setJob] = useState(null)
  const [items, setItems] = useState([])
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [newShop, setNewShop] = useState('')
  const [origStatus, setOrigStatus] = useState('')
  const [buyerList, setBuyerList] = useState([])
  const [vendors, setVendors] = useState({})  // { ชื่อร้าน: {full_name, branch, address, tax_id} }
  const [oneShop, setOneShop] = useState('')
  const [pasteBox, setPasteBox] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [zoomImg, setZoomImg] = useState(null)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => { init() }, [jobId])
  useEffect(() => { loadBuyerTags().then(setBuyerList) }, [])

  // หาทุกร้านที่จะออก PO: ร้านที่เลือก (เทียบราคา) + ร้านสั่งตรงทุกร้านในรายการ
  const poShops = [...new Set([
    ...(job?.chosen_shop ? [job.chosen_shop] : []),
    ...items.filter(it => !it.compare && String(it.shop||'').trim()).map(it => it.shop.trim())
  ])]
  const poShopsKey = poShops.join('|')

  // โหลดข้อมูลทุกร้าน (จำจากครั้งก่อน) เมื่อรายชื่อร้านเปลี่ยน
  useEffect(() => {
    if (!poShops.length) { setVendors({}); return }
    Promise.all(poShops.map(sh => loadVendor(sh).then(v => [sh, v
      ? { short_name: v.short_name, full_name: v.full_name||'', branch: v.branch||'', address: v.address||'', tax_id: v.tax_id||'' }
      : { short_name: sh, full_name:'', branch:'', address:'', tax_id:'' }])))
      .then(pairs => {
        setVendors(prev => {
          const next = { ...prev }
          pairs.forEach(([sh, vd]) => { if (!next[sh]) next[sh] = vd })  // ไม่ทับที่ผู้ใช้กำลังพิมพ์
          return next
        })
      })
  }, [poShopsKey])

  const setVendorField = (shop, field, val) => setVendors(prev => ({ ...prev, [shop]: { ...(prev[shop]||{short_name:shop}), [field]: val } }))
  const noPoShops = job?.no_po_shops || []
  const isNoPo = (sh) => noPoShops.includes(sh)
  const toggleNoPo = (sh) => set('no_po_shops', isNoPo(sh) ? noPoShops.filter(x=>x!==sh) : [...noPoShops, sh])
  const poShopsActive = poShops.filter(sh => !isNoPo(sh))

  async function init() {
    setLoading(true); setErr('')
    if (jobId === 'new') {
      const no = await nextJobNo()
      setJob({ job_no: no, job_date: new Date().toISOString().slice(0,10), requester:'', project:'', purpose:'', note:'', status:'ใหม่', po_no:'', chosen_shop:'', eta:'', eta_time:'', delivery:'', order_by:'', need_by:'', images:[], shop_eta:{}, no_po_shops:[], shop_delivery:{}, unpaid:false, unpaid_reason:"" })
      setItems([blankItem()]); setShops([]); setOrigStatus('ใหม่'); setLoading(false); return
    }
    const { data: j, error: e1 } = await supabase.from('jobs').select('*').eq('id', jobId).single()
    if (e1) { setErr(e1.message); setLoading(false); return }
    const { data: its } = await supabase.from('job_items').select('*').eq('job_id', jobId).order('sort_order')
    const rows = (its || []).map(it => ({ ...it, _k: String(it.id), quotes: it.quotes || {} }))
    const shopSet = new Set()
    rows.forEach(it => Object.keys(it.quotes || {}).forEach(s => shopSet.add(s)))
    if (j.chosen_shop) shopSet.add(j.chosen_shop)
    setJob({ ...j, job_date: j.job_date || '', eta: j.eta || '', need_by: j.need_by || '' })
    setItems(rows.length ? rows : [blankItem()])
    setShops([...shopSet]); setOrigStatus(j.status)
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
      // จำข้อมูลทุกร้านไว้ใช้ครั้งหน้า
      for (const sh of poShops) {
        const vd = vendors[sh]
        if (vd && (vd.full_name || vd.address || vd.tax_id)) await saveVendor({ ...vd, short_name: sh })
      }
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

  // ใช้ร้านเดียวกับทุกรายการ (สั่งตรง ไม่เทียบ)
  function applyOneShop() {
    const sh = oneShop.trim()
    if (!sh) return
    setItems(arr => arr.map(it => ({ ...it, compare: false, shop: sh })))
    set('chosen_shop', '')
  }

  // วางรายการจากข้อความไลน์ (บรรทัดละรายการ)
  function applyPaste() {
    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) { setPasteBox(false); return }
    const parsed = lines.map(line => {
      const clean = line.replace(/^[-\u2022*]\s*/, '')
      const m = clean.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(\S*)$/)
      if (m) return { ...blankItem(), name: m[1].trim(), qty: m[2], unit: m[3] || '' }
      return { ...blankItem(), name: clean }
    })
    setItems(arr => {
      const nonEmpty = arr.filter(it => String(it.name||'').trim())
      return [...nonEmpty, ...parsed]
    })
    setPasteText(''); setPasteBox(false)
  }

  // ลบรูปแนบ
  function delImage(idx) {
    set('images', (job.images||[]).filter((_,i)=>i!==idx))
  }

  // คัดลอกรายการส่งร้าน
  function copyItems() {
    const list = items.filter(it => String(it.name||'').trim())
    if (!list.length) { alert('ยังไม่มีรายการ'); return }
    const byShop = {}, order = []
    list.forEach(it => {
      let shop = it.compare ? (job.chosen_shop||'') : String(it.shop||'').trim()
      if (!shop) shop = '__none__'
      if (!byShop[shop]) { byShop[shop] = []; order.push(shop) }
      let line = it.name
      if (it.qty) line += ' ' + it.qty + (it.unit ? ' ' + it.unit : '')
      byShop[shop].push(line)
    })
    let text
    if (order.length === 1) text = byShop[order[0]].join('\n')
    else text = order.map(sh => (sh==='__none__'?'(ยังไม่ระบุร้าน)':'📍 '+sh) + '\n' + byShop[sh].join('\n')).join('\n\n')
    navigator.clipboard?.writeText(text).then(()=>alert('คัดลอกแล้ว ✓ วางส่งร้านได้เลย')).catch(()=>alert('คัดลอกไม่ได้'))
  }

  if (loading) return <div className="wrap"><p className="loading">กำลังโหลด…</p></div>
  if (!job) return <div className="wrap"><p className="empty" style={{color:'var(--danger)'}}>{err}</p><button className="btn ghost" onClick={()=>onBack()}>← กลับ</button></div>

  const imgSrc = (im) => {
    if (!im) return ''
    if (im.url) return im.url
    if (im.thumb) return im.thumb
    if (im.base64) return im.base64.startsWith('data:') ? im.base64 : `data:${im.type||'image/jpeg'};base64,${im.base64}`
    return ''
  }
  const total = calcTotal(items, job.chosen_shop)
  const compareItems = items.filter(it => it.compare && String(it.name||'').trim())

  return (
    <div className="wrap">
      <div className="top">
        <button className="btn ghost" onClick={()=>onBack()}>← กลับ</button>
        <h1 style={{fontSize:18}}>{job.id ? job.job_no : 'งานใหม่ ' + job.job_no}</h1>
      </div>

      {err && <div className="panel" style={{color:'var(--danger)', marginBottom:12}}>{err}</div>}

      {/* สเต็ป 1 — ข้อมูลงาน */}
      <div className="card-box">
        <div className="step-head"><span className="step-num">1</span><span className="step-title">ข้อมูลงาน</span></div>
        <div className="grid2">
          <Field label="ผู้ขอ"><input value={job.requester} onChange={e=>set('requester',e.target.value)} placeholder="ช่าง / ชื่อคนขอ" /></Field>
          <Field label="โปรเจกต์ / บ้าน"><input value={job.project} onChange={e=>set('project',e.target.value)} placeholder="เช่น บ้านเจมส์" /></Field>
          <Field label="สถานะ"><select value={job.status} onChange={e=>set('status',e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></Field>
          <Field label="คนไปรับของ (แจ้งเตือนไลน์)">
            <select value={job.requester_id||''} onChange={e=>set('requester_id',e.target.value)}>
              <option value="">— ไม่ tag ใคร —</option>
              {buyerList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              {job.requester_id && !buyerList.some(r=>r.id===job.requester_id) && <option value={job.requester_id}>{job.requester||'(คนเดิม)'}</option>}
            </select>
          </Field>
        </div>
        <div style={{marginTop:12}}>
          <Field label="ใช้ทำอะไร"><input value={job.purpose} onChange={e=>set('purpose',e.target.value)} placeholder="เช่น งานก่อฉาบชั้น 2" /></Field>
        </div>

        <button className="more-toggle" onClick={()=>setShowMore(m=>!m)}>
          {showMore ? '▾' : '▸'} ข้อมูลเพิ่มเติม (เลข PO, หมายเหตุ, การรับของ)
        </button>
        {showMore && (
          <div className="grid2" style={{marginTop:10}}>
            <Field label="เลข PO / บิล (ถ้ามี)"><input value={job.po_no} onChange={e=>set('po_no',e.target.value)} placeholder="จาก PEAK หรือเลขบิล" /></Field>
            <Field label="ใครเป็นคนสั่ง"><select value={job.order_by} onChange={e=>set('order_by',e.target.value)}><option value="">จัดซื้อสั่ง</option><option>หน้างานสั่งเอง</option></select></Field>
            <Field label="ต้องการใช้ (หน้างานระบุ)"><input type="date" value={job.need_by||''} onChange={e=>set('need_by',e.target.value)} /></Field>
            <Field label="หมายเหตุ"><input value={job.note} onChange={e=>set('note',e.target.value)} placeholder="เช่น ของด่วน" /></Field>
          </div>
        )}

        <div className="unpaid-box">
          <label className="unpaid-check">
            <input type="checkbox" checked={!!job.unpaid} onChange={e=>set('unpaid',e.target.checked)} />
            <b>🚫 ไม่จ่าย / ไม่ซื้อ</b> <span className="hint">(ตัดสินใจไม่ซื้องานนี้)</span>
          </label>
          {job.unpaid && (
            <input className="unpaid-reason" value={job.unpaid_reason||''} onChange={e=>set('unpaid_reason',e.target.value)} placeholder="เหตุผลที่ไม่จ่าย/ไม่ซื้อ เช่น ราคาแพงเกิน, เปลี่ยนแบบ, ยกเลิกงาน" />
          )}
        </div>
      </div>

      {/* สเต็ป 2 — รายการของ */}
      <div className="card-box">
        <div className="step-head"><span className="step-num">2</span><span className="step-title">รายการของ</span>
          <span className="step-hint">ติ๊ก "เทียบ" ถ้าขอหลายร้าน · "ซื้อเอง" ถ้าหน้างานไปซื้อ</span></div>
        {items.map((it, idx) => (
          <div className="item-row" key={it._k}>
            <span className="i-num">{idx+1}</span>
            <input className="i-name" value={it.name} onChange={e=>setItem(it._k,'name',e.target.value)} placeholder="ชื่อของ" />
            <input className="i-qty" value={it.qty} onChange={e=>setItem(it._k,'qty',e.target.value)} type="number" placeholder="จำนวน" />
            <input className="i-unit" value={it.unit} onChange={e=>setItem(it._k,'unit',e.target.value)} placeholder="หน่วย" />
            <button className={'i-cmp'+(it.compare?' on':'')} onClick={()=>setItem(it._k,'compare',!it.compare)}>{it.compare?'✓ เทียบ':'เทียบ'}</button>
            {!it.compare ? (
              <>
                <input className="i-shop" value={it.shop} onChange={e=>setItem(it._k,'shop',e.target.value)} placeholder="ร้านที่สั่ง" />
                {!it.self_buy && <input className="i-price" value={it.price} onChange={e=>setItem(it._k,'price',e.target.value)} type="number" placeholder="ราคา/หน่วย" />}
                {it.self_buy && <span className="i-price-self">รอบิล</span>}
                <button className={'i-self'+(it.self_buy?' on':'')} onClick={()=>setItem(it._k,'self_buy',!it.self_buy)} title="หน้างานไปซื้อเอง ไม่ต้องกรอกราคา">{it.self_buy?'✓ ซื้อเอง':'ซื้อเอง'}</button>
              </>
            ) : <span className="i-cmpnote">ใช้ราคาเทียบด้านล่าง</span>}
            <input className="i-ship" type="date" value={it.ship_date||''} onChange={e=>setItem(it._k,'ship_date',e.target.value)} title="วันส่ง/วันรับของรายการนี้" />
            <button className="i-del" onClick={()=>delItem(it._k)}>×</button>
          </div>
        ))}
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <button className="add-row" onClick={addItem} style={{flex:'0 0 auto'}}>+ เพิ่มรายการ</button>
          <button className="add-row" onClick={copyItems} style={{flex:1}}>📋 คัดลอกส่งร้าน</button>
        </div>

        {/* สั่งตรงร้านเดียวทั้งงาน */}
        <div style={{display:'flex',gap:8,marginTop:10,alignItems:'center',flexWrap:'wrap'}}>
          <input value={oneShop} onChange={e=>setOneShop(e.target.value)} placeholder="สั่งตรงร้านเดียวทั้งงาน? พิมพ์/เลือกร้าน…" style={{flex:1,minWidth:200}} />
          <button className="btn ghost" onClick={applyOneShop}>ใช้ร้านนี้ทุกรายการ</button>
        </div>

        {/* วางรายการจากไลน์ */}
        <div style={{marginTop:8}}>
          <button className="acc-toggle" onClick={()=>setPasteBox(!pasteBox)}>{pasteBox?'▾':'▸'} วางรายการจากไลน์ทั้งก้อน</button>
          {pasteBox && (
            <div style={{marginTop:8}}>
              <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} rows={5} placeholder={'วางข้อความจากไลน์ บรรทัดละรายการ เช่น\nปูนก่อ 10 ถุง\nอิฐมอญ 500 ก้อน'} style={{width:'100%',resize:'vertical'}} />
              <button className="btn ghost" onClick={applyPaste} style={{marginTop:6}}>เพิ่มรายการจากข้อความ</button>
            </div>
          )}
        </div>
      </div>

      {/* รูปแนบ — โพย/รูปที่หน้างานถ่ายส่งมา */}
      <div className="card-box">
        <div className="box-title">รูปแนบ <span className="hint">— โพย/รายการที่หน้างานถ่ายส่งมา</span></div>
        {(job.images && job.images.length > 0) ? (
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {job.images.map((im,i)=>(
              <div key={i} style={{position:'relative'}}>
                <img src={imgSrc(im)} alt={'รูป '+(i+1)} onClick={()=>setZoomImg(imgSrc(im))}
                  style={{width:96,height:96,objectFit:'cover',borderRadius:10,border:'1px solid var(--line)',cursor:'zoom-in'}} />
                <b onClick={()=>delImage(i)} style={{position:'absolute',top:-8,right:-8,background:'#fff',border:'1px solid var(--line)',borderRadius:'50%',width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:14}}>×</b>
              </div>
            ))}
          </div>
        ) : (
          <div style={{textAlign:'center',color:'var(--muted)',padding:'18px',border:'1px dashed var(--line)',borderRadius:10}}>📷 ยังไม่มีรูปแนบ (รูปจากหน้างานจะมาโผล่ที่นี่)</div>
        )}
      </div>

      {/* popup ขยายรูป — กดพื้นดำหรือปุ่ม × เพื่อปิด */}
      {zoomImg && (
        <div onClick={()=>setZoomImg(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,cursor:'zoom-out'}}>
          <span style={{position:'absolute',top:16,right:20,color:'#fff',fontSize:32,cursor:'pointer',lineHeight:1}}>×</span>
          <img src={zoomImg} alt="รูปขยาย" onClick={(e)=>e.stopPropagation()} style={{maxWidth:'92%',maxHeight:'92%',objectFit:'contain',borderRadius:8}} />
        </div>
      )}

      {/* เทียบราคา — panel แยก แบบในรูป */}
      {compareItems.length > 0 && (
        <div className="card-box compare-box">
          <div className="box-title">เปรียบเทียบราคา <span className="hint">(เฉพาะรายการที่ติ๊กเทียบ)</span></div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
            {shops.map(s => (
              <span key={s} className="chip on" style={{display:'flex',gap:6,alignItems:'center'}}>{s}<b style={{cursor:'pointer'}} onClick={()=>removeShop(s)}>×</b></span>
            ))}
            <input value={newShop} onChange={e=>setNewShop(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addShop()} placeholder="พิมพ์ชื่อร้าน แล้ว Enter" style={{maxWidth:200}} />
          </div>

          {shops.length > 0 && (
            <div style={{overflowX:'auto'}}>
              <table className="cmp-table">
                <thead>
                  <tr><th style={{textAlign:'left'}}>รายการ</th>{shops.map(s => {
                    const on = job.chosen_shop===s
                    return <th key={s} className={on?'chosen':''}>{s}</th>
                  })}</tr>
                </thead>
                <tbody>
                  {compareItems.map(it => {
                    const prices = shops.map(s=>it.quotes[s]).filter(v=>v!==''&&v!=null&&v!==undefined).map(Number)
                    const min = prices.length?Math.min(...prices):null
                    // ราคาล่าสุด/ร้านล่าสุด (แสดงใต้ชื่อ)
                    return (
                      <tr key={it._k}>
                        <td style={{textAlign:'left'}}><b>{it.name}</b><div className="hint">{fmt(it.qty)} {it.unit}</div></td>
                        {shops.map(s => {
                          const v = it.quotes[s]
                          const num = (v===''||v==null)?null:Number(v)
                          const cheap = num!==null && num===min
                          const on = job.chosen_shop===s
                          return (
                            <td key={s} className={on?'chosen':''}>
                              <input value={it.quotes[s]||''} onChange={e=>setQuote(it._k,s,e.target.value)} type="number" className={'cmp-in'+(cheap?' cheap':'')} />
                              {num!==null && it.qty && <div className="hint">= {fmt(num*Number(it.qty))}</div>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <tr className="cmp-sum">
                    <td style={{textAlign:'left',fontWeight:600}}>ราคารวมต่อร้าน</td>
                    {shops.map(s => {
                      const sum = compareItems.reduce((a,it)=>a+Number(it.quotes[s]||0)*Number(it.qty||0),0)
                      const allSums = shops.map(sh=>compareItems.reduce((a,it)=>a+Number(it.quotes[sh]||0)*Number(it.qty||0),0)).filter(x=>x>0)
                      const cheapest = allSums.length?Math.min(...allSums):null
                      const isCheap = sum>0 && sum===cheapest
                      const on = job.chosen_shop===s
                      return (
                        <td key={s} className={on?'chosen':''}>
                          <b>{fmt(sum)} ฿</b>
                          {isCheap && <div className="cheap-tag">ถูกสุด</div>}
                          {!isCheap && sum>0 && cheapest && <div className="hint" style={{color:'var(--danger)'}}>แพงกว่า +{fmt(sum-cheapest)} ฿</div>}
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    <td></td>
                    {shops.map(s => {
                      const on = job.chosen_shop===s
                      return <td key={s} style={{textAlign:'center',padding:'8px'}}>
                        <button className={on?'btn':'btn ghost'} style={{fontSize:13,padding:'6px 12px'}} onClick={()=>set('chosen_shop', on?'':s)}>{on?'✓ ร้านที่เลือก':'เลือกร้านนี้'}</button>
                      </td>
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* พาเนลใบสั่งซื้อ PO — โผล่เมื่อมีร้าน (แยกกล่องต่อร้าน กรณีหลายร้าน) */}
      {poShops.length > 0 && (
        <div className="card-box">
          <div className="box-title">ใบสั่งซื้อ (PO)
            {poShops.length > 1 && <span className="hint"> — งานนี้สั่ง {poShops.length} ร้าน ออก PO แยกใบ</span>}
          </div>
          {poShops.map(sh => {
            const vd = vendors[sh] || { full_name:'', branch:'', address:'', tax_id:'' }
            return (
              <div className="vendor-panel" key={sh} style={{marginBottom:10}}>
                <div className="vendor-head">
                  <b>{sh}</b>
                  <label className="nopo-check">
                    <input type="checkbox" checked={isNoPo(sh)} onChange={()=>toggleNoPo(sh)} />
                    ไม่เปิด PO ร้านนี้
                  </label>
                  <select className="shop-deliv" value={(job.shop_delivery||{})[sh]||'ส่ง'} onChange={e=>set('shop_delivery',{...(job.shop_delivery||{}),[sh]:e.target.value})}>
                    <option value="ส่ง">🚚 ร้านจัดส่ง</option>
                    <option value="รับเอง">🏃 ไปรับเอง</option>
                  </select>
                  <div className="shop-eta">
                    <label>📦 {((job.shop_delivery||{})[sh]==='รับเอง')?'วันเข้ารับ':'วันส่งของ'}ร้านนี้</label>
                    <input type="date" value={(job.shop_eta||{})[sh]||''} onChange={e=>set('shop_eta',{...(job.shop_eta||{}),[sh]:e.target.value})} />
                  </div>
                </div>
                {isNoPo(sh)
                  ? <p className="hint" style={{margin:0}}>ร้านนี้ไม่ต้องออก PO — ยังระบุวันส่ง + แจ้งไลน์ได้ปกติ</p>
                  : (
                <div className="grid2">
                  <Field label="ชื่อเต็มบริษัทผู้ขาย"><input value={vd.full_name||''} onChange={e=>setVendorField(sh,'full_name',e.target.value)} placeholder="เช่น บริษัท วีระพานิช เชียงใหม่ จำกัด" /></Field>
                  <Field label="สาขา"><input value={vd.branch||''} onChange={e=>setVendorField(sh,'branch',e.target.value)} placeholder="สำนักงานใหญ่" /></Field>
                  <Field label="ที่อยู่"><input value={vd.address||''} onChange={e=>setVendorField(sh,'address',e.target.value)} placeholder="เลขที่ หมู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" /></Field>
                  <Field label="เลขผู้เสียภาษี"><input value={vd.tax_id||''} onChange={e=>setVendorField(sh,'tax_id',e.target.value)} placeholder="0505XXXXXXXXX" /></Field>
                </div>
                  )}
              </div>
            )
          })}
          <p className="hint" style={{marginTop:4,marginBottom:10}}>กรอกครั้งแรกครั้งเดียว — ระบบจดจำแต่ละร้านไว้ ใช้งานครั้งหน้าขึ้นเองอัตโนมัติ</p>
          {job.id && poShopsActive.length > 0
            ? <button className="btn ghost" onClick={()=>onOpenPO(job, items)}>🖨️ พิมพ์ PO{poShopsActive.length>1?' (เลือกร้าน)':''}</button>
            : job.id && <p className="hint" style={{margin:0}}>ทุกร้านตั้งเป็น "ไม่เปิด PO" — ไม่มีเอกสารต้องพิมพ์</p>}
        </div>
      )}

      <p style={{fontSize:18,fontWeight:600,marginTop:16}}>ยอดรวม {fmt(total)} ฿</p>

      <div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap'}}>
        <button className="btn" onClick={doSave} disabled={saving}>{saving?'กำลังบันทึก…':'บันทึกงาน'}</button>
        {job.id && <button className="btn ghost" onClick={()=>onOpenPO(job, items)}>🧾 พิมพ์ PO</button>}
        {job.id && <button className="btn ghost" style={{color:'var(--danger)',borderColor:'#e6c9c9'}} onClick={doDelete}>ลบงาน</button>}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div><label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:5,color:'var(--muted)'}}>{label}</label>{children}</div>
}
