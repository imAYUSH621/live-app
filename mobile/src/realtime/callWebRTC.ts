import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
  AudioDeviceModule,
} from '@livekit/react-native-webrtc';
import { getSocket } from './socket';
import { callsApi } from '../api/endpoints';

export class CallWebRTCService {
  private static instance: CallWebRTCService | null = null;
  public pc: RTCPeerConnection | null = null;
  public localStream: MediaStream | null = null;
  public remoteStream: MediaStream | null = null;
  public callId: number | null = null;

  public onRemoteStream?: (stream: MediaStream) => void;
  public onConnectionStateChange?: (state: string) => void;

  public static getInstance(): CallWebRTCService {
    if (!CallWebRTCService.instance) {
      CallWebRTCService.instance = new CallWebRTCService();
    }
    return CallWebRTCService.instance;
  }

  public async initializeCall(
    callId: number,
    isCaller: boolean,
    kind: 'video' | 'audio' = 'video'
  ) {
    await this.cleanup();
    this.callId = callId;

    // 1. Fetch ICE servers (STUN + Coturn TURN) from server
    const { iceServers } = await callsApi.getIceServers();

    this.pc = new RTCPeerConnection({
      iceServers: iceServers && iceServers.length > 0 ? iceServers : [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });

    // 2. Acquire local audio/video media
    try {
      this.localStream = (await mediaDevices.getUserMedia({
        audio: true,
        video:
          kind === 'video'
            ? {
                facingMode: 'user',
                frameRate: 30,
              }
            : false,
      })) as MediaStream;

      this.localStream.getTracks().forEach((track) => {
        this.pc?.addTrack(track, this.localStream!);
      });
    } catch (e: any) {
      console.warn('[CallWebRTC] Media capture error:', e?.message);
    }

    // 3. Handle ICE Candidates
    this.pc.onicecandidate = async (event: any) => {
      if (event.candidate && this.callId) {
        const socket = await getSocket();
        socket.emit('call:signal', {
          callId: this.callId,
          data: {
            type: 'candidate',
            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
          },
        });
      }
    };

    // 4. Handle incoming remote stream
    this.pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.onRemoteStream && this.remoteStream) {
          this.onRemoteStream(this.remoteStream);
        }
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.onConnectionStateChange && this.pc) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };

    // 5. If caller, create & send Offer
    if (isCaller) {
      const offer = await this.pc.createOffer({});
      await this.pc.setLocalDescription(offer);

      const socket = await getSocket();
      socket.emit('call:signal', {
        callId: this.callId,
        data: {
          type: 'offer',
          sdp: offer.sdp,
        },
      });
    }
  }

  public async handleSignal(data: any) {
    if (!this.pc) return;

    try {
      if (data.type === 'offer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        const socket = await getSocket();
        socket.emit('call:signal', {
          callId: this.callId,
          data: {
            type: 'answer',
            sdp: answer.sdp,
          },
        });
      } else if (data.type === 'answer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.type === 'candidate' && data.candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err: any) {
      console.warn('[CallWebRTC] handleSignal error:', err?.message);
    }
  }

  public toggleMute(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  public toggleVideo(videoMuted: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !videoMuted;
      });
    }
  }

  public flipCamera() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0] as any;
      if (videoTrack && typeof videoTrack._switchCamera === 'function') {
        videoTrack._switchCamera();
      }
    }
  }

  public async cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteStream = null;
    this.callId = null;
  }
}

export const callWebRTCService = CallWebRTCService.getInstance();
