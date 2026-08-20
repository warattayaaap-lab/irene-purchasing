import { useState } from 'react'
import { supabase } from './supabase.js'
import JobList from './JobList.jsx'
import JobEdit from './JobEdit.jsx'
import PODoc from './PODoc.jsx'
import PriceSearch from './PriceSearch.jsx'
import ItemDetail from './ItemDetail.jsx'

export default function App() {
  const [view, setView] = useState({ page: 'list' })
  const [poCtx, setPoCtx] = useState(null)
  const [itemCtx, setItemCtx] = useState(null)

  if (view.page === 'edit')
    return <JobEdit jobId={view.jobId} onBack={() => setView({ page: 'list', ts: Date.now() })}
      onOpenPO={(job, items) => { setPoCtx({ job, items }); setView({ page: 'po' }) }} />

  if (view.page === 'po' && poCtx)
    return <PODoc {...poCtx} onClose={() => setView({ page: 'edit', jobId: poCtx.job.id })} />

  if (view.page === 'price') return <PriceSearch onBack={() => setView({ page: 'list', ts: Date.now() })}
    onOpenItem={(name, aliases) => { setItemCtx({ name, aliases }); setView({ page: 'item' }) }} />

  if (view.page === 'item' && itemCtx) return <ItemDetail itemName={itemCtx.name} aliases={itemCtx.aliases}
    onBack={() => setView({ page: 'price' })}
    onOpenJob={async (jobNo) => {
      const { data } = await supabase.from('jobs').select('id').eq('job_no', jobNo).single()
      if (data) setView({ page: 'edit', jobId: data.id })
    }} />

  return <JobList key={view.ts || 0}
    onOpen={(id) => setView({ page: 'edit', jobId: id })}
    onPrice={() => setView({ page: 'price' })}
  />
}
