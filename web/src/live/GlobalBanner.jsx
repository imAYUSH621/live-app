import { useNavigate } from 'react-router-dom';
import { useApp } from '../store.jsx';

// Big gifts are announced to every user in every room, like on Mico/Bigo.
export default function GlobalBanner() {
  const { globalBanner: b } = useApp();
  const nav = useNavigate();
  if (!b) return null;
  return (
    <button className="global-banner" key={`${b.roomId}-${b.gift.id}-${b.sender.name}`} onClick={() => nav(`/live/${b.roomId}`)}>
      <img src={b.gift.icon} alt="" />
      <span><b>{b.sender.name}</b> sent <b>{b.gift.name}{b.qty > 1 ? ` x${b.qty}` : ''}</b> to <b>{b.receiver.name}</b></span>
      <em>Tap to watch</em>
    </button>
  );
}
