import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { 
  Home, Users, ClipboardList, Megaphone, Settings, ArrowUpRight, DoorOpen, Hand, 
  Coffee, Focus, Video, X, Check, LogOut, Bell, Menu, ShieldCheck, Save, Map, 
  List, Wifi, WifiOff, CalendarCheck, Clock, CheckCircle2, AlertCircle, Plus, Trash2,
  Mic, MicOff, Headphones, PhoneOff, Radio, Volume2, VolumeX, CalendarDays, Sparkles,
  Maximize2, Minimize2, Camera, Heart, ThumbsUp, CheckSquare, MessageSquare, Send
} from 'lucide-react';
import { configured, supabase } from './backend';
import { 
  rooms as initialRooms, statuses, sampleMembers, sampleAttendance, sampleLeaves, 
  leaveTypesConfig, periodLabels, type Room, type RoomId, type Status, type Member, 
  type AttendanceRecord, type LeaveRequest, type LeaveType, type ThaiHoliday
} from './data';
import { 
  loadDemo, validMeetUrl, normalizeEmail, checkAttendanceStatus, formatThaiTime,
  getThaiPublicHoliday, getThaiHolidaysList, calculateWorkingDays, formatThaiFullDate,
  THAI_ANNUAL_FIXED_HOLIDAYS, THAI_MONTH_NAMES
} from './domain.mjs';
import { VoiceHuddleClient, playChime } from './voice';
import { VideoConferenceClient } from './conference';
import { ConferenceModal } from './ConferenceModal';

export type FeedType = 'today' | 'announcement';

export interface FeedComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
}

export interface FeedReactions {
  likes: string[];   // userIds who reacted ❤️ (ถูกใจ)
  claps: string[];   // userIds who reacted 👍 (เยี่ยม)
  noted: string[];   // userIds who reacted ✅ (รับทราบ)
}

export interface FeedPost {
  id: string;
  type: FeedType;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  reactions: FeedReactions;
  comments: FeedComment[];
}

const defaultFeedPosts: FeedPost[] = [
  {
    id: 'post-1',
    type: 'announcement',
    title: 'ยินดีต้อนรับสู่ PRIME Virtual Office',
    content: 'พื้นที่ทำงานดิจิทัลและคอมมูนิตี้ของทีมไพร์ม ทุกคนสามารถเช็คอิน อัปเดตงาน ประชุมวิดีโอ และพูดคุยผ่านฟีดนี้ได้ตลอดเวลาครับ',
    authorId: 'admin',
    authorName: 'PRIME Admin',
    authorAvatar: '🏢',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    reactions: { likes: ['may', 'ton'], claps: ['kong'], noted: ['me'] },
    comments: [
      {
        id: 'c-1',
        authorId: 'may',
        authorName: 'เมย์',
        authorAvatar: '👩🏻‍💻',
        content: 'ยินดีต้อนรับทุกคนค่า พร้อมลุยงานวันนี้ค่ะ ✨',
        createdAt: new Date(Date.now() - 80000000).toISOString()
      }
    ]
  },
  {
    id: 'post-2',
    type: 'today',
    title: 'อัปเดตระบบ WebRTC Meeting & Mobile UI วันนี้',
    content: 'พัฒนาระบบ Video Conference ให้พร้อมใช้งาน และปรับขนาดให้รองรับหน้าจอมือถือ/แท็บเล็ตเรียบร้อยแล้วครับ',
    authorId: 'ton',
    authorName: 'ต้น (Dev Lead)',
    authorAvatar: '👨🏻‍💻',
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    reactions: { likes: ['me', 'may'], claps: ['ploy'], noted: ['beam'] },
    comments: [
      {
        id: 'c-2',
        authorId: 'ploy',
        authorName: 'พลอย',
        authorAvatar: '👩🏻‍💼',
        content: 'เยี่ยมเลยค่ะ รองรับมือถือแบบนี้ทำงานสะดวกขึ้นมากเลย',
        createdAt: new Date(Date.now() - 7200000).toISOString()
      }
    ]
  }
];

type Page = 'office' | 'team' | 'attendance' | 'feed' | 'admin' | 'today' | 'announcements';
type Knock = { id:string; sender: string; receiver_id?:string; room_id:RoomId; state:string; created_at:string };
type Notice = { id:string; title:string; body:string };

const nav = [
  { id: 'office', label: 'ออฟฟิศของเรา', icon: Home },
  { id: 'feed', label: 'ฟีดงาน & ประกาศ', icon: ClipboardList },
  { id: 'attendance', label: 'ลงเวลา & ลางาน', icon: CalendarCheck },
  { id: 'team', label: 'สมาชิกทีม', icon: Users },
  { id: 'admin', label: 'ผู้ดูแลระบบ', icon: Settings }
] as const;

function Avatar({ member, small = false, isSpeaking = false }: { member: Member; small?: boolean; isSpeaking?: boolean }) {
  const isImg = member.avatarUrl && (member.avatarUrl.startsWith('http') || member.avatarUrl.startsWith('data:'));
  return (
    <span className={`avatar ${member.color} ${small ? 'small' : ''} ${isSpeaking ? 'speaking' : ''}`} aria-label={member.name}>
      {isImg ? (
        <img src={member.avatarUrl} alt={member.name} className="avatar-img" />
      ) : (
        <span className="avatar-face">
          {member.avatarUrl || (['may', 'nan', 'ploy', 'beam', 'offline-0', 'offline-5'].includes(member.id) ? '👩🏻‍💻' : '👨🏻‍💻')}
        </span>
      )}
      <i className={`status-dot ${member.online ? member.status : 'offline'}`} />
      {isSpeaking && <span className="avatar-speaking-badge" title="กำลังพูด...">🎙️</span>}
      {member.leaveToday && (
        <span className="avatar-leave-badge" title={`${member.name}: ${member.leaveToday.label}`}>
          {member.leaveToday.emoji}
        </span>
      )}
    </span>
  );
}

function errorText(error: unknown) {
  const raw = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  if (raw.includes('not_allowed')) return 'อีเมลนี้ยังไม่ได้รับสิทธิ์ หรือถูกปิดใช้งาน กรุณาติดต่อผู้ดูแล';
  if (raw.includes('member_limit')) return 'สมาชิกที่เปิดใช้งานครบ 15 คนแล้ว';
  if (raw.includes('rate_limit')) return 'เพิ่งส่งคำขอไป กรุณารอ 30 วินาทีก่อนส่งอีกครั้ง';
  if (raw.includes('self_disable')) return 'ไม่สามารถปิดสิทธิ์หรือลดสิทธิ์ผู้ดูแลของตัวเองได้';
  return raw;
}

