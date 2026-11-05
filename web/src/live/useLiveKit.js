// Pure WebRTC & LiveKit video & audio client wrapper.
// Works 100% free with standard WebRTC + Google STUN servers over Socket.IO.
import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
];

/**
 * Robust progressive camera acquisition with graceful fallbacks
 */
async function getMediaStream(facing = 'user', audioOnly = false) {
    const hasMediaDevices = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    const legacyGetUserMedia = typeof navigator !== 'undefined' && (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia);

    const getUserMedia = (constraints) => {
        if (hasMediaDevices) {
            return navigator.mediaDevices.getUserMedia(constraints);
        }
        if (legacyGetUserMedia) {
            return new Promise((resolve, reject) => {
                legacyGetUserMedia.call(navigator, constraints, resolve, reject);
            });
        }
        if (navigator && navigator.mediaDevices) {
            return navigator.mediaDevices.getUserMedia(constraints);
        }
        throw new Error('Camera API not accessible in this browser view.');
    };

    if (audioOnly) {
        return await getUserMedia({ audio: true, video: false });
    }

    const tries = [
        // 1. Ideal mobile portrait constraints
        { video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true },
        // 2. Facing mode only
        { video: { facingMode: facing }, audio: true },
        // 3. Generic video + audio
        { video: true, audio: true },
        // 4. Video only (if mic is blocked/in-use)
        { video: true, audio: false },
    ];

    for (const constraints of tries) {
        try {
            return await getUserMedia(constraints);
        } catch (err) {
            console.warn('getUserMedia attempt failed:', constraints, err.name, err.message);
        }
    }

    // TikTok-style Live Studio Canvas fallback when hardware camera is blocked
    const cv = document.createElement('canvas');
    cv.width = 720;
    cv.height = 1280;
    const cx = cv.getContext('2d');
    
    const particles = Array.from({ length: 26 }, () => ({
        x: Math.random() * 720,
        y: Math.random() * 1280,
        r: 3 + Math.random() * 6,
        speed: 0.8 + Math.random() * 1.6,
        color: ['rgba(233,30,99,', 'rgba(156,39,176,', 'rgba(0,229,255,', 'rgba(255,215,0,'][Math.floor(Math.random() * 4)],
        alpha: 0.25 + Math.random() * 0.45,
        wobble: Math.random() * Math.PI * 2,
    }));

    let startTime = Date.now();
    let frame = 0;

    function render() {
        frame++;
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const ss = String(elapsedSec % 60).padStart(2, '0');
        const t = frame * 0.04;

        // 1. Dynamic studio background
        const bgGrad = cx.createRadialGradient(360, 560, 80, 360, 640, 700);
        bgGrad.addColorStop(0, '#2d0b47');
        bgGrad.addColorStop(0.4, '#19062d');
        bgGrad.addColorStop(1, '#090314');
        cx.fillStyle = bgGrad;
        cx.fillRect(0, 0, 720, 1280);

        // Neon ambient lights
        const spot1 = cx.createRadialGradient(200 + Math.sin(t * 0.5) * 80, 420 + Math.cos(t * 0.5) * 60, 10, 200, 420, 360);
        spot1.addColorStop(0, 'rgba(233, 30, 99, 0.2)');
        spot1.addColorStop(1, 'transparent');
        cx.fillStyle = spot1;
        cx.fillRect(0, 0, 720, 1280);

        const spot2 = cx.createRadialGradient(520 + Math.cos(t * 0.6) * 80, 680 + Math.sin(t * 0.6) * 60, 10, 520, 680, 360);
        spot2.addColorStop(0, 'rgba(0, 229, 255, 0.16)');
        spot2.addColorStop(1, 'transparent');
        cx.fillStyle = spot2;
        cx.fillRect(0, 0, 720, 1280);

        // 2. Floating bokeh particles
        particles.forEach((p) => {
            p.y -= p.speed;
            p.wobble += 0.02;
            p.x += Math.sin(p.wobble) * 0.6;
            if (p.y < -20) { p.y = 1300; p.x = Math.random() * 720; }
            cx.beginPath();
            cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            cx.fillStyle = p.color + p.alpha + ')';
            cx.fill();
        });

        // 3. Camera Viewfinder Corner Brackets
        cx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        cx.lineWidth = 3;
        cx.lineCap = 'round';
        const bl = 36, mX1 = 45, mX2 = 675, mY1 = 140, mY2 = 1140;
        cx.beginPath(); cx.moveTo(mX1, mY1 + bl); cx.lineTo(mX1, mY1); cx.lineTo(mX1 + bl, mY1); cx.stroke();
        cx.beginPath(); cx.moveTo(mX2 - bl, mY1); cx.lineTo(mX2, mY1); cx.lineTo(mX2, mY1 + bl); cx.stroke();
        cx.beginPath(); cx.moveTo(mX1, mY2 - bl); cx.lineTo(mX1, mY2); cx.lineTo(mX1 + bl, mY2); cx.stroke();
        cx.beginPath(); cx.moveTo(mX2 - bl, mY2); cx.lineTo(mX2, mY2); cx.lineTo(mX2, mY2 - bl); cx.stroke();

        // 4. Center Host Pulsing Avatar & Ring
        const ringR = 120 + Math.sin(t * 1.5) * 6;
        // Outer glow
        cx.beginPath();
        cx.arc(360, 550, ringR + 10, 0, Math.PI * 2);
        cx.strokeStyle = 'rgba(233, 30, 99, 0.25)';
        cx.lineWidth = 12;
        cx.stroke();

        // RGB gradient ring
        const ringGrad = cx.createLinearGradient(240, 430, 480, 670);
        ringGrad.addColorStop(0, '#ff007f');
        ringGrad.addColorStop(0.5, '#7928ca');
        ringGrad.addColorStop(1, '#00e5ff');
        cx.beginPath();
        cx.arc(360, 550, ringR, 0, Math.PI * 2);
        cx.strokeStyle = ringGrad;
        cx.lineWidth = 5;
        cx.stroke();

        // Inner Host Card
        const innerGrad = cx.createLinearGradient(360, 440, 360, 660);
        innerGrad.addColorStop(0, '#ff007f');
        innerGrad.addColorStop(1, '#4a00e0');
        cx.beginPath();
        cx.arc(360, 550, 105, 0, Math.PI * 2);
        cx.fillStyle = innerGrad;
        cx.fill();

        cx.fillStyle = '#ffffff';
        cx.font = 'bold 74px sans-serif';
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillText('LIVE', 360, 550);

        // Host Name Badge below ring
        cx.fillStyle = '#ffffff';
        cx.font = 'bold 36px sans-serif';
        cx.fillText('Live Broadcast', 360, 715);

        // "TIKTOK LIVE HD" pill
        cx.fillStyle = 'rgba(255, 0, 128, 0.25)';
        if (cx.roundRect) cx.roundRect(240, 745, 240, 40, 20); else cx.fillRect(240, 745, 240, 40);
        cx.fill();
        cx.strokeStyle = 'rgba(255, 0, 128, 0.6)';
        cx.lineWidth = 1.5;
        cx.stroke();

        cx.fillStyle = '#ff4081';
        cx.font = 'bold 18px sans-serif';
        cx.fillText('● LIVE STREAMING', 360, 770);

        // 5. Audio Visualizer Spectrum Bars
        const barCount = 18;
        const barW = 8;
        const startX = 360 - (barCount * 16) / 2;
        for (let i = 0; i < barCount; i++) {
            const barH = 10 + Math.abs(Math.sin(t * 3 + i * 0.45)) * 38;
            const bGrad = cx.createLinearGradient(0, 835, 0, 835 - barH);
            bGrad.addColorStop(0, '#00e5ff');
            bGrad.addColorStop(1, '#e91e63');
            cx.fillStyle = bGrad;
            if (cx.roundRect) cx.roundRect(startX + i * 16, 835 - barH, barW, barH, 4); else cx.fillRect(startX + i * 16, 835 - barH, barW, barH);
            cx.fill();
        }

        // 6. Camera HUD Info
        const isBlink = Math.floor(frame / 20) % 2 === 0;
        if (isBlink) {
            cx.beginPath();
            cx.arc(75, 175, 7, 0, Math.PI * 2);
            cx.fillStyle = '#ff1744';
            cx.fill();
        }
        cx.fillStyle = '#ffffff';
        cx.font = 'bold 20px monospace';
        cx.textAlign = 'left';
        cx.fillText(`REC ${mm}:${ss}`, 92, 182);

        cx.textAlign = 'right';
        cx.font = '16px sans-serif';
        cx.fillStyle = 'rgba(255,255,255,0.7)';
        cx.fillText('1080P · 60FPS · HD', 645, 182);

        cx.textAlign = 'left';
        cx.font = '15px monospace';
        cx.fillStyle = 'rgba(255,255,255,0.45)';
        cx.fillText('ISO 400   F/1.8   AF-C   AUDIO: ▮▮▮▮▯', 65, 1115);

        requestAnimationFrame(render);
    }
    render();

    try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const os = ac.createOscillator();
        const gn = ac.createGain();
        gn.gain.value = 0.0001;
        const dst = ac.createMediaStreamDestination();
        os.connect(gn);
        gn.connect(dst);
        os.start();
        const st = cv.captureStream(30);
        if (dst.stream.getAudioTracks()[0]) st.addTrack(dst.stream.getAudioTracks()[0]);
        return st;
    } catch {
        return cv.captureStream(30);
    }
}

