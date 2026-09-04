import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase.js'
import JobList from './JobList.jsx'
import JobEdit from './JobEdit.jsx'
import PODoc from './PODoc.jsx'
import PriceSearch from './PriceSearch.jsx'
import ItemDetail from './ItemDetail.jsx'
import Settings from './Settings.jsx'
import Sidebar from './Sidebar.jsx'

export default function App() {
  const [view, setViewRaw] = useState({ page: 'list' })
  const [poCtx, setPoCtx] = useState(null)
  const [itemCtx, setItemCtx] = useState(null)
  const [priceQ, setPriceQ] = useState('')
  const [backupSignal, setBackupSignal] = useState(0)  // ส่งสัญญาณให้ JobList สำรอง

  const skipPush = useRef(false)

  useEffect(() => {
    window.history.replaceState({ view: { page: 'list' } }, '')
    const onPop = (e) => {
      const v = (e.state && e.state.view) ? e.state.view : { page: 'list' }
      skipPush.current = true
      setViewRaw(v)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function setView(v) {
    if (skipPush.current) { skipPush.current = false; setViewRaw(v); return }
    window.history.pushState({ view: v }, '')
    setViewRaw(v)
  }

  // เมนูซ้ายกด: list/price/settings เปลี่ยนหน้า, backup ยิงสัญญาณ
  function handleNav(key) {
    if (key === 'backup') { setBackupSignal(s => s + 1); return }
    if (key === 'list') setView({ page: 'list', ts: Date.now() })
    else setView({ page: key })
  }

  // หน้าที่ใช้พื้นที่เต็มจอ (ไม่มีเมนูซ้าย): edit / po / item
  if (view.page === 'edit')
    return <JobEdit jobId={view.jobId} onBack={() => setView({ page: 'list', ts: Date.now() })}
      onOpenPO={(job, items) => { setPoCtx({ job, items }); setView({ page: 'po' }) }} />

  if (view.page === 'po' && poCtx)
    return <PODoc {...poCtx} onClose={() => setView({ page: 'edit', jobId: poCtx.job.id })} />
  if (view.page === 'po' && !poCtx) { setViewRaw({ page: 'list' }); return null }

  if (view.page === 'item' && itemCtx) return <ItemDetail itemName={itemCtx.name} aliases={itemCtx.aliases}
    onBack={() => setView({ page: 'price' })}
    onOpenJob={async (jobNo) => {
      const { data } = await supabase.from('jobs').select('id').eq('job_no', jobNo).single()
      if (data) setView({ page: 'edit', jobId: data.id })
    }} />
  if (view.page === 'item' && !itemCtx) { setViewRaw({ page: 'price' }); return null }

  // หน้าที่มีเมนูซ้าย: list / price / settings
  const activeKey = view.page === 'list' ? 'list' : view.page
  return (
    <div className="app-shell">
      <Sidebar active={activeKey} onNav={handleNav} />
      <div className="app-main">
        {view.page === 'settings' && <Settings onBack={() => setView({ page: 'list', ts: Date.now() })} />}
        {view.page === 'price' && <PriceSearch q={priceQ} setQ={setPriceQ}
          onBack={() => setView({ page: 'list', ts: Date.now() })}
          onOpenItem={(name, aliases) => { setItemCtx({ name, aliases }); setView({ page: 'item' }) }} />}
        {view.page === 'list' && <JobList key={view.ts || 0}
          backupSignal={backupSignal}
          onOpen={(id) => setView({ page: 'edit', jobId: id })}
          onPrice={() => setView({ page: 'price' })}
          onSettings={() => setView({ page: 'settings' })}
        />}
      </div>
    </div>
  )
}
