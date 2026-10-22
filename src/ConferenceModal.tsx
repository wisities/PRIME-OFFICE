import { useEffect, useRef, useState } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Hand, 
  MessageSquare, X, Minimize2, Maximize2, Users, PhoneOff, Send, Pin,
  Sparkles, Bell, Mail, SendHorizontal, Check, Move
} from 'lucide-react';
import type { VideoConferenceClient, ConferenceParticipant, VideoEffect } from './conference';
import { sendLineBotPush, openLineShare, DEFAULT_LINE_TOKEN, DEFAULT_LINE_TARGET_ID } from './lineBot';

interface ConferenceModalProps {
  client: VideoConferenceClient;
  roomName: string;
  onClose: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

function VideoTile({ 
  participant, 
  isSelf, 
  isSpotlight, 
  onToggleSpotlight 
}: { 
  participant: ConferenceParticipant; 
  isSelf: boolean; 
  isSpotlight: boolean; 
  onToggleSpotlight: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream, participant.isCameraOn, participant.isScreenSharing]);

  const hasVideo = (participant.isCameraOn || participant.isScreenSharing) && !!participant.stream;

  return (
    <div className={`video-tile ${isSpotlight ? 'spotlight' : ''} ${participant.isSpeaking ? 'speaking-active' : ''} ${participant.isScreenSharing ? 'screen-sharing' : ''}`}>
      {hasVideo ? (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted={true} // Audio is handled by background audio elements to prevent echo
          className={`video-element ${isSelf && !participant.isScreenSharing ? 'mirror' : ''}`}
        />
      ) : (
        <div className="avatar-tile-placeholder">
          <div className={`avatar-bubble ${participant.isSpeaking ? 'pulse' : ''}`}>
            <span>👨🏻‍💻</span>
          </div>
          <span className="placeholder-name">{participant.name}</span>
          <span className="placeholder-status">{participant.isMuted ? 'ปิดไมค์อยู่' : 'เปิดไมค์'}</span>
        </div>
      )}

      {/* Floating Info Overlay */}
      <div className="tile-overlay-top">
        {participant.isScreenSharing && (
          <span className="badge screen-badge">
            <Monitor size={12} /> หน้าจอที่แชร์
          </span>
        )}
        {participant.isHandRaised && (
          <span className="badge hand-badge">
            ✋ ยกมือถาม
          </span>
        )}
        <button 
          className={`tile-pin-btn ${isSpotlight ? 'active' : ''}`} 
          onClick={onToggleSpotlight} 
          title={isSpotlight ? 'ยกเลิกขยายจอ' : 'ขยายจอนี้ (Spotlight)'}
        >
          <Pin size={12} />
        </button>
      </div>

      <div className="tile-overlay-bottom">
        <span className="tile-name-tag">{participant.name}</span>
        <span className={`tile-mic-tag ${participant.isMuted ? 'muted' : 'active'}`}>
          {participant.isMuted ? <MicOff size={12} /> : <Mic size={12} />}
        </span>
      </div>
    </div>
  );
}

