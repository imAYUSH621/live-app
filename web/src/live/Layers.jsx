// Visual effect layers drawn on top of the live video: gift strips, full-screen gift animations,
// entry effects and floating likes.
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import AnimPlayer from '../components/AnimPlayer.jsx';
import { Avatar } from '../components/ui.jsx';

const TIER_RANK = { small: 0, medium: 1, large: 2, super: 3 };

// ---------- gifts ----------
export const GiftLayer = forwardRef(function GiftLayer({ meId, effectsOn = true }, ref) {
  const [strips, setStrips] = useState([]); // left-side "X sent Y" strips (max 2)
  const [full, setFull] = useState(null); // full-screen animation now playing
  const queue = useRef([]);
  const playing = useRef(false);

  const next = useCallback(() => {
    if (!queue.current.length) { playing.current = false; setFull(null); return; }
    queue.current.sort((a, b) => (b.mine - a.mine) || (b.rank - a.rank) || (a.at - b.at));
    const g = queue.current.shift();
    playing.current = true;
    setFull({ ...g, key: `${g.id}-${Date.now()}` });
  }, []);

  useImperativeHandle(ref, () => ({
    push(ev) {
      const key = `${ev.sender.id}:${ev.gift.id}`;
      setStrips((cur) => {
        const ex = cur.find((s) => s.key === key);
        if (ex) return cur.map((s) => (s.key === key ? { ...s, count: s.count + ev.qty, bump: Date.now(), until: Date.now() + 3500 } : s));
        const item = { key, ev, count: ev.qty, bump: Date.now(), until: Date.now() + 3500 };
        return [...cur, item].slice(-2);
      });
      setTimeout(() => setStrips((cur) => cur.filter((s) => s.until > Date.now())), 3700);
      if (effectsOn && ev.gift.tier !== 'small' && ev.gift.animUrl) {
        queue.current.push({ id: ev.id, url: ev.gift.animUrl, type: ev.gift.animType, rank: TIER_RANK[ev.gift.tier] || 0, mine: ev.sender.id === meId ? 1 : 0, at: Date.now(), ev });
        if (queue.current.length > 12) queue.current.splice(6, queue.current.length - 12); // never let the queue grow forever
        if (!playing.current) next();
      }
    },
  }), [effectsOn, meId, next]);

  return (
    <>
      <div className="gift-strips">
        {strips.map((s) => (
          <div key={s.key} className="gift-strip">
            <Avatar user={s.ev.sender} size={34} frame={false} />
            <div className="gs-text"><b>{s.ev.sender.name}</b><span>sent {s.ev.gift.name}</span></div>
            {s.ev.gift.tier === 'small' && s.ev.gift.animUrl
              ? <AnimPlayer key={s.bump} src={s.ev.gift.animUrl} type={s.ev.gift.animType} className="gs-anim" />
              : <img className="gs-icon" src={s.ev.gift.icon} alt="" />}
            <span key={s.bump} className="gs-count">x{s.count}</span>
          </div>
        ))}
      </div>
      {full && (
        <div className="gift-full">
          <AnimPlayer key={full.key} src={full.url} type={full.type} onDone={next} className="gift-full-anim" />
          <div className="gift-full-caption"><b>{full.ev.sender.name}</b> sent {full.ev.gift.name}{full.ev.qty > 1 ? ` x${full.ev.qty}` : ''}</div>
        </div>
      )}
    </>
  );
});

// ---------- entry effects ----------
export const EntryLayer = forwardRef(function EntryLayer(_props, ref) {
  const [cur, setCur] = useState(null);
  const [plain, setPlain] = useState([]);
  const queue = useRef([]);
  const busy = useRef(false);

  const next = useCallback(() => {
    const u = queue.current.shift();
    if (!u) { busy.current = false; setCur(null); return; }
    busy.current = true;
    setCur({ user: u, key: `${u.id}-${Date.now()}` });
  }, []);

  useImperativeHandle(ref, () => ({
    push(user) {
      if (user.entry?.url) {
        queue.current.push(user);
        if (queue.current.length > 6) queue.current.shift();
        if (!busy.current) next();
      } else {
        const id = `${user.id}-${Date.now()}`;
        setPlain((p) => [...p.slice(-1), { id, user }]);
        setTimeout(() => setPlain((p) => p.filter((x) => x.id !== id)), 2600);
      }
    },
  }), [next]);

  return (
    <div className="entry-layer">
      {cur && (
        <div className="entry-fx" key={cur.key}>
          <AnimPlayer src={cur.user.entry.url} type={cur.user.entry.type} onDone={next} className="entry-anim" />
          <div className="entry-who">
            <Avatar user={cur.user} size={46} frame={false} />
            <div><b style={{ color: cur.user.vip ? '#ffe27a' : '#fff' }}>{cur.user.name}</b><span>{cur.user.vip ? `VIP${cur.user.vip} ` : ''}joined the room</span></div>
          </div>
        </div>
      )}
      {plain.map((p) => (
        <div key={p.id} className="entry-plain"><span className="lv-mini">Lv{p.user.level}</span> {p.user.name} joined</div>
      ))}
    </div>
  );
});

// ---------- floating likes ----------
const HEART_COLORS = ['#ff3d77', '#ff8fab', '#ffd166', '#7dd3fc', '#c084fc', '#4ade80'];
export const LikesLayer = forwardRef(function LikesLayer(_props, ref) {
  const [hearts, setHearts] = useState([]);
  useImperativeHandle(ref, () => ({
    burst(n = 1) {
      const add = Array.from({ length: Math.min(n, 6) }, () => ({
        id: Math.random(), color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
        x: Math.random() * 40 - 20, d: 1.8 + Math.random() * 1.2, s: 0.7 + Math.random() * 0.6,
      }));
      setHearts((h) => [...h.slice(-30), ...add]);
      setTimeout(() => setHearts((h) => h.filter((x) => !add.includes(x))), 3200);
    },
  }), []);
  return (
    <div className="likes-layer">
      {hearts.map((h) => (
        <svg key={h.id} className="like-heart" viewBox="0 0 24 24" style={{ '--x': `${h.x}px`, '--d': `${h.d}s`, '--s': h.s, color: h.color }}>
          <path fill="currentColor" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" />
        </svg>
      ))}
    </div>
  );
});
