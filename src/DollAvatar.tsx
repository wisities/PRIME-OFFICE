import React, { useMemo } from 'react';
import type { Member } from './data';

export type DollSkinTone = 'fair' | 'peach' | 'warm' | 'tan' | 'deep';
export type DollHairStyle = 'short' | 'curly' | 'ponytail' | 'bob' | 'wavy';
export type DollOutfitColor = 'navy' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';

export interface DollConfig {
  skinTone?: DollSkinTone;
  hairStyle?: DollHairStyle;
  outfitColor?: DollOutfitColor;
  accessories?: 'glasses' | 'headphone' | 'none';
}

interface DollAvatarProps {
  member: Member;
  isMoving?: boolean;
  facing?: 'left' | 'right';
  isSpeaking?: boolean;
  size?: 'normal' | 'small' | 'large';
  showName?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  config?: DollConfig;
}

const SKIN_COLORS: Record<DollSkinTone, string> = {
  fair: '#fbe3d5',
  peach: '#f7d3ba',
  warm: '#eec19e',
  tan: '#d99f78',
  deep: '#9c6644',
};

const OUTFIT_COLORS: Record<DollOutfitColor, { top: string; collar: string; pants: string }> = {
  navy: { top: '#1c4d6b', collar: '#e2e8f0', pants: '#0f172a' },
  emerald: { top: '#15803d', collar: '#dcfce7', pants: '#1e293b' },
  amber: { top: '#b45309', collar: '#fef3c7', pants: '#334155' },
  rose: { top: '#be123c', collar: '#ffe4e6', pants: '#1e293b' },
  indigo: { top: '#4338ca', collar: '#e0e7ff', pants: '#0f172a' },
  slate: { top: '#334155', collar: '#f1f5f9', pants: '#0f172a' },
};

export const DollAvatar: React.FC<DollAvatarProps> = ({
  member,
  isMoving = false,
  facing = 'right',
  isSpeaking = false,
  size = 'normal',
  showName = true,
  onClick,
  config,
}) => {
  // Deterministic avatar styling derived from member ID or explicit config
  const derivedConfig = useMemo<DollConfig>(() => {
    if (config) return config;
    const hash = member.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const skins: DollSkinTone[] = ['fair', 'peach', 'warm', 'tan'];
    const hairs: DollHairStyle[] = ['short', 'bob', 'curly', 'ponytail', 'wavy'];
    const outfits: DollOutfitColor[] = ['navy', 'emerald', 'amber', 'rose', 'indigo', 'slate'];

    return {
      skinTone: skins[hash % skins.length],
      hairStyle: hairs[(hash >> 2) % hairs.length],
      outfitColor: outfits[(hash >> 4) % outfits.length],
      accessories: (hash % 3 === 0) ? 'glasses' : (hash % 5 === 0) ? 'headphone' : 'none',
    };
  }, [member.id, config]);

  const skin = SKIN_COLORS[derivedConfig.skinTone || 'peach'];
  const outfit = OUTFIT_COLORS[derivedConfig.outfitColor || 'navy'];
  const isImageAvatar = Boolean(member.avatarUrl && (member.avatarUrl.startsWith('http') || member.avatarUrl.startsWith('data:')));

  const scale = size === 'small' ? 0.72 : size === 'large' ? 1.25 : 1;

  return (
    <div
      className={`doll-avatar-root ${isMoving ? 'is-walking' : 'is-idle'} ${member.status} ${size}`}
      onClick={onClick}
      style={{
        transform: `scale(${scale}) ${facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)'}`,
      }}
      title={`${member.name} (${member.status})`}
    >
      {/* Name Tag (unflipped for readability) */}
      {showName && (
        <div
          className="doll-name-tag-wrapper"
          style={{ transform: facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)' }}
        >
          <span className={`doll-name-tag ${isSpeaking ? 'speaking' : ''}`}>
            {isSpeaking && <span className="doll-mic-pulse">🎙️</span>}
            <strong>{member.name}</strong>
          </span>
          {member.status === 'away' && <span className="doll-sleep-bubble">Zzz</span>}
        </div>
      )}

      {/* Shadow underneath */}
      <div className="doll-shadow" />

      {/* Doll Puppet Body */}
      <div className="doll-puppet">
        {/* Head */}
        <div className="doll-head" style={{ backgroundColor: skin }}>
          {isImageAvatar ? (
            <img src={member.avatarUrl} alt={member.name} className="doll-face-photo" />
          ) : (
            <>
              {/* Hair */}
              <div className={`doll-hair style-${derivedConfig.hairStyle}`} />

              {/* Eyes with Blink animation */}
              <div className="doll-eyes">
                <span className="doll-eye left" />
                <span className="doll-eye right" />
              </div>

              {/* Cheeks */}
              <div className="doll-blush left" />
              <div className="doll-blush right" />

              {/* Smile / Mouth */}
              <div className="doll-mouth" />

              {/* Accessories */}
              {derivedConfig.accessories === 'glasses' && (
                <div className="doll-glasses">
                  <span className="glass-lens left" />
                  <span className="glass-bridge" />
                  <span className="glass-lens right" />
                </div>
              )}

              {derivedConfig.accessories === 'headphone' && (
                <div className="doll-headphones">
                  <span className="headphone-band" />
                  <span className="headphone-cup left" />
                  <span className="headphone-cup right" />
                </div>
              )}
            </>
          )}

          {/* Status Indicator Dot */}
          <span className={`doll-status-dot ${member.online ? member.status : 'offline'}`} />
        </div>

        {/* Torso & Outfit */}
        <div className="doll-torso" style={{ backgroundColor: outfit.top }}>
          <div className="doll-collar" style={{ backgroundColor: outfit.collar }} />
          <div className="doll-badge-pin" />

          {/* Arms that swing when walking */}
          <div className="doll-arm left" style={{ backgroundColor: outfit.top }}>
            <div className="doll-hand" style={{ backgroundColor: skin }} />
          </div>
          <div className="doll-arm right" style={{ backgroundColor: outfit.top }}>
            <div className="doll-hand" style={{ backgroundColor: skin }} />
          </div>
        </div>

        {/* Legs & Feet (walk cycle) */}
        <div className="doll-legs" style={{ backgroundColor: outfit.pants }}>
          <div className="doll-leg left">
            <div className="doll-shoe" />
          </div>
          <div className="doll-leg right">
            <div className="doll-shoe" />
          </div>
        </div>
      </div>
    </div>
  );
};