export function ConferenceModal({
  client,
  roomName,
  onClose,
  isMinimized,
  onToggleMinimize
}: ConferenceModalProps) {
  const [, setTick] = useState(0);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Video Effects Drawer State
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [selectedEffect, setSelectedEffect] = useState<VideoEffect>(client.currentEffect || 'none');

  // Call / Invite Meeting Modal State
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTitle, setInviteTitle] = useState(`ประชุมด่วนที่ ${roomName}`);
  const [lineToken, setLineToken] = useState(() => localStorage.getItem('prime-line-token') || DEFAULT_LINE_TOKEN);
  const [lineTargetId, setLineTargetId] = useState(() => localStorage.getItem('prime-line-target-id') || DEFAULT_LINE_TARGET_ID);
  const [telegramToken, setTelegramToken] = useState(() => localStorage.getItem('prime-tg-token') || '');
  const [telegramChatId, setTelegramChatId] = useState(() => localStorage.getItem('prime-tg-chat-id') || '');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Draggable PiP coordinates
  const [pipPos, setPipPos] = useState({ x: window.innerWidth - 320, y: window.innerHeight - 250 });
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Force re-render whenever conference state changes
  useEffect(() => {
    client.onStateChange = () => setTick(t => t + 1);
    client.onNewMessage = () => {
      setTick(t => t + 1);
      setTimeout(() => chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };
    return () => {
      client.onStateChange = undefined;
      client.onNewMessage = undefined;
    };
  }, [client]);

  const participants = client.getParticipants();
  const screenSharer = participants.find(p => p.isScreenSharing);
  const effectiveSpotlightId = spotlightId || (screenSharer ? screenSharer.id : null);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    client.sendMessage(chatInput);
    setChatInput('');
  };

  const handleApplyEffect = async (effect: VideoEffect) => {
    setSelectedEffect(effect);
    await client.setVideoEffect(effect);
  };

  // Draggable PiP handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - pipPos.x,
      y: e.clientY - pipPos.y
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const maxX = window.innerWidth - 300;
    const maxY = window.innerHeight - 200;
    const nextX = Math.max(16, Math.min(maxX, e.clientX - dragOffsetRef.current.x));
    const nextY = Math.max(16, Math.min(maxY, e.clientY - dragOffsetRef.current.y));
    setPipPos({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // Toggle stage fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      modalContainerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Build standard meeting text
  const getMeetingInviteText = () => {
    return `🚨 [เรียกประชุมด่วน - PRIME VIRTUAL OFFICE]\n\n📌 เรื่อง: ${inviteTitle}\n🏢 ห้องประชุม: ${roomName}\n👤 ผู้เรียก: ${client.myName}\n⏰ เวลา: ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.\n\n👉 กรุณาเข้าสู่ระบบ PRIME Teamwork เพื่อร่วมประชุมทันที!`;
  };

  // Send Call Meeting / LINE Bot & Telegram Invite
  const handleSendMeetingInvite = async () => {
    setInviteStatus('กำลังส่งการแจ้งเตือน...');
    const meetingText = getMeetingInviteText();
    
    // 1. Broadcast in-app
    client.broadcastMeetingInvite(inviteTitle);

    // 2. Send via LINE Bot if token and target ID provided
    if (lineToken.trim() && lineTargetId.trim()) {
      try {
        localStorage.setItem('prime-line-token', lineToken.trim());
        localStorage.setItem('prime-line-target-id', lineTargetId.trim());
        await sendLineBotPush({
          text: meetingText,
          token: lineToken.trim(),
          targetId: lineTargetId.trim()
        });
      } catch (lineErr) {
        console.warn('LINE Bot send error:', lineErr);
      }
    }

    // 3. Send via Telegram Bot if token and chat ID provided
    if (telegramToken.trim() && telegramChatId.trim()) {
      try {
        localStorage.setItem('prime-tg-token', telegramToken.trim());
        localStorage.setItem('prime-tg-chat-id', telegramChatId.trim());

        const text = `🚨 *[เรียกประชุมด่วน - PRIME VIRTUAL OFFICE]*\n\n📌 *เรื่อง:* ${inviteTitle}\n🏢 *ห้องประชุม:* ${roomName}\n👤 *ผู้เรียก:* ${client.myName}\n\nกรุณาเข้าสู่ระบบ PRIME Teamwork เพื่อร่วมประชุมทันที!`;
        const res = await fetch(`https://api.telegram.org/bot${telegramToken.trim()}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId.trim(),
            text,
            parse_mode: 'Markdown'
          })
        });
        if (!res.ok) {
          throw new Error('Telegram bot error');
        }
      } catch (err) {
        console.warn('Telegram send failed:', err);
      }
    }

    setInviteStatus('ส่งแจ้งเตือนสำเร็จแล้ว!');
    setTimeout(() => {
      setInviteStatus(null);
      setInviteOpen(false);
    }, 1200);
  };

  // Generate Email mailto link
  const generateMailtoLink = () => {
    const subject = encodeURIComponent(`[เชิญประชุมด่วน] ${inviteTitle} (${roomName})`);
    const body = encodeURIComponent(`เรียนทีมงาน PRIME,\n\nขอเชิญร่วมประชุมด่วน:\nหัวข้อ: ${inviteTitle}\nสถานที่: ห้อง ${roomName} บน PRIME Virtual Office\nผู้เรียกประชุม: ${client.myName}\n\nกรุณาเปิดระบบ PRIME Teamwork เพื่อเข้าร่วมการประชุมได้ทันทีครับ`);
    return `mailto:?subject=${subject}&body=${body}`;
  };

  // ---------------------------------------------------------------------------
  // 1. MINI FLOATING PLAYER (Picture-in-Picture Mode - Draggable anywhere)
  // ---------------------------------------------------------------------------
  if (isMinimized) {
    const featuredParticipant = screenSharer || participants.find(p => p.isSpeaking) || participants[0];

    return (
      <aside 
        className="conference-mini-player draggable-pip"
        style={{
          left: `${pipPos.x}px`,
          top: `${pipPos.y}px`,
          right: 'auto',
          bottom: 'auto'
        }}
      >
        <div 
          className="mini-player-header drag-handle"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="คลิกแล้วลากเพื่อย้ายตำแหน่งจอเล็กไปที่ไหนก็ได้"
        >
          <div className="mini-title">
            <Move size={12} style={{ opacity: 0.7, marginRight: '4px' }} />
            <span className="live-dot" />
            <strong>{roomName}</strong>
            <span className="mini-count">({participants.length})</span>
          </div>
          <div className="mini-actions" onPointerDown={e => e.stopPropagation()}>
            <button className="mini-btn" onClick={onToggleMinimize} title="ขยายเต็มหน้าจอ">
              <Maximize2 size={13} />
            </button>
            <button className="mini-btn red" onClick={onClose} title="วางสาย / ออกจากการประชุม">
              <PhoneOff size={13} />
            </button>
          </div>
        </div>

        <div className="mini-player-video">
          {featuredParticipant && (
            <VideoTile 
              participant={featuredParticipant} 
              isSelf={featuredParticipant.id === client.myId}
              isSpotlight={false}
              onToggleSpotlight={() => {}}
            />
          )}
        </div>

        <div className="mini-player-controls">
          <button 
            className={`mini-ctrl-btn ${client.isMuted ? 'muted' : ''}`} 
            onClick={() => client.toggleMute()}
            title={client.isMuted ? 'เปิดไมค์' : 'ปิดไมค์'}
          >
            {client.isMuted ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
          <button 
            className={`mini-ctrl-btn ${!client.isCameraOn ? 'muted' : ''}`} 
            onClick={() => void client.toggleCamera()}
            title={client.isCameraOn ? 'ปิดกล้อง' : 'เปิดกล้อง'}
          >
            {client.isCameraOn ? <Video size={14} /> : <VideoOff size={14} />}
          </button>
          <button 
            className={`mini-ctrl-btn ${client.isHandRaised ? 'active' : ''}`} 
            onClick={() => client.toggleRaiseHand()}
            title="ยกมือถาม"
          >
            <Hand size={14} />
          </button>
        </div>
      </aside>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. FULL CONCURRENT MEETING STAGE
  // ---------------------------------------------------------------------------
  return (
    <div className={`conference-modal-backdrop ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={modalContainerRef}>
      <div className="conference-stage-card">
        {/* Stage Header */}
        <header className="conference-header">
          <div className="conference-header-left">
            <div className="live-badge-capsule">
              <span className="live-pulsing-dot" />
              <span>LIVE CONFERENCE</span>
            </div>
            <h2>{roomName}</h2>
            <span className="participant-counter">
              <Users size={14} />
              <span>{participants.length} คนในห้องประชุม</span>
            </span>
          </div>

          <div className="conference-header-right">
            {/* Call Meeting / Invite Button */}
            <button 
              className="stage-tool-btn invite-btn"
              onClick={() => setInviteOpen(true)}
              title="เรียกประชุมด่วน / ส่งการแจ้งเตือนทางอีเมล หรือ Telegram"
            >
              <Bell size={15} />
              <span>เรียกประชุมด่วน</span>
            </button>

            {/* Effects Button */}
            <button 
              className={`stage-tool-btn ${effectsOpen ? 'active' : ''}`}
              onClick={() => setEffectsOpen(!effectsOpen)}
              title="Virtual Background, Avatar, และ Video Filters"
            >
              <Sparkles size={15} color="#ec4899" />
              <span>ปรับแต่งกล้อง & Avatar</span>
            </button>

            {/* Toggle Fullscreen Screen */}
            <button 
              className="stage-tool-btn" 
              onClick={handleToggleFullscreen}
              title={isFullscreen ? 'ย่อจากเต็มจอ' : 'ขยายเต็มหน้าจอ (Fullscreen)'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span>{isFullscreen ? 'ย่อหน้าต่าง' : 'เต็มหน้าจอ'}</span>
            </button>

            {/* Minimize to PiP */}
            <button 
              className="stage-tool-btn" 
              onClick={onToggleMinimize} 
              title="ย่อหน้าต่างเป็น Mini-player เพื่อดูงานในออฟฟิศ"
            >
              <Minimize2 size={16} />
              <span>ย่อจอเล็ก</span>
            </button>

            {/* Close / Leave */}
            <button 
              className="stage-close-btn" 
              onClick={onClose} 
              title="ออกจากการประชุม"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Stage Body (Video Grid + Optional Panels) */}
        <div className="conference-body">
          <div className={`conference-video-canvas ${effectiveSpotlightId ? 'has-spotlight' : ''} ${chatOpen ? 'chat-expanded' : ''} ${effectsOpen ? 'effects-expanded' : ''}`}>
            {effectiveSpotlightId ? (
              // Spotlight Layout: 1 large main video + sidebar of small tiles
              <div className="spotlight-layout">
                <div className="spotlight-main">
                  {(() => {
                    const spot = participants.find(p => p.id === effectiveSpotlightId) || participants[0];
                    return (
                      <VideoTile 
                        participant={spot} 
                        isSelf={spot.id === client.myId} 
                        isSpotlight={true} 
                        onToggleSpotlight={() => setSpotlightId(null)} 
                      />
                    );
                  })()}
                </div>
                <div className="spotlight-filmstrip">
                  {participants.filter(p => p.id !== effectiveSpotlightId).map(p => (
                    <VideoTile 
                      key={p.id} 
                      participant={p} 
                      isSelf={p.id === client.myId} 
                      isSpotlight={false} 
                      onToggleSpotlight={() => setSpotlightId(p.id)} 
                    />
                  ))}
                </div>
              </div>
            ) : (
              // Gallery Grid Layout
              <div className={`gallery-grid grid-count-${Math.min(participants.length, 6)}`}>
                {participants.map(p => (
                  <VideoTile 
                    key={p.id} 
                    participant={p} 
                    isSelf={p.id === client.myId} 
                    isSpotlight={false} 
                    onToggleSpotlight={() => setSpotlightId(p.id)} 
                  />
                ))}
              </div>
            )}
          </div>

          {/* Video Effects Sidebar Panel */}
          {effectsOpen && (
            <aside className="conference-effects-panel">
              <div className="effects-panel-header">
                <h3><Sparkles size={16} color="#ec4899" /> ปรับแต่งกล้อง & Avatar</h3>
                <button className="chat-close-btn" onClick={() => setEffectsOpen(false)}>
                  <X size={15} />
                </button>
              </div>

              <div className="effects-panel-content">
                {/* 1. Virtual Backgrounds */}
                <div className="effect-group">
                  <span className="effect-group-label">🖼️ พื้นหลังเสมือน (Virtual Background)</span>
                  <div className="effect-chips-grid">
                    <button 
                      className={`effect-chip ${selectedEffect === 'none' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('none')}
                    >
                      <span>🚫 กล้องสดปกติ</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'blur-light' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('blur-light')}
                    >
                      <span>🌫️ เบลอพื้นหลังเบาๆ</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'blur-heavy' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('blur-heavy')}
                    >
                      <span>🌁 เบลอพื้นหลังเข้ม</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'bg-office' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('bg-office')}
                    >
                      <span>🏢 ออฟฟิศโมเดิร์น</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'bg-loft' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('bg-loft')}
                    >
                      <span>🧱 ลอฟต์สตูดิโอ</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'bg-cafe' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('bg-cafe')}
                    >
                      <span>☕ มุมคาเฟ่อบอุ่น</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'bg-beach' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('bg-beach')}
                    >
                      <span>🏖️ วิวพระอาทิตย์ริมหาด</span>
                    </button>
                  </div>
                </div>

                {/* 2. Interactive Avatar Mode */}
                <div className="effect-group">
                  <span className="effect-group-label">🎭 อวตารแทนกล้อง (Avatar Audio-Reactive)</span>
                  <p className="effect-hint">อวตารจะขยับปากและกะพริบตาตามเสียงพูดจริงของคุณโดยอัตโนมัติ</p>
                  <div className="effect-chips-grid">
                    <button 
                      className={`effect-chip ${selectedEffect === 'avatar-doll' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('avatar-doll')}
                    >
                      <span>👧🏻 ตุ๊กตาอวตาร 3D Doll</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'avatar-cat' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('avatar-cat')}
                    >
                      <span>🐱 น้องแมวส้มไซเบอร์</span>
                    </button>
                  </div>
                </div>

                {/* 3. Camera Filters */}
                <div className="effect-group">
                  <span className="effect-group-label">🎨 ฟิลเตอร์กล้อง (Camera Filters)</span>
                  <div className="effect-chips-grid">
                    <button 
                      className={`effect-chip ${selectedEffect === 'filter-warm' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('filter-warm')}
                    >
                      <span>☀️ แสงแดดอบอุ่น (Warm)</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'filter-beauty' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('filter-beauty')}
                    >
                      <span>✨ บิวตี้สตูดิโอ (Soft Glow)</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'filter-cyberpunk' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('filter-cyberpunk')}
                    >
                      <span>⚡ ไซเบอร์พังก์นีออน</span>
                    </button>
                    <button 
                      className={`effect-chip ${selectedEffect === 'filter-mono' ? 'active' : ''}`}
                      onClick={() => void handleApplyEffect('filter-mono')}
                    >
                      <span>🎞️ ขาวดำคลาสสิก (B&W)</span>
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* In-Call Chat Sidebar */}
          {chatOpen && (
            <aside className="conference-chat-panel">
              <div className="chat-panel-header">
                <h3>แชทในห้องประชุม</h3>
                <button className="chat-close-btn" onClick={() => setChatOpen(false)}>
                  <X size={15} />
                </button>
              </div>

              <div className="chat-message-list">
                {client.messages.length === 0 ? (
                  <div className="chat-empty-state">
                    <MessageSquare size={24} color="#94a3b8" />
                    <p>ยังไม่มีข้อความในห้องประชุม<br />พิมพ์เพื่อส่งข้อความถึงทุกคนได้ทันที</p>
                  </div>
                ) : (
                  client.messages.map(m => (
                    <div key={m.id} className={`chat-bubble-row ${m.from === client.myId ? 'self' : ''}`}>
                      <div className="chat-bubble">
                        <div className="chat-meta">
                          <strong>{m.senderName}</strong>
                          <small>{m.time}</small>
                        </div>
                        <p>{m.text}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              <form className="chat-input-box" onSubmit={handleSendMessage}>
                <input 
                  type="text" 
                  placeholder="พิมพ์ข้อความในที่ประชุม..." 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)} 
                />
                <button type="submit" disabled={!chatInput.trim()}>
                  <Send size={15} />
                </button>
              </form>
            </aside>
          )}
        </div>

        {/* Stage Bottom Floating Control Dock */}
        <footer className="conference-footer-controls">
          <div className="control-group">
            {/* Microphone Toggle */}
            <button 
              className={`control-pill-btn ${client.isMuted ? 'muted' : 'active'}`}
              onClick={() => client.toggleMute()}
              title={client.isMuted ? 'เปิดไมโครโฟน' : 'ปิดไมโครโฟน'}
            >
              {client.isMuted ? <MicOff size={17} /> : <Mic size={17} />}
              <span>{client.isMuted ? 'ไมค์ปิด' : 'ไมค์เปิด'}</span>
            </button>

            {/* Camera Toggle */}
            <button 
              className={`control-pill-btn ${!client.isCameraOn ? 'muted' : 'active'}`}
              onClick={() => void client.toggleCamera()}
              title={client.isCameraOn ? 'ปิดกล้อง' : 'เปิดกล้อง'}
            >
              {client.isCameraOn ? <Video size={17} /> : <VideoOff size={17} />}
              <span>{client.isCameraOn ? 'กล้องเปิด' : 'กล้องปิด'}</span>
            </button>

            {/* Screen Share Toggle */}
            <button 
              className={`control-pill-btn ${client.isScreenSharing ? 'screen-active' : ''}`}
              onClick={() => void client.toggleScreenShare()}
              title={client.isScreenSharing ? 'หยุดแชร์หน้าจอ' : 'แชร์หน้าจอ / สไลด์'}
            >
              {client.isScreenSharing ? <MonitorOff size={17} /> : <Monitor size={17} />}
              <span>{client.isScreenSharing ? 'กำลังแชร์จอ' : 'แชร์หน้าจอ'}</span>
            </button>
          </div>

          <div className="control-group">
            {/* Raise Hand Toggle */}
            <button 
              className={`control-pill-btn ${client.isHandRaised ? 'hand-active' : ''}`}
              onClick={() => client.toggleRaiseHand()}
              title="ยกมือถามผู้บรรยาย"
            >
              <Hand size={17} />
              <span>{client.isHandRaised ? 'ยกมืออยู่' : 'ยกมือ'}</span>
            </button>

            {/* Video Effects Button */}
            <button 
              className={`control-pill-btn ${effectsOpen ? 'effects-active' : ''}`}
              onClick={() => setEffectsOpen(!effectsOpen)}
              title="เอฟเฟกต์กล้อง & Avatar"
            >
              <Sparkles size={17} color="#ec4899" />
              <span>เอฟเฟกต์</span>
            </button>

            {/* In-Call Chat Toggle */}
            <button 
              className={`control-pill-btn ${chatOpen ? 'chat-active' : ''}`}
              onClick={() => setChatOpen(!chatOpen)}
              title="เปิดกล่องแชทในห้องประชุม"
            >
              <MessageSquare size={17} />
              <span>แชท</span>
              {client.messages.length > 0 && <span className="chat-counter-badge">{client.messages.length}</span>}
            </button>
          </div>

          <div className="control-group">
            {/* Leave Conference Button */}
            <button 
              className="control-pill-btn leave-meeting-btn"
              onClick={onClose}
              title="ออกจากห้องประชุม"
            >
              <PhoneOff size={17} />
              <span>วางสาย</span>
            </button>
          </div>
        </footer>
      </div>

      {/* MODAL: Call Meeting / Invite Channels */}
      {inviteOpen && (
        <div className="conference-modal-inner-dialog">
          <div className="invite-dialog-card">
            <div className="invite-dialog-header">
              <div>
                <h3>📢 เรียกประชุมด่วน ({roomName})</h3>
                <p>ส่งการแจ้งเตือนเชิญเพื่อนร่วมทีมเข้าห้องประชุมทันที</p>
              </div>
              <button className="chat-close-btn" onClick={() => setInviteOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="invite-dialog-body">
              <label className="invite-field-label">หัวข้อการประชุม</label>
              <input 
                type="text" 
                className="invite-input"
                value={inviteTitle}
                onChange={e => setInviteTitle(e.target.value)}
                placeholder="ระบุหัวข้อประชุม เช่น ปรึกษาเคสลูกค้าด่วน…"
              />

              <div className="invite-channels-box">
                <span className="channel-box-title">ช่องทางการส่งแจ้งเตือน:</span>

                {/* Channel 1: In-App Broadcast */}
                <div className="channel-option in-app">
                  <div className="channel-icon"><Bell size={18} color="#2563eb" /></div>
                  <div className="channel-info">
                    <strong>แจ้งเตือนด่วนบนระบบ PRIME</strong>
                    <small>ขึ้นหน้าต่างป๊อปอัปและส่งเสียงเรียกทุกคนในระบบทันที</small>
                  </div>
                  <span className="channel-ready-badge">✓ พร้อมส่ง</span>
                </div>

                {/* Channel 2: Email Client Mailto */}
                <div className="channel-option email">
                  <div className="channel-icon"><Mail size={18} color="#059669" /></div>
                  <div className="channel-info">
                    <strong>ส่งอีเมลเชิญทีม (Email Mailto)</strong>
                    <small>เปิดอีเมลไคลเอนต์พร้อมข้อความและลิงก์ห้อง</small>
                  </div>
                  <a 
                    href={generateMailtoLink()} 
                    target="_blank" 
                    rel="noreferrer"
                    className="channel-action-btn email"
                  >
                    เปิดอีเมล
                  </a>
                </div>

                {/* Channel 3: LINE Bot & LINE Direct Share (Recommended in TH) */}
                <div className="channel-option line" style={{ borderLeft: '4px solid #06C755' }}>
                  <div className="channel-icon" style={{ background: '#e8f9ed', color: '#06C755' }}>
                    <MessageSquare size={18} />
                  </div>
                  <div className="channel-info" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <strong>ส่งแจ้งเตือนเข้ากลุ่ม LINE (LINE Bot)</strong>
                      <button
                        type="button"
                        style={{ background: '#06C755', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                        onClick={() => openLineShare(getMeetingInviteText())}
                        title="เปิดแอป LINE เพื่อเลือกกลุ่มหรือห้องแชทที่จะแชร์ข้อความทันที"
                      >
                        <MessageSquare size={12} /> แชร์เข้าแอป LINE ทันที
                      </button>
                    </div>
                    <small style={{ display: 'block', color: '#64748b', margin: '4px 0 8px' }}>
                      ยิงบอทอัตโนมัติด้วย LINE Messaging API (ใส่ Channel Token & Group ID) หรือกดแชร์เข้าแอป LINE ด้านบน
                    </small>
                    <div className="tg-inputs-row">
                      <input 
                        type="password"
                        placeholder="LINE Channel Access Token"
                        value={lineToken}
                        onChange={e => setLineToken(e.target.value)}
                        className="tg-small-input"
                      />
                      <input 
                        type="text"
                        placeholder="Group ID (C...) หรือ User ID (U...)"
                        value={lineTargetId}
                        onChange={e => setLineTargetId(e.target.value)}
                        className="tg-small-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Channel 4: Telegram Bot Integration */}
                <div className="channel-option telegram">
                  <div className="channel-icon"><SendHorizontal size={18} color="#0284c7" /></div>
                  <div className="channel-info">
                    <strong>เชื่อมต่อ Telegram Bot</strong>
                    <small>ส่งข้อความแจ้งเตือนเข้า Telegram Group / Channel</small>
                    <div className="tg-inputs-row">
                      <input 
                        type="password"
                        placeholder="Telegram Bot Token"
                        value={telegramToken}
                        onChange={e => setTelegramToken(e.target.value)}
                        className="tg-small-input"
                      />
                      <input 
                        type="text"
                        placeholder="Telegram Chat / Group ID"
                        value={telegramChatId}
                        onChange={e => setTelegramChatId(e.target.value)}
                        className="tg-small-input"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {inviteStatus && (
                <div className="invite-status-banner">
                  <Check size={16} /> <span>{inviteStatus}</span>
                </div>
              )}
            </div>

            <div className="invite-dialog-footer">
              <button 
                type="button" 
                className="secondary" 
                onClick={() => setInviteOpen(false)}
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                className="primary" 
                onClick={handleSendMeetingInvite}
              >
                <Bell size={15} /> ส่งเรียกประชุมทันที
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
