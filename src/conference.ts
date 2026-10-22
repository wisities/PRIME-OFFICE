import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { RoomId } from './data';
import { playChime } from './voice';

// Reliable Public STUN servers
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};

export type ConferenceMessage = {
  id: string;
  from: string;
  senderName: string;
  text: string;
  time: string;
};

export type ConferenceParticipant = {
  id: string;
  name: string;
  isCameraOn: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isSpeaking: boolean;
  stream?: MediaStream;
};

export type VideoEffect = 
  | 'none'
  | 'blur-light'
  | 'blur-heavy'
  | 'bg-office'
  | 'bg-loft'
  | 'bg-cafe'
  | 'bg-beach'
  | 'avatar-doll'
  | 'avatar-cat'
  | 'filter-warm'
  | 'filter-beauty'
  | 'filter-cyberpunk'
  | 'filter-mono';

type ConferenceSignal =
  | { type: 'join'; from: string; name: string }
  | { type: 'presence'; from: string; to: string; name: string; isCameraOn: boolean; isMuted: boolean; isScreenSharing: boolean; isHandRaised: boolean }
  | { type: 'leave'; from: string }
  | { type: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'media-state'; from: string; isCameraOn: boolean; isMuted: boolean; isScreenSharing: boolean; isHandRaised: boolean }
  | { type: 'speaking'; from: string; isSpeaking: boolean }
  | { type: 'chat'; from: string; name: string; id: string; text: string; time: string }
  | { type: 'mute-request'; from: string; to: string }
  | { type: 'meeting-invite'; from: string; senderName: string; roomId: RoomId; title: string; meetUrl?: string };

export class VideoConferenceClient {
  public myId: string;
  public myName: string;
  private supabase: SupabaseClient | null;
  public roomId: RoomId | null = null;
  public currentEffect: VideoEffect = 'none';

  // Video processing elements for effects
  private rawCameraTrack: MediaStreamTrack | null = null;
  private effectCanvas: HTMLCanvasElement | null = null;
  private effectVideo: HTMLVideoElement | null = null;
  private effectAnimFrame: number | null = null;
  private avatarBlinkState = false;
  private avatarLastBlinkTime = 0;

  // Media Streams
  public localStream: MediaStream | null = null;
  public screenStream: MediaStream | null = null;
  private channel: RealtimeChannel | null = null;
  private bc: BroadcastChannel | null = null;

  // Peer Connections
  private peers = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private peerStates = new Map<string, Omit<ConferenceParticipant, 'stream'>>();
  private iceQueues = new Map<string, RTCIceCandidateInit[]>();
  private audioElements = new Map<string, HTMLAudioElement>();

  // Local State
  public isCameraOn = true;
  public isMuted = false;
  public isScreenSharing = false;
  public isHandRaised = false;
  public isSpeaking = false;
  public activeSpeakerId: string | null = null;

  // Audio Analysis for Voice Activity Detection
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadInterval: ReturnType<typeof setInterval> | null = null;

  // Chat
  public messages: ConferenceMessage[] = [];

  // Callback to Notify UI
  public onStateChange?: () => void;
  public onNewMessage?: (msg: ConferenceMessage) => void;

  constructor(myId: string, myName: string, supabase: SupabaseClient | null) {
    this.myId = myId;
    this.myName = myName;
    this.supabase = supabase;
  }

  public updateIdentity(id: string, name: string) {
    this.myId = id;
    this.myName = name;
  }

