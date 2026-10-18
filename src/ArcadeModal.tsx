import React, { useState } from 'react';
import { X, ExternalLink, Play, Gamepad2, Trophy, Flame, Sparkles, Plus } from 'lucide-react';

export interface PartyGameItem {
  id: string;
  title: string;
  category: string;
  emoji: string;
  url: string;
  desc: string;
  recommendedPlayers: string;
}

export const FEATURED_GAMES: PartyGameItem[] = [
  {
    id: 'skribbl',
    title: 'Skribbl.io',
    category: 'วาดภาพทายคำ',
    emoji: '🎨',
    url: 'https://skribbl.io/',
    desc: 'ผลัดกันวาดภาพและพิมพ์ทายคำศัพท์ภาษาไทยหรืออังกฤษร่วมกับทีม',
    recommendedPlayers: '3–12 คน',
  },
  {
    id: 'gartic',
    title: 'Gartic Phone',
    category: 'กระซิบส่งต่อภาพ',
    emoji: '📞',
    url: 'https://garticphone.com/',
    desc: 'เกมโทรศัพท์สายหลุดสุดฮา เขียนประโยคและวาดต่อตามจินตนาการ',
    recommendedPlayers: '4–15 คน',
  },
  {
    id: 'codenames',
    title: 'Codenames Online',
    category: 'ถอดรหัสสายลับ',
    emoji: '🕵️',
    url: 'https://codenames.game/',
    desc: 'แบ่งฝ่ายแข่งกันใบ้คำเพื่อค้นหาตัวแทนสายลับของทีมให้ครบก่อน',
    recommendedPlayers: '4–10 คน',
  },
  {
    id: 'chess',
    title: 'Lichess Online',
    category: 'กระดานหมากรุก',
    emoji: '♟️',
    url: 'https://lichess.org/',
    desc: 'ประลองปัญญาดวลหมากรุกสากลแบบเรียลไทม์กับเพื่อนร่วมทีม',
    recommendedPlayers: '2 คน',
  },
  {
    id: 'jigsaw',
    title: 'Jigsaw Puzzles',
    category: 'ต่อจิ๊กซอว์ร่วมกัน',
    emoji: '🧩',
    url: 'https://jigsawpuzzles.io/',
    desc: 'ร่วมมือกันต่อจิ๊กซอว์ภาพสวยงามหลายร้อยชิ้น ช่วยผ่อนคลายและฝึกสมาธิ',
    recommendedPlayers: '1–8 คน',
  },
];

interface ArcadeModalProps {
  onClose: () => void;
  onStartGoKart: () => void;
}

