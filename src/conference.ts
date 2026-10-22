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
  | { type: 'mute-request'; from: string; to: string };

export class VideoConferenceClient {
  public myId: string;
  public myName: string;
  private supabase: SupabaseClient | null;
  public roomId: RoomId | null = null;

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
      this.localStream.getVideoTracks().forEach(t => { t.enabled = this.isCameraOn; });
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

  private notifyState() {
    this.onStateChange?.();
  }
}