function formatDuration(startStr?: string, endStr?: string | null) {
  if (!startStr) return '-';
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  const diffMinutes = Math.max(0, Math.floor((end - start) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return `${hours} ชม. ${mins} นาที`;
}

export default function App() {
  const [demo, setDemo] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [page, setPage] = useState<Page>('office');
  const [selected, setSelected] = useState<RoomId>('hub');
  const [selectedRoomCard, setSelectedRoomCard] = useState<RoomId | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen request failed:', err);
    }
  };
  const [layout, setLayout] = useState('map');
  const [menu, setMenu] = useState(false);
  const [demoState, setDemoState] = useState(() => loadDemo(localStorage));
  const [liveMembers, setLiveMembers] = useState<Member[]>([]);
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [notices, setNotices] = useState<Notice[]>([
    { id: 'demo', title: 'ยินดีต้อนรับสู่ PRIME Virtual Office', body: 'พื้นที่ทำงานออนไลน์ เชื่อมต่อทุกคนในทีมไพร์มดิจิทัลคอนซัลแทนท์ ข้อมูลในโหมดสาธิตบันทึกเฉพาะเบราว์เซอร์นี้' }
  ]);
  const [knocks, setKnocks] = useState<Knock[]>([]);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [knockTarget, setKnockTarget] = useState<Member | null>(null);
  
  // Voice Huddle State (Real WebRTC Peer-to-Peer Voice)
  const [inHuddle, setInHuddle] = useState(false);
  const [huddleRoomId, setHuddleRoomId] = useState<RoomId | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isLoopback, setIsLoopback] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMembers, setSpeakingMembers] = useState<Set<string>>(new Set());
  const [activeVoicePeers, setActiveVoicePeers] = useState<string[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const voiceClientRef = useRef<VoiceHuddleClient | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // WebRTC Video Conference State (Formal Video & Screen Sharing Conference)
  const [conferenceOpen, setConferenceOpen] = useState(false);
  const [conferenceRoomId, setConferenceRoomId] = useState<RoomId | null>(null);
  const [isConferenceMinimized, setIsConferenceMinimized] = useState(false);
  const conferenceClientRef = useRef<VideoConferenceClient | null>(null);

  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [adminMembers, setAdminMembers] = useState<{ id: string; email: string; name: string; active: boolean; is_admin: boolean }[]>([]);

  // Profile Edit State
  const [demoName, setDemoName] = useState(() => localStorage.getItem('prime-demo-name') || 'คุณ');
  const [demoAvatar, setDemoAvatar] = useState(() => localStorage.getItem('prime-demo-avatar') || '');
  const [profileOpen, setProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [demoSessionId] = useState(() => {
    try {
      let id = sessionStorage.getItem('prime-demo-session-id');
      if (!id) {
        id = 'demo-' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem('prime-demo-session-id', id);
      }
      return id;
    } catch {
      return 'demo-' + Math.random().toString(36).slice(2, 8);
    }
  });

  // Unified Feed State (Work Today & Announcements)
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>(() => {
    try {
      const saved = localStorage.getItem('prime-feed-posts-v1');
      return saved ? JSON.parse(saved) : defaultFeedPosts;
    } catch {
      return defaultFeedPosts;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('prime-feed-posts-v1', JSON.stringify(feedPosts));
    } catch {}
  }, [feedPosts]);

  const [feedFilter, setFeedFilter] = useState<'all' | 'today' | 'announcement'>('all');
  const [newPostType, setNewPostType] = useState<FeedType>('today');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // Attendance & Leave State
  const todayDateStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayHoliday = useMemo(() => getThaiPublicHoliday(todayDateStr), [todayDateStr]);
  const [selectedHolidayYear, setSelectedHolidayYear] = useState(() => new Date().getFullYear());
  const yearHolidaysList = useMemo(() => getThaiHolidaysList(selectedHolidayYear), [selectedHolidayYear]);
  const [showHolidayCalendar, setShowHolidayCalendar] = useState(false);
  const [nowTime, setNowTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNowTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [demoAttendance, setDemoAttendance] = useState<AttendanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('prime-demo-attendance');
      return saved ? JSON.parse(saved) : sampleAttendance;
    } catch {
      return sampleAttendance;
    }
  });

  const [demoLeaves, setDemoLeaves] = useState<LeaveRequest[]>(() => {
    try {
      const saved = localStorage.getItem('prime-demo-leaves');
      return saved ? JSON.parse(saved) : sampleLeaves;
    } catch {
      return sampleLeaves;
    }
  });

  const [liveAttendance, setLiveAttendance] = useState<AttendanceRecord[]>([]);
  const [liveLeaves, setLiveLeaves] = useState<LeaveRequest[]>([]);
  const [teamFilter, setTeamFilter] = useState<'all' | 'present' | 'late' | 'leave' | 'not_in'>('all');

  // Leave Form State
  const [leaveType, setLeaveType] = useState<LeaveType>('sick');
  const [leaveStart, setLeaveStart] = useState(todayDateStr);
  const [leaveEnd, setLeaveEnd] = useState(todayDateStr);
  const [leavePeriod, setLeavePeriod] = useState<'full' | 'morning' | 'afternoon'>('full');
  const [leaveReason, setLeaveReason] = useState('');
  const leaveWorkingDaysCalc = useMemo(() => calculateWorkingDays(leaveStart, leaveEnd), [leaveStart, leaveEnd]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string) => {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 4500);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('prime-demo-v1', JSON.stringify(demoState)); } catch {}
  }, [demoState]);

  useEffect(() => {
    try { localStorage.setItem('prime-demo-attendance', JSON.stringify(demoAttendance)); } catch {}
  }, [demoAttendance]);

  useEffect(() => {
    try { localStorage.setItem('prime-demo-leaves', JSON.stringify(demoLeaves)); } catch {}
  }, [demoLeaves]);

  const refresh = useCallback(async () => {
    if (!supabase || !session || demo) return;
    const results = await Promise.all([
      supabase.from('members').select('*').eq('active', true).order('name'),
      supabase.from('rooms').select('*').order('sort_order'),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('knocks').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('office_presence').select('*'),
      supabase.from('attendance_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('leave_requests').select('*').eq('status', 'approved').order('created_at', { ascending: false }).limit(100)
    ]);

    const failure = results[0].error || results[1].error || results[2].error || results[3].error;
    if (failure) throw failure;

    const rows = results[0].data || [];
    if (!rows.some(r => r.user_id === session.user.id)) {
      setLiveMembers([]);
      setLoaded(false);
      throw Error('not_allowed');
    }

    const myGoogleAvatar = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture;
    const leavesData: LeaveRequest[] = results[6].data || [];
    const attData: AttendanceRecord[] = results[5].data || [];
    setLiveAttendance(attData);
    setLiveLeaves(leavesData);

    const todayStr = new Date().toISOString().slice(0, 10);
    const activeLeavesToday = leavesData.filter(l => l.start_date <= todayStr && l.end_date >= todayStr && l.status === 'approved');

    setLiveMembers(rows.map((r, i) => {
      const memberLeave = activeLeavesToday.find(l => l.user_id === r.user_id);
      return {
        id: r.user_id || r.id,
        name: r.name,
        role: r.role || 'ทีม PRIME',
        room: r.room_id,
        status: memberLeave ? 'away' : r.status,
        online: (results[4].data || []).some(p => p.user_id === r.user_id && Date.now() - new Date(p.last_seen).getTime() < 90000),
        color: (['blue', 'mint', 'peach', 'lavender'] as const)[i % 4],
        note: r.daily_note,
        isAdmin: r.is_admin,
        avatarUrl: r.avatar_url || (r.user_id === session?.user?.id ? myGoogleAvatar : undefined),
        leaveToday: memberLeave ? {
          type: memberLeave.leave_type,
          label: leaveTypesConfig[memberLeave.leave_type]?.label || 'ลางาน',
          emoji: leaveTypesConfig[memberLeave.leave_type]?.emoji || '📋'
        } : undefined
      };
    }));

    setRooms((results[1].data || []).map(r => ({ ...initialRooms.find(x => x.id === r.id)!, meet_url: r.meet_url || '' })));
    setNotices(results[2].data || []);
    setKnocks((results[3].data || []).map(k => ({ ...k, sender: rows.find(r => r.user_id === k.sender_id)?.name || 'สมาชิก' })));
    setLoaded(true);
  }, [session?.user.id, session?.user?.user_metadata?.avatar_url, session?.user?.user_metadata?.picture, demo]);

  useEffect(() => {
    if (demo || !supabase || !session) { setConnected(false); return; }
    const client = supabase;
    let cancelled = false;
    setLoaded(false);
    setError('');

    const sync = () => refresh().catch(e => { if (!cancelled) { setError(errorText(e)); setConnected(false); } });
    const heartbeat = async () => {
      const { error } = await client.rpc('heartbeat');
      if (error) { if (!cancelled) { setError(errorText(error)); setLoaded(false); setConnected(false); } return; }
      if (!cancelled) await sync();
    };

    void (async () => {
      const { error } = await client.rpc('claim_membership');
      if (cancelled) return;
      if (error) { setError(errorText(error)); return; }
      await heartbeat();
    })();

    const channel = client.channel('prime-office-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => void sync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => void sync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => void sync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'knocks' }, () => void sync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => void sync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => void sync())
      .subscribe(status => { if (!cancelled) setConnected(status === 'SUBSCRIBED'); });

    const interval = setInterval(() => void heartbeat(), 30000);
    const fallback = setInterval(() => void sync(), 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(fallback);
      void client.removeChannel(channel);
    };
  }, [demo, session?.user.id, refresh]);

  const userAvatar = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture;
  const currentLive = liveMembers.find(m => m.id === session?.user.id);
  const me: Member = demo
    ? { id: demoSessionId, name: demoName, role: 'ทีม PRIME', room: demoState.room as RoomId, status: demoState.status as Status, online: true, color: 'blue', note: demoState.note, isAdmin: true, avatarUrl: demoAvatar }
    : (currentLive ? { ...currentLive, avatarUrl: currentLive.avatarUrl || userAvatar } : { id: session?.user?.id || '', name: session?.user?.user_metadata?.full_name || 'สมาชิก', role: 'ทีม PRIME', room: 'hub', status: 'available', online: false, color: 'blue', avatarUrl: userAvatar });

  // Effective Attendance & Leaves data
  const attendanceList = demo ? demoAttendance : liveAttendance;
  const leavesList = demo ? demoLeaves : liveLeaves;
  const todayMyAttendance = attendanceList.find(a => (a.user_id === me.id || (demo && (a.user_id === 'me' || a.user_id.startsWith('demo-')))) && a.work_date === todayDateStr);

  const activeLeavesToday = useMemo(() => {
    return leavesList.filter(l => l.start_date <= todayDateStr && l.end_date >= todayDateStr && l.status === 'approved');
  }, [leavesList, todayDateStr]);

  const members: Member[] = useMemo(() => {
    if (!demo) return liveMembers;
    return [me, ...sampleMembers].map(m => {
      const activeLeave = activeLeavesToday.find(l => l.user_id === m.id);
      if (activeLeave) {
        return {
          ...m,
          status: 'away' as Status,
          leaveToday: {
            type: activeLeave.leave_type,
            label: leaveTypesConfig[activeLeave.leave_type]?.label || 'ลางาน',
            emoji: leaveTypesConfig[activeLeave.leave_type]?.emoji || '📋'
          }
        };
      }
      return m;
    });
  }, [demo, liveMembers, me, activeLeavesToday]);

  const room = rooms.find(r => r.id === selected) || initialRooms[0];
  const online = members.filter(m => m.online);
  const occupants = online.filter(m => m.room === selected);
  const incoming = knocks.filter(k => k.state === 'pending' && Date.now() - new Date(k.created_at).getTime() < 300000);

  useEffect(() => { setNote(me.note || ''); }, [me.note, demo]);

  useEffect(() => {
    if (voiceClientRef.current) {
      voiceClientRef.current.updateIdentity(me.id, me.name);
    }
  }, [me.id, me.name]);

  useEffect(() => {
    return () => {
      if (voiceClientRef.current) {
        voiceClientRef.current.leave();
      }
    };
  }, []);

  const joinHuddle = useCallback(async (targetRoomId: RoomId) => {
    setError('');
    try {
      if (!voiceClientRef.current) {
        voiceClientRef.current = new VoiceHuddleClient(me.id, me.name, supabase);
      } else {
        voiceClientRef.current.updateIdentity(me.id, me.name);
      }
      voiceClientRef.current.onStateChange = (state) => {
        setActiveVoicePeers(state.activePeers);
        setSpeakingMembers(state.speakingPeers);
        setIsSpeaking(state.isSpeaking);
        setIsLoopback(state.isLoopback);
        setMicLevel(state.audioLevel);
      };

      const stream = await voiceClientRef.current.join(targetRoomId);
      audioStreamRef.current = stream;
      setInHuddle(true);
      setHuddleRoomId(targetRoomId);
      setIsMuted(false);
      setIsDeafened(false);
      setIsLoopback(false);
      const roomObj = rooms.find(r => r.id === targetRoomId);
      notify(`เชื่อมต่อ Voice Huddle ในห้อง ${roomObj?.name || 'ทำงาน'} แล้ว 🎙️`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error('Failed to join voice huddle:', err);
      const msg = e?.message || 'ไม่สามารถเปิดไมโครโฟนได้';
      setError(msg);
      notify(msg);
      if (voiceClientRef.current) {
        voiceClientRef.current.leave();
      }
      setInHuddle(false);
      setHuddleRoomId(null);
    }
  }, [me.id, me.name, rooms]);

  const leaveHuddle = useCallback(() => {
    if (voiceClientRef.current) {
      voiceClientRef.current.leave();
    }
    audioStreamRef.current = null;
    setInHuddle(false);
    setHuddleRoomId(null);
    setIsSpeaking(false);
    setIsLoopback(false);
    setSpeakingMembers(new Set());
    setActiveVoicePeers([]);
    setMicLevel(0);
    notify('ออกจาก Voice Huddle แล้ว 👋');
  }, []);

  const toggleLoopback = useCallback(() => {
    setIsLoopback(prev => {
      const next = !prev;
      if (voiceClientRef.current) {
        voiceClientRef.current.setLoopback(next);
      }
      notify(next ? '🔊 กำลังทดสอบไมค์ (คุณจะได้ยินเสียงตัวเองผ่านลำโพง/หูฟัง)' : 'ปิดโหมดทดสอบเสียงแล้ว');
      return next;
    });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      if (voiceClientRef.current) {
        voiceClientRef.current.setMute(next);
      }
      playChime(next ? 'stop' : 'start');
      return next;
    });
  }, []);

  const startHoldTalk = useCallback(() => {
    if (!inHuddle) return;
    setIsMuted(false);
    if (voiceClientRef.current) {
      voiceClientRef.current.setMute(false);
    }
    playChime('start');
  }, [inHuddle]);

  const stopHoldTalk = useCallback(() => {
    if (!inHuddle) return;
    setIsMuted(true);
    if (voiceClientRef.current) {
      voiceClientRef.current.setMute(true);
    }
    playChime('stop');
  }, [inHuddle]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened(prev => {
      const next = !prev;
      if (voiceClientRef.current) {
        voiceClientRef.current.setDeafen(next);
      }
      if (next) {
        setIsMuted(true);
      }
      return next;
    });
  }, []);

  const holdStartTimeRef = useRef(0);
  const wasHoldTalkRef = useRef(false);

  const handleMicPointerDown = useCallback(() => {
    holdStartTimeRef.current = Date.now();
    wasHoldTalkRef.current = false;
    startHoldTalk();
  }, [startHoldTalk]);

  const handleMicPointerUp = useCallback(() => {
    const elapsed = Date.now() - holdStartTimeRef.current;
    if (elapsed >= 350) {
      wasHoldTalkRef.current = true;
      stopHoldTalk();
    } else {
      wasHoldTalkRef.current = false;
    }
    holdStartTimeRef.current = 0;
  }, [stopHoldTalk]);

  const handleMicPointerLeave = useCallback(() => {
    if (holdStartTimeRef.current > 0) {
      const elapsed = Date.now() - holdStartTimeRef.current;
      if (elapsed >= 350) {
        wasHoldTalkRef.current = true;
        stopHoldTalk();
      }
      holdStartTimeRef.current = 0;
    }
  }, [stopHoldTalk]);

  const handleMicClick = useCallback(() => {
    if (wasHoldTalkRef.current) {
      wasHoldTalkRef.current = false;
      return;
    }
    toggleMute();
  }, [toggleMute]);

  // When moving between rooms, if you leave the huddle room, leave huddle automatically
  useEffect(() => {
    if (inHuddle && huddleRoomId && me.room !== huddleRoomId) {
      leaveHuddle();
    }
  }, [me.room, inHuddle, huddleRoomId, leaveHuddle]);

  // Spacebar Push-to-Talk (Hold Spacebar to speak)
  useEffect(() => {
    if (!inHuddle) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        if (!e.repeat) {
          e.preventDefault();
          startHoldTalk();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        e.preventDefault();
        stopHoldTalk();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [inHuddle, startHoldTalk, stopHoldTalk]);

  // ESC key to close any drawer or popover
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (page !== 'office') setPage('office');
        setSelectedRoomCard(null);
        if (profileOpen) setProfileOpen(false);
        if (noticeOpen) setNoticeOpen(false);
        if (knockTarget) setKnockTarget(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [page, profileOpen, noticeOpen, knockTarget]);

  // WebRTC Native Video Conference Handlers (Replaces Google Meet)
  const startConference = useCallback(async (roomId: RoomId) => {
    // 1. If currently active in voice huddle, pause/leave voice huddle so mics do not conflict!
    if (inHuddle && voiceClientRef.current) {
      voiceClientRef.current.leave();
      setInHuddle(false);
      setHuddleRoomId(null);
      notify('สลับเข้าห้องประชุมวิดีโอ (ปิด Voice Huddle ชั่วคราว) 📹');
    }

    setConferenceRoomId(roomId);
    setConferenceOpen(true);
    setIsConferenceMinimized(false);

    if (!conferenceClientRef.current) {
      conferenceClientRef.current = new VideoConferenceClient(me.id, me.name, supabase);
    } else {
      conferenceClientRef.current.updateIdentity(me.id, me.name);
    }

    try {
      await conferenceClientRef.current.join(roomId);
      notify(`เข้าร่วมห้องประชุมวิดีโอ ${rooms.find(r => r.id === roomId)?.name || ''} เรียบร้อย 📹`);
    } catch (err) {
      console.warn('Conference join error:', err);
    }
  }, [inHuddle, me.id, me.name, rooms]);

  const closeConference = useCallback(() => {
    if (conferenceClientRef.current) {
      conferenceClientRef.current.leave();
    }
    setConferenceOpen(false);
    setConferenceRoomId(null);
    setIsConferenceMinimized(false);
    notify('ออกจากห้องประชุมวิดีโอแล้ว 👋');
  }, []);

  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await fn(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function updateProfile(values: { room_id?: RoomId; status?: Status; daily_note?: string }) {
    await action(async () => {
      if (demo) {
        setDemoState(s => ({ ...s, room: values.room_id ?? s.room, status: values.status ?? s.status, note: values.daily_note ?? s.note }));
      } else {
        const { error } = await supabase!.rpc('update_my_profile', {
          p_room: values.room_id ?? me.room,
          p_status: values.status ?? me.status,
          p_note: values.daily_note ?? me.note ?? ''
        });
        if (error) throw error;
        await refresh();
      }
      notify(values.room_id ? 'เข้าห้อง ' + rooms.find(r => r.id === values.room_id)?.name + ' แล้ว' : 'บันทึกเรียบร้อย');
    });
  }

  async function saveProfile() {
    const trimmed = editName.trim();
    if (!trimmed) { setError('กรุณาใส่ชื่อของคุณ'); return; }
    await action(async () => {
      if (demo) {
        setDemoName(trimmed);
        setDemoAvatar(editAvatar);
        try {
          localStorage.setItem('prime-demo-name', trimmed);
          localStorage.setItem('prime-demo-avatar', editAvatar);
        } catch {}
      } else if (supabase) {
        try { await supabase.auth.updateUser({ data: { full_name: trimmed, avatar_url: editAvatar } }); } catch {}
        try {
          const { error } = await supabase.rpc('update_my_identity', { p_name: trimmed, p_avatar: editAvatar });
          if (error) console.warn(error);
        } catch {}
        await refresh();
      }
      setProfileOpen(false);
      notify('บันทึกชื่อและรูปโปรไฟล์แล้ว');
    });
  }

  // Handle client-side image upload & resize for avatar
  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setEditAvatar(dataUrl);
          notify('อัปโหลดและปรับขนาดรูปภาพเรียบร้อย');
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Unified Feed Handlers
  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newPostTitle.trim();
    const content = newPostContent.trim();
    if (!content) {
      setError('กรุณาใส่เนื้อหาข้อความ');
      return;
    }
    const newPost: FeedPost = {
      id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type: newPostType,
      title: title || (newPostType === 'today' ? `งานวันนี้ (${me.name})` : `ประกาศจาก ${me.name}`),
      content,
      authorId: me.id,
      authorName: me.name,
      authorAvatar: me.avatarUrl,
      createdAt: new Date().toISOString(),
      reactions: { likes: [], claps: [], noted: [] },
      comments: []
    };
    setFeedPosts(prev => [newPost, ...prev]);
    setNewPostTitle('');
    setNewPostContent('');
    notify(newPostType === 'today' ? 'บันทึกงานวันนี้ลงฟีดเรียบร้อย' : 'โพสต์ประกาศลงฟีดเรียบร้อย');
  };

  const handleToggleReaction = (postId: string, type: 'likes' | 'claps' | 'noted') => {
    setFeedPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const list = p.reactions[type] || [];
      const has = list.includes(me.id);
      const updated = has ? list.filter(id => id !== me.id) : [...list, me.id];
      return {
        ...p,
        reactions: {
          ...p.reactions,
          [type]: updated
        }
      };
    }));
  };

  const handleAddComment = (postId: string) => {
    const text = (commentDrafts[postId] || '').trim();
    if (!text) return;
    const newComment: FeedComment = {
      id: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      authorId: me.id,
      authorName: me.name,
      authorAvatar: me.avatarUrl,
      content: text,
      createdAt: new Date().toISOString()
    };
    setFeedPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return {
        ...p,
        comments: [...(p.comments || []), newComment]
      };
    }));
    setCommentDrafts(prev => ({ ...prev, [postId]: '' }));
    notify('ส่งความคิดเห็นเรียบร้อย');
  };

  const handleDeletePost = (postId: string) => {
    setFeedPosts(prev => prev.filter(p => p.id !== postId));
    notify('ลบโพสต์เรียบร้อย');
  };

  function formatPostTime(isoStr: string) {
    try {
      const d = new Date(isoStr);
      const now = Date.now();
      const diff = Math.floor((now - d.getTime()) / 1000);
      if (diff < 60) return 'เมื่อสักครู่';
      if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} ชม. ที่แล้ว`;
      return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    } catch {
      return 'เมื่อสักครู่';
    }
  }

  // Attendance Handlers (Work hours: 08:00 - 17:00)
  async function handleCheckIn() {
    await action(async () => {
      const now = new Date();
      const isHol = todayHoliday.isCompanyHoliday;
      const status = isHol ? 'on_time' : checkAttendanceStatus(now);
      if (demo) {
        const newRecord: AttendanceRecord = {
          id: 'att-' + Date.now(),
          user_id: me.id,
          work_date: todayDateStr,
          check_in_at: now.toISOString(),
          status
        };
        setDemoAttendance(prev => [newRecord, ...prev.filter(a => !(a.user_id === me.id && a.work_date === todayDateStr))]);
      } else if (supabase) {
        const { error } = await supabase.rpc('check_in_today');
        if (error) throw error;
        await refresh();
      }
      const holMsg = todayHoliday.isPublicHoliday 
        ? ` (ทำงานวันหยุดบริษัท: ${todayHoliday.name})` 
        : todayHoliday.isWeekend ? ' (ทำงานวันหยุดสุดสัปดาห์)' : ` (${status === 'on_time' ? 'ตรงเวลา 👍' : 'สาย'})`;
      notify(`เช็คอินเข้างานแล้ว เวลา ${formatThaiTime(now.toISOString())}${holMsg}`);
    });
  }

  async function handleCheckOut() {
    await action(async () => {
      const now = new Date();
      if (demo) {
        setDemoAttendance(prev => prev.map(a => {
          if (a.user_id === me.id && a.work_date === todayDateStr) {
            return { ...a, check_out_at: now.toISOString() };
          }
          return a;
        }));
      } else if (supabase) {
        const { error } = await supabase.rpc('check_out_today');
        if (error) throw error;
        await refresh();
      }
      notify(`เช็คเอาท์เลิกงานแล้ว เวลา ${formatThaiTime(now.toISOString())} ขอบคุณสำหรับการทำงานวันนี้! ✨`);
    });
  }

  // Leave Handlers (Approval Mode 1: Auto-approved immediately)
  async function handleLeaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (leaveEnd < leaveStart) {
      setError('วันที่สิ้นสุดต้องไม่มาก่อนวันที่เริ่มต้น');
      return;
    }
    if (leaveWorkingDaysCalc.workingDays === 0 && leaveWorkingDaysCalc.totalDays > 0) {
      notify('⚠️ ทุกวันที่เลือกเป็นวันหยุดของบริษัทอยู่แล้ว (หยุดตามราชการ) ไม่จำเป็นต้องยื่นลางานครับ');
      return;
    }
    await action(async () => {
      const cfg = leaveTypesConfig[leaveType];
      if (demo) {
        const newLeave: LeaveRequest = {
          id: 'leave-' + Date.now(),
          user_id: me.id,
          leave_type: leaveType,
          start_date: leaveStart,
          end_date: leaveEnd,
          period: leavePeriod,
          reason: leaveReason.trim(),
          status: 'approved',
          created_at: new Date().toISOString()
        };
        setDemoLeaves(prev => [newLeave, ...prev]);
        if (leaveStart <= todayDateStr && leaveEnd >= todayDateStr) {
          setDemoState(s => ({ ...s, status: 'away' }));
        }
      } else if (supabase) {
        const { error } = await supabase.rpc('submit_leave', {
          p_type: leaveType,
          p_start: leaveStart,
          p_end: leaveEnd,
          p_period: leavePeriod,
          p_reason: leaveReason.trim()
        });
        if (error) throw error;
        await refresh();
      }
      setLeaveReason('');
      const holDeduction = leaveWorkingDaysCalc.holidays.length > 0 
        ? ` (หักวันหยุดราชการ ${leaveWorkingDaysCalc.holidays.length} วัน รวมใช้วันลาจริง ${leaveWorkingDaysCalc.workingDays} วันทำการ)`
        : '';
      notify(`ยื่น${cfg.label}สำเร็จ (อนุมัติทันที) มีผล ${leaveStart === leaveEnd ? leaveStart : `${leaveStart} ถึง ${leaveEnd}`}${holDeduction}`);
    });
  }

  async function handleCancelLeave(id: string) {
    await action(async () => {
      if (demo) {
        setDemoLeaves(prev => prev.filter(l => l.id !== id));
      } else if (supabase) {
        const { error } = await supabase.rpc('cancel_leave', { p_id: id });
        if (error) throw error;
        await refresh();
      }
      notify('ยกเลิกคำขอลางานเรียบร้อยแล้ว');
    });
  }

  async function sendKnock() {
    if (!knockTarget) return;
    await action(async () => {
      if (demo) {
        notify('โหมดสาธิต: จำลองคำขอคุยกับ ' + knockTarget.name + ' แล้ว ไม่มีการส่งจริง');
      } else {
        const { error } = await supabase!.rpc('send_knock', { p_receiver: knockTarget.id, p_room: me.room });
        if (error) throw error;
        notify('ส่งคำขอแล้ว คำขอหมดอายุใน 5 นาที');
      }
      setKnockTarget(null);
    });
  }

  async function respondKnock(k: Knock, accept: boolean) {
    await action(async () => {
      const { error } = await supabase!.rpc('respond_knock', { p_id: k.id, p_accept: accept });
      if (error) throw error;
      if (accept) setSelected(k.room_id);
      await refresh();
      notify(accept ? 'ตอบรับและย้ายเข้าห้องแล้ว' : 'ปฏิเสธคำขอแล้ว');
    });
  }

  async function login() {
    await action(async () => {
      if (!supabase) throw Error('ยังไม่ได้ตั้งค่า Supabase กรุณาทำตาม SETUP-TH.md');
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/' } });
      if (error) throw error;
    });
  }

  async function logout() {
    await action(async () => {
      if (!demo && supabase) {
        await supabase.rpc('leave_office');
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      setDemo(false);
      setLoaded(false);
      setLiveMembers([]);
      setKnocks([]);
      setNotices([]);
    });
  }

  async function loadAdmin() {
    if (demo) return;
    const { data, error } = await supabase!.rpc('admin_list_members');
    if (error) throw error;
    setAdminMembers(data || []);
  }

  useEffect(() => {
    if (page === 'admin' && me.isAdmin && !demo) void action(loadAdmin);
  }, [page, me.isAdmin, demo]);

  function meeting() {
    if (!validMeetUrl(room.meet_url || '')) {
      notify('ยังไม่มีลิงก์ประชุม ให้ผู้ดูแลเพิ่มในหน้าตั้งค่า');
      return;
    }
    window.open(room.meet_url, '_blank', 'noopener,noreferrer');
  }

  // Attendance metrics calculation
  const todayAttendanceLogs = useMemo(() => {
    return attendanceList.filter(a => a.work_date === todayDateStr);
  }, [attendanceList, todayDateStr]);

  const checkedInCount = todayAttendanceLogs.length;
  const onTimeCount = todayAttendanceLogs.filter(a => a.status === 'on_time').length;
  const lateCount = todayAttendanceLogs.filter(a => a.status === 'late').length;
  const onLeaveCount = activeLeavesToday.length;

  const filteredMembers = useMemo(() => {
    return members.map(m => {
      const att = todayAttendanceLogs.find(a => a.user_id === m.id);
      const leave = activeLeavesToday.find(l => l.user_id === m.id);
      return { member: m, att, leave };
    }).filter(({ att, leave }) => {
      if (teamFilter === 'present') return Boolean(att);
      if (teamFilter === 'late') return att?.status === 'late';
      if (teamFilter === 'leave') return Boolean(leave);
      if (teamFilter === 'not_in') return !att && !leave;
      return true;
    });
  }, [members, todayAttendanceLogs, activeLeavesToday, teamFilter]);

  const errorBanner = error && (
    <div className="error-banner" role="alert">
      {error}
      <button aria-label="ปิดข้อความ" onClick={() => setError('')}><X size={16} /></button>
    </div>
  );

  if (!authReady || (!demo && session && !loaded && !error)) {
    return <div className="loading"><span className="brand-mark">P</span><p>กำลังเตรียมออฟฟิศของคุณ…</p></div>;
  }

  if (!demo && (!session || !loaded)) {
    return (
      <div className="login-screen">
        <button 
          className="icon-button"
          onClick={toggleFullscreen}
          style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 50, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', borderRadius: '10px' }}
          title={isFullscreen ? 'ย่อหน้าต่าง (Esc หรือ F11)' : 'ขยายเต็มหน้าจอโน้ตบุ๊ก (Fullscreen / F11)'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <div className="login-art">
          <img src="/assets/office.png" alt="ออฟฟิศการ์ตูน PRIME มีห้องทำงาน ห้องประชุม มุมโฟกัส และมุมกาแฟ" />
        </div>
        <section className="login-panel">
          <span className="brand-mark">P</span>
          <p className="eyebrow">PRIME DIGITAL CONSULTANT</p>
          <h1>คนละที่<br />ทีมเดียวกัน<span>.</span></h1>
          <p>พื้นที่เล็ก ๆ สำหรับไอเดียใหญ่ของทีมเรา<br />เข้ามาทำงาน เช็คอิน และเติบโตไปด้วยกัน</p>
          {errorBanner}
          <button className="primary" disabled={busy || !configured} onClick={login}>
            เข้าสู่ระบบด้วย Google <ArrowUpRight size={18} />
          </button>
          {!configured && <small>ยังไม่ได้เชื่อมต่อบัญชีบริษัท · ดูคู่มือ SETUP-TH.md</small>}
          {session && <button className="secondary" onClick={logout}>ออกจากบัญชีนี้</button>}
          <button className="text-button" onClick={() => {
            setDemo(true);
            setError('');
            setRooms(initialRooms);
            setNotices([{ id: 'demo', title: 'ทดลองออฟฟิศของเรา', body: 'ข้อมูลสาธิตบันทึกเฉพาะเครื่องนี้ ยังไม่มีการส่งถึงสมาชิกจริง' }]);
          }}>
            ลองใช้งานด้วยข้อมูลสาธิต →
          </button>
          <small>สำหรับสมาชิกที่ได้รับอนุญาตเท่านั้น · สูงสุด 15 คน</small>
        </section>
      </div>
    );
  }

  return (
    <div className="immersive-app-container">
      {/* 1. IMMERSIVE FULL-SCREEN OFFICE CANVAS */}
      <div className="immersive-map-stage">
        <div className={`immersive-map-viewport ${page !== 'office' || selectedRoomCard ? 'drawer-open' : ''}`}>
          <img src="/assets/office.png" alt="PRIME Virtual Office Campus" />
          {rooms.map(r => {
            const people = online.filter(m => m.room === r.id);
            const isMyRoom = me.room === r.id;
            const isSelected = selected === r.id;
            return (
              <div className={`immersive-map-room ${r.id}`} key={r.id}>
                <button
                  type="button"
                  className={`room-pin-pill ${isMyRoom ? 'my-current-room' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setSelected(r.id);
                    setSelectedRoomCard(selectedRoomCard === r.id ? null : r.id);
                  }}
                  title={`คลิกเพื่อดูห้อง ${r.name} (${people.length} คน)`}
                >
                  <span className="tiny-dot" />
                  <span>{r.name}</span>
                  <span className="room-count-badge">{people.length}</span>
                </button>
                <div className="map-avatars">
                  {people.slice(0, 5).map(m => (
                    <button
                      type="button"
                      key={m.id}
                      className="map-person"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(r.id);
                        if (m.id !== me.id) setKnockTarget(m);
                      }}
                      aria-label={`${m.name} ${statuses[m.status]}`}
                      title={`${m.name}: ${statuses[m.status]}`}
                    >
                      <Avatar member={m} small isSpeaking={speakingMembers.has(m.id) || (m.id === me.id && isSpeaking)} />
                      <span>{m.id === me.id ? 'คุณ' : m.name}</span>
                    </button>
                  ))}
                  {people.length > 5 && <span className="more-people">+{people.length - 5}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. FLOATING ROOM CARD (When clicking a room pin on canvas) */}
      {selectedRoomCard && (
        <div 
          className="floating-room-popover" 
          style={{ 
            bottom: '86px', 
            right: page !== 'office' ? 'calc(min(720px, 94vw) + 18px)' : '24px' 
          }}
        >
          {(() => {
            const activeR = rooms.find(r => r.id === selectedRoomCard) || rooms[0];
            const peopleInRoom = online.filter(m => m.room === activeR.id);
            const isMyRoom = me.room === activeR.id;
            return (
              <>
                <div className="room-popover-header">
                  <strong>{activeR.name}</strong>
                  <button className="icon-button" onClick={() => setSelectedRoomCard(null)} title="ปิด"><X size={15} /></button>
                </div>
                <p className="room-popover-desc">{activeR.description}</p>
                <div className="section-label">
                  <span>สมาชิกในห้อง</span>
                  <small>{peopleInRoom.length} คน</small>
                </div>
                <div className="room-popover-occupants">
                  {peopleInRoom.length === 0 ? (
                    <small style={{ color: '#94a3b8' }}>ห้องว่าง แวะเข้ามาเป็นคนแรก</small>
                  ) : (
                    peopleInRoom.map(m => (
                      <div className="room-popover-person" key={m.id}>
                        <Avatar member={m} small isSpeaking={speakingMembers.has(m.id) || (m.id === me.id && isSpeaking)} />
                        <span>{m.name}{m.id === me.id ? ' (คุณ)' : ''}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="room-popover-actions">
                  {!isMyRoom ? (
                    <button className="primary" onClick={() => void updateProfile({ room_id: activeR.id })}>
                      <DoorOpen size={16} /> ย้ายเข้าห้องนี้
                    </button>
                  ) : (
                    <>
                      {inHuddle && huddleRoomId === activeR.id ? (
                        <button className="secondary" onClick={leaveHuddle}>
                          <PhoneOff size={15} color="#ef4444" /> วางสายเสียง
                        </button>
                      ) : (
                        <button className="primary" onClick={() => joinHuddle(activeR.id)}>
                          <Mic size={15} /> เข้าสายเสียงห้องนี้
                        </button>
                      )}
                    </>
                  )}
                  <button className="primary" style={{ background: '#2563eb' }} onClick={() => { setSelectedRoomCard(null); void startConference(activeR.id); }}>
                    <Video size={15} /> ประชุมวิดีโอห้องนี้ (WebRTC)
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 3. FLOATING TOP ISLAND */}
      <header className="floating-top-island">
        <div className="island-brand" onClick={() => { setPage('office'); setSelectedRoomCard(null); }}>
          <span className="island-brand-mark">P</span>
          <div className="island-brand-text">
            <strong>PRIME</strong>
            <small>VIRTUAL OFFICE</small>
          </div>
        </div>

        <div className="island-divider" />

        <div className="island-clock">
          <Clock size={13} color="#475569" />
          <span>{nowTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>
        </div>

        {todayHoliday.isCompanyHoliday ? (
          <button 
            type="button"
            className={`island-holiday-tag ${todayHoliday.isPublicHoliday ? 'public' : 'weekend'}`}
            onClick={() => { setPage('attendance'); setShowHolidayCalendar(true); }}
            title={`${todayHoliday.statusLabel} (หยุดตามราชการ) คลิกเพื่อดูปฏิทินทั้งปี`}
          >
            <span>{todayHoliday.isPublicHoliday ? `🏖️ วันหยุด: ${todayHoliday.name}` : `🛋️ ${todayHoliday.name}`}</span>
          </button>
        ) : (
          <button 
            type="button"
            className="island-holiday-tag weekend"
            onClick={() => { setPage('attendance'); setShowHolidayCalendar(true); }}
            title="ตรวจเช็ควันหยุดราชการประจำปี"
          >
            <span>🇹🇭 ตรวจวันหยุดราชการ</span>
          </button>
        )}

        <div className="island-divider" />

        {/* Quick Check-in pill */}
        {todayMyAttendance ? (
          !todayMyAttendance.check_out_at ? (
            <button className="topbar-checkin-pill active" onClick={handleCheckOut} disabled={busy} title="คลิกเพื่อเช็คเอาท์เลิกงาน">
              <span className="tiny-dot" />
              <span>เข้า {formatThaiTime(todayMyAttendance.check_in_at)} · เช็คเอาท์</span>
            </button>
          ) : (
            <div className="topbar-checkin-pill completed">
              <CheckCircle2 size={13} color="#40947a" />
              <span>ออกงานแล้ว {formatThaiTime(todayMyAttendance.check_out_at)}</span>
            </div>
          )
        ) : (
          <button className={`topbar-checkin-pill cta ${todayHoliday.isCompanyHoliday ? 'holiday-mode' : ''}`} onClick={handleCheckIn} disabled={busy} title="คลิกเพื่อเช็คอิน">
            <Clock size={13} />
            <span>{todayHoliday.isPublicHoliday ? 'ทำงานวันหยุดพิเศษ' : 'เช็คอินเข้างาน'}</span>
          </button>
        )}

        <div className="island-divider" />

        <select className="island-status-select" value={me.status} disabled={busy} onChange={e => void updateProfile({ status: e.target.value as Status })}>
          {Object.entries(statuses).map(([v, l]) => <option value={v} key={v}>{l}</option>)}
        </select>

        <div className="island-actions">
          <button className="icon-button bell" onClick={() => setNoticeOpen(true)} title={`การแจ้งเตือน ${incoming.length} รายการ`}>
            <Bell size={17} />
            {incoming.length > 0 && <b>{incoming.length}</b>}
          </button>
          <button 
            className="profile-badge-btn" 
            onClick={() => { setEditName(me.name); setEditAvatar(me.avatarUrl || ''); setProfileOpen(true); }}
            title="แก้ไขโปรไฟล์ของคุณ"
          >
            <Avatar member={me} small />
            <span className="my-name-tag">{me.name}</span>
          </button>
          <button 
            className="icon-button" 
            onClick={toggleFullscreen} 
            title={isFullscreen ? 'ย่อหน้าต่าง (Esc หรือ F11)' : 'ขยายเต็มหน้าจอโน้ตบุ๊ก (Fullscreen / F11)'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button className="icon-button" onClick={logout} disabled={busy} title={demo ? 'เข้าสู่ระบบจริง' : 'ออกจากระบบ'}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Floating Demo / Error Banners */}
      {demo && (
        <div className="demo-banner" style={{ position: 'fixed', top: '68px', left: '50%', transform: 'translateX(-50%)', zIndex: 115, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
          <span><span className="tiny-dot amber" />โหมดสาธิต · สมาชิก การเช็คอิน และการลาเป็นตัวอย่าง บันทึกเฉพาะเครื่องนี้</span>
          <button onClick={() => { setDemo(false); setError(''); }}>เชื่อมต่อทีมจริง <ArrowUpRight size={14} /></button>
        </div>
      )}
      {errorBanner}

      {/* 4. BOTTOM FLOATING DOCK */}
      <nav className="floating-bottom-dock">
        <button 
          className={`dock-btn ${page === 'office' && !selectedRoomCard ? 'active' : ''}`} 
          onClick={() => { setPage('office'); setSelectedRoomCard(null); }} 
          title="ออฟฟิศของเรา (ฉากเต็มจอ)"
        >
          <Home size={19} />
          <span className="dock-btn-label">ออฟฟิศ</span>
        </button>

        <div className="dock-divider" />

        {/* Voice Huddle Controller in Dock */}
        {inHuddle && huddleRoomId ? (
          <div className="dock-voice-module">
            <button
              className={`dock-voice-btn ${isMuted ? 'muted' : ''} ${isSpeaking ? 'speaking' : ''}`}
              onClick={handleMicClick}
              onPointerDown={handleMicPointerDown}
              onPointerUp={handleMicPointerUp}
              title={isMuted ? "ไมค์ปิดอยู่ (กดเพื่อเปิด หรือกด Spacebar ค้างเพื่อพูด)" : "ไมค์เปิดอยู่ (กำลังส่งเสียง)"}
            >
              {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
              <span>{isSpeaking ? 'กำลังพูด…' : isMuted ? 'ไมค์ปิด (Spacebar)' : 'ไมค์เปิด'}</span>
            </button>
            <button className="dock-btn" style={{ minWidth: '36px', height: '36px' }} onClick={() => toggleMute()} title="สลับไมค์">
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button className="dock-btn" style={{ minWidth: '36px', height: '36px' }} onClick={leaveHuddle} title="วางสายเสียง">
              <PhoneOff size={16} color="#ef4444" />
            </button>
          </div>
        ) : (
          <button className="dock-btn" onClick={() => joinHuddle(me.room)} title={`เปิดไมค์คุยในห้อง ${rooms.find(r => r.id === me.room)?.name}`}>
            <Radio size={19} color="#10b981" />
            <span className="dock-btn-label">เปิดไมค์</span>
          </button>
        )}

        {/* WebRTC Video Conference Launcher */}
        <button 
          className={`dock-btn ${conferenceOpen ? 'active' : ''}`} 
          onClick={() => {
            if (conferenceOpen) {
              setIsConferenceMinimized(false);
            } else {
              void startConference(me.room || 'project');
            }
          }} 
          title="ห้องประชุมวิดีโอ (WebRTC Meeting)"
        >
          <Video size={19} color={conferenceOpen ? '#38ef7d' : undefined} />
          <span className="dock-btn-label">Meeting</span>
          {conferenceOpen && <span className="dock-badge" style={{ background: '#10b981' }}>LIVE</span>}
        </button>

        <div className="dock-divider" />

        {/* Navigation to Drawers */}
        <button 
          className={`dock-btn ${page === 'attendance' ? 'active' : ''}`} 
          onClick={() => { setPage('attendance'); setSelectedRoomCard(null); }} 
          title="ระบบลงเวลาทำงาน & วันหยุดราชการ & ลางาน"
        >
          <CalendarCheck size={19} />
          <span className="dock-btn-label">ลงเวลา & ลา</span>
          {onLeaveCount > 0 && <span className="dock-badge leave-badge">{onLeaveCount}</span>}
        </button>

        <button 
          className={`dock-btn ${page === 'team' ? 'active' : ''}`} 
          onClick={() => { setPage('team'); setSelectedRoomCard(null); }} 
          title="สมาชิกทีมทั้งหมด"
        >
          <Users size={19} />
          <span className="dock-btn-label">สมาชิก</span>
          <span className="dock-badge">{members.length}</span>
        </button>

        <button 
          className={`dock-btn ${page === 'feed' || page === 'today' || page === 'announcements' ? 'active' : ''}`} 
          onClick={() => { setPage('feed'); setSelectedRoomCard(null); }} 
          title="ฟีดงาน & บอร์ดประกาศของทีม"
        >
          <ClipboardList size={19} />
          <span className="dock-btn-label">ฟีด & งาน</span>
          {feedPosts.length > 0 && <span className="dock-badge">{feedPosts.length}</span>}
        </button>

        {me.isAdmin && (
          <button 
            className={`dock-btn ${page === 'admin' ? 'active' : ''}`} 
            onClick={() => { setPage('admin'); setSelectedRoomCard(null); }} 
            title="ผู้ดูแลระบบ"
          >
            <Settings size={19} />
            <span className="dock-btn-label">แอดมิน</span>
          </button>
        )}
      </nav>

      {/* 5. SLIDE-OVER GLASS DRAWER (When page !== 'office') */}
      {page !== 'office' && (
        <>
          <div className="drawer-backdrop" onClick={() => setPage('office')} />
          <aside className="slide-over-drawer">
            <div className="drawer-header">
              <div className="drawer-header-title">
                <h2>{nav.find(n => n.id === page)?.label}</h2>
                <span>PRIME VIRTUAL OFFICE</span>
              </div>
              <button className="drawer-close-btn" onClick={() => setPage('office')} title="ปิดหน้าต่าง (หรือกด Esc)">
                <X size={16} />
                <span>ปิด (Esc)</span>
              </button>
            </div>
            <div className="drawer-body">
              {/* PAGE: Attendance & Leave Management */}

          {page === 'attendance' && (
            <div className="attendance-page">
              {/* Company Holiday Confirmation Banner */}
              {todayHoliday.isCompanyHoliday ? (
                <div className={`company-holiday-banner ${todayHoliday.isPublicHoliday ? 'public' : 'weekend'}`}>
                  <div className="holiday-banner-badge">
                    <span>{todayHoliday.isPublicHoliday ? '🇹🇭 วันหยุดราชการ' : '🛋️ วันหยุดสุดสัปดาห์'}</span>
                    <span className="confirm-check">✓ ยืนยันเป็นวันหยุดบริษัท</span>
                  </div>
                  <div className="holiday-banner-body">
                    <h2>{todayHoliday.isPublicHoliday ? `วันนี้เป็นวันหยุดของบริษัท: ${todayHoliday.name}` : `วันนี้เป็น${todayHoliday.name}`}</h2>
                    <p>บริษัท ไพร์มดิจิทัลคอนซัลแทนท์ จำกัด ปฏิบัติตาม<strong>ปฏิทินวันหยุดราชการไทย ประจำปี พ.ศ. {new Date().getFullYear() + 543}</strong> ทีมงานสามารถพักผ่อนได้เต็มที่โดยไม่จำเป็นต้องเช็คอินเข้างาน</p>
                  </div>
                  <div className="holiday-banner-actions">
                    <button type="button" className="text-button" onClick={() => setShowHolidayCalendar(!showHolidayCalendar)}>
                      <CalendarCheck size={16} /> {showHolidayCalendar ? 'ซ่อนปฏิทินวันหยุด' : 'ดูปฏิทินวันหยุดราชการทั้งปี →'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="workday-banner">
                  <div><span className="workday-dot" /><span>วันนี้เป็นวันทำงานปกติ · {formatThaiFullDate(todayDateStr)}</span></div>
                  <button type="button" className="text-button" onClick={() => setShowHolidayCalendar(!showHolidayCalendar)}>
                    <CalendarCheck size={15} /> {showHolidayCalendar ? 'ปิดปฏิทิน' : 'ตรวจเช็คปฏิทินวันหยุดราชการปีนี้'}
                  </button>
                </div>
              )}

              {/* Annual Holiday Calendar Panel */}
              {showHolidayCalendar && (
                <section className="panel holiday-calendar-card">
                  <div className="holiday-calendar-header">
                    <div>
                      <h2>🇹🇭 ปฏิทินวันหยุดราชการของบริษัท ประจำปี พ.ศ. {selectedHolidayYear + 543} ({selectedHolidayYear})</h2>
                      <p>อ้างอิงตามประกาศมติคณะรัฐมนตรี (ครม.) · บริษัทหยุดตามราชการทั้งหมด {yearHolidaysList.length} วัน</p>
                    </div>
                    <div className="year-selector-tabs">
                      {[2025, 2026, 2027].map(y => (
                        <button key={y} className={`year-tab ${selectedHolidayYear === y ? 'active' : ''}`} onClick={() => setSelectedHolidayYear(y)}>
                          พ.ศ. {y + 543} ({y})
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="holiday-grid-list">
                    {yearHolidaysList.map(h => {
                      const isPast = h.date < todayDateStr;
                      const isCurrent = h.date === todayDateStr;
                      return (
                        <div key={h.date} className={`holiday-row-card ${isCurrent ? 'today' : ''} ${isPast ? 'past' : ''}`}>
                          <div className="holiday-date-col">
                            <span className="holiday-date-num">{h.date.split('-')[2]}</span>
                            <span className="holiday-date-mo">{THAI_MONTH_NAMES[Number(h.date.split('-')[1]) - 1]}</span>
                          </div>
                          <div className="holiday-info-col">
                            <strong>{h.name}</strong>
                            <small>{h.thaiDate} {h.isSubstitute ? ' · (วันหยุดชดเชย)' : ''}</small>
                          </div>
                          <div className="holiday-tag-col">
                            {isCurrent ? <span className="holiday-tag-status active">🎉 วันนี้</span> : isPast ? <span className="holiday-tag-status past">ผ่านไปแล้ว</span> : <span className="holiday-tag-status future">วันหยุดบริษัท</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Daily KPI Dashboard */}
              <div className="att-kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-icon blue"><Users size={22} /></div>
                  <div>
                    <small>สมาชิกทั้งหมด</small>
                    <strong>{members.length} คน</strong>
                    <span className="kpi-sub">ไพร์มดิจิทัลคอนซัลแทนท์</span>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-icon green"><CheckCircle2 size={22} /></div>
                  <div>
                    <small>เช็คอินเข้างานแล้ว</small>
                    <strong>{checkedInCount} คน</strong>
                    <span className="kpi-sub">{Math.round((checkedInCount / members.length) * 100)}% ของทั้งทีม</span>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-icon amber"><Clock size={22} /></div>
                  <div>
                    <small>ตรงเวลา / สาย</small>
                    <strong>{onTimeCount} <span className="kpi-divider">/</span> <span className="kpi-warn">{lateCount}</span></strong>
                    <span className="kpi-sub">เกณฑ์เวลา 08:00 น.</span>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-icon purple"><CalendarCheck size={22} /></div>
                  <div>
                    <small>ลางานวันนี้</small>
                    <strong>{onLeaveCount} คน</strong>
                    <span className="kpi-sub">อนุมัติอัตโนมัติ</span>
                  </div>
                </div>
              </div>

              <div className="att-layout-grid">
                {/* Left Column: My Action & Leave Submission */}
                <div className="att-left-col">
                  {/* My Attendance Card */}
                  <section className="panel att-box">
                    <div className="att-box-header">
                      <div>
                        <h2><Clock size={20} />การลงเวลาของคุณวันนี้</h2>
                        <p>เวลาทำการมาตรฐานบริษัท: <strong>08:00 - 17:00 น.</strong></p>
                      </div>
                      <div className="live-clock-badge">
                        <span className="tiny-dot" />
                        <span>{nowTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.</span>
                      </div>
                    </div>

                    <div className="my-att-summary-card">
                      <div className="att-time-cell">
                        <small>เวลาเข้างาน</small>
                        <strong>{todayMyAttendance ? formatThaiTime(todayMyAttendance.check_in_at) : '—'}</strong>
                        {todayMyAttendance && (
                          <span className={`status-tag ${todayMyAttendance.status}`}>
                            {todayMyAttendance.status === 'on_time' ? '✓ ตรงเวลา' : '⚠ มาสาย'}
                          </span>
                        )}
                      </div>
                      <div className="att-time-divider" />
                      <div className="att-time-cell">
                        <small>เวลาออกงาน</small>
                        <strong>{todayMyAttendance?.check_out_at ? formatThaiTime(todayMyAttendance.check_out_at) : '—'}</strong>
                        {todayMyAttendance?.check_out_at ? (
                          <span className="status-tag finished">✓ บันทึกแล้ว</span>
                        ) : (
                          <span className="status-tag in-progress">กำลังทำงาน</span>
                        )}
                      </div>
                      <div className="att-time-divider" />
                      <div className="att-time-cell">
                        <small>รวมเวลาทำงาน</small>
                        <strong>{todayMyAttendance ? formatDuration(todayMyAttendance.check_in_at, todayMyAttendance.check_out_at) : '—'}</strong>
                        <span className="sub-hint">เป้าหมาย 8 ชม.</span>
                      </div>
                    </div>

                    <div className="att-actions-row">
                      {!todayMyAttendance ? (
                        <button className="primary att-btn-lg" onClick={handleCheckIn} disabled={busy}>
                          <Clock size={18} />เช็คอินเข้างาน (เริ่ม 08:00 น.)
                        </button>
                      ) : !todayMyAttendance.check_out_at ? (
                        <button className="primary att-btn-lg checkout" onClick={handleCheckOut} disabled={busy}>
                          <CheckCircle2 size={18} />เช็คเอาท์เลิกงาน (17:00 น.)
                        </button>
                      ) : (
                        <div className="att-done-banner">
                          <CheckCircle2 size={18} color="#2b7a5a" />
                          <span>คุณลงเวลาเข้าและออกงานของวันนี้เรียบร้อยแล้ว พักผ่อนให้เต็มที่ครับ!</span>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Leave Request Form (Instant Approval Mode 1) */}
                  <section className="panel att-box">
                    <div className="att-box-header">
                      <div>
                        <h2><CalendarCheck size={20} />ยื่นคำขอลางาน</h2>
                        <p>อนุมัติทันทีเพื่อความคล่องตัว สถานะจะขึ้นบนผังออฟฟิศอัตโนมัติ</p>
                      </div>
                    </div>

                    <form className="leave-form" onSubmit={handleLeaveSubmit}>
                      <div className="form-group">
                        <label>ประเภทการลา</label>
                        <div className="leave-type-selector">
                          {(Object.keys(leaveTypesConfig) as LeaveType[]).map(t => {
                            const cfg = leaveTypesConfig[t];
                            return (
                              <button
                                type="button"
                                key={t}
                                className={`leave-type-chip ${leaveType === t ? 'active' : ''}`}
                                onClick={() => setLeaveType(t)}
                              >
                                <span className="chip-emoji">{cfg.emoji}</span>
                                <span className="chip-label">{cfg.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>วันที่เริ่มต้น</label>
                          <input 
                            type="date" 
                            required 
                            value={leaveStart} 
                            onChange={e => {
                              setLeaveStart(e.target.value);
                              if (leaveEnd < e.target.value) setLeaveEnd(e.target.value);
                            }} 
                          />
                        </div>
                        <div className="form-group">
                          <label>วันที่สิ้นสุด</label>
                          <input 
                            type="date" 
                            required 
                            min={leaveStart} 
                            value={leaveEnd} 
                            onChange={e => setLeaveEnd(e.target.value)} 
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>ช่วงเวลา</label>
                        <select value={leavePeriod} onChange={e => setLeavePeriod(e.target.value as any)}>
                          {Object.entries(periodLabels).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>เหตุผล / รายละเอียด (ระบุสั้นๆ)</label>
                        <input 
                          type="text" 
                          maxLength={300} 
                          value={leaveReason} 
                          onChange={e => setLeaveReason(e.target.value)} 
                          placeholder="เช่น พบแพทย์โรงพยาบาล, ติดต่อธุระราชการ, นัดหมายด่วน…" 
                        />
                      </div>

                      {/* Working Days & Company Holiday Deduction Calculator */}
                      <div className="leave-calc-box">
                        <div className="calc-summary">
                          <span>ระยะเวลาที่เลือก: <strong>{leaveWorkingDaysCalc.totalDays} วัน</strong></span>
                          <span>•</span>
                          <span>วันหยุดบริษัท/เสาร์-อาทิตย์: <strong className="text-amber">{leaveWorkingDaysCalc.holidays.length} วัน</strong></span>
                          <span>•</span>
                          <span>ใช้วันลาจริง: <strong className="text-green">{leaveWorkingDaysCalc.workingDays} วันทำการ</strong></span>
                        </div>
                        {leaveWorkingDaysCalc.holidays.length > 0 && (
                          <div className="calc-holiday-tags">
                            <small>วันหยุดราชการของบริษัทที่ไม่นับเป็นวันลา (หยุดตามราชการ):</small>
                            <div className="holiday-chip-row">
                              {leaveWorkingDaysCalc.holidays.map(h => (
                                <span key={h.date} className="holiday-chip" title={h.name}>
                                  🏖️ {h.date}: {h.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {leaveWorkingDaysCalc.workingDays === 0 && leaveWorkingDaysCalc.totalDays > 0 && (
                          <div className="calc-zero-alert">
                            💡 ทุกวันที่เลือกเป็นวันหยุดของบริษัทอยู่แล้ว (หยุดตามราชการ) ไม่เสียโควตาวันลา
                          </div>
                        )}
                      </div>

                      <button type="submit" className="primary" disabled={busy}>
                        <Plus size={16} />ยื่นการลา (มีผลทันที)
                      </button>
                    </form>

                    {/* My Recent Leaves */}
                    <div className="my-leaves-history">
                      <div className="section-label">
                        <span>ประวัติการลาของคุณ</span>
                        <small>{leavesList.filter(l => l.user_id === me.id).length} รายการ</small>
                      </div>
                      <div className="leave-history-list">
                        {leavesList.filter(l => l.user_id === me.id).length === 0 ? (
                          <p className="empty-inline">ยังไม่มีประวัติการลา</p>
                        ) : leavesList.filter(l => l.user_id === me.id).map(l => (
                          <div key={l.id} className="leave-item-row">
                            <span className="leave-item-icon">{leaveTypesConfig[l.leave_type]?.emoji || '📋'}</span>
                            <div className="leave-item-body">
                              <strong>
                                {leaveTypesConfig[l.leave_type]?.label}
                                <span className="period-tag">{periodLabels[l.period] || l.period}</span>
                              </strong>
                              <small>
                                {l.start_date === l.end_date ? l.start_date : `${l.start_date} ถึง ${l.end_date}`}
                                {l.reason ? ` · ${l.reason}` : ''}
                              </small>
                            </div>
                            <button 
                              className="icon-button" 
                              title="ยกเลิกการลา" 
                              onClick={() => void handleCancelLeave(l.id)}
                            >
                              <Trash2 size={15} color="#9aa7ae" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>

                {/* Right Column: Team Attendance & Leaves Today */}
                <div className="att-right-col">
                  <section className="panel att-box">
                    <div className="att-box-header">
                      <div>
                        <h2><Users size={20} />สถานะการเข้างานของทีมวันนี้</h2>
                        <p>ประจำวัน {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      </div>
                    </div>

                    {/* Filter chips */}
                    <div className="att-filter-bar">
                      <button className={`chip-btn ${teamFilter === 'all' ? 'active' : ''}`} onClick={() => setTeamFilter('all')}>
                        ทั้งหมด ({members.length})
                      </button>
                      <button className={`chip-btn ${teamFilter === 'present' ? 'active' : ''}`} onClick={() => setTeamFilter('present')}>
                        เข้างานแล้ว ({checkedInCount})
                      </button>
                      <button className={`chip-btn ${teamFilter === 'late' ? 'active' : ''}`} onClick={() => setTeamFilter('late')}>
                        สาย ({lateCount})
                      </button>
                      <button className={`chip-btn ${teamFilter === 'leave' ? 'active' : ''}`} onClick={() => setTeamFilter('leave')}>
                        ลางาน ({onLeaveCount})
                      </button>
                      <button className={`chip-btn ${teamFilter === 'not_in' ? 'active' : ''}`} onClick={() => setTeamFilter('not_in')}>
                        ยังไม่เช็คอิน ({members.length - checkedInCount - onLeaveCount})
                      </button>
                    </div>

                    {/* Team Members Attendance Table */}
                    <div className="team-att-table">
                      {filteredMembers.map(({ member: m, att, leave }) => (
                        <div key={m.id} className="team-att-row">
                          <div className="team-att-user">
                            <Avatar member={m} small />
                            <div>
                              <strong>{m.name}{m.id === me.id ? ' (คุณ)' : ''}</strong>
                              <small>{m.role}</small>
                            </div>
                          </div>

                          <div className="team-att-status">
                            {leave ? (
                              <span className="badge-leave" title={leave.reason || leaveTypesConfig[leave.leave_type]?.label}>
                                {leaveTypesConfig[leave.leave_type]?.emoji} {leaveTypesConfig[leave.leave_type]?.label} ({periodLabels[leave.period]?.split(' ')[0]})
                              </span>
                            ) : att ? (
                              <div className="checkin-info">
                                <span className={`badge-time ${att.status}`}>
                                  {att.status === 'on_time' ? '🟢 ตรงเวลา' : '🟡 สาย'} {formatThaiTime(att.check_in_at)}
                                </span>
                                {att.check_out_at && (
                                  <small className="checkout-time">ออก {formatThaiTime(att.check_out_at)}</small>
                                )}
                              </div>
                            ) : (
                              <span className="badge-not-in">⚪ ยังไม่เช็คอิน</span>
                            )}
                          </div>

                          <div className="team-att-room">
                            <small>{rooms.find(r => r.id === m.room)?.name}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {/* PAGE: Team Members */}
          {page === 'team' && (
            <div className="team-grid">
              {members.map(m => (
                <article className="member-card" key={m.id}>
                  <Avatar member={m} />
                  <div>
                    <h3>
                      {m.name}{m.id === me.id ? ' (คุณ)' : ''}
                      {m.leaveToday && <span className="member-leave-tag">{m.leaveToday.emoji} {m.leaveToday.label}</span>}
                    </h3>
                    <p>{m.role}</p>
                    <small>
                      {m.leaveToday ? `ลางานวันนี้ (${m.leaveToday.label})` : (m.online ? `${statuses[m.status]} · ${rooms.find(r => r.id === m.room)?.name}` : 'ออฟไลน์')}
                    </small>
                  </div>
                  {m.id !== me.id && (
                    <button className="secondary" disabled={!m.online || Boolean(m.leaveToday)} onClick={() => setKnockTarget(m)}>
                      <Hand size={16} />ขอคุย
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}

          {/* PAGE: Unified Feed (Today Work + Announcements) */}
          {(page === 'feed' || page === 'today' || page === 'announcements') && (
            <div className="feed-container">
              {/* 1. Filter Tabs */}
              <div className="feed-filter-tabs">
                <button 
                  type="button" 
                  className={`feed-tab-btn ${feedFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setFeedFilter('all')}
                >
                  <span>ทั้งหมด</span>
                  <span style={{ opacity: 0.8 }}>({feedPosts.length})</span>
                </button>
                <button 
                  type="button" 
                  className={`feed-tab-btn ${feedFilter === 'today' ? 'active' : ''}`}
                  onClick={() => setFeedFilter('today')}
                >
                  <span>💼 งานวันนี้</span>
                  <span style={{ opacity: 0.8 }}>({feedPosts.filter(p => p.type === 'today').length})</span>
                </button>
                <button 
                  type="button" 
                  className={`feed-tab-btn ${feedFilter === 'announcement' ? 'active' : ''}`}
                  onClick={() => setFeedFilter('announcement')}
                >
                  <span>📢 เรื่องประกาศ</span>
                  <span style={{ opacity: 0.8 }}>({feedPosts.filter(p => p.type === 'announcement').length})</span>
                </button>
              </div>

              {/* 2. Composer Card (Open to all members) */}
              <div className="feed-composer-card">
                <form onSubmit={handleCreatePost}>
                  <div className="feed-composer-header">
                    <div className="feed-author-meta">
                      <Avatar member={me} small />
                      <div className="feed-author-text">
                        <strong>{me.name}</strong>
                        <small>แชร์ให้เพื่อนร่วมทีม</small>
                      </div>
                    </div>
                    <div className="feed-type-selector">
                      <button 
                        type="button" 
                        className={`type-pill-btn today ${newPostType === 'today' ? 'active today' : ''}`}
                        onClick={() => setNewPostType('today')}
                      >
                        💼 งานวันนี้
                      </button>
                      <button 
                        type="button" 
                        className={`type-pill-btn announcement ${newPostType === 'announcement' ? 'active announcement' : ''}`}
                        onClick={() => setNewPostType('announcement')}
                      >
                        📢 เรื่องประกาศ
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <input 
                      type="text" 
                      placeholder={newPostType === 'today' ? "หัวข้องานวันนี้ (เช่น พัฒนาฟีเจอร์, เตรียมเอกสาร...)" : "หัวข้อเรื่องประกาศ (เช่น นัดหมายสำคัญ, กิจกรรมทีม...)"}
                      value={newPostTitle}
                      onChange={e => setNewPostTitle(e.target.value)}
                      maxLength={120}
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <textarea 
                      required
                      rows={3}
                      placeholder={newPostType === 'today' ? "วันนี้ทำอะไรอยู่ หรือมีเรื่องที่อยากให้ทีมช่วย?" : "พิมพ์รายละเอียดเรื่องประกาศที่ทุกคนควรรู้..."}
                      value={newPostContent}
                      onChange={e => setNewPostContent(e.target.value)}
                      maxLength={1000}
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px', borderRadius: '10px', border: '1px solid #cbd5e1', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="primary" style={{ padding: '8px 18px', fontSize: '12px' }}>
                      <Send size={13} style={{ marginRight: '6px' }} /> โพสต์{newPostType === 'today' ? 'งานวันนี้' : 'เรื่องประกาศ'}
                    </button>
                  </div>
                </form>
              </div>

              {/* 3. Feed Posts List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {feedPosts
                  .filter(p => feedFilter === 'all' || p.type === feedFilter)
                  .map(post => {
                    const isAuthor = post.authorId === me.id;
                    const canDelete = isAuthor || me.isAdmin;
                    const authorMember = members.find(m => m.id === post.authorId);
                    const authorDisplayMember: Member = authorMember || {
                      id: post.authorId,
                      name: post.authorName,
                      role: 'ทีม PRIME',
                      room: 'hub',
                      status: 'available',
                      online: false,
                      color: 'blue',
                      avatarUrl: post.authorAvatar
                    };

                    return (
                      <article className="feed-post-card" key={post.id}>
                        {/* Post Header */}
                        <div className="feed-post-header">
                          <div className="feed-author-meta">
                            <Avatar member={authorDisplayMember} small />
                            <div className="feed-author-text">
                              <strong>{post.authorName}</strong>
                              <small>{formatPostTime(post.createdAt)}</small>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`feed-tag-badge ${post.type}`}>
                              {post.type === 'today' ? '💼 งานวันนี้' : '📢 เรื่องประกาศ'}
                            </span>
                            {canDelete && (
                              <button 
                                type="button" 
                                onClick={() => handleDeletePost(post.id)}
                                title="ลบโพสต์นี้"
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Post Content */}
                        <div className="feed-post-content">
                          {post.title && <h3>{post.title}</h3>}
                          <p>{post.content}</p>
                        </div>

                        {/* Reactions Bar */}
                        <div className="feed-reaction-bar">
                          <button 
                            type="button"
                            className={`reaction-btn like ${(post.reactions.likes || []).includes(me.id) ? 'active' : ''}`}
                            onClick={() => handleToggleReaction(post.id, 'likes')}
                            title="กดถูกใจ (Like)"
                          >
                            <Heart size={13} fill={(post.reactions.likes || []).includes(me.id) ? 'currentColor' : 'none'} />
                            <span>ถูกใจ</span>
                            {(post.reactions.likes || []).length > 0 && <strong>{(post.reactions.likes || []).length}</strong>}
                          </button>

                          <button 
                            type="button"
                            className={`reaction-btn clap ${(post.reactions.claps || []).includes(me.id) ? 'active' : ''}`}
                            onClick={() => handleToggleReaction(post.id, 'claps')}
                            title="กดเยี่ยม (Great)"
                          >
                            <ThumbsUp size={13} fill={(post.reactions.claps || []).includes(me.id) ? 'currentColor' : 'none'} />
                            <span>เยี่ยม</span>
                            {(post.reactions.claps || []).length > 0 && <strong>{(post.reactions.claps || []).length}</strong>}
                          </button>

                          <button 
                            type="button"
                            className={`reaction-btn noted ${(post.reactions.noted || []).includes(me.id) ? 'active' : ''}`}
                            onClick={() => handleToggleReaction(post.id, 'noted')}
                            title="กดรับทราบ (Noted)"
                          >
                            <CheckSquare size={13} />
                            <span>รับทราบ</span>
                            {(post.reactions.noted || []).length > 0 && <strong>{(post.reactions.noted || []).length}</strong>}
                          </button>

                          <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MessageSquare size={13} />
                            <span>{(post.comments || []).length} ความคิดเห็น</span>
                          </div>
                        </div>

                        {/* Comments Section */}
                        <div className="feed-comment-section">
                          {(post.comments && post.comments.length > 0) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {post.comments.map(c => {
                                const cMember = members.find(m => m.id === c.authorId) || {
                                  id: c.authorId,
                                  name: c.authorName,
                                  role: 'ทีม PRIME',
                                  room: 'hub',
                                  status: 'available',
                                  online: false,
                                  color: 'blue',
                                  avatarUrl: c.authorAvatar
                                };
                                return (
                                  <div className="feed-comment-row" key={c.id}>
                                    <Avatar member={cMember} small />
                                    <div className="feed-comment-bubble">
                                      <strong>{c.authorName}</strong>
                                      <p>{c.content}</p>
                                      <small>{formatPostTime(c.createdAt)}</small>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Comment Input */}
                          <form 
                            className="feed-comment-input-row" 
                            onSubmit={e => {
                              e.preventDefault();
                              handleAddComment(post.id);
                            }}
                          >
                            <input 
                              type="text"
                              placeholder="เขียนความคิดเห็นหรือตอบกลับ…"
                              value={commentDrafts[post.id] || ''}
                              onChange={e => setCommentDrafts({ ...commentDrafts, [post.id]: e.target.value })}
                              maxLength={300}
                            />
                            <button type="submit" disabled={!commentDrafts[post.id]?.trim()}>
                              ตอบ
                            </button>
                          </form>
                        </div>
                      </article>
                    );
                  })}

                {feedPosts.filter(p => feedFilter === 'all' || p.type === feedFilter).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <ClipboardList size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '13px' }}>ยังไม่มีรายการในหมวดนี้ โพสต์เป็นคนแรกได้เลย!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PAGE: Admin Dashboard */}
          {page === 'admin' && me.isAdmin && (
            <div className="admin-grid">
              <section className="panel">
                <h2><Video size={21} />ระบบห้องประชุมวิดีโอ (WebRTC Native)</h2>
                <p>ระบบประชุมวิดีโอแบบเปิดกล้องและแชร์หน้าจอ ทำงานในตัวแบบเสร็จสรรพ ไม่ต้องใช้ Google Meet</p>
                <div className="setup-note" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                  <p>✅ <strong>ระบบประชุมพร้อมใช้งาน:</strong> ทุกห้องทำงาน (PRIME Hub, Project Room, Focus Zone, Coffee Corner) มีห้องประชุมวิดีโอความละเอียดสูงแยกอิสระในตัว</p>
                  <p style={{ marginTop: '8px' }}>🔐 <strong>ความปลอดภัย:</strong> เข้ารหัสแบบ End-to-End P2P ส่งสัญญาณภาพและเสียงตรงระหว่างสมาชิกในห้องประชุม</p>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    className="primary" 
                    onClick={() => { void startConference('project'); }}
                  >
                    <Video size={16} /> ทดสอบเปิดห้องประชุม Project Room
                  </button>
                </div>
              </section>

              <section className="panel">
                <h2><ShieldCheck size={21} />อนุญาตสมาชิก</h2>
                <p>เพิ่มรายชื่ออีเมลก่อนให้สมาชิกเข้าสู่ระบบ รองรับ 15 บัญชีที่เปิดใช้งาน</p>
                {demo ? (
                  <div className="setup-note">โหมดสาธิตยังไม่เพิ่มบัญชีจริง<br />เชื่อม Supabase แล้วจึงจัดการสิทธิ์สมาชิกได้</div>
                ) : (
                  <>
                    <form className="admin-form" onSubmit={e => {
                      e.preventDefault();
                      void action(async () => {
                        const { error } = await supabase!.rpc('admin_upsert_member', { p_email: normalizeEmail(inviteEmail), p_name: inviteName, p_active: true, p_admin: false });
                        if (error) throw error;
                        setInviteEmail('');
                        setInviteName('');
                        await loadAdmin();
                        await refresh();
                        notify('อนุญาตสมาชิกแล้ว ให้สมาชิกเข้าสู่ระบบด้วย Google');
                      });
                    }}>
                      <label>ชื่อ<input required maxLength={80} value={inviteName} onChange={e => setInviteName(e.target.value)} /></label>
                      <label>อีเมล Google<input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></label>
                      <button disabled={busy} className="primary">เพิ่มสมาชิก</button>
                    </form>
                    <div className="admin-members">
                      {adminMembers.map(m => (
                        <div key={m.id}>
                          <span><strong>{m.name}{m.is_admin ? ' · ผู้ดูแล' : ''}</strong><small>{m.email}</small></span>
                          <button className="text-button" disabled={busy} onClick={() => void action(async () => {
                            const { error } = await supabase!.rpc('admin_upsert_member', { p_email: m.email, p_name: m.name, p_active: !m.active, p_admin: m.is_admin });
                            if (error) throw error;
                            await loadAdmin();
                            await refresh();
                          })}>
                            {m.active ? 'ปิดสิทธิ์' : 'เปิดสิทธิ์'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

              <footer className="page-footer">
                <span>PRIME DIGITAL CONSULTANT</span>
                <span>พื้นที่ทำงานของเรา · เวอร์ชัน 0.2 (ระบบลงเวลา & ลางาน)</span>
              </footer>
            </div>
          </aside>
        </>
      )}

      {/* MODAL: Knock Request */}
      {knockTarget && (
        <div className="modal-backdrop" onClick={() => setKnockTarget(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="knock-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setKnockTarget(null); }}>
            <button autoFocus className="icon-button close-modal" aria-label="ปิด" onClick={() => setKnockTarget(null)}><X /></button>
            <Avatar member={knockTarget} />
            <h2 id="knock-title">ขอคุยกับ{knockTarget.name}</h2>
            <p>
              เชิญมาเจอกันที่ {rooms.find(r => r.id === me.room)?.name}<br />
              {knockTarget.status === 'focus' ? 'เพื่อนกำลังโฟกัส สามารถเลือกตอบรับภายหลังได้' : 'ผู้รับเลือกตอบรับหรือปฏิเสธได้'}
            </p>
            <button className="primary" disabled={busy} onClick={sendKnock}>
              <Hand size={18} />{demo ? 'ทดลองเคาะประตู' : 'ส่งคำขอคุย'}
            </button>
            <small>{demo ? 'ไม่มีการส่งข้อความจริง' : 'คำขอหมดอายุใน 5 นาที'}</small>
          </section>
        </div>
      )}

      {/* MODAL: Notifications */}
      {noticeOpen && (
        <div className="modal-backdrop" onClick={() => setNoticeOpen(false)}>
          <section className="modal notifications" role="dialog" aria-modal="true" aria-labelledby="notifications-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setNoticeOpen(false); }}>
            <button autoFocus className="icon-button close-modal" aria-label="ปิด" onClick={() => setNoticeOpen(false)}><X /></button>
            <h2 id="notifications-title">คำขอคุย</h2>
            {demo ? (
              <p>โหมดสาธิตไม่มีคำขอจากสมาชิกจริง</p>
            ) : incoming.length === 0 ? (
              <p>ยังไม่มีคำขอใหม่</p>
            ) : incoming.map(k => (
              <article key={k.id}>
                <p><strong>{k.sender}</strong> ชวนคุยที่ {rooms.find(r => r.id === k.room_id)?.name}</p>
                <div className="button-row">
                  <button disabled={busy} className="primary" onClick={() => void respondKnock(k, true)}>ตอบรับและเข้าห้อง</button>
                  <button disabled={busy} className="secondary" onClick={() => void respondKnock(k, false)}>ปฏิเสธ</button>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}


      {/* MODAL: Edit Profile */}
      {profileOpen && (
        <div className="modal-backdrop" onClick={() => setProfileOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setProfileOpen(false); }}>
            <button autoFocus className="icon-button close-modal" aria-label="ปิด" onClick={() => setProfileOpen(false)}><X /></button>
            <h2 id="profile-title">แก้ไขโปรไฟล์</h2>
            <p>เปลี่ยนชื่อที่แสดงและเลือกรูปการ์ตูนประจำตัวของคุณ</p>
            <div className="avatar-preview-box">
              <Avatar member={{ ...me, name: editName || 'คุณ', avatarUrl: editAvatar }} />
              <small style={{ color: '#7e95a3' }}>ตัวอย่างที่คนอื่นเห็น</small>
            </div>
            <form onSubmit={e => { e.preventDefault(); void saveProfile(); }}>
              <div style={{ textAlign: 'left', marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: '#688090', display: 'block', marginBottom: '6px' }}>ชื่อของคุณ</label>
                <input required maxLength={80} style={{ width: '100%' }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="เช่น เมย์, ต้น, ก้อง…" />
              </div>
              
              <div style={{ textAlign: 'left', marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: '#688090', display: 'block', marginBottom: '6px' }}>รูปภาพโพรไฟล์ของคุณ</label>
                <div className="upload-avatar-row">
                  <label className="upload-avatar-btn">
                    <Camera size={14} /> อัปโหลดรูปภาพจากอุปกรณ์
                    <input type="file" accept="image/*" onChange={handleAvatarFileUpload} />
                  </label>
                  {editAvatar && (
                    <button 
                      type="button" 
                      className="secondary" 
                      style={{ padding: '6px 10px', fontSize: '11px' }} 
                      onClick={() => setEditAvatar('')}
                    >
                      ลบรูป
                    </button>
                  )}
                </div>
                <small style={{ color: '#94a3b8', fontSize: '10px', display: 'block', marginTop: '4px' }}>
                  รองรับไฟล์ภาพจากมือถือหรือคอมพิวเตอร์ (ปรับขนาดอัตโนมัติ)
                </small>
              </div>

              <div style={{ textAlign: 'left', marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: '#688090', display: 'block', marginBottom: '6px' }}>หรือเลือกการ์ตูนประจำตัว</label>
                <div className="emoji-selector">
                  {['👩🏻‍💻', '👨🏻‍💻', '🧑🏻‍💼', '👩🏻‍💼', '🧑🏻‍🎨', '👨🏻‍🔬', '🦊', '🐱', '🐶', '🐼', '🚀', '☕', '🎧', '🌟'].map(emoji => (
                    <button type="button" key={emoji} className={`emoji-btn ${editAvatar === emoji ? 'active' : ''}`} onClick={() => setEditAvatar(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'left', marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#688090', display: 'block', marginBottom: '6px' }}>หรือใส่ URL รูปภาพของคุณ</label>
                <input type="url" style={{ width: '100%' }} value={editAvatar.startsWith('http') ? editAvatar : ''} onChange={e => setEditAvatar(e.target.value.trim())} placeholder="https://example.com/photo.jpg" />
                <div className="quick-options">
                  {session?.user?.user_metadata?.avatar_url && (
                    <button type="button" onClick={() => setEditAvatar(session.user.user_metadata.avatar_url)}>ใช้รูปโปรไฟล์ Google</button>
                  )}
                  <button type="button" onClick={() => setEditAvatar('')}>ใช้อีโมจิเริ่มต้น</button>
                </div>
              </div>
              <div className="button-row" style={{ marginTop: '20px' }}>
                <button type="button" className="secondary" onClick={() => setProfileOpen(false)}>ยกเลิก</button>
                <button type="submit" className="primary" disabled={busy}>บันทึกโปรไฟล์</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Floating Bottom Voice Huddle Dock */}
      {inHuddle && (
        <div className="huddle-floating-dock" role="region" aria-label="แถบควบคุม Voice Huddle">
          <div className="huddle-dock-info">
            <span className="huddle-dock-dot">
              <Radio size={15} className="pulse-icon" />
            </span>
            <div>
              <strong>Voice Huddle · {rooms.find(r => r.id === huddleRoomId)?.name}</strong>
              <small>
                {isDeafened 
                  ? 'ปิดเสียงลำโพง' 
                  : isMuted 
                    ? 'ไมโครโฟนปิดอยู่ (Muted)' 
                    : isSpeaking 
                      ? '🎙️ กำลังส่งเสียงพูด…' 
                      : (activeVoicePeers.length > 1 ? `เชื่อมต่อ P2P (${activeVoicePeers.length} คน) · พร้อมพูด` : 'เปิดไมค์พร้อมพูด')}
              </small>
              {!isMuted && (
                <div className="mic-level-meter" style={{ marginTop: 3, height: 3, width: 140 }}>
                  <span className="mic-level-fill" style={{ width: `${micLevel}%` }} />
                </div>
              )}
            </div>
          </div>
          <div className="huddle-dock-actions">
            <button 
              type="button"
              className={`huddle-dock-btn ${!isMuted ? (isSpeaking ? 'active speaking' : 'active') : 'muted'}`}
              onPointerDown={handleMicPointerDown}
              onPointerUp={handleMicPointerUp}
              onPointerLeave={handleMicPointerLeave}
              onClick={handleMicClick}
              title="คลิกเพื่อเปิด/ปิดไมค์ หรือกดค้างเพื่อพูด (Spacebar)"
            >
              {!isMuted ? <Mic size={16} className={isSpeaking ? 'pulse-icon' : ''} /> : <MicOff size={16} />}
              <span>{!isMuted ? (isSpeaking ? 'กำลังพูด…' : 'ไมค์เปิด') : 'กดพูด (หรือกดค้าง)'}</span>
            </button>
            <button 
              className={`huddle-dock-btn ${isDeafened ? 'muted' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'เปิดเสียงลำโพง' : 'ปิดเสียงลำโพง'}
            >
              <Headphones size={16} />
            </button>
            <button 
              className={`huddle-dock-btn ${isLoopback ? 'active' : ''}`}
              onClick={toggleLoopback}
              title={isLoopback ? 'ปิดการทดสอบฟังเสียงตัวเอง' : 'เปิดทดสอบฟังเสียงไมค์ตัวเอง (Loopback)'}
            >
              <Volume2 size={16} />
              <span>{isLoopback ? 'ฟังเสียงอยู่' : 'ทดสอบไมค์'}</span>
            </button>
            <button 
              className="huddle-dock-btn meet-link"
              onClick={() => { void startConference(huddleRoomId || 'project'); }}
              title="เปิดห้องประชุมวิดีโอ (WebRTC Conference)"
            >
              <Video size={16} />
              <span>ประชุมวิดีโอ</span>
            </button>
            <button 
              className="huddle-dock-btn hangup"
              onClick={leaveHuddle}
              title="ออกจาก Voice Huddle"
            >
              <PhoneOff size={16} />
              <span>วางสาย</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. WEBRTC VIDEO CONFERENCE STAGE & MINI PLAYER */}
      {conferenceOpen && conferenceClientRef.current && (
        <ConferenceModal
          client={conferenceClientRef.current}
          roomName={`ห้อง ${rooms.find(r => r.id === conferenceRoomId)?.name || 'ประชุม'}`}
          onClose={closeConference}
          isMinimized={isConferenceMinimized}
          onToggleMinimize={() => setIsConferenceMinimized(!isConferenceMinimized)}
        />
      )}


      {/* Toast Alert */}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />{toast}
        </div>
      )}
    </div>
  );
}
