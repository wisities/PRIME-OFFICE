import { useEffect, useRef, useState } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Hand, 
  MessageSquare, X, Minimize2, Maximize2, Users, PhoneOff, Send, Pin
} from 'lucide-react';
import type { VideoConferenceClient, ConferenceParticipant, ConferenceMessage } from './conference';

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
          muted={true} // Audio is cleanly handled by dedicated background audio elements to prevent echo and maintain uninterrupted audio
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
  // Default spotlight to screen sharer if active, or user selected spotlight
  const effectiveSpotlightId = spotlightId || (screenSharer ? screenSharer.id : null);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    client.sendMessage(chatInput);
    setChatInput('');
  };

  // ---------------------------------------------------------------------------
  // 1. MINI FLOATING PLAYER (Picture-in-Picture Mode)
  // ---------------------------------------------------------------------------
  if (isMinimized) {
    const featuredParticipant = screenSharer || participants.find(p => p.isSpeaking) || participants[0];

    return (
      <aside className="conference-mini-player">
        <div className="mini-player-header">
          <div className="mini-title">
            <span className="live-dot" />
            <strong>{roomName}</strong>
            <span className="mini-count">({participants.length})</span>
          </div>
          <div className="mini-actions">
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
    <div className="conference-modal-backdrop">
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
            <button 
              className="stage-tool-btn" 
              onClick={onToggleMinimize} 
              title="ย่อหน้าต่างเป็น Mini-player เพื่อดูงานในออฟฟิศ"
            >
              <Minimize2 size={16} />
              <span>ย่อหน้าต่าง</span>
            </button>
            <button 
              className="stage-close-btn" 
              onClick={onClose} 
              title="ออกจากการประชุม"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Stage Body (Video Grid + Optional Chat Sidebar) */}
        <div className="conference-body">
          <div className={`conference-video-canvas ${effectiveSpotlightId ? 'has-spotlight' : ''} ${chatOpen ? 'chat-expanded' : ''}`}>
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
    </div>
  );
}
