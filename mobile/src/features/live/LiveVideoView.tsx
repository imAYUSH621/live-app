import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { RTCView, MediaStream } from '@livekit/react-native-webrtc';
import { CameraView } from 'expo-camera';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Track, Room, RoomEvent } from 'livekit-client';
import { colors, typography } from '../../theme';
import { useLiveRoomStore } from '../../stores/liveRoomStore';
import { liveKitService } from '../../realtime/livekit';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

interface LiveVideoViewProps {
  room: Room | null;
  isHost: boolean;
}

export const LiveVideoView: React.FC<LiveVideoViewProps> = ({ room, isHost }) => {
  const connectionStatus = useLiveRoomStore((s) => s.connectionStatus);
  const localVideoTrack = useLiveRoomStore((s) => s.localVideoTrack);
  const facingMode = useLiveRoomStore((s) => s.facingMode);

  const [remoteVideoTrack, setRemoteVideoTrack] = useState<Track | null>(null);

  // For viewer: subscribe to remote video track from room
  useEffect(() => {
    if (isHost) return;

    if (!room) {
      setRemoteVideoTrack(null);
      return;
    }

    const updateRemoteTrack = () => {
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.videoTrackPublications.values()) {
          if (publication.track) {
            setRemoteVideoTrack(publication.track);
            return;
          }
        }
      }
      setRemoteVideoTrack(null);
    };

    updateRemoteTrack();

    const onTrackSubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Video) {
        setRemoteVideoTrack(track);
      }
    };

    const onTrackUnsubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Video) {
        updateRemoteTrack();
      }
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, updateRemoteTrack);
    room.on(RoomEvent.ParticipantDisconnected, updateRemoteTrack);

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(RoomEvent.ParticipantConnected, updateRemoteTrack);
      room.off(RoomEvent.ParticipantDisconnected, updateRemoteTrack);
    };
  }, [room, isHost]);

  const activeTrack = isHost
    ? (localVideoTrack || liveKitService.localVideoTrack)
    : remoteVideoTrack;

  // Resolve native RTC stream URL from active Track
  const streamURL = useMemo(() => {
    if (!activeTrack) return '';
    try {
      if (activeTrack.mediaStream && typeof activeTrack.mediaStream.toURL === 'function') {
        const url = activeTrack.mediaStream.toURL();
        if (url) return url;
      }
      if (activeTrack.mediaStreamTrack) {
        const ms = new MediaStream([activeTrack.mediaStreamTrack]);
        return ms.toURL();
      }
    } catch (e: any) {
      console.warn('[LiveVideoView] Failed to compute streamURL:', e?.message);
    }
    return '';
  }, [activeTrack, activeTrack?.mediaStream, activeTrack?.mediaStreamTrack]);

  return (
    <View style={styles.container}>
      {streamURL ? (
        <RTCView
          streamURL={streamURL}
          style={styles.fullVideo}
          objectFit="cover"
          mirror={isHost && facingMode === 'user'}
          zOrder={0}
        />
      ) : isHost ? (
        /* Host camera fallback (works in Expo Go and while WebRTC attaches) */
        <CameraView
          style={styles.fullVideo}
          facing={facingMode === 'user' ? 'front' : 'back'}
        />
      ) : (
        <View style={styles.fallbackBox}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
          <Text style={styles.fallbackText}>
            {connectionStatus === 'connecting'
              ? 'Connecting to broadcast stream...'
              : connectionStatus === 'reconnecting'
              ? 'Reconnecting to stream...'
              : 'Waiting for host camera...'}
          </Text>
        </View>
      )}

      {/* Expo Go notice */}
      {isExpoGo && (
        <View style={styles.expoGoBanner}>
          <Text style={styles.expoGoText}>
            ℹ️ Expo Go Mode: Camera Preview Active (Build APK for SFU WebRTC)
          </Text>
        </View>
      )}

      {/* Reconnecting banner overlay */}
      {connectionStatus === 'reconnecting' && (
        <View style={styles.reconnectingBanner}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.reconnectingText}>Reconnecting...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#07090E',
  },
  fullVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  fallbackBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07090E',
    padding: 24,
  },
  fallbackText: {
    color: colors.gold.light,
    marginTop: 12,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    textAlign: 'center',
  },
  reconnectingBanner: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 99,
  },
  expoGoBanner: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: colors.gold.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    zIndex: 90,
  },
  expoGoText: {
    color: colors.gold.light,
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  reconnectingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: typography.weights.bold,
    marginLeft: 8,
  },
});