export const ArcadeModal: React.FC<ArcadeModalProps> = ({ onClose, onStartGoKart }) => {
  const [customGameUrl, setCustomGameUrl] = useState('');
  const [customGameName, setCustomGameName] = useState('');
  const [activeIframeUrl, setActiveIframeUrl] = useState<string | null>(null);
  const [customList, setCustomList] = useState<PartyGameItem[]>(() => {
    try {
      const saved = localStorage.getItem('prime_custom_games_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleAddCustomGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGameUrl.trim()) return;
    let url = customGameUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const newGame: PartyGameItem = {
      id: 'custom-' + Date.now(),
      title: customGameName.trim() || 'เกมเว็บที่แปะลิงก์',
      category: 'ลิงก์ของทีม',
      emoji: '🎮',
      url,
      desc: url,
      recommendedPlayers: 'ตามที่เกมกำหนด',
    };
    const updated = [newGame, ...customList];
    setCustomList(updated);
    try {
      localStorage.setItem('prime_custom_games_v1', JSON.stringify(updated));
    } catch { }
    setCustomGameUrl('');
    setCustomGameName('');
  };

  const allGames = [...customList, ...FEATURED_GAMES];

  return (
    <div className="arcade-modal-backdrop" onClick={onClose}>
      <div className="arcade-modal-window" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="arcade-modal-header">
          <div className="arcade-header-brand">
            <span className="arcade-brand-icon"><Gamepad2 size={22} /></span>
            <div>
              <h2>🎮 ห้องเกม Arcade & Lounge</h2>
              <p>พื้นที่สังสรรค์ ผ่อนคลายความเครียด และเล่นเกมร่วมกันในทีม</p>
            </div>
          </div>
          <button className="arcade-close-btn" onClick={onClose} title="ปิดหน้าต่าง">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="arcade-modal-body">
          {/* 1. Highlight Banner: Office Go-Kart Mini-Game */}
          <div className="gokart-banner-card">
            <div className="gokart-banner-art">
              <span className="gokart-art-icon">🏎️💨</span>
            </div>
            <div className="gokart-banner-content">
              <div className="gokart-banner-badge">
                <Flame size={13} color="#f59e0b" />
                <span>มินิเกมซิ่งรถในออฟฟิศ (OFFICE GO-KART)</span>
              </div>
              <h3>แข่งโกคาร์ทซิ่งรอบออฟฟิศ PRIME!</h3>
              <p>แปลงร่างตุ๊กตาหุ่นของคุณเป็นนักซิ่งโกคาร์ท บังคับด้วยปุ่มลูกศรหรือปุ่ม WASD ซิ่งวนรอบโต๊ะทำงาน เก็บดาว และทำสถิติความเร็วประจำวัน!</p>
              <div className="gokart-banner-actions">
                <button
                  type="button"
                  className="start-gokart-btn"
                  onClick={() => {
                    onClose();
                    onStartGoKart();
                  }}
                >
                  <Play size={16} fill="#ffffff" />
                  <span>เริ่มซิ่งโกคาร์ททันที (Go-Kart Mode)</span>
                </button>
                <span className="gokart-tips">กดปุ่มลูกศร ◄ ▲ ▼ ► เพื่อควบคุมความเร็วและเลี้ยว</span>
              </div>
            </div>
          </div>

          {/* 2. Custom Link Bar */}
          <div className="custom-game-adder-box">
            <h4><Plus size={15} /> แปะลิงก์เกมเว็บใหม่เพื่อเล่นร่วมกัน</h4>
            <form onSubmit={handleAddCustomGame} className="custom-game-form">
              <input
                type="text"
                placeholder="ชื่อเกม (เช่น Board Game Arena, Codenames...)"
                value={customGameName}
                onChange={e => setCustomGameName(e.target.value)}
                className="custom-game-name-input"
              />
              <input
                type="url"
                required
                placeholder="วางลิงก์ห้องเกม (https://...)"
                value={customGameUrl}
                onChange={e => setCustomGameUrl(e.target.value)}
                className="custom-game-url-input"
              />
              <button type="submit" className="custom-game-add-btn">
                <span>บันทึกเกมลงห้อง</span>
              </button>
            </form>
          </div>

          {/* 3. Featured Party Games Grid */}
          <div className="arcade-section-heading">
            <h4><Sparkles size={16} color="#d97706" /> เกมออนไลน์แนะนำสำหรับทีมงาน</h4>
            <small>คลิกเปิดเล่นในแท็บใหม่ หรือแชร์ห้องให้เพื่อนในห้องแชทได้ทันที</small>
          </div>

          <div className="party-games-grid">
            {allGames.map(game => (
              <div className="party-game-card" key={game.id}>
                <div className="game-card-top">
                  <span className="game-card-emoji">{game.emoji}</span>
                  <div className="game-card-title-group">
                    <strong>{game.title}</strong>
                    <span className="game-category-tag">{game.category}</span>
                  </div>
                </div>
                <p className="game-card-desc">{game.desc}</p>
                <div className="game-card-footer">
                  <span className="game-players-info">👥 {game.recommendedPlayers}</span>
                  <a
                    href={game.url}
                    target="_blank"
                    rel="noreferrer"
                    className="launch-game-link"
                    title={`เปิด ${game.title} ในแท็บใหม่`}
                  >
                    <span>เปิดเล่น</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
