import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase.js'
import JobList from './JobList.jsx'
import JobEdit from './JobEdit.jsx'
import PODoc from './PODoc.jsx'
import PriceSearch from './PriceSearch.jsx'
import ItemDetail from './ItemDetail.jsx'
import Settings from './Settings.jsx'

export default function App() {
  const [view, setViewRaw] = useState({ page: 'list' })
  const [poCtx, setPoCtx] = useState(null)
  const [itemCtx, setItemCtx] = useState(null)
  const [priceQ, setPriceQ] = useState('')

  // กันไม่ให้ push ซ้ำตอนกำลังย้อน history (popstate)
  const skipPush = useRef(false)

  // ตั้ง state แรกใน history ตอนเปิดแอป
  useEffect(() => {
    window.history.replaceState({ view: { page: 'list' } }, '')
    const onPop = (e) => {
      // ผู้ใช้กด back/forward — เอา view จาก history มาแสดง (ไม่ push ซ้ำ)
      const v = (e.state && e.state.view) ? e.state.view : { page: 'list' }
      skipPush.current = true
      setViewRaw(v)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // setView ที่ push เข้า browser history ด้วย (เว้นตอนย้อนจาก popstate)
  function setView(v) {
    if (skipPush.current) { skipPush.current = false; setViewRaw(v); return }
    window.history.pushState({ view: v }, '')
    setViewRaw(v)
  }

  if (view.page === 'edit')
    return <JobEdit jobId={view.jobId} onBack={() => setView({ page: 'list', ts: Date.now() })}
      onOpenPO={(job, items) => { setPoCtx({ job, items }); setView({ page: 'po' }) }} />

  if (view.page === 'po' && poCtx)
    return <PODoc {...poCtx} onClose={() => setView({ page: 'edit', jobId: poCtx.job.id })} />
  if (view.page === 'po' && !poCtx) { setViewRaw({ page: 'list' }); return null }

  if (view.page === 'settings') return <Settings onBack={() => setView({ page: 'list', ts: Date.now() })} />

  if (view.page === 'price') return <PriceSearch q={priceQ} setQ={setPriceQ}
    onBack={() => setView({ page: 'list', ts: Date.now() })}
    onOpenItem={(name, aliases) => { setItemCtx({ name, aliases }); setView({ page: 'item' }) }} />

  if (view.page === 'item' && itemCtx) return <ItemDetail itemName={itemCtx.name} aliases={itemCtx.aliases}
    onBack={() => setView({ page: 'price' })}
    onOpenJob={async (jobNo) => {
      const { data } = await supabase.from('jobs').select('id').eq('job_no', jobNo).single()
      if (data) setView({ page: 'edit', jobId: data.id })
    }} />
  if (view.page === 'item' && !itemCtx) { setViewRaw({ page: 'price' }); return null }

  return <JobList key={view.ts || 0}
    onOpen={(id) => setView({ page: 'edit', jobId: id })}
    onPrice={() => setView({ page: 'price' })}
    onSettings={() => setView({ page: 'settings' })}
  />
}
