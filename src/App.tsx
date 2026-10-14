import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Home, Users, ClipboardList, Megaphone, Settings, ArrowUpRight, DoorOpen, Hand,
  Coffee, Focus, Video, X, Check, LogOut, Bell, Menu, ShieldCheck, Save, Map,
  List, Wifi, WifiOff, CalendarCheck, Clock, CheckCircle2, AlertCircle, Plus, Trash2,
  Mic, MicOff, Headphones, PhoneOff, Radio, Volume2, VolumeX, CalendarDays, Sparkles,
  Maximize2, Minimize2, Camera, Heart, ThumbsUp, CheckSquare, MessageSquare, Send,
  Zap, AlertTriangle, Calendar, UserCheck, Square
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
import { VoiceHuddleClient, playChime, playAlertChime } from './voice';
import { VideoConferenceClient } from './conference';
import { ConferenceModal } from './ConferenceModal';

export interface TaskAssignee {
  id: string;
  name: string;
  avatar?: string;
  completed: boolean;
  completedAt?: string;
}

export type TaskPriority = 'urgent' | 'normal' | 'low';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  dueTime?: string;
  priority: TaskPriority;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  assignees: TaskAssignee[];
  status: TaskStatus;
  createdAt: string;
}

export interface UrgentBroadcast {
  id: string;
  message: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  createdAt: string;
}

