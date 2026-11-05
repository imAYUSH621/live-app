import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './store.jsx';
import './styles.css';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import GoLive from './pages/GoLive.jsx';
import Me from './pages/Me.jsx';
import Recharge from './pages/Recharge.jsx';
import Store from './pages/Store.jsx';
import HostCenter from './pages/HostCenter.jsx';
import Agency from './pages/Agency.jsx';
import Messages, { Chat } from './pages/Messages.jsx';
import Profile from './pages/Profile.jsx';
import Rank from './pages/Rank.jsx';
import EditProfile from './pages/EditProfile.jsx';
import Room from './live/Room.jsx';
import Safety from './pages/Safety.jsx';
import Verify from './pages/Verify.jsx';
import Banned from './pages/Banned.jsx';
import GlobalBanner from './live/GlobalBanner.jsx';
import DesktopNav from './components/DesktopNav.jsx';
import DesktopDock from './components/DesktopDock.jsx';

function Guard({ children }) {
  const { token } = useApp();
  const loc = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

function Shell() {
  return (
    <div className="desktop-root-container">
      <DesktopNav />
      <div className="desktop-stage-layout">
        <DesktopDock />
        <main className="mobile-phone-viewport-wrapper">
          <div className="app">
            <GlobalBanner />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Guard><Home /></Guard>} />
              <Route path="/live/:id" element={<Guard><Room /></Guard>} />
              <Route path="/golive" element={<Guard><GoLive /></Guard>} />
              <Route path="/me" element={<Guard><Me /></Guard>} />
              <Route path="/me/edit" element={<Guard><EditProfile /></Guard>} />
              <Route path="/recharge" element={<Guard><Recharge /></Guard>} />
              <Route path="/store" element={<Guard><Store /></Guard>} />
              <Route path="/vip" element={<Guard><Store vipFirst /></Guard>} />
              <Route path="/host" element={<Guard><HostCenter /></Guard>} />
              <Route path="/agency" element={<Guard><Agency /></Guard>} />
              <Route path="/messages" element={<Guard><Messages /></Guard>} />
              <Route path="/chat/:userId" element={<Guard><Chat /></Guard>} />
              <Route path="/user/:id" element={<Guard><Profile /></Guard>} />
              <Route path="/rank" element={<Guard><Rank /></Guard>} />
              <Route path="/safety" element={<Guard><Safety /></Guard>} />
              <Route path="/verify" element={<Guard><Verify /></Guard>} />
              <Route path="/banned" element={<Guard><Banned /></Guard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
