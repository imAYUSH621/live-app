import { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { session } from './lib/api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { Users, Hosts, Agencies } from './pages/People.jsx';
import Live from './pages/Live.jsx';
import { Reports, Risk, MomentsMod, BannedDevices, Appeals } from './pages/Moderation.jsx';
import { Gifts, StoreAdmin, Banners, Events, Tasks, Cms, HostLevels, Notifications, Families, Rankings } from './pages/Content.jsx';
import { Orders, Economy, Settlement, Sellers, Ledger, Analytics } from './pages/Finance.jsx';
import { Staff, Audit, Settings, Support, Account } from './pages/System.jsx';
import { AgencyHome, AgencyHosts, AgencyApplications, AgencyMoney, AgencyMore, SellerHome } from './pages/Partners.jsx';

// [path, label, module needed, element, group]
const ADMIN_NAV = [
  ['/', 'Dashboard', 'dashboard', <Dashboard />, 'Overview'],
  ['/analytics', 'Analytics', 'analytics', <Analytics />, 'Overview'],
  ['/live', 'Live monitoring', 'live', <Live />, 'Moderation'],
  ['/reports', 'Reports', 'reports', <Reports />, 'Moderation'],
  ['/risk', 'Risk & fraud', 'risk', <Risk />, 'Moderation'],
  ['/moments', 'Moments', 'moments', <MomentsMod />, 'Moderation'],
  ['/banned', 'Banned devices', 'users.ban', <BannedDevices />, 'Moderation'],
  ['/appeals', 'Appeals', 'users.ban', <Appeals />, 'Moderation'],
  ['/users', 'Users', 'users.view', <Users />, 'People'],
  ['/hosts', 'Hosts', 'hosts', <Hosts />, 'People'],
  ['/host-levels', 'Host levels', 'hosts', <HostLevels />, 'People'],
  ['/agencies', 'Agencies', 'agencies', <Agencies />, 'People'],
  ['/families', 'Families', 'families', <Families />, 'People'],
  ['/orders', 'Recharge orders', 'finance', <Orders />, 'Money'],
  ['/settlement', 'Salaries & commissions', 'settlement', <Settlement />, 'Money'],
  ['/sellers', 'Coin sellers', 'sellers', <Sellers />, 'Money'],
  ['/economy', 'Economy & pricing', 'economy', <Economy />, 'Money'],
  ['/ledger', 'Ledger & P&L', 'finance', <Ledger />, 'Money'],
  ['/gifts', 'Gifts', 'gifts', <Gifts />, 'Content'],
  ['/store', 'Store, VIP, Noble', 'store', <StoreAdmin />, 'Content'],
  ['/events', 'Events', 'events', <Events />, 'Content'],
  ['/banners', 'Banners', 'banners', <Banners />, 'Content'],
  ['/tasks', 'Daily tasks', 'tasks', <Tasks />, 'Content'],
  ['/rankings', 'Rankings', 'rankings', <Rankings />, 'Content'],
  ['/notifications', 'Notifications', 'notifications', <Notifications />, 'Content'],
  ['/cms', 'Pages & policies', 'cms', <Cms />, 'Content'],
  ['/support', 'Support tickets', 'support', <Support />, 'System'],
  ['/staff', 'Staff & roles', 'staff', <Staff />, 'System'],
  ['/settings', 'App settings', 'settings', <Settings />, 'System'],
  ['/audit', 'Audit log', 'audit', <Audit />, 'System'],
  ['/account', 'My account', null, <Account />, 'System'],
];

const AGENCY_NAV = [
  ['/', 'Overview', null, <AgencyHome />, 'Agency'],
  ['/hosts', 'My hosts', null, <AgencyHosts />, 'Agency'],
  ['/applications', 'Applications', null, <AgencyApplications />, 'Agency'],
  ['/money', 'Commission', null, <AgencyMoney />, 'Agency'],
  ['/more', 'Sub-agents & help', null, <AgencyMore />, 'Agency'],
];

const SELLER_NAV = [['/', 'Send coins', null, <SellerHome />, 'Seller']];

function can(modules, m) {
  if (!m) return true;
  if (!modules) return false;
  if (modules.includes('*') || modules.includes(m)) return true;
  return modules.includes(m.split('.')[0]);
}

export default function App() {
  const [s, setS] = useState(session.get());
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  if (!s) return <Login onIn={setS} />;
  const nav = (s.kind === 'agency' ? AGENCY_NAV : s.kind === 'seller' ? SELLER_NAV : ADMIN_NAV).filter((n) => can(s.modules, n[2]) || s.kind !== 'admin');
  const groups = [...new Set(nav.map((n) => n[4]))];
  return (
    <div className="layout">
      <aside className={`side ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">Control Room<small>{s.name} · {s.kind === 'admin' ? s.role.replace('_', ' ') : s.kind}</small></div>
        {groups.map((g) => (
          <div key={g}>
            <div className="group">{g}</div>
            {nav.filter((n) => n[4] === g).map(([path, label]) => <NavLink key={path} to={path} end={path === '/'}>{label}</NavLink>)}
          </div>
        ))}
        <div className="group">Session</div>
        <a href="/" onClick={(e) => { e.preventDefault(); session.set(null); setS(null); }}>Sign out</a>
      </aside>
      <main className="main" key={loc.pathname}>
        <button className="btn burger" onClick={() => setOpen(true)} style={{ marginBottom: 12 }}>☰ Menu</button>
        <Routes>
          {nav.map(([path, , , el]) => <Route key={path} path={path} element={el} />)}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
