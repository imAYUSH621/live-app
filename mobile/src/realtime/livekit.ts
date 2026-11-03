import {
  Room,
  RoomEvent,
  VideoPresets,
  Track,
  createLocalVideoTrack,
  createLocalAudioTrack,
  LocalVideoTrack,
  LocalAudioTrack,
  RemoteTrackPublication,
  RemoteParticipant,
} from 'livekit-client';
import { useLiveRoomStore } from '../stores/liveRoomStore';

export class LiveKitService {
  private static instance: LiveKitService | null = null;
  public room: Room | null = null;
  public localVideoTrack: LocalVideoTrack | null = null;
  public localAudioTrack: LocalAudioTrack | null = null;
  private currentFacingMode: 'user' | 'environment' = 'user';

  public static getInstance(): LiveKitService {
    if (!LiveKitService.instance) {
      LiveKitService.instance = new LiveKitService();
    }
    return LiveKitService.instance;
  }

  public async connectRoom(url: string, token: string, isHost: boolean = false): Promise<Room> {
    await this.disconnect();

    const roomStore = useLiveRoomStore.getState();
    roomStore.setConnectionStatus('connecting');

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });

    this.setupListeners(this.room);

    await this.room.connect(url, token);
    roomStore.setConnectionStatus('connected');

    if (isHost) {
      await this.publishHostTracks();
    }

    return this.room;
  }

  private setupListeners(room: Room) {
    const store = useLiveRoomStore.getState();

    room.on(RoomEvent.Connected, () => {
      console.log('[LiveKit] Connected to SFU room');
      useLiveRoomStore.getState().setConnectionStatus('connected');
    });

    room.on(RoomEvent.Reconnecting, () => {
      console.log('[LiveKit] Reconnecting to SFU...');
      useLiveRoomStore.getState().setConnectionStatus('reconnecting');
    });

    room.on(RoomEvent.Reconnected, () => {
      console.log('[LiveKit] Reconnected to SFU room');
      useLiveRoomStore.getState().setConnectionStatus('connected');
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log('[LiveKit] Disconnected from SFU room');
      useLiveRoomStore.getState().setConnectionStatus('disconnected');
    });

    room.on(
      RoomEvent.TrackSubscribed,
      (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        console.log(`[LiveKit] Subscribed to ${track.kind} from ${participant.identity}`);
      }
    );
  }

  public async publishHostTracks() {
    if (!this.room) return;

    try {
      this.localVideoTrack = await createLocalVideoTrack({
        facingMode: 'user',
        resolution: VideoPresets.h720.resolution,
      });

      this.localAudioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
      });

      useLiveRoomStore.getState().setFacingMode(this.currentFacingMode);
      useLiveRoomStore.getState().setLocalVideoTrack(this.localVideoTrack);

      await this.room.localParticipant.publishTrack(this.localVideoTrack, {
        simulcast: true,
      });

      await this.room.localParticipant.publishTrack(this.localAudioTrack);
      console.log('[LiveKit] Host local camera & audio tracks published');
    } catch (e: any) {
      console.error('[LiveKit] Failed to acquire or publish local tracks:', e.message);
      throw e;
    }
  }

  public async flipCamera() {
    if (this.localVideoTrack) {
      this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
      await this.localVideoTrack.restartTrack({ facingMode: this.currentFacingMode });
      useLiveRoomStore.getState().setFacingMode(this.currentFacingMode);
      useLiveRoomStore.getState().setLocalVideoTrack(this.localVideoTrack);
    }
  }

  public toggleMute(muted: boolean) {
    if (this.localAudioTrack) {
      if (muted) this.localAudioTrack.mute();
      else this.localAudioTrack.unmute();
    }
  }

  public toggleVideo(videoMuted: boolean) {
    if (this.localVideoTrack) {
      if (videoMuted) this.localVideoTrack.mute();
      else this.localVideoTrack.unmute();
    }
  }

  public async disconnect() {
    useLiveRoomStore.getState().setLocalVideoTrack(null);
    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
    }
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
  }
}

export const liveKitService = LiveKitService.getInstance();
