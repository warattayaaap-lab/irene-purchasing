import { useState, useEffect } from 'react'
import { loadSettings, saveSetting, loadRequesters } from './lib.js'

// หน้าตั้งค่า: เลือกคนจัดซื้อที่จะ tag ในไลน์เมื่อมีคำขอใหม่
export default function Settings({ onBack }) {
  const [people, setPeople] = useState([])       // คนที่เคยส่งฟอร์ม [{id,name}]
  const [selected, setSelected] = useState([])   // id ที่เลือกให้ tag
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [cfg, list] = await Promise.all([loadSettings(), loadRequesters()])
    setPeople(list)
    // buyer_tags เก็บเป็น JSON: [{id,name}]
    let tags = []
    try { tags = JSON.parse(cfg.buyer_tags || '[]') } catch { tags = [] }
    setSelected(tags.map(t => t.id))
    setLoading(false)
  }

  function toggle(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    setSaved(false)
  }

  async function save() {
    const tags = people.filter(p => selected.includes(p.id)).map(p => ({ id: p.id, name: p.name }))
    await saveSetting('buyer_tags', JSON.stringify(tags))
    setSaved(true)
  }

  return (
    <div className="wrap">
      <div className="top">
        <button className="btn ghost" onClick={onBack}>← กลับ</button>
        <h1 style={{fontSize:18}}>ตั้งค่า</h1>
      </div>

      <div className="card-box">
        <div className="box-title">คนจัดซื้อที่จะแจ้งเตือน (tag) ในไลน์
          <span className="hint"> — เมื่อมีคำขอซื้อใหม่จากหน้างาน จะ tag คนที่เลือกไว้</span>
        </div>

        {loading ? <p className="loading">กำลังโหลด…</p> : (
          people.length === 0 ? <p className="empty">ยังไม่มีรายชื่อ (ต้องมีคนเคยส่งฟอร์มก่อน)</p> : (
            <>
              <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                {people.map(p => (
                  <label key={p.id} className={'tag-pick'+(selected.includes(p.id)?' on':'')}>
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggle(p.id)} />
                    <b>{p.name}</b>
                  </label>
                ))}
              </div>
              <button className="btn" onClick={save}>บันทึกการตั้งค่า</button>
              {saved && <span style={{marginLeft:12,color:'var(--accent)'}}>✓ บันทึกแล้ว</span>}
              <p className="hint" style={{marginTop:12}}>เลือกได้หลายคน — ทุกคนที่เลือกจะถูก tag พร้อมกันเมื่อมีคำขอใหม่</p>
            </>
          )
        )}
      </div>
    </div>
  )
}
