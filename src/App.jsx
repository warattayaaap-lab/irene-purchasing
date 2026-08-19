import { useState } from 'react'
import JobList from './JobList.jsx'
import JobEdit from './JobEdit.jsx'
import PODoc from './PODoc.jsx'
import PriceSearch from './PriceSearch.jsx'
import MonthSummary from './MonthSummary.jsx'

export default function App() {
  const [view, setView] = useState({ page: 'list' })
  const [poCtx, setPoCtx] = useState(null)

  if (view.page === 'edit')
    return <JobEdit jobId={view.jobId} onBack={() => setView({ page: 'list', ts: Date.now() })}
      onOpenPO={(job, items) => { setPoCtx({ job, items }); setView({ page: 'po' }) }} />

  if (view.page === 'po' && poCtx)
    return <PODoc {...poCtx} onClose={() => setView({ page: 'edit', jobId: poCtx.job.id })} />

  if (view.page === 'price') return <PriceSearch onBack={() => setView({ page: 'list', ts: Date.now() })} />
  if (view.page === 'month') return <MonthSummary onBack={() => setView({ page: 'list', ts: Date.now() })} onOpen={(id)=>setView({page:'edit',jobId:id})} />

  return <JobList key={view.ts || 0}
    onOpen={(id) => setView({ page: 'edit', jobId: id })}
    onPrice={() => setView({ page: 'price' })}
    onMonth={() => setView({ page: 'month' })}
  />
}
