import { useState, useEffect } from 'react'
import { loadSettings, saveSetting, loadRequesters } from './lib.js'

// หน้าตั้งค่า: เลือกคนจัดซื้อที่จะ tag ในไลน์เมื่อมีคำขอใหม่
export default function Settings({ onBack }) {
  const [people, setPeople] = useState([])       // คนที่เคยส่งฟอร์ม [{id,name}]
  const [selectedKeys, setSelectedKeys] = useState([]) // key(ชื่อ) ที่เลือก
  const [hidden, setHidden] = useState([])        // id ที่ซ่อน (คนออกแล้ว)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [cfg, list] = await Promise.all([loadSettings(), loadRequesters()])
    // กรองคนที่ไม่มี id ออก (tag ไม่ได้อยู่แล้ว)
    const valid = list.filter(p => p.id && p.id.trim())
    setPeople(valid)
    let tags = []
    try { tags = JSON.parse(cfg.buyer_tags || '[]') } catch { tags = [] }
    // จับคู่ tag เดิมกับ key(ชื่อ) ปัจจุบัน
    const tagNames = tags.map(t => t.name)
    setSelectedKeys(valid.filter(p => tagNames.includes(p.name)).map(p => p.key))
    let hid = []
    try { hid = JSON.parse(cfg.hidden_people || '[]') } catch { hid = [] }
    setHidden(hid)
    setLoading(false)
  }

  // toggle ตาม id เดียว (กันชนกัน)
  function toggle(key) {
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
    setSaved(false)
  }

  // ซ่อนคนที่ออกแล้ว (ไม่ลบข้อมูลงานเก่า แค่ไม่โชว์ในรายการเลือก)
  async function hidePerson(id, name) {
    if (!confirm('ซ่อน "' + name + '" ออกจากรายการ?\n(งานเก่ายังอยู่ครบ แค่ไม่โชว์ให้เลือก tag)')) return
    const newHidden = [...hidden, name]
    setHidden(newHidden)
    setSelectedKeys(prev => prev.filter(k => k !== name))
    await saveSetting('hidden_people', JSON.stringify(newHidden))
    setSaved(false)
  }
  async function unhideAll() {
    setHidden([])
    await saveSetting('hidden_people', '[]')
  }

  async function save() {
    const tags = people.filter(p => selectedKeys.includes(p.key)).map(p => ({ id: p.id, name: p.name }))
    await saveSetting('buyer_tags', JSON.stringify(tags))
    setSaved(true)
  }

  const visible = people.filter(p => !hidden.includes(p.name))

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
          visible.length === 0 ? <p className="empty">ยังไม่มีรายชื่อ (ต้องมีคนเคยส่งฟอร์มก่อน)</p> : (
            <>
              <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                {visible.map(p => (
                  <div key={p.key} className={'tag-pick'+(selectedKeys.includes(p.key)?' on':'')}>
                    <label style={{display:'flex',alignItems:'center',gap:10,flex:1,cursor:'pointer'}}>
                      <input type="checkbox" checked={selectedKeys.includes(p.key)} onChange={()=>toggle(p.key)} />
                      <b>{p.name}</b>
                    </label>
                    <button className="hide-btn" onClick={()=>hidePerson(p.id, p.name)} title="ซ่อน (คนออกแล้ว)">ซ่อน</button>
                  </div>
                ))}
              </div>
              <button className="btn" onClick={save}>บันทึกการตั้งค่า</button>
              {saved && <span style={{marginLeft:12,color:'var(--accent)'}}>✓ บันทึกแล้ว</span>}
              <p className="hint" style={{marginTop:12}}>เลือกได้หลายคน — ทุกคนที่เลือกจะถูก tag พร้อมกันเมื่อมีคำขอใหม่</p>
              {hidden.length > 0 && (
                <p className="hint" style={{marginTop:4}}>ซ่อนอยู่ {hidden.length} คน · <span style={{color:'var(--accent)',cursor:'pointer'}} onClick={unhideAll}>แสดงทั้งหมดคืน</span></p>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}
