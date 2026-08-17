import { useState } from 'react'
import JobList from './JobList.jsx'
import JobEdit from './JobEdit.jsx'
import PODoc from './PODoc.jsx'

export default function App() {
  const [view, setView] = useState({ page: 'list' })
  const [poCtx, setPoCtx] = useState(null)
  const [poPick, setPoPick] = useState(null)

  if (view.page === 'edit') {
    return <JobEdit
      jobId={view.jobId}
      onBack={() => setView({ page: 'list', ts: Date.now() })}
      onOpenPO={(job, items, shops) => { setPoCtx({ job, items, shops }); setPoPick(true) }}
    />
  }
  if (view.page === 'po' && poCtx) {
    return <PODoc {...poCtx} mode={view.mode} onClose={() => setView({ page: 'edit', jobId: poCtx.job.id })} />
  }

  return (
    <>
      <JobList key={view.ts || 0} onOpen={(id) => setView({ page: 'edit', jobId: id })} />
      {poPick && poCtx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setPoPick(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 320, width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 14 }}>เลือกเอกสาร</h3>
            <button className="btn" style={{ width: '100%', marginBottom: 8 }} onClick={() => { setPoPick(false); setView({ page: 'po', mode: 'pr' }) }}>📄 ใบขอซื้อ (ขออนุมัติ)</button>
            <button className="btn" style={{ width: '100%' }} onClick={() => { setPoPick(false); setView({ page: 'po', mode: 'po' }) }}>🧾 ใบสั่งซื้อ PO (ส่งร้าน)</button>
          </div>
        </div>
      )}
    </>
  )
}
