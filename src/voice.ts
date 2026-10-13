import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { RoomId } from './data';

// Reliable Public STUN servers (Google & Cloudflare)
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};

type VoiceSignal = 
  | { type: 'join'; from: string; name: string }
  | { type: 'presence'; from: string; to: string; name: string }
  | { type: 'leave'; from: string }
  | { type: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'speaking'; from: string; isSpeaking: boolean };

export type VoiceState = {
  inHuddle: boolean;
  roomId: RoomId | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isLoopback: boolean;
  activePeers: string[]; // List of user IDs in voice huddle
  speakingPeers: Set<string>; // Set of user IDs currently speaking
  audioLevel: number; // 0 - 100 current mic level
};

let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// Play audible walkie-talkie chimes
export function playChime(type: 'start' | 'stop' | 'join' | 'leave') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'start') {
      // Walkie-talkie chirp up
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'stop') {
      // Walkie-talkie chirp down
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(450, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'join') {
      // Friendly chord up
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(660, now + 0.09);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'leave') {
      // Chord down
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.setValueAtTime(360, now + 0.09);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (err) {
    console.warn('Audio chime error:', err);
  }
}

export class VoiceHuddleClient {
  private myId: string;
  private myName: string;
  private supabase: SupabaseClient | null;
  private roomId: RoomId | null = null;
  private localStream: MediaStream | null = null;
  private channel: RealtimeChannel | null = null;
  private bc: BroadcastChannel | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private iceCandidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private loopbackGain: GainNode | null = null;
  private levelInterval: ReturnType<typeof setInterval> | null = null;

  public isMuted = false;
  public isDeafened = false;
  public isLoopback = false;
  public onStateChange?: (state: {
    activePeers: string[];
    speakingPeers: Set<string>;
    isSpeaking: boolean;
    isLoopback: boolean;
    audioLevel: number;
  }) => void;

  private activePeers = new Set<string>();
  private speakingPeers = new Set<string>();
  private isSpeaking = false;
  private currentAudioLevel = 0;

  constructor(myId: string, myName: string, supabase: SupabaseClient | null) {
    this.myId = myId;
    this.myName = myName;
    this.supabase = supabase;
  }

  public updateIdentity(id: string, name: string) {
    this.myId = id;
    this.myName = name;
  }

  public resumeAudio() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public async join(targetRoomId: RoomId): Promise<MediaStream> {
    this.leave(); // Clean up any active huddle first
    this.roomId = targetRoomId;
    this.isMuted = false;
    this.isDeafened = false;
    this.isLoopback = false;

    // 1. Capture microphone with explicit error diagnostics
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('เบราว์เซอร์ไม่รองรับการเปิดไมโครโฟน หรือไม่ได้เปิดผ่าน HTTPS / Localhost');
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      console.warn('Voice huddle: could not access microphone', err);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        throw new Error('ไมโครโฟนถูกปฏิเสธ: กรุณากดอนุญาต (Allow) การใช้งานไมค์ที่รูปกุญแจ/การตั้งค่าบนแถบ URL');
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        throw new Error('ไม่พบอุปกรณ์ไมโครโฟน: กรุณาเชื่อมต่อไมโครโฟนเข้ากับเครื่อง');
      } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        throw new Error('ไมโครโฟนกำลังถูกโปรแกรมอื่นใช้งานอยู่ (เช่น Zoom, Meet, Teams) กรุณาปิดโปรแกรมอื่นก่อน');
      }
      throw new Error(`ไม่สามารถเปิดไมโครโฟนได้: ${e.message || 'เกิดข้อผิดพลาดในการขอสิทธิ์ไมค์'}`);
    }

    // 2. Setup AudioContext for local voice level detection
    this.setupAudioAnalysis();

    playChime('join');

    // 3. Setup Cross-tab BroadcastChannel (enables instant multi-tab audio on same device)
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.bc = new BroadcastChannel(`prime-voice-${targetRoomId}`);
        this.bc.onmessage = async (e) => {
          if (e.data) {
            await this.handleSignal(e.data);
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel error', e);
    }

    // 4. Setup Supabase Realtime Signaling for cross-device communication
    if (this.supabase) {
      this.setupSupabaseSignaling(targetRoomId);
    }

    // Add myself and announce join
    this.activePeers.add(this.myId);
    this.sendSignal({ type: 'join', from: this.myId, name: this.myName });
    this.notifyState();

    return this.localStream;
  }

  public leave() {
    if (!this.roomId && !this.localStream) return;

    playChime('leave');

    // 1. Announce leave
    this.sendSignal({ type: 'leave', from: this.myId });

    if (this.bc) {
      try { this.bc.close(); } catch {}
      this.bc = null;
    }

    if (this.channel) {
      try { this.channel.unsubscribe(); } catch {}
      this.channel = null;
    }

    // 2. Close loopback
    this.setLoopback(false);

    // 3. Close all WebRTC peer connections
    this.peers.forEach((pc) => {
      try { pc.close(); } catch {}
    });
    this.peers.clear();
    this.iceCandidateQueues.clear();

    // 4. Stop and clean audio elements
    this.audioElements.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {}
    });
    this.audioElements.clear();

    // 5. Stop local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
      this.localStream = null;
    }

    // 6. Clean AudioContext
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
      this.analyser = null;
      this.loopbackGain = null;
    }

    this.roomId = null;
    this.activePeers.clear();
    this.speakingPeers.clear();
    this.isSpeaking = false;
    this.currentAudioLevel = 0;
    this.notifyState();
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => {
        t.enabled = !muted;
      });
    }
    this.resumeAudio();
    if (muted && this.isSpeaking) {
      this.isSpeaking = false;
      this.sendSignal({ type: 'speaking', from: this.myId, isSpeaking: false });
    }
    this.notifyState();
  }

  public setDeafen(deafened: boolean) {
    this.isDeafened = deafened;
    // Mute all remote audio playback
    this.audioElements.forEach(audio => {
      audio.muted = deafened;
    });
    if (deafened) {
      this.setMute(true);
    }
    this.notifyState();
  }

  // Toggle listening to own microphone (Mic Test / Loopback via Web Audio API)
  public setLoopback(enabled: boolean) {
    this.isLoopback = enabled;
    try {
      this.resumeAudio();
      if (this.audioCtx && this.analyser) {
        if (!this.loopbackGain) {
          this.loopbackGain = this.audioCtx.createGain();
          this.analyser.connect(this.loopbackGain);
          this.loopbackGain.connect(this.audioCtx.destination);
        }
        this.loopbackGain.gain.setValueAtTime(enabled ? 1.0 : 0.0, this.audioCtx.currentTime);
      }
    } catch (e) {
      console.warn('Loopback error:', e);
    }
    this.notifyState();
  }

  private sendSignal(signal: VoiceSignal) {
    // 1. Cross-tab BroadcastChannel
    try {
      this.bc?.postMessage(signal);
    } catch {}

    // 2. Supabase Realtime Broadcast
    if (this.channel) {
      try {
        this.channel.send({
          type: 'broadcast',
          event: 'voice-signal',
          payload: signal
        });
      } catch {}
    }
  }

  private setupAudioAnalysis() {
    if (!this.localStream) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const source = this.audioCtx.createMediaStreamSource(this.localStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let speakingCounter = 0;

      this.levelInterval = setInterval(() => {
        if (!this.analyser || this.isMuted) {
          if (this.currentAudioLevel !== 0 || this.isSpeaking) {
            this.currentAudioLevel = 0;
            this.isSpeaking = false;
            this.sendSignal({ type: 'speaking', from: this.myId, isSpeaking: false });
            this.notifyState();
          }
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        this.currentAudioLevel = normalized;

        const isNowSpeaking = normalized > 12;
        if (isNowSpeaking) {
          speakingCounter = 4; // Linger speaking state for smooth UI
        } else if (speakingCounter > 0) {
          speakingCounter--;
        }

        const speakState = speakingCounter > 0;
        if (speakState !== this.isSpeaking) {
          this.isSpeaking = speakState;
          this.sendSignal({ type: 'speaking', from: this.myId, isSpeaking: speakState });
          this.notifyState();
        }
      }, 100);
    } catch (e) {
      console.warn('Could not set up audio analyzer', e);
    }
  }

  private setupSupabaseSignaling(roomId: RoomId) {
    if (!this.supabase) return;
    const channelName = `voice-room-${roomId}`;
    this.channel = this.supabase.channel(channelName, {
      config: { broadcast: { self: false } }
    });

    this.channel.on('broadcast', { event: 'voice-signal' }, async ({ payload }: { payload: VoiceSignal }) => {
      await this.handleSignal(payload);
    });

    this.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.sendSignal({ type: 'join', from: this.myId, name: this.myName });
      }
    });
  }

  private async handleSignal(signal: VoiceSignal) {
    if (!signal || signal.from === this.myId) return;

    if (signal.type === 'join') {
      this.activePeers.add(signal.from);
      this.notifyState();

      // Reply with our presence so new joiner knows we are in the room
      this.sendSignal({ type: 'presence', from: this.myId, to: signal.from, name: this.myName });

      // Deterministic initiator to prevent glare: lower ID initiates offer
      if (this.myId < signal.from) {
        await this.initiatePeerConnection(signal.from, true);
      }
    } else if (signal.type === 'presence' && signal.to === this.myId) {
      this.activePeers.add(signal.from);
      this.notifyState();

      // If we are the designated initiator, start offer
      if (this.myId < signal.from) {
        await this.initiatePeerConnection(signal.from, true);
      }
    } else if (signal.type === 'leave') {
      this.activePeers.delete(signal.from);
      this.speakingPeers.delete(signal.from);
      this.closePeer(signal.from);
      this.notifyState();
    } else if (signal.type === 'speaking') {
      if (signal.isSpeaking) {
        this.speakingPeers.add(signal.from);
      } else {
        this.speakingPeers.delete(signal.from);
      }
      this.notifyState();
    } else if (signal.type === 'offer' && signal.to === this.myId) {
      this.activePeers.add(signal.from);
      const pc = await this.initiatePeerConnection(signal.from, false);

      // Handle collision with polite rollback if necessary
      if (pc.signalingState !== 'stable') {
        if (this.myId < signal.from) {
          // Impolite peer ignores incoming colliding offer
          return;
        }
        await pc.setRemoteDescription({ type: 'rollback' });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

      // Flush queued ICE candidates
      const queue = this.iceCandidateQueues.get(signal.from) || [];
      for (const cand of queue) {
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
      }
      this.iceCandidateQueues.delete(signal.from);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.sendSignal({ type: 'answer', from: this.myId, to: signal.from, sdp: answer });
      this.notifyState();
    } else if (signal.type === 'answer' && signal.to === this.myId) {
      const pc = this.peers.get(signal.from);
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        // Flush queued ICE candidates
        const queue = this.iceCandidateQueues.get(signal.from) || [];
        for (const cand of queue) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
        }
        this.iceCandidateQueues.delete(signal.from);
      }
    } else if (signal.type === 'ice' && signal.to === this.myId) {
      const pc = this.peers.get(signal.from);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          console.warn('Error adding ICE candidate', e);
        }
      } else {
        // Queue until remote description is set
        const q = this.iceCandidateQueues.get(signal.from) || [];
        q.push(signal.candidate);
        this.iceCandidateQueues.set(signal.from, q);
      }
    }
  }

  private async initiatePeerConnection(peerId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    let pc = this.peers.get(peerId);
    if (pc) return pc;

    pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(peerId, pc);

    // Attach local audio track
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        pc!.addTrack(track, this.localStream!);
      });
    }

    // ICE Candidate event
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice',
          from: this.myId,
          to: peerId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    // Incoming remote audio track
    pc.ontrack = (event) => {
      const remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      this.attachRemoteAudio(peerId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === 'disconnected' || pc?.connectionState === 'failed' || pc?.connectionState === 'closed') {
        this.closePeer(peerId);
        this.activePeers.delete(peerId);
        this.speakingPeers.delete(peerId);
        this.notifyState();
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', from: this.myId, to: peerId, sdp: offer });
      } catch (err) {
        console.warn('Failed to create/send offer:', err);
      }
    }

    return pc;
  }

  private attachRemoteAudio(peerId: string, stream: MediaStream) {
    let audio = this.audioElements.get(peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.volume = 1.0;
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audio.muted = this.isDeafened;
      document.body.appendChild(audio);
      this.audioElements.set(peerId, audio);
    }
    audio.srcObject = stream;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Audio autoplay blocked, setting interaction listener', err);
        const resumeOnUserAction = () => {
          audio?.play().catch(() => {});
          window.removeEventListener('click', resumeOnUserAction);
          window.removeEventListener('keydown', resumeOnUserAction);
        };
        window.addEventListener('click', resumeOnUserAction, { once: true });
        window.addEventListener('keydown', resumeOnUserAction, { once: true });
      });
    }
  }

  private closePeer(peerId: string) {
    const pc = this.peers.get(peerId);
    if (pc) {
      try { pc.close(); } catch {}
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
    this.iceCandidateQueues.delete(peerId);
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        activePeers: Array.from(this.activePeers),
        speakingPeers: new Set(this.speakingPeers),
        isSpeaking: this.isSpeaking,
        isLoopback: this.isLoopback,
        audioLevel: this.currentAudioLevel
      });
    }
  }
}
