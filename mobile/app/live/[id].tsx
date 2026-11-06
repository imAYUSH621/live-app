import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { liveKitService } from '../../src/realtime/livekit';
import { describeMediaError } from '../../src/realtime/mediaError';
import { getSocket } from '../../src/realtime/socket';
import { liveApi } from '../../src/api/endpoints';
import { useLiveRoomStore } from '../../src/stores/liveRoomStore';
import { useChatStore } from '../../src/stores/chatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useGiftQueueStore } from '../../src/stores/giftQueueStore';
import { usePkBattleStore } from '../../src/stores/pkBattleStore';
import { LiveVideoView } from '../../src/features/live/LiveVideoView';
import { LiveChatOverlay } from '../../src/features/live/LiveChatOverlay';
import { LiveTopBar } from '../../src/features/live/LiveTopBar';
import { LiveBottomBar } from '../../src/features/live/LiveBottomBar';
import { LiveSeatsOverlay } from '../../src/features/live/LiveSeatsOverlay';
import { LiveEndSummaryModal } from '../../src/features/live/LiveEndSummaryModal';
import { GiftPanel } from '../../src/features/gifts/GiftPanel';
import { GiftAnimationPlayer } from '../../src/features/gifts/GiftAnimationPlayer';
import { GlobalGiftBanner } from '../../src/features/gifts/GlobalGiftBanner';
import { PKScoreBar } from '../../src/features/pk/PKScoreBar';
import { PKResultModal } from '../../src/features/pk/PKResultModal';
import { PKInviteModal } from '../../src/features/pk/PKInviteModal';
import { Toast } from '../../src/components/ui';
import { spacing } from '../../src/theme';