  public async join(targetRoomId: RoomId, initialCamera = true, initialMic = true): Promise<void> {
    this.leave(); // Clean up prior conference if active
    this.roomId = targetRoomId;
    this.isCameraOn = initialCamera;
    this.isMuted = !initialMic;
    this.isScreenSharing = false;
    this.isHandRaised = false;
    this.messages = [];

    // 1. Acquire Local Camera + Microphone Stream
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24, max: 30 }
        }
      });
    } catch {
      // Fallback: If camera is unavailable or denied, acquire audio only
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        this.isCameraOn = false;
      } catch {
        // If both denied, create empty stream
        this.localStream = new MediaStream();
        this.isCameraOn = false;
        this.isMuted = true;
      }
    }

    // Apply initial mute/camera state
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = !this.isMuted; });
      const vt = this.localStream.getVideoTracks()[0];
      if (vt) {
        vt.enabled = this.isCameraOn;
        this.rawCameraTrack = vt;
      }
    }

    // 2. Setup VAD (Voice Activity Detection)
    this.setupAudioAnalysis();

    // 3. Setup Cross-tab Broadcast Channel (For Demo mode / local multi-tab testing)
    const channelName = `prime-video-conference-${targetRoomId}`;
    try {
      this.bc = new BroadcastChannel(channelName);
      this.bc.onmessage = (e) => this.handleSignal(e.data as ConferenceSignal);
    } catch {}

    // 4. Setup Supabase Realtime Signaling Channel (For Production multi-device)
    if (this.supabase) {
      this.channel = this.supabase.channel(channelName, {
        config: { broadcast: { self: false } }
      });

      this.channel.on('broadcast', { event: 'conf-signal' }, ({ payload }) => {
        this.handleSignal(payload as ConferenceSignal);
      });

      await this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.broadcastSignal({
            type: 'join',
            from: this.myId,
            name: this.myName
          });
        }
      });
    }

    // Also broadcast to BroadcastChannel immediately
    this.broadcastSignal({
      type: 'join',
      from: this.myId,
      name: this.myName
    });

    playChime('join');
    this.notifyState();
  }

  public leave() {
    if (!this.roomId) return;

    playChime('leave');

    // Notify peers that we are leaving
    this.broadcastSignal({
      type: 'leave',
      from: this.myId
    });

    // Close and cleanup all Peer Connections
    this.peers.forEach((peer) => {
      try { peer.close(); } catch {}
    });
    this.peers.clear();
    this.remoteStreams.clear();
    this.peerStates.clear();
    this.iceQueues.clear();

    // Clean audio playback elements
    this.audioElements.forEach((audio) => {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch {}
    });
    this.audioElements.clear();

    // Clean channels
    try { this.bc?.close(); } catch {}
    this.bc = null;

    if (this.channel && this.supabase) {
      try { this.supabase.removeChannel(this.channel); } catch {}
      this.channel = null;
    }

    // Stop local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this.localStream = null;
    }

    // Stop screen share if active
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this.screenStream = null;
    }

    // Clean audio analysis
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
      this.analyser = null;
    }

    // Clean up video effects
    this.stopVideoEffect();
    if (this.rawCameraTrack) {
      try { this.rawCameraTrack.stop(); } catch {}
      this.rawCameraTrack = null;
    }
    this.currentEffect = 'none';

    this.roomId = null;
    this.isScreenSharing = false;
    this.isHandRaised = false;
    this.isSpeaking = false;
    this.activeSpeakerId = null;
    this.messages = [];
    this.notifyState();
  }

  // Toggle Camera
  public async toggleCamera(): Promise<boolean> {
    this.isCameraOn = !this.isCameraOn;
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = this.isCameraOn;
      } else if (this.isCameraOn) {
        // If no video track existed initially, acquire one now
        try {
          const freshMedia = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } }
          });
          const newTrack = freshMedia.getVideoTracks()[0];
          if (newTrack) {
            this.localStream.addTrack(newTrack);
            // Replace track in all peer connections
            this.peers.forEach(peer => {
              const sender = peer.getSenders().find(s => s.track?.kind === 'video');
              if (sender) {
                sender.replaceTrack(newTrack).catch(() => {});
              } else {
                peer.addTrack(newTrack, this.localStream!);
              }
            });
          }
        } catch (err) {
          console.warn('Could not re-acquire camera:', err);
          this.isCameraOn = false;
        }
      }
    }
    this.broadcastMediaState();
    this.notifyState();
    return this.isCameraOn;
  }

  // Toggle Microphone
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => {
        t.enabled = !this.isMuted;
      });
    }
    if (this.isMuted && this.isSpeaking) {
      this.isSpeaking = false;
      this.broadcastSignal({ type: 'speaking', from: this.myId, isSpeaking: false });
    }
    this.broadcastMediaState();
    this.notifyState();
    return this.isMuted;
  }

  // Toggle Screen Sharing
  public async toggleScreenShare(): Promise<boolean> {
    if (this.isScreenSharing) {
      this.stopScreenShare();
      return false;
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true
      });

      const screenVideoTrack = this.screenStream.getVideoTracks()[0];
      if (!screenVideoTrack) throw new Error('No screen video track');

      // Listen for when user clicks "Stop sharing" from browser native chrome
      screenVideoTrack.onended = () => {
        this.stopScreenShare();
      };

      this.isScreenSharing = true;

      // Replace video track in all peers with screen track
      this.peers.forEach(peer => {
        const sender = peer.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenVideoTrack).catch(() => {});
        } else {
          peer.addTrack(screenVideoTrack, this.screenStream!);
        }
      });

      this.broadcastMediaState();
      this.notifyState();
      return true;
    } catch (err) {
      console.warn('Screen share canceled or failed:', err);
      this.isScreenSharing = false;
      return false;
    }
  }

  public stopScreenShare() {
    if (!this.isScreenSharing) return;
    this.isScreenSharing = false;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this.screenStream = null;
    }

    // Switch back to camera video track in all peers
    const cameraTrack = this.localStream?.getVideoTracks()[0] || null;
    this.peers.forEach(peer => {
      const sender = peer.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(cameraTrack).catch(() => {});
      }
    });

    this.broadcastMediaState();
    this.notifyState();
  }

  // Toggle Raise Hand
  public toggleRaiseHand(): boolean {
    this.isHandRaised = !this.isHandRaised;
    if (this.isHandRaised) {
      playChime('start');
    }
    this.broadcastMediaState();
    this.notifyState();
    return this.isHandRaised;
  }

  // Send In-call Chat
  public sendMessage(text: string) {
    if (!text.trim()) return;
    const msg: ConferenceMessage = {
      id: Math.random().toString(36).slice(2, 10),
      from: this.myId,
      senderName: this.myName,
      text: text.trim(),
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };
    this.messages.push(msg);
    this.broadcastSignal({
      type: 'chat',
      from: this.myId,
      name: this.myName,
      id: msg.id,
      text: msg.text,
      time: msg.time
    });
    this.onNewMessage?.(msg);
    this.notifyState();
  }

  // Get All Participants (Self + Remote Peers)
  public getParticipants(): ConferenceParticipant[] {
    const list: ConferenceParticipant[] = [];

    // 1. Add Local Self
    list.push({
      id: this.myId,
      name: `${this.myName} (คุณ)`,
      isCameraOn: this.isCameraOn,
      isMuted: this.isMuted,
      isScreenSharing: this.isScreenSharing,
      isHandRaised: this.isHandRaised,
      isSpeaking: this.isSpeaking,
      stream: this.isScreenSharing && this.screenStream ? this.screenStream : this.localStream || undefined
    });

    // 2. Add Remote Peers
    this.peerStates.forEach((state, peerId) => {
      const stream = this.remoteStreams.get(peerId);
      list.push({
        id: peerId,
        name: state.name,
        isCameraOn: state.isCameraOn,
        isMuted: state.isMuted,
        isScreenSharing: state.isScreenSharing,
        isHandRaised: state.isHandRaised,
        isSpeaking: state.isSpeaking,
        stream
      });
    });

    return list;
  }

  // -------------------------------------------------------------------------
  // SIGNALING & WEBRTC HANDSHAKE
  // -------------------------------------------------------------------------

  private async handleSignal(signal: ConferenceSignal) {
    if (!signal || signal.from === this.myId) return;

    switch (signal.type) {
      case 'join': {
        // Someone joined. Record them and announce our presence
        this.peerStates.set(signal.from, {
          id: signal.from,
          name: signal.name,
          isCameraOn: true,
          isMuted: false,
          isScreenSharing: false,
          isHandRaised: false,
          isSpeaking: false
        });

        this.broadcastSignal({
          type: 'presence',
          from: this.myId,
          to: signal.from,
          name: this.myName,
          isCameraOn: this.isCameraOn,
          isMuted: this.isMuted,
          isScreenSharing: this.isScreenSharing,
          isHandRaised: this.isHandRaised
        });

        // The existing member creates an Offer to the newly joined member
        await this.createOffer(signal.from);
        this.notifyState();
        break;
      }

      case 'presence': {
        if (signal.to !== this.myId) return;
        this.peerStates.set(signal.from, {
          id: signal.from,
          name: signal.name,
          isCameraOn: signal.isCameraOn,
          isMuted: signal.isMuted,
          isScreenSharing: signal.isScreenSharing,
          isHandRaised: signal.isHandRaised,
          isSpeaking: false
        });
        this.notifyState();
        break;
      }

      case 'offer': {
        if (signal.to !== this.myId) return;
        await this.handleOffer(signal.from, signal.sdp);
        break;
      }

      case 'answer': {
        if (signal.to !== this.myId) return;
        await this.handleAnswer(signal.from, signal.sdp);
        break;
      }

      case 'ice': {
        if (signal.to !== this.myId) return;
        await this.handleIceCandidate(signal.from, signal.candidate);
        break;
      }

      case 'media-state': {
        const p = this.peerStates.get(signal.from);
        if (p) {
          p.isCameraOn = signal.isCameraOn;
          p.isMuted = signal.isMuted;
          p.isScreenSharing = signal.isScreenSharing;
          p.isHandRaised = signal.isHandRaised;
          this.notifyState();
        }
        break;
      }

      case 'speaking': {
        const p = this.peerStates.get(signal.from);
        if (p) {
          p.isSpeaking = signal.isSpeaking;
          if (signal.isSpeaking) {
            this.activeSpeakerId = signal.from;
          } else if (this.activeSpeakerId === signal.from) {
            this.activeSpeakerId = null;
          }
          this.notifyState();
        }
        break;
      }

      case 'chat': {
        const msg: ConferenceMessage = {
          id: signal.id,
          from: signal.from,
          senderName: signal.name,
          text: signal.text,
          time: signal.time
        };
        this.messages.push(msg);
        this.onNewMessage?.(msg);
        this.notifyState();
        break;
      }

      case 'leave': {
        this.removePeer(signal.from);
        this.notifyState();
        break;
      }

      case 'mute-request': {
        if (signal.to === this.myId && !this.isMuted) {
          this.toggleMute();
        }
        break;
      }
    }
  }

  private getOrCreatePeer(peerId: string): RTCPeerConnection {
    let peer = this.peers.get(peerId);
    if (!peer || peer.connectionState === 'closed') {
      peer = new RTCPeerConnection(RTC_CONFIG);
      this.peers.set(peerId, peer);

      // Add local tracks (Audio + Video/Screen)
      const currentStream = this.isScreenSharing && this.screenStream ? this.screenStream : this.localStream;
      if (currentStream) {
        currentStream.getTracks().forEach(track => {
          peer!.addTrack(track, currentStream);
        });
      }

      // Handle ICE Candidate generation
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          this.broadcastSignal({
            type: 'ice',
            from: this.myId,
            to: peerId,
            candidate: event.candidate.toJSON()
          });
        }
      };

      // Handle incoming remote media tracks (Audio + Video)
      peer.ontrack = (event) => {
        let remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : this.remoteStreams.get(peerId);
        if (!remoteStream) {
          remoteStream = new MediaStream();
        }
        if (!remoteStream.getTracks().includes(event.track)) {
          remoteStream.addTrack(event.track);
        }
        this.remoteStreams.set(peerId, remoteStream);
        this.attachRemoteAudio(peerId, remoteStream);
        this.notifyState();
      };

      peer.onconnectionstatechange = () => {
        if (peer?.connectionState === 'failed' || peer?.connectionState === 'disconnected') {
          // Attempt ICE restart if needed
        }
      };
    }
    return peer;
  }

  private async createOffer(peerId: string) {
    try {
      const peer = this.getOrCreatePeer(peerId);
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peer.setLocalDescription(offer);
      this.broadcastSignal({
        type: 'offer',
        from: this.myId,
        to: peerId,
        sdp: offer
      });
    } catch (err) {
      console.warn('Error creating offer for', peerId, err);
    }
  }

  private async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit) {
    try {
      const peer = this.getOrCreatePeer(peerId);
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));

      // Process any queued ICE candidates
      const queue = this.iceQueues.get(peerId) || [];
      for (const cand of queue) {
        await peer.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }
      this.iceQueues.delete(peerId);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      this.broadcastSignal({
        type: 'answer',
        from: this.myId,
        to: peerId,
        sdp: answer
      });
    } catch (err) {
      console.warn('Error handling offer from', peerId, err);
    }
  }

  private async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit) {
    try {
      const peer = this.peers.get(peerId);
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(sdp));
        const queue = this.iceQueues.get(peerId) || [];
        for (const cand of queue) {
          await peer.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        this.iceQueues.delete(peerId);
      }
    } catch (err) {
      console.warn('Error handling answer from', peerId, err);
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    const peer = this.peers.get(peerId);
    if (peer && peer.remoteDescription) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('ICE add error:', err);
      }
    } else {
      // Queue candidate until remote description is set
      const queue = this.iceQueues.get(peerId) || [];
      queue.push(candidate);
      this.iceQueues.set(peerId, queue);
    }
  }

  private attachRemoteAudio(peerId: string, stream: MediaStream) {
    if (stream.getAudioTracks().length === 0) return;
    let audio = this.audioElements.get(peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.volume = 1.0;
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      document.body.appendChild(audio);
      this.audioElements.set(peerId, audio);
    }
    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }
    audio.play().catch(err => {
      console.warn('Conference audio autoplay blocked, will resume on user interaction:', err);
      const resume = () => {
        audio?.play().catch(() => {});
        window.removeEventListener('click', resume);
        window.removeEventListener('keydown', resume);
      };
      window.addEventListener('click', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    });
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      try { peer.close(); } catch {}
      this.peers.delete(peerId);
    }
    const audio = this.audioElements.get(peerId);
    if (audio) {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch {}
      this.audioElements.delete(peerId);
    }
    this.remoteStreams.delete(peerId);
    this.peerStates.delete(peerId);
    this.iceQueues.delete(peerId);
    if (this.activeSpeakerId === peerId) {
      this.activeSpeakerId = null;
    }
  }

  private broadcastMediaState() {
    this.broadcastSignal({
      type: 'media-state',
      from: this.myId,
      isCameraOn: this.isCameraOn,
      isMuted: this.isMuted,
      isScreenSharing: this.isScreenSharing,
      isHandRaised: this.isHandRaised
    });
  }

  private broadcastSignal(signal: ConferenceSignal) {
    try { this.bc?.postMessage(signal); } catch {}
    if (this.channel) {
      try {
        this.channel.send({
          type: 'broadcast',
          event: 'conf-signal',
          payload: signal
        });
      } catch {}
    }
  }

  // -------------------------------------------------------------------------
  // VOICE ACTIVITY DETECTION (VAD)
  // -------------------------------------------------------------------------
  private setupAudioAnalysis() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx || !this.localStream) return;

      const audioTrack = this.localStream.getAudioTracks()[0];
      if (!audioTrack) return;

      this.audioCtx = new AudioCtx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      const source = this.audioCtx.createMediaStreamSource(this.localStream);
      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      let consecutiveSpeakingCount = 0;

      this.vadInterval = setInterval(() => {
        if (!this.analyser || this.isMuted) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.broadcastSignal({ type: 'speaking', from: this.myId, isSpeaking: false });
            this.notifyState();
          }
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;

        const isNowSpeaking = avg > 14;
        if (isNowSpeaking) {
          consecutiveSpeakingCount++;
          if (consecutiveSpeakingCount >= 2 && !this.isSpeaking) {
            this.isSpeaking = true;
            this.activeSpeakerId = this.myId;
            this.broadcastSignal({ type: 'speaking', from: this.myId, isSpeaking: true });
            this.notifyState();
          }
        } else {
          consecutiveSpeakingCount = 0;
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.broadcastSignal({ type: 'speaking', from: this.myId, isSpeaking: false });
            if (this.activeSpeakerId === this.myId) {
              this.activeSpeakerId = null;
            }
            this.notifyState();
          }
        }
      }, 150);
    } catch (err) {
      console.warn('VAD setup skipped:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Video Effects Engine (Virtual Background, Avatar, Camera Filters)
  // ---------------------------------------------------------------------------
  public async setVideoEffect(effect: VideoEffect): Promise<void> {
    this.currentEffect = effect;

    if (!this.localStream) return;

    if (effect === 'none') {
      this.stopVideoEffect();
      if (this.rawCameraTrack) {
        this.replaceLocalVideoTrack(this.rawCameraTrack);
      }
      this.notifyState();
      return;
    }

    // Initialize Canvas & Hidden Video if needed
    if (!this.effectCanvas) {
      this.effectCanvas = document.createElement('canvas');
      this.effectCanvas.width = 1280;
      this.effectCanvas.height = 720;
    }

    if (!this.effectVideo) {
      this.effectVideo = document.createElement('video');
      this.effectVideo.muted = true;
      this.effectVideo.playsInline = true;
      this.effectVideo.autoplay = true;
    }

    // Ensure raw camera stream is playing in hidden video element
    if (this.rawCameraTrack && this.effectVideo.srcObject !== this.localStream) {
      this.effectVideo.srcObject = new MediaStream([this.rawCameraTrack]);
      await this.effectVideo.play().catch(() => {});
    }

    // Start render loop
    if (!this.effectAnimFrame) {
      this.renderEffectLoop();
    }

    // Capture canvas video stream
    const canvasStream = (this.effectCanvas as any).captureStream ? (this.effectCanvas as any).captureStream(30) : null;
    if (canvasStream) {
      const processedTrack = canvasStream.getVideoTracks()[0];
      if (processedTrack) {
        this.replaceLocalVideoTrack(processedTrack);
      }
    }

    this.notifyState();
  }

  public stopVideoEffect() {
    if (this.effectAnimFrame) {
      cancelAnimationFrame(this.effectAnimFrame);
      this.effectAnimFrame = null;
    }
    if (this.effectVideo) {
      try {
        this.effectVideo.pause();
        this.effectVideo.srcObject = null;
      } catch {}
    }
  }

  private replaceLocalVideoTrack(newTrack: MediaStreamTrack) {
    if (!this.localStream) return;
    const oldTrack = this.localStream.getVideoTracks()[0];
    if (oldTrack && oldTrack !== newTrack && oldTrack !== this.rawCameraTrack) {
      try { oldTrack.stop(); } catch {}
    }
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
    }
    this.localStream.addTrack(newTrack);
    newTrack.enabled = this.isCameraOn;

    // Propagate to all connected WebRTC peers
    this.peers.forEach(peer => {
      const sender = peer.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack).catch(() => {});
      }
    });
  }

  private renderEffectLoop = () => {
    if (!this.effectCanvas || this.currentEffect === 'none') {
      this.effectAnimFrame = null;
      return;
    }

    const ctx = this.effectCanvas.getContext('2d');
    if (ctx) {
      const w = this.effectCanvas.width;
      const h = this.effectCanvas.height;
      const now = performance.now();

      // Check avatar blinking
      if (now - this.avatarLastBlinkTime > 3200) {
        this.avatarBlinkState = true;
        if (now - this.avatarLastBlinkTime > 3400) {
          this.avatarBlinkState = false;
          this.avatarLastBlinkTime = now;
        }
      }

      ctx.save();

      if (this.currentEffect === 'avatar-doll' || this.currentEffect === 'avatar-cat') {
        // --- 1. AVATAR MODE ---
        // Background gradient
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#1e293b');
        bgGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Ambient glow circle
        ctx.fillStyle = this.currentEffect === 'avatar-cat' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(244, 114, 182, 0.15)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 280, 0, Math.PI * 2);
        ctx.fill();

        // Draw Avatar Character
        const centerX = w / 2;
        const centerY = h / 2 + 30;

        if (this.currentEffect === 'avatar-cat') {
          // Cyber Cat Avatar
          ctx.fillStyle = '#f59e0b'; // Cat Face
          ctx.beginPath();
          ctx.arc(centerX, centerY, 140, 0, Math.PI * 2);
          ctx.fill();

          // Cat Ears
          ctx.fillStyle = '#d97706';
          ctx.beginPath();
          ctx.moveTo(centerX - 100, centerY - 90);
          ctx.lineTo(centerX - 140, centerY - 210);
          ctx.lineTo(centerX - 30, centerY - 130);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(centerX + 100, centerY - 90);
          ctx.lineTo(centerX + 140, centerY - 210);
          ctx.lineTo(centerX + 30, centerY - 130);
          ctx.fill();

          // Cat Eyes (Blink or Open)
          ctx.fillStyle = '#1e293b';
          if (this.avatarBlinkState) {
            ctx.fillRect(centerX - 60, centerY - 20, 30, 4);
            ctx.fillRect(centerX + 30, centerY - 20, 30, 4);
          } else {
            ctx.beginPath();
            ctx.arc(centerX - 45, centerY - 20, 14, 0, Math.PI * 2);
            ctx.arc(centerX + 45, centerY - 20, 14, 0, Math.PI * 2);
            ctx.fill();
          }

          // Cat Nose & Mouth (Reactive to speaking)
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(centerX, centerY + 10, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#1e293b';
          if (this.isSpeaking) {
            ctx.beginPath();
            ctx.ellipse(centerX, centerY + 45, 18, 22, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#1e293b';
            ctx.beginPath();
            ctx.arc(centerX - 12, centerY + 25, 12, 0, Math.PI);
            ctx.arc(centerX + 12, centerY + 25, 12, 0, Math.PI);
            ctx.stroke();
          }
        } else {
          // Anime Doll Avatar
          // Hair back
          ctx.fillStyle = '#475569';
          ctx.beginPath();
          ctx.arc(centerX, centerY - 10, 160, 0, Math.PI * 2);
          ctx.fill();

          // Face
          ctx.fillStyle = '#ffedd5';
          ctx.beginPath();
          ctx.arc(centerX, centerY, 130, 0, Math.PI * 2);
          ctx.fill();

          // Eyes
          ctx.fillStyle = '#2563eb';
          if (this.avatarBlinkState) {
            ctx.fillRect(centerX - 60, centerY - 15, 34, 4);
            ctx.fillRect(centerX + 26, centerY - 15, 34, 4);
          } else {
            ctx.beginPath();
            ctx.arc(centerX - 45, centerY - 15, 16, 0, Math.PI * 2);
            ctx.arc(centerX + 45, centerY - 15, 16, 0, Math.PI * 2);
            ctx.fill();
            // Highlight
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(centerX - 40, centerY - 20, 5, 0, Math.PI * 2);
            ctx.arc(centerX + 50, centerY - 20, 5, 0, Math.PI * 2);
            ctx.fill();
          }

          // Cheeks Blush
          ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
          ctx.beginPath();
          ctx.arc(centerX - 70, centerY + 20, 16, 0, Math.PI * 2);
          ctx.arc(centerX + 70, centerY + 20, 16, 0, Math.PI * 2);
          ctx.fill();

          // Mouth (Reactive to speaking)
          ctx.fillStyle = '#e11d48';
          if (this.isSpeaking) {
            ctx.beginPath();
            ctx.ellipse(centerX, centerY + 48, 16, 20, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(centerX, centerY + 45, 12, 0, Math.PI);
            ctx.fill();
          }
        }

        // Name tag at bottom of avatar
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.roundRect(centerX - 80, centerY + 180, 160, 36, 18);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`✨ ${this.myName}`, centerX, centerY + 204);

      } else {
        // --- 2. VIRTUAL BACKGROUNDS & FILTERS ---
        // Draw underlying virtual scene
        if (this.currentEffect === 'bg-office') {
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#1e3a8a');
          grad.addColorStop(0.5, '#3b82f6');
          grad.addColorStop(1, '#93c5fd');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          // Office windows illustration
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(40 + i * 310, 30, 260, 480);
          }
        } else if (this.currentEffect === 'bg-loft') {
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#27272a');
          grad.addColorStop(1, '#52525b');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          // Loft brick accents
          ctx.fillStyle = '#3f3f46';
          ctx.fillRect(0, h - 160, w, 160);
        } else if (this.currentEffect === 'bg-cafe') {
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#78350f');
          grad.addColorStop(1, '#d97706');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        } else if (this.currentEffect === 'bg-beach') {
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#f97316');
          grad.addColorStop(0.45, '#fbbf24');
          grad.addColorStop(0.7, '#0284c7');
          grad.addColorStop(1, '#0c4a6e');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }

        // Apply filters to camera video
        if (this.currentEffect === 'blur-light') {
          ctx.filter = 'blur(6px)';
        } else if (this.currentEffect === 'blur-heavy') {
          ctx.filter = 'blur(16px)';
        } else if (this.currentEffect === 'filter-warm') {
          ctx.filter = 'sepia(0.3) saturate(1.4) brightness(1.05)';
        } else if (this.currentEffect === 'filter-beauty') {
          ctx.filter = 'brightness(1.08) contrast(1.05) saturate(1.15)';
        } else if (this.currentEffect === 'filter-cyberpunk') {
          ctx.filter = 'hue-rotate(290deg) contrast(1.3) saturate(1.5)';
        } else if (this.currentEffect === 'filter-mono') {
          ctx.filter = 'grayscale(1) contrast(1.2) brightness(0.95)';
        } else {
          ctx.filter = 'none';
        }

        // Render camera frame
        if (this.effectVideo && this.effectVideo.readyState >= 2) {
          if (this.currentEffect.startsWith('bg-')) {
            // Virtual background: draw central video with vignette blend
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.52, 0, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(this.effectVideo, 0, 0, w, h);
            ctx.restore();
          } else {
            ctx.drawImage(this.effectVideo, 0, 0, w, h);
          }
        }
      }

      ctx.restore();
    }

    this.effectAnimFrame = requestAnimationFrame(this.renderEffectLoop);
  };

  // Broadcast Instant Meeting Invitation
  public broadcastMeetingInvite(title: string, meetUrl?: string) {
    if (!this.roomId) return;
    this.broadcastSignal({
      type: 'meeting-invite',
      from: this.myId,
      senderName: this.myName,
      roomId: this.roomId,
      title,
      meetUrl
    });
  }

  private notifyState() {
    this.onStateChange?.();
  }
}
