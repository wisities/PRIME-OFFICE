import React, { useState } from 'react';

export type PetType =
  | 'cat' | 'dog' | 'hamster' | 'frog' | 'toad'
  | 'rabbit' | 'bear' | 'panda' | 'koala' | 'tiger'
  | 'lion' | 'fox' | 'redpanda' | 'otter' | 'hedgehog'
  | 'penguin' | 'chick' | 'duck' | 'owl' | 'parrot'
  | 'dolphin' | 'seal' | 'whale' | 'turtle' | 'dino'
  | 'dragon' | 'unicorn' | 'monkey' | 'sheep' | 'alpaca';

export interface PetConfig {
  type: PetType;
  name: string;
  color?: string;
}

export const PET_CATALOG: Record<PetType, { label: string; emoji: string; desc: string; defaultName: string; sound: string; accessory?: string }> = {
  cat: {
    label: 'แมวส้ม (Cat)',
    emoji: '🐱',
    desc: 'แมวส้มขี้อ้อน เดินคลอเคลียข้างโต๊ะทำงาน',
    defaultName: 'น้องส้มซ่า',
    sound: 'เหมียว~ 🐾',
    accessory: '🐾',
  },
  dog: {
    label: 'หมาชิบะ (Dog)',
    emoji: '🐶',
    desc: 'ซื่อสัตย์ ร่าเริง กระดิกหางต้อนรับทุกคน',
    defaultName: 'เจ้าม่อน',
    sound: 'โฮ่งๆ! 🦴',
    accessory: '🦴',
  },
  hamster: {
    label: 'แฮมสเตอร์ (Hamster)',
    emoji: '🐹',
    desc: 'ตัวกลมดุ๊กดิ๊ก ชอบแทะเมล็ดทานตะวัน',
    defaultName: 'เจ้านุ่มนิ่ม',
    sound: 'จี๊ดๆ! 🌻',
    accessory: '🌻',
  },
  frog: {
    label: 'กบเขียว (Frog)',
    emoji: '🐸',
    desc: 'กระโดดดุ๊กดิ๊ก ตาแป๋ว เรียกรอยยิ้มได้ทั้งวัน',
    defaultName: 'พี่กบอ๊บ',
    sound: 'อ๊บๆ~ 💧',
    accessory: '💧',
  },
  toad: {
    label: 'คางคกทอง (Fortune Toad)',
    emoji: '👑🐸',
    desc: 'คางคกทองสวมมงกุฎ สัญลักษณ์ดูดทรัพย์และโชคลาภ',
    defaultName: 'ท่านทองแท้',
    sound: 'ก๊าบ! โชคดีร่ำรวย 💰',
    accessory: '💰',
  },
  rabbit: {
    label: 'กระต่ายขาว (Bunny)',
    emoji: '🐰',
    desc: 'หูยาวน่ารัก กระโดดไปมาเคี้ยวแครอทกรุบกรอบ',
    defaultName: 'น้องบันนี่',
    sound: 'งุบงิบๆ แครอทอร่อย 🥕',
    accessory: '🥕',
  },
  bear: {
    label: 'หมีสีน้ำตาล (Brown Bear)',
    emoji: '🐻',
    desc: 'พี่หมีตัวโตใจดี คอยปกป้องและให้กำลังใจเสมอ',
    defaultName: 'พี่หมีอบอุ่น',
    sound: 'ฮึ่ม~ อิ่มน้ำผึ้งจัง 🍯',
    accessory: '🍯',
  },
  panda: {
    label: 'แพนด้า (Panda)',
    emoji: '🐼',
    desc: 'แพนด้าจอมกลิ้ง นอนแทะต้นไผ่เคียงข้างโต๊ะงาน',
    defaultName: 'เปาเปา',
    sound: 'กรุบๆ อิ่มแล้วขอนอน 🎋',
    accessory: '🎋',
  },
  koala: {
    label: 'โคอาล่า (Koala)',
    emoji: '🐨',
    desc: 'โคอาล่าขี้เซา กอดแขนกอดโต๊ะทำงานไม่ยอมปล่อย',
    defaultName: 'น้องโคโค่',
    sound: 'งืมม... ขอกอดแน่นๆ 🌿',
    accessory: '🌿',
  },
  tiger: {
    label: 'ลูกเสือตัวแสบ (Tiger Cub)',
    emoji: '🐯',
    desc: 'เสือน้อยลายพาดกลอน พลังงานล้นเหลือ ไฟแรง',
    defaultName: 'เจ้าสายฟ้า',
    sound: 'โฮกปิ๊บ! พร้อมลุยงาน ⚡',
    accessory: '⚡',
  },
  lion: {
    label: 'สิงโตน้อย (Little Lion)',
    emoji: '🦁',
    desc: 'สิงโตเจ้าป่าตัวจิ๋ว แผงคอฟูฟ่อง เสริมบารมีผู้นำ',
    defaultName: 'ซิมบ้า',
    sound: 'คำรามเท่ๆ ให้กำลังใจ 👑',
    accessory: '👑',
  },
  fox: {
    label: 'จิ้งจอกส้ม (Foxy)',
    emoji: '🦊',
    desc: 'จิ้งจอกหางฟู เฉลียวฉลาด ว่องไว ไอเดียกระฉูด',
    defaultName: 'น้องฟ็อกซี่',
    sound: 'คิกๆ วิ่งไวได้ไอเดีย 🍁',
    accessory: '🍁',
  },
  redpanda: {
    label: 'แพนด้าแดง (Red Panda)',
    emoji: '🦝',
    desc: 'ชอบยกสองมือขู่แบบน่ารัก หางยาวลายปล้องนุ่มฟู',
    defaultName: 'ร็อกกี้',
    sound: 'แฮร่! แกล้งตกใจหน่อยสิ ✨',
    accessory: '✨',
  },
  otter: {
    label: 'นากทะเล (Sea Otter)',
    emoji: '🦦',
    desc: 'ลอยน้ำลูบพุง ชอบถือหอยนำโชคและจับมือเพื่อน',
    defaultName: 'น้องนากกี้',
    sound: 'จุ๊บๆ จับมือไว้ไม่เหงา 🐚',
    accessory: '🐚',
  },
  hedgehog: {
    label: 'เม่นแคระ (Hedgehog)',
    emoji: '🦔',
    desc: 'เม่นตัวจิ๋ว ขดตัวเป็นก้อนกลม จมูกชมพูดุ๊กดิ๊ก',
    defaultName: 'เจ้าหนามนุ่ม',
    sound: 'ฟึดฟัดๆ ม้วนตัวกลมดิ๊ก 🌰',
    accessory: '🌰',
  },
  penguin: {
    label: 'เพนกวิน (Penguin)',
    emoji: '🐧',
    desc: 'เพนกวินจักรพรรดิน้อย สวมทักซิโด้เดินเตาะแตะ',
    defaultName: 'พิงกุ',
    sound: 'กวิ้นๆ รับลมหนาวสดชื่น ❄️',
    accessory: '❄️',
  },
  chick: {
    label: 'ลูกเจี๊ยบ (Baby Chick)',
    emoji: '🐥',
    desc: 'ลูกเจี๊ยบสีเหลืองสดใส วิ่งตามเจ้าของไม่ห่าง',
    defaultName: 'จิ๊บจิ๊บ',
    sound: 'ปิ๊บๆ วิ่งตามเจ้านาย 🌾',
    accessory: '🌾',
  },
  duck: {
    label: 'เป็ดเหลือง (Happy Duck)',
    emoji: '🦆',
    desc: 'เป็ดน้อยอารมณ์ดี ว่ายน้ำแจกความสดชื่นคลายเครียด',
    defaultName: 'ก้าบก้าบ',
    sound: 'ก้าบๆ อย่าเครียดนะ สู้ๆ 🫧',
    accessory: '🫧',
  },
  owl: {
    label: 'นกฮูกปราชญ์ (Wise Owl)',
    emoji: '🦉',
    desc: 'นกฮูกตากลมโต ฉลาดรอบรู้ อยู่เป็นเพื่อนกะดึก',
    defaultName: 'ศ.ดร.ฮูก',
    sound: 'ฮูกก~ ดึกแล้วอย่าลืมพักนะ 🌙',
    accessory: '🌙',
  },
  parrot: {
    label: 'นกแก้วช่างพูด (Parrot)',
    emoji: '🦜',
    desc: 'ขนนกสีรุ้ง ชอบส่งเสียงเชียร์และทักทายทุกคน',
    defaultName: 'มาคอว์จี้',
    sound: 'เก่งมาก! ทำงานไวเวอร์ 🌈',
    accessory: '🌈',
  },
  dolphin: {
    label: 'โลมา (Dolphin)',
    emoji: '🐬',
    desc: 'โลมาแสนรู้ กระโดดพ่นน้ำแจกพลังบวกและความสุข',
    defaultName: 'ฟินฟิน',
    sound: 'กริ๊กๆ สมองแล่นฉลุย 🌊',
    accessory: '🌊',
  },
  seal: {
    label: 'แมวน้ำ (Chubby Seal)',
    emoji: '🦭',
    desc: 'แมวน้ำตัวขาวอ้วนกลม นอนกลิ้งไปมานุ่มเหมือนแป้งโมจิ',
    defaultName: 'น้องก้อนแป้ง',
    sound: 'อุ๋งๆ ตัวนุ่มเด้งดึ๋ง ☁️',
    accessory: '☁️',
  },
  whale: {
    label: 'วาฬสีน้ำเงิน (Baby Whale)',
    emoji: '🐳',
    desc: 'วาฬน้อยใจดี พ่นน้ำคลายร้อนและสร้างความสงบใจ',
    defaultName: 'เจ้าพ่นน้ำ',
    sound: 'บุ๋งๆ ใจเย็นเป็นสายน้ำ 💧',
    accessory: '💧',
  },
  turtle: {
    label: 'เต่าน้อยชิล (Chill Turtle)',
    emoji: '🐢',
    desc: 'เต่าเดินเรื่อยๆ สไตล์ Work-Life Balance ไม่หวั่นงานหนัก',
    defaultName: 'เต่าสโลว์ไลฟ์',
    sound: 'ค่อยๆ ทำ เดี๋ยวก็เสร็จสวยงาม 🥬',
    accessory: '🥬',
  },
  dino: {
    label: 'ไดโนเสาร์ (Baby Dino)',
    emoji: '🦖',
    desc: 'ทีเร็กซ์ตัวจิ๋วแต่ใจใหญ่ พลังล้นเหลือพร้อมลุยทุกโปรเจกต์',
    defaultName: 'เจ้าก๊อตซี่',
    sound: 'ก๊าววว! งานนี้ไฟลุก 🔥',
    accessory: '🔥',
  },
  dragon: {
    label: 'มังกรเขียว (Lucky Dragon)',
    emoji: '🐲',
    desc: 'มังกรมงคลนำพาความมั่งคั่ง ความสำเร็จ และความก้าวหน้า',
    defaultName: 'ริวงาม',
    sound: 'พ่นประกายทอง เงินไหลมา 🌟',
    accessory: '🌟',
  },
  unicorn: {
    label: 'ยูนิคอร์น (Unicorn)',
    emoji: '🦄',
    desc: 'ม้ามีเขาสายรุ้ง โปรยผงเวทมนตร์บันดาลจินตนาการ',
    defaultName: 'สตาร์ไลท์',
    sound: 'ฮี้ๆ เวทมนตร์แห่งความสุข 💖',
    accessory: '💖',
  },
  monkey: {
    label: 'ลิงจ๋อแสนซน (Playful Monkey)',
    emoji: '🐵',
    desc: 'ลิงจิ๋วแสนซน กินกล้วยแก้หิว คอยสร้างเสียงหัวเราะ',
    defaultName: 'จ๋อจอมซน',
    sound: 'เจี๊ยกๆ พักกินกล้วยก่อน 🍌',
    accessory: '🍌',
  },
  sheep: {
    label: 'แกะปุยเมฆ (Fluffy Sheep)',
    emoji: '🐑',
    desc: 'แกะขนปุกปุยนุ่มฟู มองแล้วอบอุ่นหัวใจ สบายตาสบายใจ',
    defaultName: 'น้องปุยเมฆ',
    sound: 'แบ๊ะๆ นุ่มนิ่มฟินหัวใจ ☁️',
    accessory: '☁️',
  },
  alpaca: {
    label: 'อัลปาก้า (Alpaca)',
    emoji: '🦙',
    desc: 'อัลปาก้าคอยาวหน้าทะเล้น ยิ้มแป้นส่งกำลังใจตลอดวัน',
    defaultName: 'อัลปี้',
    sound: 'ฮัมเพลงอารมณ์ดี๊ดี 🪕',
    accessory: '🪕',
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
    const texts = ['❤️', '✨', '🐾', '🥰', '💖', '⭐', '🍀'];
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
        {type === 'cat' ? (
          <div className="pet-cat-body">
            <span className="cat-ears" />
            <span className="cat-face">🐱</span>
            <span className="cat-tail" />
          </div>
        ) : type === 'dog' ? (
          <div className="pet-dog-body">
            <span className="dog-ears" />
            <span className="dog-face">🐶</span>
            <span className="dog-tail" />
          </div>
        ) : type === 'hamster' ? (
          <div className="pet-hamster-body">
            <span className="hamster-face">🐹</span>
            <span className="hamster-sunflower" title="เมล็ดทานตะวัน">🌻</span>
          </div>
        ) : type === 'frog' ? (
          <div className="pet-frog-body">
            <span className="frog-eyes" />
            <span className="frog-face">🐸</span>
            <span className="frog-lily" />
          </div>
        ) : type === 'toad' ? (
          <div className="pet-toad-body">
            <span className="toad-crown">👑</span>
            <span className="toad-face">🐸</span>
            <span className="toad-coin" title="เหรียญทองเรียกทรัพย์">💰</span>
          </div>
        ) : (
          <div className="pet-universal-body">
            <span className="pet-main-avatar">{petInfo.emoji}</span>
            {petInfo.accessory && (
              <span className="pet-accessory-badge" title="ไอเทมประจำตัว">{petInfo.accessory}</span>
            )}
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
