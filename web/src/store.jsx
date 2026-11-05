import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { api, getApiBase, getToken, setToken } from './api.js';
import { applyDir, getLang, setLang as saveLang, translateKey } from './i18n.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [token, setTok] = useState(getToken());
  const [me, setMe] = useState(null);
  const [wallet, setWallet] = useState({ coins: 0, diamonds: 0 });
  const [config, setConfig] = useState({});
  const [toasts, setToasts] = useState([]);
  const [socket, setSocket] = useState(null);
  const [globalBanner, setGlobalBanner] = useState(null);
  const bannerTimer = useRef();
  const [lang, setLangState] = useState(getLang() || 'en');
  const [lowData, setLowDataState] = useState(() => { try { return localStorage.getItem('liveapp_lowdata') === '1'; } catch { return false; } });
  const [liveCheck, setLiveCheck] = useState(null);
  const nav = useNavigate();
  const setLang = useCallback((l) => { saveLang(l || 'en'); setLangState(l || 'en'); }, []);
  const setLowData = useCallback((v) => { try { localStorage.setItem('liveapp_lowdata', v ? '1' : '0'); } catch { /* ignore */ } setLowDataState(v); }, []);
  useEffect(() => { applyDir(lang); }, [lang]);

  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const d = await api('/me');
      setMe(d);
      setWallet(d.wallet);
      if (!localStorage.getItem('liveapp_lang') && d.user.language) {
        setLang(['hi', 'en', 'ar'].includes(d.user.language) ? d.user.language : 'en');
      }
    } catch { /* handled by api */ }
  }, [setLang]);

  const login = useCallback((t) => { setToken(t); setTok(t); }, []);
  const logout = useCallback(() => { setToken(null); setTok(null); setMe(null); }, []);

  useEffect(() => { api('/config').then(setConfig).catch(() => {}); }, []);
  useEffect(() => {
    const h = () => logout();
    window.addEventListener('liveapp:logout', h);
    const b = () => nav('/banned', { replace: true });
    window.addEventListener('liveapp:banned', b);
    return () => { window.removeEventListener('liveapp:logout', h); window.removeEventListener('liveapp:banned', b); };
  }, [logout, nav]);

  useEffect(() => {
    if (!token) return undefined;
    refresh();
    const s = io(getApiBase() || undefined, { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('notify', (n) => toast(n.text));
    s.on('banned', () => { toast('Your account has been suspended', 'error'); nav('/banned', { replace: true }); });
    s.on('livecheck', (c) => setLiveCheck({ ...c, until: Date.now() + c.seconds * 1000 }));
    s.on('banner', (b) => {
      setGlobalBanner(b);
      clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setGlobalBanner(null), 7000);
    });
    setSocket(s);
    return () => { s.disconnect(); setSocket(null); };
  }, [token, refresh, toast, logout, nav]);

  const answerCheck = useCallback(() => {
    if (liveCheck) socket?.emit('livecheck:ok', { id: liveCheck.id });
    setLiveCheck(null);
  }, [liveCheck, socket]);
  useEffect(() => {
    if (!liveCheck) return undefined;
    const t = setTimeout(() => setLiveCheck(null), Math.max(0, liveCheck.until - Date.now()));
    return () => clearTimeout(t);
  }, [liveCheck]);

  const value = useMemo(() => ({ token, me, wallet, setWallet, refresh, login, logout, socket, toast, config, globalBanner, lang, setLang, lowData, setLowData }),
    [token, me, wallet, refresh, login, logout, socket, toast, config, globalBanner, lang, setLang, lowData, setLowData]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
      {liveCheck && (
        <div className="modal-wrap livecheck">
          <div className="modal">
            <h3>{translateKey(lang, 'liveCheck')}</h3>
            <p className="muted">{liveCheck.text}</p>
            <p className="small muted">{translateKey(lang, 'liveCheckNote', { s: liveCheck.seconds })}</p>
            <button className="btn primary big" onClick={answerCheck}>{translateKey(lang, 'liveCheckBtn')}</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
