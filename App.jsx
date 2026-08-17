import { useState } from 'react'
import JobList from './JobList.jsx'
import JobDetail from './JobDetail.jsx'

export default function App() {
  const [view, setView] = useState({ page: 'list', jobId: null })

  if (view.page === 'detail') {
    return <JobDetail jobId={view.jobId} onBack={() => setView({ page: 'list' })} />
  }
  return <JobList onOpen={(id) => {
    if (id === 'new') { alert('หน้าเพิ่มงานใหม่จะทำในเฟสถัดไป'); return }
    setView({ page: 'detail', jobId: id })
  }} />
}