export function getDeadlineStatus(dueDate?: string, dueTime?: string, status?: string) {
  if (status === 'done') {
    return { label: 'เสร็จสิ้นแล้ว', type: 'done', text: '✅ ส่งมอบงานครบแล้ว' };
  }
  if (!dueDate) {
    return { label: 'ไม่มีกำหนดส่ง', type: 'none', text: 'ไม่ระบุวันส่ง' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dueDateTimeStr = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T23:59:59`;
  const dueDateTime = new Date(dueDateTimeStr);
  const isPast = dueDateTime.getTime() < now.getTime();

  if (isPast) {
    const diffHours = Math.floor((now.getTime() - dueDateTime.getTime()) / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const timeText = diffDays > 0 ? `เกินกำหนด ${diffDays} วัน` : `เกินกำหนด ${diffHours || 1} ชม.`;
    return { label: 'เกินกำหนดส่ง', type: 'overdue', text: `🔴 ${timeText} (${dueDate} ${dueTime || ''})` };
  }

  if (dueDate === today) {
    return { label: 'กำหนดส่งวันนี้!', type: 'today', text: `⚠️ ส่งวันนี้ (${dueTime || 'สิ้นวัน'})` };
  }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (dueDate === tomorrow) {
    return { label: 'กำหนดส่งพรุ่งนี้', type: 'soon', text: `⏰ ส่งพรุ่งนี้ (${dueTime || 'สิ้นวัน'})` };
  }

  const daysRemaining = Math.ceil((dueDateTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return { label: `เหลืออีก ${daysRemaining} วัน`, type: 'normal', text: `📅 กำหนดส่ง: ${dueDate} ${dueTime || ''}` };
}

const defaultTasks: TaskItem[] = [
  {
    id: 'task-1',
    title: 'ส่งมอบรายงานระบบ Virtual Office และ WebRTC ให้ลูกค้า',
    description: 'รวบรวมสรุปผลการทดสอบการเชื่อมต่อไมค์ การแชร์หน้าจอ และระบบความปลอดภัย',
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    dueTime: '17:00',
    priority: 'urgent',
    creatorId: 'ton',
    creatorName: 'ต้น (Dev Lead)',
    creatorAvatar: '👨🏻‍💻',
    assignees: [
      { id: 'me', name: 'คุณ', completed: false },
      { id: 'may', name: 'เมย์', avatar: '👩🏻‍💻', completed: true, completedAt: new Date().toISOString() },
      { id: 'kong', name: 'ก้อง', avatar: '👨🏻‍🎨', completed: false }
    ],
    status: 'in_progress',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString()
  },
  {
    id: 'task-2',
    title: 'อัปเดตกราฟิกและ Avatar ประจำตัวสมาชิกทีมไพร์ม',
    description: 'เตรียมภาพไอคอนทีมและจัดเตรียมภาพประกอบห้องทำงานให้ครบทุกห้อง',
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    dueTime: '12:00',
    priority: 'normal',
    creatorId: 'may',
    creatorName: 'เมย์',
    creatorAvatar: '👩🏻‍💻',
    assignees: [
      { id: 'kong', name: 'ก้อง', avatar: '👨🏻‍🎨', completed: false }
    ],
    status: 'todo',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
  }
];

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
type Knock = { id: string; sender: string; receiver_id?: string; room_id: RoomId; state: string; created_at: string };
type Notice = { id: string; title: string; body: string };

const nav = [
  { id: 'office', label: 'ออฟฟิศของเรา', icon: Home },
  { id: 'feed', label: 'ฟีด & มอบหมายงาน', icon: ClipboardList },
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
  const myRoomRef = useRef<RoomId>('hub');

  const triggerUrgentFlash = useCallback((broadcast: UrgentBroadcast) => {
    // CRITICAL FOCUS ZONE ISOLATION: Never show popup to anyone in Focus Zone
    if (myRoomRef.current === 'focus') {
      console.log('Skipping urgent flash popup: User is in Focus Zone');
      return;
    }
    playAlertChime();
    setUrgentPopup(broadcast);
  }, []);

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
  const [customName, setCustomName] = useState(() => localStorage.getItem('prime-user-name') || localStorage.getItem('prime-demo-name') || '');
  const [customAvatar, setCustomAvatar] = useState(() => localStorage.getItem('prime-user-avatar') || localStorage.getItem('prime-demo-avatar') || '');
  const [demoName, setDemoName] = useState(() => localStorage.getItem('prime-demo-name') || localStorage.getItem('prime-user-name') || 'คุณ');
  const [demoAvatar, setDemoAvatar] = useState(() => localStorage.getItem('prime-demo-avatar') || localStorage.getItem('prime-user-avatar') || '');
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
    } catch { }
  }, [feedPosts]);

  const [feedFilter, setFeedFilter] = useState<'all' | 'today' | 'announcement'>('all');
  const [newPostType, setNewPostType] = useState<FeedType>('today');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // Task Delegation State
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem('prime-tasks-v1');
      return saved ? JSON.parse(saved) : defaultTasks;
    } catch {
      return defaultTasks;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('prime-tasks-v1', JSON.stringify(tasks));
    } catch { }
  }, [tasks]);

  const [feedSubTab, setFeedSubTab] = useState<'feed' | 'tasks'>('feed');
  const [taskFilter, setTaskFilter] = useState<'all' | 'assigned_to_me' | 'created_by_me' | 'pending' | 'completed'>('all');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitleDraft, setTaskTitleDraft] = useState('');
  const [taskDescDraft, setTaskDescDraft] = useState('');
  const [taskDueDateDraft, setTaskDueDateDraft] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [taskDueTimeDraft, setTaskDueTimeDraft] = useState('17:00');
  const [taskPriorityDraft, setTaskPriorityDraft] = useState<TaskPriority>('normal');
  const [taskAssigneesDraft, setTaskAssigneesDraft] = useState<string[]>([]);

  // Flash Urgent Broadcast State
  const [urgentPopup, setUrgentPopup] = useState<UrgentBroadcast | null>(null);
  const [urgentModalOpen, setUrgentModalOpen] = useState(false);
  const [urgentDraft, setUrgentDraft] = useState('');

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
    try { localStorage.setItem('prime-demo-v1', JSON.stringify(demoState)); } catch { }
  }, [demoState]);

  useEffect(() => {
    try { localStorage.setItem('prime-demo-attendance', JSON.stringify(demoAttendance)); } catch { }
  }, [demoAttendance]);

  useEffect(() => {
    try { localStorage.setItem('prime-demo-leaves', JSON.stringify(demoLeaves)); } catch { }
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
      supabase.from('leave_requests').select('*').eq('status', 'approved').order('created_at', { ascending: false }).limit(100),
      supabase.from('feed_posts').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(100)
    ]);

    const failure = results[0].error || results[1].error || results[2].error || results[3].error;
    if (failure) throw failure;

    const rows = results[0].data || [];
    if (!rows.some(r => r.user_id === session.user.id)) {
      setLiveMembers([]);
      setLoaded(false);
      throw Error('not_allowed');
    }

    const myRow = rows.find(r => r.user_id === session.user.id);
    if (myRow) {
      if (myRow.name) {
        setCustomName(myRow.name);
        try {
          localStorage.setItem('prime-user-name', myRow.name);
          localStorage.setItem('prime-demo-name', myRow.name);
        } catch { }
      }
      if (myRow.avatar_url) {
        setCustomAvatar(myRow.avatar_url);
        try {
          localStorage.setItem('prime-user-avatar', myRow.avatar_url);
          localStorage.setItem('prime-demo-avatar', myRow.avatar_url);
        } catch { }
      }
    }

    const myGoogleAvatar = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture;
    const leavesData: LeaveRequest[] = results[6].data || [];
    const attData: AttendanceRecord[] = results[5].data || [];
    setLiveAttendance(attData);
    setLiveLeaves(leavesData);

    const feedRows = results[7]?.data;
    if (feedRows && Array.isArray(feedRows)) {
      setFeedPosts(feedRows.map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        content: r.content,
        authorId: r.author_id,
        authorName: r.author_name,
        authorAvatar: r.author_avatar,
        createdAt: r.created_at,
        reactions: {
          likes: Array.isArray(r.reactions?.likes) ? r.reactions.likes : [],
          claps: Array.isArray(r.reactions?.claps) ? r.reactions.claps : [],
          noted: Array.isArray(r.reactions?.noted) ? r.reactions.noted : [],
        },
        comments: Array.isArray(r.comments) ? r.comments : []
      })));
    }

    const taskRows = results[8]?.data;
    if (taskRows && Array.isArray(taskRows)) {
      setTasks(taskRows.map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description || '',
        dueDate: r.due_date || '',
        dueTime: r.due_time || '',
        priority: r.priority || 'normal',
        creatorId: r.creator_id || '',
        creatorName: r.creator_name || 'สมาชิก',
        creatorAvatar: r.creator_avatar || '',
        assignees: Array.isArray(r.assignees) ? r.assignees : [],
        status: r.status || 'todo',
        createdAt: r.created_at
      })));
    }

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, () => void sync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => void sync())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'urgent_broadcasts' }, (payload) => {
        void sync();
        const r = payload.new as any;
        if (r && myRoomRef.current !== 'focus') {
          triggerUrgentFlash({
            id: r.id,
            message: r.message,
            senderId: r.sender_id,
            senderName: r.sender_name,
            senderAvatar: r.sender_avatar,
            createdAt: r.created_at
          });
        }
      })
      .on('broadcast', { event: 'urgent_flash' }, ({ payload }) => {
        if (myRoomRef.current !== 'focus') {
          triggerUrgentFlash(payload);
        }
      })
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

  // Prioritize user's saved custom identity
  const effectiveName = customName || (demo ? demoName : (currentLive?.name || session?.user?.user_metadata?.full_name || 'คุณ'));
  const effectiveAvatar = customAvatar || (demo ? demoAvatar : (currentLive?.avatarUrl || userAvatar || ''));

  const me: Member = demo
    ? { id: demoSessionId, name: effectiveName, role: 'ทีม PRIME', room: demoState.room as RoomId, status: demoState.status as Status, online: true, color: 'blue', note: demoState.note, isAdmin: true, avatarUrl: effectiveAvatar }
    : (currentLive
      ? { ...currentLive, name: effectiveName, avatarUrl: effectiveAvatar }
      : { id: session?.user?.id || '', name: effectiveName, role: 'ทีม PRIME', room: 'hub', status: 'available', online: false, color: 'blue', avatarUrl: effectiveAvatar });

  // Effective Attendance & Leaves data
  const attendanceList = demo ? demoAttendance : liveAttendance;
  const leavesList = demo ? demoLeaves : liveLeaves;
  const todayMyAttendance = attendanceList.find(a => (a.user_id === me.id || (demo && (a.user_id === 'me' || a.user_id.startsWith('demo-')))) && a.work_date === todayDateStr);

  const activeLeavesToday = useMemo(() => {
    return leavesList.filter(l => l.start_date <= todayDateStr && l.end_date >= todayDateStr && l.status === 'approved');
  }, [leavesList, todayDateStr]);

  const members: Member[] = useMemo(() => {
    const rawList = demo ? [me, ...sampleMembers] : liveMembers;
    return rawList.map(m => {
      const isMe = m.id === me.id || (session?.user?.id && m.id === session.user.id);
      const targetMember = isMe ? { ...m, name: me.name, avatarUrl: me.avatarUrl } : m;
      const activeLeave = activeLeavesToday.find(l => l.user_id === targetMember.id);
      if (activeLeave) {
        return {
          ...targetMember,
          status: 'away' as Status,
          leaveToday: {
            type: activeLeave.leave_type,
            label: leaveTypesConfig[activeLeave.leave_type]?.label || 'ลางาน',
            emoji: leaveTypesConfig[activeLeave.leave_type]?.emoji || '📋'
          }
        };
      }
      return targetMember;
    });
  }, [demo, liveMembers, me, activeLeavesToday, session?.user?.id]);

  const room = rooms.find(r => r.id === selected) || initialRooms[0];
  const online = members.filter(m => m.online);
  const occupants = online.filter(m => m.room === selected);
  const incoming = me.room === 'focus' ? [] : knocks.filter(k => k.state === 'pending' && Date.now() - new Date(k.created_at).getTime() < 300000);

  // Unread/unacknowledged feed posts count (posts not written by me that I have not reacted to yet)
  const unreadFeedCount = useMemo(() => {
    return feedPosts.filter(p => {
      if (p.authorId === me.id) return false;
      const hasReacted =
        (p.reactions.likes || []).includes(me.id) ||
        (p.reactions.claps || []).includes(me.id) ||
        (p.reactions.noted || []).includes(me.id);
      return !hasReacted;
    }).length;
  }, [feedPosts, me.id]);

  // Sync my room to ref and isolate Focus Zone from flash popups
  useEffect(() => {
    myRoomRef.current = me.room;
    if (me.room === 'focus' && urgentPopup) {
      setUrgentPopup(null);
    }
  }, [me.room, urgentPopup]);

  // Demo multi-tab broadcast listener for urgent flash popups
  useEffect(() => {
    const onFlash = (e: Event) => {
      const detail = (e as CustomEvent<UrgentBroadcast>).detail;
      if (detail && myRoomRef.current !== 'focus') {
        triggerUrgentFlash(detail);
      }
    };
    window.addEventListener('prime-urgent-flash', onFlash);
    return () => window.removeEventListener('prime-urgent-flash', onFlash);
  }, [triggerUrgentFlash]);

  // Pending tasks assigned to me that I haven't completed yet
  const myPendingTasksCount = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'done') return false;
      const myAssignment = t.assignees.find(a => a.id === me.id);
      return myAssignment && !myAssignment.completed;
    }).length;
  }, [tasks, me.id]);

  const urgentDeadlinesCount = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'done') return false;
      const d = getDeadlineStatus(t.dueDate, t.dueTime, t.status);
      return d.type === 'overdue' || d.type === 'today';
    }).length;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (taskFilter === 'assigned_to_me') {
        return t.assignees.some(a => a.id === me.id);
      }
      if (taskFilter === 'created_by_me') {
        return t.creatorId === me.id;
      }
      if (taskFilter === 'pending') {
        return t.status !== 'done';
      }
      if (taskFilter === 'completed') {
        return t.status === 'done';
      }
      return true;
    });
  }, [tasks, taskFilter, me.id]);

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
    if (targetRoomId === 'focus' || me.room === 'focus') {
      notify('ห้อง Focus Zone เป็นโซนทำงานแบบเงียบ ไม่รองรับระบบเสียง 🤫');
      return;
    }
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
    // 0. Focus Zone cannot have conference
    if (roomId === 'focus' || me.room === 'focus') {
      notify('ห้อง Focus Zone เป็นโซนสมาธิส่วนตัว ตัดฟังก์ชันการประชุมออก 🤫');
      return;
    }
    // Must enter room first before starting or joining meeting
    if (me.room !== roomId) {
      notify(`ต้องเข้าห้อง ${rooms.find(r => r.id === roomId)?.name || ''} ก่อนกดเข้าห้องประชุม`);
      return;
    }

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

  // When moving between rooms, if you leave the huddle room, leave huddle automatically
  useEffect(() => {
    if (inHuddle && huddleRoomId && me.room !== huddleRoomId) {
      leaveHuddle();
    }
    if (me.room === 'focus') {
      if (inHuddle) leaveHuddle();
      if (conferenceOpen) closeConference();
    }
  }, [me.room, inHuddle, huddleRoomId, leaveHuddle, conferenceOpen, closeConference]);

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
      // 1. Immediately update reactive state & local storage for instant UI reflection
      setCustomName(trimmed);
      setCustomAvatar(editAvatar);
      setDemoName(trimmed);
      setDemoAvatar(editAvatar);
      try {
        localStorage.setItem('prime-user-name', trimmed);
        localStorage.setItem('prime-user-avatar', editAvatar);
        localStorage.setItem('prime-demo-name', trimmed);
        localStorage.setItem('prime-demo-avatar', editAvatar);
      } catch (err) {
        console.warn('Failed to store profile in localStorage:', err);
      }

      // 2. If connected to Supabase, sync to backend
      if (!demo && supabase && session) {
        try {
          await supabase.auth.updateUser({
            data: {
              full_name: trimmed,
              display_name: trimmed,
              avatar_url: editAvatar.startsWith('data:') ? undefined : editAvatar,
              custom_avatar: editAvatar.startsWith('data:') ? undefined : editAvatar
            }
          });
        } catch (err) {
          console.warn('Supabase updateUser err:', err);
        }

        const { error: rpcError } = await supabase.rpc('update_my_identity', { p_name: trimmed, p_avatar: editAvatar });
        if (rpcError) {
          console.error('RPC update_my_identity err:', rpcError);
          throw rpcError;
        }

        await refresh();
      }

      setProfileOpen(false);
      notify('บันทึกชื่อและรูปโปรไฟล์เรียบร้อย ✨');
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
          ctx.clearRect(0, 0, size, size);
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/png');
          setEditAvatar(dataUrl);
          notify('อัปโหลดและปรับขนาดรูปภาพเรียบร้อย');
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Unified Feed Handlers (Real-time synchronized via Supabase)
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newPostTitle.trim();
    const content = newPostContent.trim();
    if (!content) {
      setError('กรุณาใส่เนื้อหาข้อความ');
      return;
    }
    const finalTitle = title || (newPostType === 'today' ? `งานวันนี้ (${me.name})` : `ประกาศจาก ${me.name}`);

    if (demo || !supabase || !session) {
      const newPost: FeedPost = {
        id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        type: newPostType,
        title: finalTitle,
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
      return;
    }

    await action(async () => {
      const { error: rpcErr } = await supabase!.rpc('post_feed_item', {
        p_type: newPostType,
        p_title: finalTitle,
        p_content: content
      });
      if (rpcErr) throw rpcErr;
      setNewPostTitle('');
      setNewPostContent('');
      await refresh();
      notify(newPostType === 'today' ? 'บันทึกงานวันนี้ลงฟีดเรียบร้อย' : 'โพสต์ประกาศลงฟีดเรียบร้อย');
    });
  };

  const handleToggleReaction = async (postId: string, type: 'likes' | 'claps' | 'noted') => {
    // 1. Optimistic update for instant responsiveness
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

    if (!demo && supabase && session) {
      try {
        const { error: rpcErr } = await supabase.rpc('toggle_feed_reaction', {
          p_post_id: postId,
          p_reaction: type
        });
        if (rpcErr) console.warn('toggle_feed_reaction err:', rpcErr);
      } catch (err) {
        console.warn('Failed to sync reaction:', err);
      }
    }
  };

  const handleAddComment = async (postId: string) => {
    const text = (commentDrafts[postId] || '').trim();
    if (!text) return;
    const tempComment: FeedComment = {
      id: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      authorId: me.id,
      authorName: me.name,
      authorAvatar: me.avatarUrl,
      content: text,
      createdAt: new Date().toISOString()
    };

    if (demo || !supabase || !session) {
      setFeedPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: [...(p.comments || []), tempComment]
        };
      }));
      setCommentDrafts(prev => ({ ...prev, [postId]: '' }));
      notify('ส่งความคิดเห็นเรียบร้อย');
      return;
    }

    await action(async () => {
      const { error: rpcErr } = await supabase!.rpc('add_feed_comment', {
        p_post_id: postId,
        p_content: text
      });
      if (rpcErr) throw rpcErr;
      setCommentDrafts(prev => ({ ...prev, [postId]: '' }));
      await refresh();
      notify('ส่งความคิดเห็นเรียบร้อย');
    });
  };

  const handleDeletePost = async (postId: string) => {
    // Optimistic delete
    setFeedPosts(prev => prev.filter(p => p.id !== postId));
    notify('ลบโพสต์เรียบร้อย');

    if (!demo && supabase && session) {
      try {
        const { error: rpcErr } = await supabase.rpc('delete_feed_post', {
          p_post_id: postId
        });
        if (rpcErr) console.warn('delete_feed_post err:', rpcErr);
        await refresh();
      } catch (err) {
        console.warn('Failed to sync post deletion:', err);
      }
    }
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

  // Task Delegation Handlers
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = taskTitleDraft.trim();
    if (!title) {
      setError('กรุณาระบุหัวข้องาน');
      return;
    }
    if (taskAssigneesDraft.length === 0) {
      setError('กรุณาเลือกผู้รับผิดชอบงานอย่างน้อย 1 คน');
      return;
    }

    const selectedAssignees: TaskAssignee[] = taskAssigneesDraft.map(id => {
      const mem = members.find(m => m.id === id);
      return {
        id,
        name: mem ? mem.name : (id === me.id ? me.name : 'สมาชิก'),
        avatar: mem?.avatarUrl || (id === me.id ? me.avatarUrl : undefined),
        completed: false
      };
    });

    const newTaskObj: TaskItem = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      title,
      description: taskDescDraft.trim(),
      dueDate: taskDueDateDraft,
      dueTime: taskDueTimeDraft,
      priority: taskPriorityDraft,
      creatorId: me.id,
      creatorName: me.name,
      creatorAvatar: me.avatarUrl,
      assignees: selectedAssignees,
      status: 'todo',
      createdAt: new Date().toISOString()
    };

    if (demo || !supabase || !session) {
      setTasks(prev => [newTaskObj, ...prev]);
      setTaskTitleDraft('');
      setTaskDescDraft('');
      setTaskAssigneesDraft([]);
      setTaskModalOpen(false);
      notify(`มอบหมายงาน "${title}" เรียบร้อย (กำหนดส่ง: ${taskDueDateDraft || 'ไม่มีกำหนด'} ${taskDueTimeDraft || ''}) 📋`);
      return;
    }

    await action(async () => {
      const { error: rpcErr } = await supabase!.rpc('create_task', {
        p_title: title,
        p_description: taskDescDraft.trim(),
        p_due_date: taskDueDateDraft || null,
        p_due_time: taskDueTimeDraft || '',
        p_priority: taskPriorityDraft,
        p_assignees: selectedAssignees
      });
      if (rpcErr) throw rpcErr;
      setTaskTitleDraft('');
      setTaskDescDraft('');
      setTaskAssigneesDraft([]);
      setTaskModalOpen(false);
      await refresh();
      notify(`มอบหมายงาน "${title}" เรียบร้อย (กำหนดส่ง: ${taskDueDateDraft || 'ไม่มีกำหนด'} ${taskDueTimeDraft || ''}) 📋`);
    });
  };

  const handleToggleAssigneeDone = async (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const isAssignee = t.assignees.some(a => a.id === me.id);
      let updatedAssignees = [...t.assignees];
      if (isAssignee) {
        updatedAssignees = updatedAssignees.map(a => {
          if (a.id === me.id) {
            const nextCompleted = !a.completed;
            return {
              ...a,
              completed: nextCompleted,
              completedAt: nextCompleted ? new Date().toISOString() : undefined
            };
          }
          return a;
        });
      }

      let nextStatus: TaskStatus = t.status;
      const allDone = updatedAssignees.length > 0 && updatedAssignees.every(a => a.completed);
      const anyDone = updatedAssignees.some(a => a.completed);
      if (!isAssignee && t.creatorId === me.id) {
        nextStatus = t.status === 'done' ? 'todo' : 'done';
      } else if (allDone) {
        nextStatus = 'done';
      } else if (anyDone) {
        nextStatus = 'in_progress';
      } else {
        nextStatus = 'todo';
      }

      return {
        ...t,
        assignees: updatedAssignees,
        status: nextStatus
      };
    }));

    if (!demo && supabase && session) {
      try {
        const { error: rpcErr } = await supabase.rpc('toggle_task_assignee_done', { p_task_id: taskId });
        if (rpcErr) console.warn('toggle_task_assignee_done err:', rpcErr);
        await refresh();
      } catch (err) {
        console.warn('Failed to sync toggle_task_assignee_done:', err);
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('คุณต้องการลบงานที่มอบหมายนี้ใช่หรือไม่?')) return;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (!demo && supabase && session) {
      try {
        const { error: rpcErr } = await supabase.rpc('delete_task', { p_task_id: taskId });
        if (rpcErr) console.warn('delete_task err:', rpcErr);
        await refresh();
      } catch (err) {
        console.warn('Failed to delete task:', err);
      }
    }
    notify('ลบงานที่มอบหมายเรียบร้อย');
  };

  const handleSendUrgentBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = urgentDraft.trim();
    if (!msg) {
      setError('กรุณาใส่ข้อความประกาศด่วน');
      return;
    }
    if (msg.length > 280) {
      setError('ข้อความประกาศด่วนต้องไม่เกิน 280 ตัวอักษร');
      return;
    }

    const broadcastObj: UrgentBroadcast = {
      id: 'ub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      message: msg,
      senderId: me.id,
      senderName: me.name,
      senderAvatar: me.avatarUrl,
      createdAt: new Date().toISOString()
    };

    setUrgentModalOpen(false);
    setUrgentDraft('');

    if (demo || !supabase || !session) {
      if (myRoomRef.current !== 'focus') {
        playAlertChime();
        setUrgentPopup(broadcastObj);
      } else {
        notify('คุณอยู่ในห้อง Focus Zone ระบบจึงไม่แสดง Pop-up เพื่อรักษาสมาธิ 🤫');
      }
      try {
        localStorage.setItem('prime-urgent-flash-last', JSON.stringify(broadcastObj));
        window.dispatchEvent(new CustomEvent('prime-urgent-flash', { detail: broadcastObj }));
      } catch { }
      notify('ส่งประกาศด่วนเรียบร้อย Pop-up แจ้งทุกคนกลางหน้าจอแล้ว ⚡');
      return;
    }

    await action(async () => {
      const { error: rpcErr } = await supabase!.rpc('send_urgent_broadcast', {
        p_message: msg
      });
      if (rpcErr) throw rpcErr;

      try {
        const channel = supabase!.channel('prime-office-updates');
        await channel.send({
          type: 'broadcast',
          event: 'urgent_flash',
          payload: broadcastObj
        });
      } catch (err) {
        console.warn('Realtime broadcast send error:', err);
      }

      if (myRoomRef.current !== 'focus') {
        playAlertChime();
        setUrgentPopup(broadcastObj);
      }
      notify('ส่งประกาศด่วนเรียบร้อย Pop-up แจ้งทุกคนกลางหน้าจอแล้ว ⚡');
    });
  };

  // Attendance Handlers (Work hours: 09:00 - 17:00)
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
    if (knockTarget.room === 'focus') {
      notify(`${knockTarget.name} อยู่ในห้อง Focus Zone (กำลังโฟกัสงาน) ปิดรับคำขอคุย กรุณาโทรเบอร์มือถือหากมีงานด่วน 📵`);
      setKnockTarget(null);
      return;
    }
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
                        if (m.id !== me.id) {
                          if (m.room === 'focus') {
                            notify(`${m.name} อยู่ในห้อง Focus Zone (กำลังโฟกัสงาน) ปิดรับคำขอคุย กรุณาโทรเบอร์มือถือหากมีงานด่วน 📵`);
                          } else {
                            setKnockTarget(m);
                          }
                        }
                      }}
                      aria-label={`${m.name} ${statuses[m.status]}`}
                      title={m.room === 'focus' ? `${m.name}: กำลังโฟกัสงานใน Focus Zone (กรุณาโทรเบอร์มือถือหากมีงานด่วน)` : `${m.name}: ${statuses[m.status]}`}
                    >
                      <Avatar member={m} small isSpeaking={speakingMembers.has(m.id) || (m.id === me.id && isSpeaking)} />
                      <span>{m.id === me.id ? `${m.name} (คุณ)` : m.name}</span>
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
                  ) : activeR.id === 'focus' ? (
                    <div className="focus-zone-card-notice">
                      <span>🤫 โซนสมาธิส่วนตัว: ปิดเสียงและการประชุมเพื่อโฟกัสงาน (หากมีงานด่วนกรุณาโทรเข้าเบอร์มือถือ)</span>
                    </div>
                  ) : (
                    <>
                      {inHuddle && huddleRoomId === activeR.id ? (
                        <button className="secondary" onClick={leaveHuddle}>
                          <PhoneOff size={15} color="#ef4444" /> วางสายเสียง
                        </button>
                      ) : (
                        <button className="secondary" onClick={() => joinHuddle(activeR.id)}>
                          <Mic size={15} /> เข้าสายเสียงห้องนี้
                        </button>
                      )}
                      <button className="primary" style={{ background: '#2563eb' }} onClick={() => { setSelectedRoomCard(null); void startConference(activeR.id); }}>
                        <Video size={15} /> ประชุมวิดีโอห้องนี้ (WebRTC)
                      </button>
                    </>
                  )}
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
          <button
            type="button"
            className="urgent-flash-top-btn"
            onClick={() => { setUrgentDraft(''); setUrgentModalOpen(true); }}
            title="ส่งประกาศด่วนถึงทุกคน (Pop-up กลางหน้าจอทันที ยกเว้นห้อง Focus Zone)"
          >
            <Zap size={14} className="flash-zap-pulse" />
            <span>ประกาศด่วน</span>
          </button>
          <button
            className="icon-button bell"
            onClick={() => setNoticeOpen(true)}
            title={me.room === 'focus' ? 'ห้อง Focus Zone: ปิดแจ้งเตือน (โหมดห้ามรบกวน)' : `การแจ้งเตือน ${incoming.length} รายการ`}
          >
            <Bell size={17} style={me.room === 'focus' ? { opacity: 0.5 } : undefined} />
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
        {me.room === 'focus' ? (
          <button
            className="dock-btn disabled"
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
            onClick={() => notify('ห้อง Focus Zone เป็นโซนเงียบ ปิดระบบเสียงและการโทร 🤫')}
            title="ห้อง Focus Zone เป็นโซนเงียบ ปิดระบบเสียงและการโทร"
          >
            <MicOff size={19} color="#94a3b8" />
            <span className="dock-btn-label">ปิดไมค์</span>
          </button>
        ) : inHuddle && huddleRoomId ? (
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
          className={`dock-btn ${conferenceOpen ? 'active' : ''} ${me.room === 'focus' ? 'disabled' : ''}`}
          style={me.room === 'focus' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          onClick={() => {
            if (me.room === 'focus') {
              notify('ห้อง Focus Zone เป็นโซนโฟกัสการทำงาน ตัดฟังก์ชันการประชุมออก 🤫');
              return;
            }
            if (conferenceOpen) {
              setIsConferenceMinimized(false);
            } else {
              void startConference(me.room);
            }
          }}
          title={me.room === 'focus' ? 'ห้อง Focus Zone ไม่รองรับการประชุม (โหมดห้ามรบกวน)' : `ห้องประชุมวิดีโอห้อง ${rooms.find(r => r.id === me.room)?.name || ''}`}
        >
          <Video size={19} color={me.room === 'focus' ? '#94a3b8' : conferenceOpen ? '#38ef7d' : undefined} />
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
          <span className="dock-badge" style={{ background: '#475569' }}>{members.length}</span>
        </button>

        <button
          className={`dock-btn ${page === 'feed' || page === 'today' || page === 'announcements' ? 'active' : ''}`}
          onClick={() => { setPage('feed'); setSelectedRoomCard(null); }}
          title="ฟีด & มอบหมายงานของทีม"
        >
          <ClipboardList size={19} />
          <span className="dock-btn-label">ฟีด & งาน</span>
          {(unreadFeedCount + myPendingTasksCount) > 0 && (
            <span className="dock-badge">
              {unreadFeedCount + myPendingTasksCount}
            </span>
          )}
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
                        <span className="kpi-sub">เกณฑ์เวลา 09:00 น.</span>
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
                            <p>เวลาทำการมาตรฐานบริษัท: <strong>09:00 - 17:00 น.</strong></p>
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
                              <Clock size={18} />เช็คอินเข้างาน (เริ่ม 09:00 น.)
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
                        m.room === 'focus' ? (
                          <span className="focus-zone-badge-tag" title="เพื่อนกำลังโฟกัสการทำงานอยู่ กรุณาโทรมือถือไปหาแทนหากมีงานด่วน">
                            🤫 โฟกัสงาน (โทรหาหากด่วน)
                          </span>
                        ) : (
                          <button className="secondary" disabled={!m.online || Boolean(m.leaveToday)} onClick={() => setKnockTarget(m)}>
                            <Hand size={16} />ขอคุย
                          </button>
                        )
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
                      className={`feed-tab-btn ${feedSubTab === 'tasks' ? 'active' : ''}`}
                      onClick={() => setFeedSubTab('tasks')}
                    >
                      <CheckSquare size={13} style={{ marginRight: '4px' }} />
                      <span>📋 มอบหมายงาน</span>
                      <span style={{ opacity: 0.85 }}>({tasks.length})</span>
                      {myPendingTasksCount > 0 && (
                        <span style={{ background: '#2563eb', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', marginLeft: '4px' }}>
                          {myPendingTasksCount} งานของคุณ
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`feed-tab-btn ${feedSubTab === 'feed' && feedFilter === 'all' ? 'active' : ''}`}
                      onClick={() => { setFeedSubTab('feed'); setFeedFilter('all'); }}
                    >
                      <span>ฟีดทั้งหมด</span>
                      <span style={{ opacity: 0.8 }}>({feedPosts.length})</span>
                      {unreadFeedCount > 0 && (
                        <span style={{ background: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', marginLeft: '4px' }}>
                          {unreadFeedCount} รอรับทราบ
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`feed-tab-btn ${feedSubTab === 'feed' && feedFilter === 'today' ? 'active' : ''}`}
                      onClick={() => { setFeedSubTab('feed'); setFeedFilter('today'); }}
                    >
                      <span>💼 งานวันนี้</span>
                      <span style={{ opacity: 0.8 }}>({feedPosts.filter(p => p.type === 'today').length})</span>
                    </button>
                    <button
                      type="button"
                      className={`feed-tab-btn ${feedSubTab === 'feed' && feedFilter === 'announcement' ? 'active' : ''}`}
                      onClick={() => { setFeedSubTab('feed'); setFeedFilter('announcement'); }}
                    >
                      <span>📢 เรื่องประกาศ</span>
                      <span style={{ opacity: 0.8 }}>({feedPosts.filter(p => p.type === 'announcement').length})</span>
                    </button>
                  </div>

                  {feedSubTab === 'tasks' ? (
                    <div className="task-system-wrapper">
                      {/* KPI Summary Cards */}
                      <div className="task-summary-row">
                        <div className="task-kpi-card">
                          <div className="task-kpi-icon blue"><ClipboardList size={18} /></div>
                          <div className="task-kpi-text">
                            <small>งานทั้งหมด</small>
                            <strong>{tasks.length}</strong>
                          </div>
                        </div>
                        <div className="task-kpi-card">
                          <div className="task-kpi-icon amber"><Clock size={18} /></div>
                          <div className="task-kpi-text">
                            <small>รอดำเนินการ</small>
                            <strong>{tasks.filter(t => t.status !== 'done').length}</strong>
                          </div>
                        </div>
                        <div className="task-kpi-card">
                          <div className="task-kpi-icon red"><AlertTriangle size={18} /></div>
                          <div className="task-kpi-text">
                            <small>ส่งวันนี้/เกินกำหนด</small>
                            <strong>{urgentDeadlinesCount}</strong>
                          </div>
                        </div>
                        <div className="task-kpi-card">
                          <div className="task-kpi-icon green"><CheckCircle2 size={18} /></div>
                          <div className="task-kpi-text">
                            <small>เสร็จสมบูรณ์</small>
                            <strong>{tasks.filter(t => t.status === 'done').length}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Task Action Bar: Filters + Assign Task Button */}
                      <div className="task-action-bar">
                        <div className="task-filter-chips">
                          {[
                            { id: 'all', label: 'ทั้งหมด' },
                            { id: 'assigned_to_me', label: `งานที่มอบให้ฉัน (${tasks.filter(t => t.assignees.some(a => a.id === me.id)).length})` },
                            { id: 'created_by_me', label: 'งานที่ฉันมอบหมาย' },
                            { id: 'pending', label: 'ยังไม่เสร็จ' },
                            { id: 'completed', label: 'เสร็จแล้ว' }
                          ].map(filter => (
                            <button
                              type="button"
                              key={filter.id}
                              className={`task-filter-btn ${taskFilter === filter.id ? 'active' : ''}`}
                              onClick={() => setTaskFilter(filter.id as any)}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="primary create-task-trigger-btn"
                          onClick={() => {
                            setTaskTitleDraft('');
                            setTaskDescDraft('');
                            setTaskDueDateDraft(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
                            setTaskDueTimeDraft('17:00');
                            setTaskPriorityDraft('normal');
                            setTaskAssigneesDraft([me.id]);
                            setTaskModalOpen(true);
                          }}
                        >
                          <Plus size={15} /> มอบหมายงานใหม่
                        </button>
                      </div>

                      {/* Task Cards List */}
                      <div className="task-cards-list">
                        {filteredTasks.length === 0 ? (
                          <div className="task-empty-state">
                            <div className="empty-icon-circle">📋</div>
                            <h3>ไม่มีรายการงานในหมวดหมู่นี้</h3>
                            <p>คุณสามารถคลิก "มอบหมายงานใหม่" ด้านบนเพื่อเริ่มมอบหมายงานให้เพื่อนร่วมทีมหรือตัวเองได้ทันที</p>
                          </div>
                        ) : (
                          filteredTasks.map(task => {
                            const deadline = getDeadlineStatus(task.dueDate, task.dueTime, task.status);
                            const isCreator = task.creatorId === me.id;
                            const completedAssigneesCount = task.assignees.filter(a => a.completed).length;

                            return (
                              <article className={`task-card-item ${task.status} ${task.priority}`} key={task.id}>
                                <div className="task-card-header">
                                  <div className="task-header-tags">
                                    <span className={`task-priority-tag ${task.priority}`}>
                                      {task.priority === 'urgent' ? '⚡ ด่วนมาก' : task.priority === 'normal' ? '📌 ปกติ' : '☕ ไม่ด่วน'}
                                    </span>
                                    <span className={`task-deadline-tag ${deadline.type}`}>
                                      <Clock size={12} />
                                      <span>{deadline.text}</span>
                                    </span>
                                    <span className={`task-status-tag ${task.status}`}>
                                      {task.status === 'done' ? '✅ เสร็จสิ้น' : task.status === 'in_progress' ? '⏳ กำลังทำ' : '📋 รอเริ่มงาน'}
                                    </span>
                                  </div>

                                  <div className="task-header-actions">
                                    {(isCreator || me.isAdmin) && (
                                      <button
                                        type="button"
                                        className="task-delete-icon-btn"
                                        onClick={() => handleDeleteTask(task.id)}
                                        title="ลบงานที่มอบหมายนี้"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="task-card-body">
                                  <h3>{task.title}</h3>
                                  {task.description && <p>{task.description}</p>}
                                </div>

                                <div className="task-card-creator">
                                  <span className="creator-label">ผู้มอบหมาย:</span>
                                  <span className="creator-badge">
                                    {(() => {
                                      const av = task.creatorAvatar;
                                      const isImg = av && (av.startsWith('http') || av.startsWith('data:'));
                                      return isImg ? (
                                        <img src={av} alt={task.creatorName} className="creator-av-img" />
                                      ) : (
                                        <span className="creator-av-icon">{av || '👤'}</span>
                                      );
                                    })()}
                                    <strong>{task.creatorName}</strong>
                                  </span>
                                  <small className="creator-time">· {formatPostTime(task.createdAt)}</small>
                                </div>

                                {/* Multi-Assignee Progress & Interactive Checklist */}
                                <div className="task-assignees-container">
                                  <div className="task-assignees-heading">
                                    <span>ผู้รับผิดชอบงาน ({completedAssigneesCount}/{task.assignees.length} คนส่งงานแล้ว):</span>
                                    {task.assignees.length > 0 && (
                                      <div className="assignee-progress-bar">
                                        <div
                                          className="assignee-progress-fill"
                                          style={{ width: `${(completedAssigneesCount / task.assignees.length) * 100}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>

                                  <div className="task-assignees-pills-grid">
                                    {task.assignees.map(a => {
                                      const isMe = a.id === me.id;
                                      return (
                                        <div className={`assignee-pill-row ${a.completed ? 'completed' : 'pending'}`} key={a.id}>
                                          <div className="assignee-pill-left">
                                            {(() => {
                                              const av = a.avatar;
                                              const isImg = av && (av.startsWith('http') || av.startsWith('data:'));
                                              return isImg ? (
                                                <img src={av} alt={a.name} className="assignee-pill-avatar-img" />
                                              ) : (
                                                <span className="assignee-pill-avatar">{av || '👤'}</span>
                                              );
                                            })()}
                                            <span className="assignee-pill-name">{a.name}{isMe ? ' (คุณ)' : ''}</span>
                                          </div>
                                          {isMe ? (
                                            <button
                                              type="button"
                                              className={`assignee-toggle-check-btn ${a.completed ? 'is-done' : 'is-todo'}`}
                                              onClick={() => handleToggleAssigneeDone(task.id)}
                                              title={a.completed ? "คุณส่งงานแล้ว (คลิกเพื่อยกเลิก)" : "คลิกเพื่อส่งมอบงานของคุณ"}
                                            >
                                              {a.completed ? (
                                                <>
                                                  <CheckCircle2 size={13} color="#059669" />
                                                  <span>ส่งงานแล้ว ✓</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Square size={13} color="#64748b" />
                                                  <span>คลิกส่งงาน</span>
                                                </>
                                              )}
                                            </button>
                                          ) : (
                                            <span className={`assignee-static-badge ${a.completed ? 'done' : 'todo'}`}>
                                              {a.completed ? '✓ ส่งแล้ว' : '⏳ รอส่งงาน'}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </article>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
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

                            const hasReacted =
                              (post.reactions.likes || []).includes(me.id) ||
                              (post.reactions.claps || []).includes(me.id) ||
                              (post.reactions.noted || []).includes(me.id);
                            const isMyPost = post.authorId === me.id;

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
                                    {!isMyPost && !hasReacted && (
                                      <span style={{
                                        background: '#ef4444',
                                        color: '#ffffff',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '10px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}>
                                        🔴 ยังไม่ได้รับทราบ
                                      </span>
                                    )}
                                    {!isMyPost && hasReacted && (
                                      <span style={{
                                        background: '#ecfdf5',
                                        color: '#059669',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        padding: '2px 8px',
                                        borderRadius: '10px'
                                      }}>
                                        ✓ รับทราบแล้ว
                                      </span>
                                    )}
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
                    </>
                  )}
                </div>
              )}

              {/* PAGE: Admin Dashboard */}
              {page === 'admin' && me.isAdmin && (
                <div className="admin-grid">
                  <section className="panel">
                    <h2><Video size={21} />ระบบห้องประชุมวิดีโอ (WebRTC Native)</h2>
                    <p>ระบบประชุมวิดีโอแบบเปิดกล้องและแชร์หน้าจอ ทำงานในตัวแบบเสร็จสรรพ ไม่ต้องใช้ Google Meet</p>
                    <div className="setup-note" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                      <p>✅ <strong>ระบบประชุมพร้อมใช้งาน:</strong> ห้องประชุมวิดีโอความละเอียดสูงพร้อมใช้งานในห้อง PRIME Hub, Project Room และ Coffee Corner (ยกเว้น Focus Zone ที่สงวนไว้เป็นโซนสมาธิส่วนตัว)</p>
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
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="knock-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setKnockTarget(null); }}>
            <button autoFocus className="icon-button close-modal" aria-label="ปิด" onClick={() => setKnockTarget(null)}><X /></button>
            <Avatar member={knockTarget} />
            <h2 id="knock-title">ขอคุยกับ{knockTarget.name}</h2>
            {knockTarget.room === 'focus' ? (
              <>
                <p style={{ color: '#e11d48', marginTop: '12px' }}>
                  ⚠️ เพื่อนกำลังโฟกัสการทำงานอยู่ใน Focus Zone (ปิดรับคำขอคุย)<br />
                  <strong>หากมีงานด่วน กรุณาโทรเบอร์มือถือหาโดยตรง</strong>
                </p>
                <button className="secondary" style={{ marginTop: '16px' }} onClick={() => setKnockTarget(null)}>
                  ปิดหน้าต่าง
                </button>
              </>
            ) : (
              <>
                <p>
                  เชิญมาเจอกันที่ {rooms.find(r => r.id === me.room)?.name}<br />
                  {knockTarget.status === 'focus' ? 'เพื่อนกำลังโฟกัส สามารถเลือกตอบรับภายหลังได้' : 'ผู้รับเลือกตอบรับหรือปฏิเสธได้'}
                </p>
                <button className="primary" disabled={busy} onClick={sendKnock}>
                  <Hand size={18} />{demo ? 'ทดลองเคาะประตู' : 'ส่งคำขอคุย'}
                </button>
                <small>{demo ? 'ไม่มีการส่งข้อความจริง' : 'คำขอหมดอายุใน 5 นาที'}</small>
              </>
            )}
          </section>
        </div>
      )}

      {/* MODAL: Notifications */}
      {noticeOpen && (
        <div className="modal-backdrop">
          <section className="modal notifications" role="dialog" aria-modal="true" aria-labelledby="notifications-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setNoticeOpen(false); }}>
            <button autoFocus className="icon-button close-modal" aria-label="ปิด" onClick={() => setNoticeOpen(false)}><X /></button>
            <h2 id="notifications-title">คำขอคุย</h2>
            {me.room === 'focus' ? (
              <p>ขณะนี้คุณอยู่ในห้อง Focus Zone ระบบปิดการแจ้งเตือนชั่วคราวเพื่อให้คุณมีสมาธิกับการทำงาน หากมีงานด่วนเพื่อนร่วมทีมจะโทรหาเบอร์มือถือโดยตรง 📵</p>
            ) : demo ? (
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
        <div className="modal-backdrop">
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

      {/* FLASH URGENT BROADCAST COMPOSER MODAL */}
      {urgentModalOpen && (
        <div className="modal-backdrop">
          <section className="modal flash-broadcast-modal" onClick={e => e.stopPropagation()}>
            <button className="icon-button close-modal" onClick={() => setUrgentModalOpen(false)}><X size={18} /></button>
            <div className="flash-modal-badge-icon">
              <Zap size={26} color="#d97706" />
            </div>
            <h2>⚡ ประกาศด่วนพิเศษ (Flash Broadcast)</h2>
            <p>ส่งข้อความสั้นๆ ขึ้น Pop-up กลางหน้าจอทุกคนแบบ Real-time ทันที</p>

            <div className="focus-zone-isolation-banner">
              <span>🤫 ข้อความนี้จะไม่ขึ้นรบกวนสมาชิกในห้อง <strong>Focus Zone</strong> เพื่อรักษาสมาธิการทำงาน</span>
            </div>

            <form onSubmit={handleSendUrgentBroadcast}>
              <div style={{ textAlign: 'left', marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>เลือกข้อความด่วนสำเร็จรูป:</label>
                <div className="flash-presets-grid">
                  {[
                    '🚨 รวมพลประชุมด่วน ทุกคนเข้าห้อง Boardroom ตอนนี้ครับ',
                    '⚠️ แจ้งด่วน: กำลังตรวจสอบปัญหาระบบ รบกวนรอการอัปเดตสักครู่',
                    '🎯 แจ้งด่วน: ลูกค้าขอไฟล์งานด่วน ขอส่งต่อให้ทีมช่วยดูด้วยครับ',
                    '☕ พักเบรก: เชิญทุกคนมาจิบกาแฟและเบรกพร้อมกันที่ Coffee Bar ครับ'
                  ].map(preset => (
                    <button
                      type="button"
                      key={preset}
                      className="flash-preset-chip"
                      onClick={() => setUrgentDraft(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ textAlign: 'left', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>พิมพ์ข้อความประกาศด่วนของคุณ:</label>
                  <span style={{ fontSize: '11px', color: urgentDraft.length > 250 ? '#ef4444' : '#94a3b8' }}>{urgentDraft.length} / 280 ตัวอักษร</span>
                </div>
                <textarea
                  required
                  rows={3}
                  maxLength={280}
                  placeholder="พิมพ์ข้อความด่วนสั้นๆ ที่ต้องการให้ทุกคนทราบทันที..."
                  value={urgentDraft}
                  onChange={e => setUrgentDraft(e.target.value)}
                  style={{ width: '100%', fontSize: '14px', borderRadius: '10px', padding: '10px 12px' }}
                />
              </div>

              <div className="button-row">
                <button type="button" className="secondary" onClick={() => setUrgentModalOpen(false)}>ยกเลิก</button>
                <button type="submit" className="primary flash-submit-btn" disabled={busy || !urgentDraft.trim()}>
                  <Zap size={14} /> ส่งประกาศด่วนทันที
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* TASK DELEGATION COMPOSER MODAL */}
      {taskModalOpen && (
        <div className="modal-backdrop">
          <section className="modal task-composer-modal" onClick={e => e.stopPropagation()}>
            <button className="icon-button close-modal" onClick={() => setTaskModalOpen(false)}><X size={18} /></button>
            <div className="task-modal-badge-icon">
              <ClipboardList size={26} color="#2563eb" />
            </div>
            <h2>📋 มอบหมายงานใหม่ (Task Delegation)</h2>
            <p>ใครสามารถมอบหมายงานให้ใครก็ได้ กำหนดวันส่ง และมอบหมายให้หลายคนพร้อมกันได้</p>

            <form onSubmit={handleCreateTask}>
              {/* Title */}
              <div style={{ textAlign: 'left', marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                  หัวข้องาน *
                </label>
                <input
                  type="text"
                  required
                  maxLength={180}
                  placeholder="เช่น จัดทำสรุปยอดขาย Q3, ตรวจสอบความปลอดภัยระบบ WebRTC..."
                  value={taskTitleDraft}
                  onChange={e => setTaskTitleDraft(e.target.value)}
                  style={{ width: '100%', fontSize: '13px', borderRadius: '9px', padding: '10px 12px' }}
                />
              </div>

              {/* Description */}
              <div style={{ textAlign: 'left', marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                  รายละเอียดงาน / สิ่งที่ต้องส่ง
                </label>
                <textarea
                  rows={2}
                  maxLength={600}
                  placeholder="ระบุรายละเอียด แนวทาง หรือข้อมูลที่ต้องการให้ทีมดำเนินการ..."
                  value={taskDescDraft}
                  onChange={e => setTaskDescDraft(e.target.value)}
                  style={{ width: '100%', fontSize: '13px', borderRadius: '9px', padding: '9px 12px', minHeight: '65px' }}
                />
              </div>

              {/* Due Date & Due Time & Priority in 1 Grid */}
              <div className="task-deadline-form-grid">
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    กำหนดส่งวันที่ *
                  </label>
                  <input
                    type="date"
                    required
                    value={taskDueDateDraft}
                    onChange={e => setTaskDueDateDraft(e.target.value)}
                    style={{ width: '100%', fontSize: '12px', padding: '8px 10px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    เวลาส่ง (ชั่วโมง:นาที)
                  </label>
                  <input
                    type="time"
                    value={taskDueTimeDraft}
                    onChange={e => setTaskDueTimeDraft(e.target.value)}
                    style={{ width: '100%', fontSize: '12px', padding: '8px 10px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    ระดับความสำคัญ
                  </label>
                  <select
                    value={taskPriorityDraft}
                    onChange={e => setTaskPriorityDraft(e.target.value as TaskPriority)}
                    style={{ width: '100%', fontSize: '12px', padding: '8px 10px' }}
                  >
                    <option value="urgent">⚡ ด่วนมาก (Urgent)</option>
                    <option value="normal">📌 ปกติ (Normal)</option>
                    <option value="low">☕ ไม่ด่วน (Low)</option>
                  </select>
                </div>
              </div>

              {/* Multi-assignee selection */}
              <div style={{ textAlign: 'left', margin: '14px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    มอบหมายให้ใครบ้าง (เลือกได้หลายคนพร้อมกัน):
                  </label>
                  <button
                    type="button"
                    className="select-all-assignees-btn"
                    onClick={() => {
                      if (taskAssigneesDraft.length === members.length) {
                        setTaskAssigneesDraft([]);
                      } else {
                        setTaskAssigneesDraft(members.map(m => m.id));
                      }
                    }}
                  >
                    {taskAssigneesDraft.length === members.length ? 'ยกเลิกทั้งหมด' : '✓ มอบให้ทุกคน'}
                  </button>
                </div>

                <div className="task-member-select-grid">
                  {members.map(m => {
                    const isSelected = taskAssigneesDraft.includes(m.id);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        className={`member-select-pill ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          if (isSelected) {
                            setTaskAssigneesDraft(taskAssigneesDraft.filter(id => id !== m.id));
                          } else {
                            setTaskAssigneesDraft([...taskAssigneesDraft, m.id]);
                          }
                        }}
                      >
                        <Avatar member={m} small />
                        <div className="member-pill-text">
                          <strong>{m.name}{m.id === me.id ? ' (คุณ)' : ''}</strong>
                          <small>{m.role}</small>
                        </div>
                        {isSelected && <span className="pill-check-icon">✓</span>}
                      </button>
                    );
                  })}
                </div>
                <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginTop: '6px' }}>
                  เลือกแล้ว {taskAssigneesDraft.length} คน (สามารถมอบหมายงานพร้อมกันหลายคนได้)
                </small>
              </div>

              <div className="button-row" style={{ marginTop: '20px' }}>
                <button type="button" className="secondary" onClick={() => setTaskModalOpen(false)}>ยกเลิก</button>
                <button type="submit" className="primary" disabled={busy || taskAssigneesDraft.length === 0}>
                  <CheckSquare size={15} /> มอบหมายงานทันที
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* SCREEN CENTER FLASH URGENT BROADCAST POPUP (Excluded from Focus Zone) */}
      {urgentPopup && me.room !== 'focus' && (
        <div className="urgent-popup-backdrop">
          <div className="urgent-flash-popup-card">
            <div className="flash-popup-glow-border" />
            <div className="flash-popup-header">
              <div className="flash-alert-badge">
                <Zap size={16} className="flash-zap-pulse" />
                <span>⚡ ประกาศด่วนพิเศษ · FLASH ANNOUNCEMENT</span>
              </div>
              <button
                className="flash-popup-close-btn"
                onClick={() => setUrgentPopup(null)}
                title="ปิดข้อความ"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flash-sender-profile">
              {(() => {
                const av = urgentPopup.senderAvatar;
                const isImg = av && (av.startsWith('http') || av.startsWith('data:'));
                return isImg ? (
                  <img src={av} alt={urgentPopup.senderName} className="flash-sender-avatar-img" />
                ) : (
                  <span className="flash-sender-avatar">{av || '📢'}</span>
                );
              })()}
              <div className="flash-sender-meta">
                <strong>{urgentPopup.senderName}</strong>
                <small>{formatPostTime(urgentPopup.createdAt)}</small>
              </div>
            </div>

            <div className="flash-message-content">
              <p>{urgentPopup.message}</p>
            </div>

            <div className="flash-popup-footer">
              <small className="focus-protection-hint">
                🤫 ป็อปอัปนี้แจ้งเตือนทุกคนทันที (ยกเว้นผู้ที่อยู่ในห้อง Focus Zone เพื่อรักษาความเงียบ)
              </small>
              <button
                type="button"
                className="flash-acknowledge-btn"
                onClick={() => {
                  playChime('stop');
                  setUrgentPopup(null);
                }}
              >
                <Check size={16} /> รับทราบข้อความ
              </button>
            </div>
          </div>
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