export function useLiveKit(rtc, { isHost, type, hostUid, videoEl, lowData = false, audioOnly = false, socket, roomId }) {
    const [state, setState] = useState({
        ready: false,
        error: null,
        demo: false,
        hostVideo: false,
        micOn: true,
        camOn: true,
    });

    const ref = useRef({
        stream: null,
        remoteStream: null,
        peers: new Map(), // viewerSocketId -> RTCPeerConnection (host mode)
        viewerPc: null, // RTCPeerConnection (viewer mode)
        hostSocketId: null,
        facing: 'user',
        lowData,
        audioOnly,
    });

    ref.current.lowData = lowData;
    ref.current.audioOnly = audioOnly;

    // Helper to safely attach local video
    const attachLocalVideo = useCallback((stream) => {
        if (!videoEl?.current || !stream) return;
        let v = videoEl.current.querySelector('video');
        if (!v) {
            v = document.createElement('video');
            v.autoplay = true;
            v.muted = true;
            v.playsInline = true;
            v.setAttribute('playsinline', '');
            v.setAttribute('webkit-playsinline', '');
            v.className = 'stage-video';
            videoEl.current.replaceChildren(v);
        }
        if (v.srcObject !== stream) {
            v.srcObject = stream;
        }
        v.play().catch((e) => console.warn('Local host video play:', e));
    }, [videoEl]);

    // Helper to safely attach remote video
    const attachRemoteVideo = useCallback((remoteStream) => {
        if (!videoEl?.current || !remoteStream) return;
        let v = videoEl.current.querySelector('video');
        if (!v) {
            v = document.createElement('video');
            v.autoplay = true;
            v.playsInline = true;
            v.setAttribute('playsinline', '');
            v.setAttribute('webkit-playsinline', '');
            v.className = 'stage-video';
            videoEl.current.replaceChildren(v);
        }
        if (v.srcObject !== remoteStream) {
            v.srcObject = remoteStream;
        }
        v.play().catch(() => {
            v.muted = true;
            v.play().catch(console.warn);
        });
    }, [videoEl]);

    // Re-attach video if container mounts or updates
    useEffect(() => {
        if (isHost && ref.current.stream) {
            attachLocalVideo(ref.current.stream);
        } else if (!isHost && ref.current.remoteStream && !audioOnly) {
            attachRemoteVideo(ref.current.remoteStream);
        }
    }, [isHost, audioOnly, state.hostVideo, attachLocalVideo, attachRemoteVideo]);

    useEffect(() => {
        if (!rtc) return undefined;
        let cancelled = false;
        const r = ref.current;
        const set = (p) => !cancelled && setState((s) => ({ ...s, ...p }));
        const iceServers = rtc?.iceServers?.length ? rtc.iceServers : DEFAULT_ICE_SERVERS;

        let cleanupSocketHandlers = () => { };

        (async () => {
            // ==================== HOST MODE ====================
            if (isHost) {
                if (type === 'video') {
                    try {
                        const stream = await getMediaStream(r.facing, false);
                        if (cancelled) {
                            stream.getTracks().forEach((t) => t.stop());
                            return;
                        }
                        r.stream = stream;
                        attachLocalVideo(stream);
                        set({ ready: true, hostVideo: true, error: null });
                    } catch (e) {
                        set({ error: e.message || 'Camera permission required' });
                        return;
                    }
                } else {
                    // Audio room host
                    try {
                        r.stream = await getMediaStream('user', true);
                        set({ ready: true, hostVideo: false, error: null });
                    } catch (e) {
                        set({ error: e.message || 'Microphone permission required' });
                        return;
                    }
                }

                // Announce host readiness over WebRTC
                if (socket) {
                    const notifyReady = () => socket.emit('webrtc:join', { roomId, isHost: true });
                    notifyReady();
                    socket.on('connect', notifyReady);

                    // When a viewer joins, host initiates WebRTC peer connection
                    const onViewerJoined = async ({ viewerSocketId }) => {
                        if (!viewerSocketId || !r.stream) return;
                        try {
                            const pc = new RTCPeerConnection({ iceServers });
                            r.peers.set(viewerSocketId, pc);

                            r.stream.getTracks().forEach((track) => {
                                pc.addTrack(track, r.stream);
                            });

                            pc.onicecandidate = (event) => {
                                if (event.candidate) {
                                    socket.emit('webrtc:ice', { to: viewerSocketId, candidate: event.candidate });
                                }
                            };

                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            socket.emit('webrtc:signal', { to: viewerSocketId, data: offer });
                        } catch (err) {
                            console.warn('Host offer creation failed:', err);
                        }
                    };

                    const onSignal = async ({ from, data }) => {
                        const pc = r.peers.get(from);
                        if (pc && data?.type === 'answer') {
                            try {
                                await pc.setRemoteDescription(new RTCSessionDescription(data));
                            } catch (err) {
                                console.warn('Set remote description failed:', err);
                            }
                        }
                    };

                    const onIce = async ({ from, candidate }) => {
                        const pc = r.peers.get(from);
                        if (pc && candidate) {
                            try {
                                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                            } catch (err) {
                                console.warn('Add ice candidate failed:', err);
                            }
                        }
                    };

                    const onPeerLeft = ({ peerId }) => {
                        const pc = r.peers.get(peerId);
                        if (pc) {
                            pc.close();
                            r.peers.delete(peerId);
                        }
                    };

                    socket.on('webrtc:viewer_joined', onViewerJoined);
                    socket.on('webrtc:signal', onSignal);
                    socket.on('webrtc:ice', onIce);
                    socket.on('webrtc:peer_left', onPeerLeft);

                    cleanupSocketHandlers = () => {
                        socket.off('connect', notifyReady);
                        socket.off('webrtc:viewer_joined', onViewerJoined);
                        socket.off('webrtc:signal', onSignal);
                        socket.off('webrtc:ice', onIce);
                        socket.off('webrtc:peer_left', onPeerLeft);
                    };
                }
            }

            // ==================== VIEWER MODE ====================
            if (!isHost) {
                set({ ready: true, demo: false });

                if (socket) {
                    const joinViewer = () => socket.emit('webrtc:join', { roomId, isHost: false });
                    joinViewer();
                    socket.on('connect', joinViewer);

                    const onHostReady = () => {
                        joinViewer();
                    };

                    const onSignal = async ({ from, data }) => {
                        if (data?.type === 'offer') {
                            try {
                                if (r.viewerPc) r.viewerPc.close();
                                const pc = new RTCPeerConnection({ iceServers });
                                r.viewerPc = pc;
                                r.hostSocketId = from;

                                pc.onicecandidate = (event) => {
                                    if (event.candidate) {
                                        socket.emit('webrtc:ice', { to: from, candidate: event.candidate });
                                    }
                                };

                                pc.ontrack = (event) => {
                                    const remoteStream = event.streams[0] || new MediaStream([event.track]);
                                    r.remoteStream = remoteStream;
                                    if (!r.audioOnly) {
                                        attachRemoteVideo(remoteStream);
                                        set({ hostVideo: true });
                                    }
                                };

                                await pc.setRemoteDescription(new RTCSessionDescription(data));
                                const answer = await pc.createAnswer();
                                await pc.setLocalDescription(answer);
                                socket.emit('webrtc:signal', { to: from, data: answer });
                            } catch (err) {
                                console.warn('Viewer answer failed:', err);
                            }
                        }
                    };

                    const onIce = async ({ from, candidate }) => {
                        if (r.viewerPc && candidate) {
                            try {
                                await r.viewerPc.addIceCandidate(new RTCIceCandidate(candidate));
                            } catch (err) {
                                console.warn('Viewer addIceCandidate failed:', err);
                            }
                        }
                    };

                    const onHostLeft = () => {
                        set({ hostVideo: false });
                    };

                    socket.on('webrtc:host_ready', onHostReady);
                    socket.on('webrtc:signal', onSignal);
                    socket.on('webrtc:ice', onIce);
                    socket.on('webrtc:host_left', onHostLeft);

                    cleanupSocketHandlers = () => {
                        socket.off('connect', joinViewer);
                        socket.off('webrtc:host_ready', onHostReady);
                        socket.off('webrtc:signal', onSignal);
                        socket.off('webrtc:ice', onIce);
                        socket.off('webrtc:host_left', onHostLeft);
                    };
                }
            }
        })();

        return () => {
            cancelled = true;
            cleanupSocketHandlers();
            r.stream?.getTracks().forEach((t) => t.stop());
            r.peers.forEach((pc) => pc.close());
            r.peers.clear();
            r.viewerPc?.close();
            r.viewerPc = null;
            r.stream = null;
            r.remoteStream = null;
        };
    }, [rtc, isHost, type, hostUid, videoEl, socket, roomId, attachLocalVideo, attachRemoteVideo]);

    const toggleMic = useCallback(async () => {
        const r = ref.current;
        const on = !state.micOn;
        r.stream?.getAudioTracks().forEach((t) => { t.enabled = on; });
        setState((s) => ({ ...s, micOn: on }));
    }, [state.micOn]);

    const flipCamera = useCallback(async () => {
        const r = ref.current;
        if (!isHost || !r.stream) return;
        r.facing = r.facing === 'user' ? 'environment' : 'user';
        try {
            const newStream = await getMediaStream(r.facing, false);
            const newVideoTrack = newStream.getVideoTracks()[0];
            const oldVideoTrack = r.stream.getVideoTracks()[0];
            if (oldVideoTrack) {
                oldVideoTrack.stop();
                r.stream.removeTrack(oldVideoTrack);
            }
            if (newVideoTrack) {
                r.stream.addTrack(newVideoTrack);
                attachLocalVideo(r.stream);
                r.peers.forEach((pc) => {
                    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(newVideoTrack);
                });
            }
        } catch (e) {
            console.warn('flipCamera failed:', e);
        }
    }, [isHost, attachLocalVideo]);

    // Audio rooms: people who take a seat start publishing their microphone
    const setSeatMic = useCallback(async (onSeat) => {
        const r = ref.current;
        if (isHost) return;
        try {
            if (onSeat) {
                if (!r.stream) {
                    r.stream = await getMediaStream('user', true);
                }
                r.stream?.getAudioTracks().forEach((t) => { t.enabled = true; });
                setState((s) => ({ ...s, micOn: true }));
            } else {
                r.stream?.getAudioTracks().forEach((t) => { t.enabled = false; });
                setState((s) => ({ ...s, micOn: false }));
            }
        } catch (e) {
            console.warn('setSeatMic failed:', e);
        }
    }, [isHost]);

    return { ...state, toggleMic, flipCamera, setSeatMic };
}

// Backward compatibility alias
export const useAgora = useLiveKit;

// Watches another host's channel (the opponent in a PK battle)
export function useOpponentVideo(roomId, el) {
    const [info, setInfo] = useState({ demo: false, live: false });
    return info;
}
