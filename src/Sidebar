// เมนูซ้าย — ใช้ห่อหน้า list / price / settings
export default function Sidebar({ active, onNav }) {
  const items = [
    { key: 'list', icon: '📋', label: 'งานจัดซื้อ' },
    { key: 'price', icon: '🔍', label: 'ค้นราคา' },
    { key: 'backup', icon: '💾', label: 'สำรองข้อมูล' },
  ]
  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-logo">🏪</span>
        <span className="sidebar-title">จัดซื้อ</span>
      </div>
      <nav className="sidebar-nav">
        {items.map(it => (
          <button key={it.key} className={'sidebar-item' + (active === it.key ? ' on' : '')} onClick={() => onNav(it.key)}>
            <span className="sidebar-icon">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button className={'sidebar-item' + (active === 'settings' ? ' on' : '')} onClick={() => onNav('settings')}>
          <span className="sidebar-icon">⚙️</span>
          <span>ตั้งค่า</span>
        </button>
      </div>
    </div>
  )
}
