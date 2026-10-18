import React, { useState } from 'react';

export type PetType = 'cat' | 'dog' | 'hamster' | 'frog' | 'toad';

export interface PetConfig {
  type: PetType;
  name: string;
  color?: string;
}

export const PET_CATALOG: Record<PetType, { label: string; emoji: string; desc: string; defaultName: string; sound: string }> = {
  cat: {
    label: 'แมวเหมียว (Cat)',
    emoji: '🐱',
    desc: 'แมวส้มขี้อ้อน เดินคลอเคลียข้างโต๊ะทำงาน',
    defaultName: 'น้องส้มซ่า',
    sound: 'เหมียว~ 🐾',
  },
  dog: {
    label: 'น้องหมาชิบะ (Dog)',
    emoji: '🐶',
    desc: 'ซื่อสัตย์ ร่าเริง กระดิกหางต้อนรับทุกคน',
    defaultName: 'เจ้าม่อน',
    sound: 'โฮ่งๆ! 🦴',
  },
  hamster: {
    label: 'หนูแฮมสเตอร์ (Hamster)',
    emoji: '🐹',
    desc: 'ตัวกลมดุ๊กดิ๊ก ชอบแทะเมล็ดทานตะวัน',
    defaultName: 'เจ้านุ่มนิ่ม',
    sound: 'จี๊ดๆ! 🌻',
  },
  frog: {
    label: 'กบเขียวตากลม (Frog)',
    emoji: '🐸',
    desc: 'กระโดดดุ๊กดิ๊ก ตาแป๋ว เรียกรอยยิ้มได้ทั้งวัน',
    defaultName: 'พี่กบอ๊บ',
    sound: 'อ๊บๆ~ 💧',
  },
  toad: {
    label: 'คางคกทองนำโชค (Fortune Toad)',
    emoji: '👑🐸',
    desc: 'คางคกทองสวมมงกุฎ สัญลักษณ์ดูดทรัพย์และโชคลาภ',
    defaultName: 'ท่านทองแท้',
    sound: 'ก๊าบ! โชคดีร่ำรวย 💰',
  },
};

interface CompanionPetProps {
  type: PetType;
  name?: string;
  isWalking?: boolean;
  facing?: 'left' | 'right';
  onClick?: () => void;
  size?: 'normal' | 'small' | 'large';
}

export const CompanionPet: React.FC<CompanionPetProps> = ({
  type,
  name,
  isWalking = false,
  facing = 'right',
  onClick,
  size = 'normal',
}) => {
  const [hearts, setHearts] = useState<{ id: number; text: string }[]>([]);
  const [speechBubble, setSpeechBubble] = useState<string | null>(null);

  const petInfo = PET_CATALOG[type] || PET_CATALOG.cat;
  const displayName = name || petInfo.defaultName;

  const handlePet = (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = Date.now();
    const texts = ['❤️', '✨', '🐾', '🥰', '💖'];
    const randomText = texts[Math.floor(Math.random() * texts.length)];
    setHearts(prev => [...prev, { id, text: randomText }]);
    setSpeechBubble(petInfo.sound);

    setTimeout(() => {
      setHearts(prev => prev.filter(h => h.id !== id));
    }, 1200);

    setTimeout(() => {
      setSpeechBubble(null);
    }, 2500);

    onClick?.();
  };

  return (
    <div
      className={`companion-pet-wrapper ${type} ${isWalking ? 'pet-walking' : 'pet-idle'} ${size}`}
      onClick={handlePet}
      style={{
        transform: facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)',
      }}
      title={`คลิกเพื่อลูบหัว ${displayName} (${petInfo.label})`}
    >
      {/* Speech Bubble / Sound */}
      {speechBubble && (
        <div
          className="pet-speech-bubble"
          style={{ transform: facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)' }}
        >
          <span>{speechBubble}</span>
        </div>
      )}

      {/* Floating Pet Hearts */}
      {hearts.map(h => (
        <span key={h.id} className="pet-floating-heart">
          {h.text}
        </span>
      ))}

      {/* Pet Character Body */}
      <div className="pet-creature">
        {type === 'cat' && (
          <div className="pet-cat-body">
            <span className="cat-ears" />
            <span className="cat-face">🐱</span>
            <span className="cat-tail" />
          </div>
        )}

        {type === 'dog' && (
          <div className="pet-dog-body">
            <span className="dog-ears" />
            <span className="dog-face">🐶</span>
            <span className="dog-tail" />
          </div>
        )}

        {type === 'hamster' && (
          <div className="pet-hamster-body">
            <span className="hamster-face">🐹</span>
            <span className="hamster-sunflower" title="เมล็ดทานตะวัน">🌻</span>
          </div>
        )}

        {type === 'frog' && (
          <div className="pet-frog-body">
            <span className="frog-eyes" />
            <span className="frog-face">🐸</span>
            <span className="frog-lily" />
          </div>
        )}

        {type === 'toad' && (
          <div className="pet-toad-body">
            <span className="toad-crown">👑</span>
            <span className="toad-face">🐸</span>
            <span className="toad-coin" title="เหรียญทองเรียกทรัพย์">💰</span>
          </div>
        )}
      </div>

      {/* Pet Name Tag */}
      <span
        className="pet-name-pill"
        style={{ transform: facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)' }}
      >
        {displayName}
      </span>
    </div>
  );
};
