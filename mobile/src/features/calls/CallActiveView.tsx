import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RTCView } from '@livekit/react-native-webrtc';
import { Avatar } from '../../components/ui';
import { colors, typography, radii, spacing } from '../../theme';
import { MiniProfile } from '../../api/types';
import { formatNumber, formatDuration } from '../../utils/formatters';
import { callWebRTCService } from '../../realtime/callWebRTC';

interface CallActiveViewProps {
  peer: MiniProfile | null;
  kind: 'video' | 'audio';
  durationSeconds: number;
  rate: number;
  coinsSpent: number;
  isCaller: boolean;
  isMuted: boolean;
  isVideoMuted: boolean;
  onToggleMute: () => void;
  onToggleVideoMute: () => void;
  onFlipCamera: () => void;
  onEndCall: () => void;
}

export const CallActiveView: React.FC<CallActiveViewProps> = ({
  peer,
  kind,
  durationSeconds,
  rate,
  coinsSpent,
  isCaller,
  isMuted,
  isVideoMuted,
  onToggleMute,
  onToggleVideoMute,
  onFlipCamera,
  onEndCall,
}) => {
  const localStream = callWebRTCService.localStream;
  const remoteStream = callWebRTCService.remoteStream;

  return (
    <View style={styles.container}>
      {/* 1. Full-screen Remote Video or Audio Avatar */}
      {kind === 'video' && remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
        />
      ) : (
        <View style={styles.audioPlaceholder}>
          <Avatar
            url={peer?.avatar_url}
            name={peer?.name}
            size={120}
            vipLevel={peer?.vip_level}
          />
          <Text style={styles.audioCallingText}>
            1v1 Audio Call with {peer?.name}
          </Text>
        </View>
      )}

      {/* 2. Floating Picture-in-Picture Local Camera View */}
      {kind === 'video' && localStream && !isVideoMuted && (
        <View style={styles.pipContainer}>
          <RTCView
            streamURL={localStream.toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            zOrder={1}
          />
        </View>
      )}

      {/* 3. Top Info & Real-Time Billing Bar */}
      <View style={styles.topInfoBar}>
        <View style={styles.peerChip}>
          <Avatar
            url={peer?.avatar_url}
            name={peer?.name}
            size={36}
            vipLevel={peer?.vip_level}
          />
          <View style={styles.peerDetails}>
            <Text style={styles.peerName} numberOfLines={1}>
              {peer?.name}
            </Text>
            <Text style={styles.timerText}>
              ⏱ {formatDuration(durationSeconds)}
            </Text>
          </View>
        </View>

        {/* Billing Chip */}
        <View style={styles.billingChip}>
          <Text style={styles.billingLabel}>
            {isCaller ? 'Cost:' : 'Income:'}
          </Text>
          <Text style={styles.billingIcon}>
            {isCaller ? '🪙' : '💎'}
          </Text>
          <Text style={styles.billingAmount}>
            {formatNumber(coinsSpent)}
          </Text>
        </View>
      </View>

      {/* 4. Bottom Controls */}
      <View style={styles.bottomBar}>
        {/* Mute Mic */}
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={onToggleMute}
          activeOpacity={0.8}
        >
          <Text style={styles.controlEmoji}>{isMuted ? '🔇' : '🎙️'}</Text>
        </TouchableOpacity>

        {/* Flip Camera (Video only) */}
        {kind === 'video' && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={onFlipCamera}
            activeOpacity={0.8}
          >
            <Text style={styles.controlEmoji}>🔄</Text>
          </TouchableOpacity>
        )}

        {/* Toggle Video (Video only) */}
        {kind === 'video' && (
          <TouchableOpacity
            style={[styles.controlBtn, isVideoMuted && styles.controlBtnActive]}
            onPress={onToggleVideoMute}
            activeOpacity={0.8}
          >
            <Text style={styles.controlEmoji}>{isVideoMuted ? '🚫' : '📹'}</Text>
          </TouchableOpacity>
        )}

        {/* End Call Hangup */}
        <TouchableOpacity
          style={[styles.controlBtn, styles.endCallBtn]}
          onPress={onEndCall}
          activeOpacity={0.8}
        >
          <Text style={styles.controlEmoji}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#07090E',
    justifyContent: 'space-between',
  },
  audioPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E1322',
  },
  audioCallingText: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    marginTop: spacing.lg,
  },
  pipContainer: {
    position: 'absolute',
    top: 100,
    right: spacing.md,
    width: 105,
    height: 155,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.gold.primary,
    backgroundColor: '#07090E',
    zIndex: 10,
    elevation: 10,
  },
  topInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    zIndex: 5,
  },
  peerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 9, 14, 0.75)',
    borderRadius: radii.full,
    paddingLeft: 3,
    paddingRight: spacing.md,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    maxWidth: '58%',
  },
  peerDetails: {
    marginLeft: spacing.sm,
  },
  peerName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: typography.weights.bold,
  },
  timerText: {
    color: colors.gold.bright,
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  billingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 9, 14, 0.75)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.gold.primary,
  },
  billingLabel: {
    color: colors.text.muted,
    fontSize: 10,
    marginRight: 4,
  },
  billingIcon: {
    fontSize: 11,
    marginRight: 2,
  },
  billingAmount: {
    color: colors.gold.light,
    fontSize: 12,
    fontWeight: typography.weights.heavy,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: spacing.xxxl,
    zIndex: 5,
  },
  controlBtn: {
    width: 54,
    height: 54,
    borderRadius: radii.full,
    backgroundColor: 'rgba(7, 9, 14, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
    borderColor: colors.feedback.error,
  },
  endCallBtn: {
    backgroundColor: colors.feedback.error,
    borderColor: colors.feedback.error,
    transform: [{ rotate: '135deg' }],
  },
  controlEmoji: {
    fontSize: 22,
  },
});