export default function LiveRoomScreen() {
  const params = useLocalSearchParams<{ id: string; isHost?: string }>();
  const roomId = Number(params.id);
  const isHostParam = params.isHost === 'true';

  const user = useAuthStore((s) => s.user);
  const {
    room,
    host,
    viewers,
    likes,
    seats,
    isHost,
    isMuted,
    isLiveEnded,
    endSummary,
    setRoomData,
    updateViewers,
    incrementLikes,
    toggleAudioMute,
    setLiveEnded,
    resetRoom,
  } = useLiveRoomStore();

  const addMessage = useChatStore((s) => s.addMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const enqueueGift = useGiftQueueStore((s) => s.enqueueGift);
  const setGlobalBanner = useGiftQueueStore((s) => s.setGlobalBanner);
  const clearGiftQueue = useGiftQueueStore((s) => s.clearQueue);

  const {
    startPk,
    updateScores: updatePkScores,
    endPk,
    resetPk,
  } = usePkBattleStore();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showPkInvite, setShowPkInvite] = useState(false);

  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    activateKeepAwakeAsync();

    let isMounted = true;
    let socketRef: any = null;

    const setupRoom = async () => {
      try {
        // 1. Join room via REST API if viewer
        let currentRoom = room;
        let currentHost = host;
        let currentSeats = seats;

        if (!isHostParam || !liveKitService.room) {
          const joinRes = await liveApi.joinRoom(roomId);
          currentRoom = joinRes.room;
          currentHost = joinRes.host;
          currentSeats = joinRes.seats;

          setRoomData({
            room: joinRes.room,
            host: joinRes.host,
            seats: joinRes.seats,
            isHost: isHostParam,
          });

          await liveKitService.connectRoom(
            joinRes.livekit_url,
            joinRes.token,
            isHostParam
          );

          if (joinRes.pk) {
            startPk({
              pkId: joinRes.pk.id,
              opponent: joinRes.pk.opponent,
              duration: joinRes.pk.remaining,
            });
          }
        }

        // 2. Connect and bind socket
        const socket = await getSocket();
        socketRef = socket;

        socket.emit('room:join', { roomId }, (ack: any) => {
          if (ack?.ok && ack.viewers) {
            updateViewers(ack.viewers);
          }
        });

        // Listen for chat messages
        socket.on('room:chat', (msg: any) => {
          if (!isMounted) return;
          addMessage({
            id: msg.id || String(Date.now()),
            type: 'chat',
            user: msg.user,
            text: msg.text,
            ts: msg.ts || Date.now(),
          });
        });

        // Listen for user enter events
        socket.on('room:enter', (data: any) => {
          if (!isMounted) return;
          if (data.viewers) updateViewers(data.viewers);
          if (data.user) {
            addMessage({
              id: `enter_${Date.now()}_${data.user.id}`,
              type: 'enter',
              user: data.user,
              ts: Date.now(),
            });
          }
        });

        // Listen for viewer updates
        socket.on('room:viewers', (data: any) => {
          if (!isMounted) return;
          if (data.viewers !== undefined) updateViewers(data.viewers);
        });

        // Listen for room likes
        socket.on('room:like', (data: any) => {
          if (!isMounted) return;
          incrementLikes(data.count || 1);
        });

        // Listen for gifts
        socket.on('room:gift', (data: any) => {
          if (!isMounted) return;
          addMessage({
            id: `gift_${Date.now()}_${data.from?.id}`,
            type: 'gift',
            user: data.from,
            giftName: data.gift?.name,
            giftIcon: data.gift?.icon,
            giftQty: data.qty || 1,
            ts: Date.now(),
          });

          enqueueGift({
            id: data.id || Date.now(),
            gift: data.gift,
            from: data.from,
            to: data.to,
            qty: data.qty || 1,
            combo: data.qty > 1 ? data.qty : undefined,
            coins: data.coins || 0,
          });
        });

        // Global marquee banner for large gifts
        socket.on('global:banner', (data: any) => {
          if (!isMounted) return;
          setGlobalBanner(data);
        });

        // Listen for PK battle events
        socket.on('room:pk:start', (data: any) => {
          if (!isMounted) return;
          startPk({
            pkId: data.id,
            opponent: data.opponent,
            duration: data.duration || 300,
          });
        });

        socket.on('pk:score', (data: any) => {
          if (!isMounted) return;
          const isHostA = room && Number(room.id) === Number(data.room_a);
          const hScore = isHostA ? data.score_a : data.score_b;
          const oppScore = isHostA ? data.score_b : data.score_a;
          updatePkScores(hScore || 0, oppScore || 0);
        });

        socket.on('room:pk:end', (data: any) => {
          if (!isMounted) return;
          endPk(data.winner_id);
        });

        // Listen for room end
        socket.on('room:end', (summary: any) => {
          if (!isMounted) return;
          setLiveEnded(summary);
        });

        // Host heartbeat every 15s
        if (isHostParam) {
          heartbeatTimer.current = setInterval(() => {
            socket.emit('host:heartbeat', { roomId });
          }, 15000);
        }
      } catch (err: any) {
        console.error('[LiveRoom] Setup error:', err);
        const media = describeMediaError(err);
        setToastMessage(`${media.title}. ${media.hint}`);
      }
    };

    setupRoom();

    return () => {
      isMounted = false;
      deactivateKeepAwake();

      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }

      if (socketRef) {
        socketRef.emit('room:leave', { roomId });
        socketRef.off('room:chat');
        socketRef.off('room:enter');
        socketRef.off('room:viewers');
        socketRef.off('room:like');
        socketRef.off('room:gift');
        socketRef.off('global:banner');
        socketRef.off('room:pk:start');
        socketRef.off('pk:score');
        socketRef.off('room:pk:end');
        socketRef.off('room:end');
      }

      liveKitService.disconnect();
      clearMessages();
      clearGiftQueue();
      resetPk();
      resetRoom();
    };
  }, [roomId]);

  const handleSendMessage = async (text: string) => {
    try {
      const socket = await getSocket();
      socket.emit('room:chat', { roomId, text }, (ack: any) => {
        if (!ack?.ok && ack?.error) {
          setToastMessage(ack.error);
        }
      });
    } catch (e: any) {
      setToastMessage(e?.message || 'Failed to send message');
    }
  };

  const handleSendLike = async () => {
    incrementLikes(1);
    try {
      const socket = await getSocket();
      socket.emit('room:like', { roomId, count: 1 });
    } catch {}
  };

  const handleClose = () => {
    if (isHost) {
      Alert.alert('End Stream', 'Are you sure you want to end this live broadcast?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Broadcast',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await liveApi.endRoom(roomId);
              setLiveEnded(res.summary);
            } catch {
              router.replace('/(tabs)');
            }
          },
        },
      ]);
    } else {
      router.back();
    }
  };

  const handleFlipCamera = () => {
    liveKitService.flipCamera();
  };

  const handleToggleMute = () => {
    toggleAudioMute();
    liveKitService.toggleMute(!isMuted);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 1. Full Screen Native WebRTC Video Surface */}
      <LiveVideoView room={liveKitService.room} isHost={isHost} />

      {/* 2. Top Bar */}
      <LiveTopBar
        host={host}
        viewers={viewers}
        diamonds={room?.diamonds_earned || 0}
        onClose={handleClose}
      />

      {/* 3. PK Battle Realtime Score Bar */}
      <PKScoreBar />

      {/* 4. Seats Row */}
      <LiveSeatsOverlay
        seats={seats}
        onPressSeat={(seatIndex) => {
          setToastMessage(`Seat #${seatIndex + 1} selected`);
        }}
      />

      {/* 5. Overlay & Chat & Bottom Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomOverlay}
        pointerEvents="box-none"
      >
        <LiveChatOverlay />

        <LiveBottomBar
          isHost={isHost}
          isMuted={isMuted}
          onSendMessage={handleSendMessage}
          onSendLike={handleSendLike}
          onOpenGifts={() => setShowGiftPanel(true)}
          onOpenSeats={() => {
            if (isHost) setShowPkInvite(true);
            else setToastMessage('Guest seats');
          }}
          onToggleMute={handleToggleMute}
          onFlipCamera={handleFlipCamera}
        />
      </KeyboardAvoidingView>

      {/* 6. Full-Screen Gift Animation Player */}
      <GiftAnimationPlayer />

      {/* 7. App-wide Big Gift Marquee Banner */}
      <GlobalGiftBanner />

      {/* 8. Gift Bottom Sheet Panel */}
      <GiftPanel
        visible={showGiftPanel}
        roomId={roomId}
        receiverId={host?.id || room?.host_id || 0}
        onClose={() => setShowGiftPanel(false)}
        onNeedRecharge={() => {
          setShowGiftPanel(false);
          setToastMessage('Redirecting to wallet recharge...');
          router.push('/wallet/recharge' as any);
        }}
      />

      {/* 9. PK Invite & Candidate Picker Sheet */}
      <PKInviteModal
        visible={showPkInvite}
        onClose={() => setShowPkInvite(false)}
        onInviteSent={(name) => setToastMessage(`PK invitation sent to ${name}`)}
      />

      {/* 10. PK Battle Result Modal */}
      <PKResultModal />

      {/* 11. End Stream Summary Modal */}
      <LiveEndSummaryModal
        visible={isLiveEnded}
        isHost={isHost}
        host={host}
        summary={endSummary}
        onClose={() => {
          resetRoom();
          router.replace('/(tabs)');
        }}
      />

      <Toast
        visible={!!toastMessage}
        message={toastMessage || ''}
        type="info"
        onHide={() => setToastMessage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090E',
    justifyContent: 'space-between',
  },
  bottomOverlay: {
    justifyContent: 'flex-end',
    paddingBottom: spacing.xs,
  },
});
