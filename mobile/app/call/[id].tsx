import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { callsApi } from '../../src/api/endpoints';
import { callWebRTCService } from '../../src/realtime/callWebRTC';
import { getSocket } from '../../src/realtime/socket';
import { useCallStore } from '../../src/stores/callStore';
import { useAuthStore } from '../../src/stores/authStore';
import { CallRingingView } from '../../src/features/calls/CallRingingView';
import { CallActiveView } from '../../src/features/calls/CallActiveView';
import { CallRatingModal } from '../../src/features/calls/CallRatingModal';
import { Toast } from '../../src/components/ui';

export default function CallScreen() {
  const params = useLocalSearchParams<{
    id: string;
    kind?: 'video' | 'audio';
    isIncoming?: string;
  }>();

  const callId = Number(params.id);
  const isIncoming = params.isIncoming === 'true';
  const kind = params.kind || 'video';

  const {
    status,
    role,
    peer,
    rate,
    durationSeconds,
    coinsSpent,
    isMuted,
    isVideoMuted,
    setConnected,
    tickDuration,
    toggleMute,
    toggleVideoMute,
    endCall,
    resetCall,
  } = useCallStore();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    activateKeepAwakeAsync();
    let socketRef: any = null;

    const setupCallSignaling = async () => {
      try {
        const socket = await getSocket();
        socketRef = socket;

        // 1. Listen for P2P WebRTC signals
        socket.on('call:signal', async ({ call_id, data }: any) => {
          if (Number(call_id) === callId) {
            await callWebRTCService.handleSignal(data);
          }
        });

        // 2. Caller receives call:accepted when host answers
        socket.on('call:accepted', async (data: any) => {
          if (Number(data.call_id) === callId) {
            setConnected();
            await callWebRTCService.initializeCall(callId, true, kind);
          }
        });

        // 3. Listen for call termination
        socket.on('call:ended', (data: any) => {
          if (Number(data.call_id) === callId) {
            handleCallTermination(data.reason);
          }
        });

        // 4. Low balance warning
        socket.on('call:low_balance', (data: any) => {
          if (Number(data.call_id) === callId) {
            setToastMessage('Low coin balance! Call will end soon.');
          }
        });

        // If caller initiated, WebRTC is ready to create offer upon connect
        if (!isIncoming) {
          // Caller will initialize after socket confirmed or when ringing
        }
      } catch (err: any) {
        console.warn('[CallScreen] Signaling setup failed:', err?.message);
      }
    };

    setupCallSignaling();

    return () => {
      deactivateKeepAwake();
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
      if (socketRef) {
        socketRef.off('call:signal');
        socketRef.off('call:accepted');
        socketRef.off('call:ended');
        socketRef.off('call:low_balance');
      }
      callWebRTCService.cleanup();
    };
  }, [callId]);

  // Duration Timer for active call
  useEffect(() => {
    if (status === 'connected') {
      timerInterval.current = setInterval(() => {
        tickDuration();
      }, 1000);
    } else {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    }

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    };
  }, [status]);

  const handleCallTermination = (reason = 'hangup') => {
    endCall(reason);
    callWebRTCService.cleanup();
    setShowRating(true);
  };

  const handleAccept = async () => {
    try {
      await callsApi.acceptCall(callId);
      setConnected();
      await callWebRTCService.initializeCall(callId, false, kind);
    } catch (e: any) {
      setToastMessage(e?.message || 'Failed to accept call');
      router.back();
    }
  };

  const handleReject = async () => {
    try {
      if (isIncoming) await callsApi.rejectCall(callId);
      else await callsApi.endCall(callId);
    } catch {}
    resetCall();
    router.back();
  };

  const handleHangup = async () => {
    try {
      await callsApi.endCall(callId);
    } catch {}
    handleCallTermination('hangup');
  };

  const handleMuteToggle = () => {
    toggleMute();
    callWebRTCService.toggleMute(!isMuted);
  };

  const handleVideoMuteToggle = () => {
    toggleVideoMute();
    callWebRTCService.toggleVideo(!isVideoMuted);
  };

  const handleFlipCamera = () => {
    callWebRTCService.flipCamera();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {status === 'outgoing_ringing' || status === 'incoming_ringing' ? (
        <CallRingingView
          isIncoming={isIncoming}
          peer={peer}
          kind={kind}
          rate={rate}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      ) : (
        <CallActiveView
          peer={peer}
          kind={kind}
          durationSeconds={durationSeconds}
          rate={rate}
          coinsSpent={coinsSpent}
          isCaller={role === 'caller'}
          isMuted={isMuted}
          isVideoMuted={isVideoMuted}
          onToggleMute={handleMuteToggle}
          onToggleVideoMute={handleVideoMuteToggle}
          onFlipCamera={handleFlipCamera}
          onEndCall={handleHangup}
        />
      )}

      {/* Post-Call Rating Modal */}
      <CallRatingModal
        visible={showRating}
        callId={callId}
        peer={peer}
        durationSeconds={durationSeconds}
        onFinish={() => {
          setShowRating(false);
          resetCall();
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
  },
});

