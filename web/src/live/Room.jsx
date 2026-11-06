import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmt, assetUrl } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, Icon, LevelBadge, Sheet, Spinner, GemIcon, VerifiedBadge } from '../components/ui.jsx';
import { useT } from '../i18n.js';
import { useLiveKit } from './useLiveKit.js';
import { canFallbackToAudio } from './mediaError.js';
import { EntryLayer, GiftLayer, LikesLayer } from './Layers.jsx';
import GiftPanel from './GiftPanel.jsx';
import { PkBar, PkInviteModal, PkInviteSheet, PkOpponent, PkResult } from './Pk.jsx';

const REPORT_REASONS = ['Nudity or sexual content', 'Violence or threats', 'Hate speech or abuse', 'Underage user', 'Scam or spam', 'Other'];

// Server seats use `seat` for the number; server gifts use `price`.
const normSeat = (st) => ({ ...st, no: st.no ?? st.seat });
const giftTier = (price) => (price < 100 ? 'small' : price < 1000 ? 'medium' : price < 10000 ? 'large' : 'super');

export default function Room() {
  const { id } = useParams();
  const { socket, me, toast, lang, lowData } = useApp();
  const t = useT();
  const [translateOn, setTranslateOn] = useState(false);
  const [tr, setTr] = useState({}); // message id -> translated text
  const [audioOnly, setAudioOnly] = useState(false);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [chat, setChat] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [viewerList, setViewerList] = useState([]);
  const [top, setTop] = useState([]);
  const [seats, setSeats] = useState([]);
  const [pk, setPk] = useState(null);
  const [pkPeople, setPkPeople] = useState(null);
  const [pkResult, setPkResult] = useState(null);
  const [pkInvite, setPkInvite] = useState(null);
  const [diamonds, setDiamonds] = useState(0);
  const [following, setFollowing] = useState(false);
  const [ended, setEnded] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sheet, setSheet] = useState(null); // 'gift' | 'viewers' | 'top' | 'more' | 'pk' | 'report' | {user}
  const [text, setText] = useState('');
  const [beauty, setBeauty] = useState(true);
  const [effectsOn, setEffectsOn] = useState(true);
  const videoEl = useRef(null);
  const giftRef = useRef();
  const entryRef = useRef();
  const likeRef = useRef();
  const chatEnd = useRef();
  const meId = me?.user?.id;

  // 1. join over REST (gets the Agora token)
  useEffect(() => {
    let alive = true;
    api(`/live/${id}/join`, { method: 'POST' }).then((d) => {
      if (!alive) return;
      setInfo(d);
      setFollowing(d.state?.following ?? d.following);
      setDiamonds(d.room.diamonds);
      // initial room state comes from the REST join (server ack carries no state)
      const st = d.state || {};
      setViewers(st.viewers || 0);
      setTop(st.top || []);
      setSeats((st.seats || []).map(normSeat));
      if (st.pk && st.pk.status === 'active') {
        setPk(st.pk);
        if (st.pk.host_a) setPkPeople({ a: st.pk.host_a, b: st.pk.host_b });
      }
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id]);

  const isHost = info ? (info.isHost ?? (Number(info.room?.host_id) === Number(me?.user?.id))) : false;
  const rawType = info?.room?.type || 'video';
  const type = (rawType === 'party' || rawType === 'audio') ? 'audio' : 'video';
  const rtc = info ? (info.rtc || { token: info.token, livekit_url: info.livekit_url }) : null;
  const av = useLiveKit(rtc, {
    isHost,
    type,
    hostUid: info?.hostCard?.publicId ? Number(info.hostCard.publicId) : null,
    videoEl,
    lowData,
    audioOnly,
    attempt: mediaAttempt,
    socket,
    roomId: id,
  });

  // 2. realtime room events
  useEffect(() => {
    if (!socket || !info) return undefined;
    const join = () => socket.emit('room:join', { roomId: Number(id) }, (r) => {
      if (r && r.ok === false) setEnded(r.error || 'Unable to join this live');
    });
    join();
    socket.on('connect', join);
    const on = {
      'room:chat': (m) => setChat((c) => [...c.slice(-79), m]),
      'room:system': (m) => setChat((c) => [...c.slice(-79), { id: Math.random(), system: true, text: m.text, level: m.level }]),
      'room:enter': ({ user, viewers: n }) => {
        setViewers(n);
        setViewerList((l) => [user, ...l.filter((u) => u.id !== user.id)].slice(0, 50));
        entryRef.current?.push(user);
      },
      'room:viewers': ({ viewers: n, left }) => { setViewers(n); if (left) setViewerList((l) => l.filter((u) => u.id !== left)); },
      'room:gift': (p) => {
        const ev = {
          id: p.id, qty: p.qty, coins: p.coins,
          sender: p.from, receiver: p.to,
          gift: { ...p.gift, coins: p.gift.price, animUrl: assetUrl(p.gift.anim_url), animType: p.gift.anim_type, tier: giftTier(Number(p.gift.price) || 0) },
        };
        giftRef.current?.push(ev);
        setChat((c) => [...c.slice(-79), { id: p.id, gift: true, user: p.from, text: `sent ${p.gift.name} x${p.qty}`, icon: p.gift.icon }]);
      },
      'room:likes': () => likeRef.current?.burst(1),
      'seat:update': (pl) => setSeats((pl.seats || []).map(normSeat)),
      'pk:start': (p) => { setPk(p); setPkPeople({ a: p.host_a, b: p.host_b }); setPkResult(null); },
      'pk:score': (p) => setPk((cur) => (cur ? { ...cur, ...p } : p)),
      'pk:end': (p) => { setPk(null); setPkResult(p); },
      'pk:invite': (inv) => setPkInvite(inv),
      'pk:declined': () => toast('PK invite declined'),
      'room:ended': () => { if (!isHost) setEnded('This live has ended'); },
      'room:cut': () => { if (!isHost) setEnded('This live was stopped by moderators'); },
      'room:kicked': ({ room_id: rid }) => { if (Number(rid) === Number(id)) { toast('You were removed from this room', 'error'); nav('/'); } },
    };
    for (const [k, fn] of Object.entries(on)) socket.on(k, fn);
    return () => {
      socket.emit('room:leave', { roomId: id });
      socket.off('connect', join);
      for (const [k, fn] of Object.entries(on)) socket.off(k, fn);
    };
  }, [socket, info, id, isHost, nav, toast]);

  // 3. host heartbeat keeps the room alive
  useEffect(() => {
    if (!isHost || summary) return undefined;
    const beat = () => socket?.emit('host:heartbeat', { roomId: Number(id) });
    beat();
    const t = setInterval(beat, 30000);
    return () => clearInterval(t);
  }, [isHost, id, summary]);

  // PK names when we joined mid-battle
  useEffect(() => {
    if (!pk || pkPeople) return;
    if (typeof pk.host_a === 'object' && pk.host_a) { setPkPeople({ a: pk.host_a, b: pk.host_b }); return; }
    Promise.all([api(`/users/${pk.host_a}`), api(`/users/${pk.host_b}`)]).then(([a, b]) => setPkPeople({ a: a.user, b: b.user })).catch(() => { });
  }, [pk, pkPeople]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [chat, tr]);

  // Chat translation: messages written in another script are translated in small batches.
  useEffect(() => {
    if (!translateOn) return undefined;
    const need = chat.filter((m) => !m.system && !m.gift && m.lang && tr[m.id] === undefined && needsTranslation(m.lang, lang));
    if (!need.length) return undefined;
    const timer = setTimeout(async () => {
      try {
        const r = await api('/translate', { method: 'POST', body: { texts: need.map((m) => m.text), to: lang } });
        if (!r.available) { toast('Translation is not switched on for this app yet'); setTranslateOn(false); return; }
        setTr((cur) => { const n = { ...cur }; need.forEach((m, i) => { n[m.id] = r.texts[i] === m.text ? null : r.texts[i]; }); return n; });
      } catch { /* ignore */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [chat, translateOn, lang, tr, toast]);

  // Host app sends a small frame now and then for the moderators' live wall (and AI check when enabled).
  useEffect(() => {
    if (!isHost || type !== 'video' || !info?.snapshotSec) return undefined;
    const grab = () => {
      const v = videoEl.current?.querySelector('video');
      if (!v || !v.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = 360; c.height = Math.round((360 * v.videoHeight) / v.videoWidth);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        if (!b) return;
        const f = new FormData();
        f.append('file', new File([b], 'frame.jpg', { type: 'image/jpeg' }));
        api(`/live/${id}/thumbnail`, { method: 'POST', form: f }).catch(() => { });
      }, 'image/jpeg', 0.7);
    };
    const first = setTimeout(grab, 8000);
    const timer = setInterval(grab, info.snapshotSec * 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [isHost, type, info?.snapshotSec, id]);

  // audio room: start/stop mic when I take or leave a seat
  const mySeat = seats.find((s) => s.user?.id === meId);
  useEffect(() => { if (type === 'audio' && !isHost) av.setSeatMic(!!mySeat).catch(() => { }); }, [type, isHost, !!mySeat]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatPending = useRef(false);
  const composing = useRef(false);
  const sendChat = (e) => {
    e?.preventDefault();
    if (composing.current) return; // Enter confirming an IME candidate must not send
    const msg = text.trim();
    if (!msg || !socket || chatPending.current) return; // no duplicate sends while an ack is pending
    chatPending.current = true;
    let settled = false;
    const ackTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chatPending.current = false;
      toast(t('chatNotSent'), 'error'); // socket dropped: draft is retained for retry
    }, 5000);
    socket.emit('room:chat', { roomId: Number(id), text: msg }, (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(ackTimer);
      chatPending.current = false;
      if (r && r.ok === false) { r.error && toast(r.error, 'error'); return; } // keep the draft on failure
      setText('');
    });
  };
  const like = () => { socket?.emit('room:like', { roomId: Number(id), n: 1 }); likeRef.current?.burst(1); };
  const follow = async () => {
    try { await api(`/users/${info.room.host.id}/follow`, { method: following ? 'DELETE' : 'POST' }); setFollowing(!following); }
    catch (e) { toast(e.message, 'error'); }
  };
  const endLive = async () => {
    if (!window.confirm('End your live?')) return;
    try {
      await api(`/live/${id}/end`, { method: 'POST' });
      const s = await api(`/live/${id}/summary`);
      setSummary({ durationSec: s.seconds ?? 0, peak: s.peak ?? 0, diamonds: s.diamonds ?? 0, newFans: 0 });
    }
    catch (e) { toast(e.message, 'error'); }
  };
  const report = async (reason) => {
    try { await api('/reports', { method: 'POST', body: { target_type: 'room', target_id: id, reason } }); toast(t('thanksReport')); }
    catch (e) { toast(e.message, 'error'); }
    setSheet(null);
  };
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: info.room.title, url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } } catch { /* cancelled */ }
  };
  const takeSeat = (no) => api(`/live/${id}/seats/take`, { method: 'POST', body: { seat: no } }).catch((e) => toast(e.message, 'error'));
  const leaveSeat = () => api(`/live/${id}/seats/leave`, { method: 'POST' }).catch(() => { });
  const seatAdmin = (no, action, userId) => {
    const url = action === 'kick' ? 'remove' : action === 'lock' ? 'lock' : 'mute';
    const body = { seat: no };
    if (url === 'lock') body.locked = true;
    if (url === 'mute') body.muted = true;
    if (url === 'remove') body.user_id = userId;
    api(`/live/${id}/seats/${url}`, { method: 'POST', body }).catch((e) => toast(e.message, 'error'));
  };
  const hostAct = (action, userId) => {
    const path = action === 'kick' ? 'kick' : 'mute';
    api(`/live/${id}/${path}`, { method: 'POST', body: { user_id: userId } })
      .then(() => toast(action === 'kick' ? 'User removed' : 'Done'))
      .catch((e) => toast(e.message, 'error'));
    setSheet(null);
  };

  const host = info?.hostCard;
  const opponent = useMemo(() => {
    if (!pk || !pkPeople) return null;
    return pk.room_a === id ? pkPeople.b : pkPeople.a;
  }, [pk, pkPeople, id]);

  if (error) return <div className="room center"><p>{error}</p><button className="btn" onClick={() => nav('/')}>Back</button></div>;
  if (!info) return <div className="room center"><Spinner /></div>;

  const mainVideo = (
    <>
      <div ref={videoEl} className={`stage-video-box ${isHost && beauty ? 'beauty' : ''}`} />
      {audioOnly && !isHost && type === 'video' && <div className="stage-cover audio-only"><img src={info.room.cover || host?.avatar || '/icon.svg'} alt="" /><span>{t('audioOnly')}</span></div>}
      {!av.hostVideo && type === 'video' && !audioOnly && !av.mediaError && (
        <div className="stage-cover">
          <img src={info.room.cover || host?.avatar || '/icon.svg'} alt="" />
          {!isHost && <span>Connecting to live video...</span>}
          {av.error && !isHost ? <span className="err">{av.error}</span> : null}
        </div>
      )}
      {av.mediaError && isHost && (
        <div className="stage-cover">
          <img src={info.room.cover || host?.avatar || '/icon.svg'} alt="" />
          <div className="media-error">
            <b>{av.mediaError.title}</b>
            <p className="me-hint">{av.mediaError.hint}</p>
            <div className="media-error-actions">
              <button className="btn" onClick={() => setMediaAttempt((a) => a + 1)}>Try again</button>
              {type === 'video' && !audioOnly && canFallbackToAudio(av.mediaError.kind) && (
                <button className="btn ghost" onClick={() => { setAudioOnly(true); setMediaAttempt((a) => a + 1); }}>{t('audioOnly')}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className={`room ${type} ${pk ? 'has-pk' : ''}`}>
      {/* ---------- stage ---------- */}
      {type === 'video' && <div className={`stage ${pk ? 'pk' : ''}`}>{mainVideo}</div>}
      {type === 'video' && pk && <PkOpponent pk={pk} roomId={id} opponent={opponent} livekitUrl={info?.livekit_url} />}
      {type === 'audio' && (
        <div className="audio-stage" style={{ backgroundImage: `url(${info.room.cover || host?.avatar || ''})` }}>
          <div className="audio-host"><Avatar user={host} size={92} /><b>{host?.name}</b><small>Host</small></div>
          <div className="seats">
            {seats.map((s) => (
              <div key={s.no} className={`seat ${s.user ? 'taken' : ''} ${s.locked ? 'locked' : ''}`}
                onClick={() => (s.user ? setSheet({ user: s.user, seat: s.no }) : isHost ? seatAdmin(s.no, 'lock') : !s.locked && takeSeat(s.no))}>
                {s.user ? <Avatar user={s.user} size={56} /> : <div className="seat-empty">{s.locked ? <Icon name="lock" size={20} /> : <Icon name="plus" size={20} />}</div>}
                <span>{s.user ? s.user.name : s.locked ? 'Locked' : `${s.no}`}</span>
                {s.muted && <i className="seat-muted"><Icon name="micOff" size={12} /></i>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="stage-shade" />

      {/* ---------- top bar ---------- */}
      <div className="room-top">
        <div className="host-chip" onClick={() => setSheet({ user: host })}>
          <Avatar user={host} size={36} frame={false} />
          <div className="hc-text"><b>{host?.name} <VerifiedBadge user={host} size={12} /></b><span><GemIcon size={11} /> {fmt(diamonds)}</span></div>
          {!isHost && <button className={`follow-btn ${following ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); follow(); }}>{following ? '✓' : '+ Follow'}</button>}
        </div>
        <div className="viewer-strip" onClick={() => setSheet('viewers')}>
          {viewerList.slice(0, 3).map((u) => <Avatar key={u.id} user={u} size={30} frame={false} />)}
          <span className="viewer-count">{fmt(viewers)}</span>
        </div>
        <button className="icon-btn dark" onClick={() => (isHost ? endLive() : nav(-1))} aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="room-sub">
        <button className="chip" onClick={() => setSheet('top')}><Icon name="crown" size={14} /> {t('topFans')}</button>
        {translateOn && <span className="chip"><Icon name="translate" size={14} /> {t('translated')}</span>}
        <span className="chip muted">ID {host?.publicId}</span>
      </div>
      {pk && <PkBar pk={pk} roomId={id} />}

      {/* ---------- effects ---------- */}
      <LikesLayer ref={likeRef} />
      <EntryLayer ref={entryRef} />
      <GiftLayer ref={giftRef} meId={meId} effectsOn={effectsOn} />
      {pkResult && <PkResult result={pkResult} meHostId={info.room.host.id} onDone={() => setPkResult(null)} />}

      {/* ---------- chat ---------- */}
      <div className="chat-list">
        <div className="chat-notice">{t('welcomeRules')}</div>
        {chat.map((m) => (
          m.system
            ? <div key={m.id} className={`chat-sys ${m.level || ''}`}>{m.text}</div>
            : (
              <div key={m.id} className={`chat-msg ${m.user.bubble ? m.user.bubble.url : ''} ${m.gift ? 'gift' : ''}`} onClick={() => setSheet({ user: m.user })}>
                <LevelBadge level={m.user.level} vip={m.user.vip} />
                <b>{m.user.name}:</b> <span dir="auto">{translateOn && tr[m.id] ? tr[m.id] : m.text}</span>
                {translateOn && tr[m.id] && <small className="orig" dir="auto">{m.text}</small>}
                {m.icon && <img src={m.icon} alt="" />}
              </div>
            )
        ))}
        <div ref={chatEnd} />
      </div>

      {/* ---------- bottom bar ---------- */}
      <div className="room-bottom">
        <form className="say-hi composer" onSubmit={sendChat}>
          <input dir="auto" maxLength={200} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t('sayHi')} enterKeyHint="send" aria-label={t('sayHi')}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={() => (composing.current = false)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || composing.current)) e.preventDefault(); }} />
          {text.trim() ? <button className="composer-send" aria-label={t('send')}><Icon name="send" size={16} /></button> : null}
        </form>
        <div className="room-actions">
        {isHost ? (
          <>
            {type === 'video' && <button className="round-btn" onClick={() => setSheet('pk')} aria-label="PK"><Icon name="vs" /></button>}
            {type === 'video' && <button className={`round-btn ${beauty ? 'on' : ''}`} onClick={() => setBeauty(!beauty)} aria-label="Beauty"><Icon name="beauty" /></button>}
            {type === 'video' && <button className="round-btn" onClick={av.flipCamera} aria-label="Flip camera"><Icon name="flip" /></button>}
            <button className={`round-btn ${av.micOn ? '' : 'off'}`} onClick={av.toggleMic} aria-label="Mic"><Icon name={av.micOn ? 'mic' : 'micOff'} /></button>
          </>
        ) : (
          <>
            {type === 'audio' && mySeat && <button className="round-btn" onClick={leaveSeat} aria-label="Leave seat"><Icon name="micOff" /></button>}
            <button className="round-btn" onClick={share} aria-label="Share"><Icon name="share" /></button>
            <button className="round-btn" onClick={() => setSheet('more')} aria-label="More"><Icon name="more" stroke={3} /></button>
            <button className="round-btn heart" onClick={like} aria-label="Like"><Icon name="heart" fill /></button>
            <button className="round-btn gift" onClick={() => setSheet('gift')} aria-label="Gifts"><Icon name="gift" /></button>
          </>
        )}
        </div>
      </div>

      {/* ---------- sheets ---------- */}
      {!isHost && <GiftPanel open={sheet === 'gift'} onClose={() => setSheet(null)} roomId={id} host={info.room.host} seats={seats} />}
      <Sheet open={sheet === 'viewers'} onClose={() => setSheet(null)} title={`${t('viewers')} (${viewers})`}>
        <div className="list">{viewerList.map((u) => (
          <div key={u.id} className="list-row" onClick={() => setSheet({ user: u })}><Avatar user={u} size={40} /><div className="grow"><b>{u.name}</b><LevelBadge level={u.level} vip={u.vip} /></div></div>
        ))}</div>
      </Sheet>
      <Sheet open={sheet === 'top'} onClose={() => setSheet(null)} title={t('topFans')}>
        <div className="list">{top.length === 0 ? <p className="muted">Send a gift to become the top fan!</p> : top.map((t, i) => (
          <div key={t.user.id} className="list-row"><span className="rank-no">{i + 1}</span><Avatar user={t.user} size={40} /><div className="grow"><b>{t.user.name}</b></div><span className="coins">{fmt(t.coins)}</span></div>
        ))}</div>
      </Sheet>
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={t('more')}>
        <button className="menu-row" onClick={() => { setTranslateOn(!translateOn); setSheet(null); }}><Icon name="translate" /> {translateOn ? t('translateOff') : t('translateOn')}</button>
        {type === 'video' && <button className="menu-row" onClick={() => { setAudioOnly(!audioOnly); setSheet(null); }}><Icon name="mic" /> {audioOnly ? t('videoBack') : t('audioOnly')}</button>}
        <button className="menu-row" onClick={() => setEffectsOn(!effectsOn)}><Icon name="sparkle" /> {effectsOn ? t('effectsOff') : t('effectsOn')}</button>
        <button className="menu-row danger" onClick={() => setSheet('report')}><Icon name="flag" /> {t('report')}</button>
      </Sheet>
      <Sheet open={sheet === 'report'} onClose={() => setSheet(null)} title={t('reportWhy')}>
        {REPORT_REASONS.map((r) => <button key={r} className="menu-row" onClick={() => report(r)}>{r}</button>)}
      </Sheet>
      {isHost && <PkInviteSheet open={sheet === 'pk'} onClose={() => setSheet(null)} roomId={id} />}
      {sheet?.user && (
        <Sheet open onClose={() => setSheet(null)} className="user-card">
          <Avatar user={sheet.user} size={76} />
          <h3>{sheet.user.name} <VerifiedBadge user={sheet.user} size={16} /></h3>
          <p className="muted">ID {sheet.user.publicId}</p>
          <LevelBadge level={sheet.user.level} vip={sheet.user.vip} />
          <div className="row gap wrap center">
            <Link className="btn" to={`/user/${sheet.user.id}`}>Profile</Link>
            {sheet.user.id !== meId && <Link className="btn" to={`/chat/${sheet.user.id}`}>Message</Link>}
            {isHost && sheet.user.id !== meId && <>
              <button className="btn ghost" onClick={() => hostAct('mute', sheet.user.id)}>Mute chat</button>
              <button className="btn danger" onClick={() => hostAct('kick', sheet.user.id)}>Remove</button>
            </>}
            {isHost && sheet.seat && <button className="btn ghost" onClick={() => { seatAdmin(sheet.seat, 'mute'); setSheet(null); }}>Mute seat</button>}
            {isHost && sheet.seat && <button className="btn ghost" onClick={() => { seatAdmin(sheet.seat, 'kick', sheet.user?.id); setSheet(null); }}>Down from seat</button>}
          </div>
        </Sheet>
      )}
      <PkInviteModal invite={pkInvite} onClose={() => setPkInvite(null)} />

      {ended && !isHost && (
        <div className="modal-wrap">
          <div className="modal">
            <Avatar user={host} size={72} />
            <h3>{ended}</h3>
            {!following && <button className="btn primary" onClick={follow}>Follow {host?.name}</button>}
            <button className="btn" onClick={() => nav('/')}>Back to home</button>
          </div>
        </div>
      )}
      {summary && (
        <div className="modal-wrap">
          <div className="modal">
            <h3>Live ended</h3>
            <div className="summary-grid">
              <div><b>{Math.floor(summary.durationSec / 60)}m</b><span>Duration</span></div>
              <div><b>{fmt(summary.peak)}</b><span>Peak viewers</span></div>
              <div><b>{fmt(summary.diamonds)}</b><span>Diamonds</span></div>
              <div><b>{fmt(summary.newFans)}</b><span>New fans</span></div>
            </div>
            <button className="btn primary" onClick={() => nav('/', { replace: true })}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Same script as the reader's language (or Latin letters for Hindi/English readers): no translation needed.
function needsTranslation(msgLang, myLang) {
  if (msgLang === myLang) return false;
  if (msgLang === 'latn' && (myLang === 'en' || myLang === 'hi')) return false;
  return true;
}
