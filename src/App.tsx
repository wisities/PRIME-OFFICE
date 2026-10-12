import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { 
  Home, Users, ClipboardList, Megaphone, Settings, ArrowUpRight, DoorOpen, Hand, 
  Coffee, Focus, Video, X, Check, LogOut, Bell, Menu, ShieldCheck, Save, Map, 
  List, Wifi, WifiOff, CalendarCheck, Clock, CheckCircle2, AlertCircle, Plus, Trash2,
  Mic, MicOff, Headphones, PhoneOff, Radio
} from 'lucide-react';
import { configured, supabase } from './backend';
import { 
  rooms as initialRooms, statuses, sampleMembers, sampleAttendance, sampleLeaves, 
  leaveTypesConfig, periodLabels, type Room, type RoomId, type Status, type Member, 
  type AttendanceRecord, type LeaveRequest, type LeaveType 
} from './data';
import { loadDemo, validMeetUrl, normalizeEmail, checkAttendanceStatus, formatThaiTime } from './domain.mjs';

type Page = 'office' | 'team' | 'attendance' | 'today' | 'announcements' | 'admin';
type Knock = { id:string; sender: string; receiver_id?:string; room_id:RoomId; state:string; created_at:string };
type Notice = { id:string; title:string; body:string };

const nav = [
  { id: 'office', label: 'ออฟฟิศของเรา', icon: Home },
  { id: 'team', label: 'สมาชิกทีม', icon: Users },
  { id: 'attendance', label: 'ลงเวลา & ลางาน', icon: CalendarCheck },
  { id: 'today', label: 'งานวันนี้', icon: ClipboardList },
  { id: 'announcements', label: 'บอร์ดประกาศ', icon: Megaphone },
  { id: 'admin', label: 'ผู้ดูแลระบบ', icon: Settings }
] as const;

function Avatar({ member, small = false }: { member: Member; small?: boolean }) {
  const isImg = member.avatarUrl && (member.avatarUrl.startsWith('http') || member.avatarUrl.startsWith('data:'));
  return (
    <span className={`avatar ${member.color} ${small ? 'small' : ''}`} aria-label={member.name}>
      {isImg ? (
        <img src={member.avatarUrl} alt={member.name} className="avatar-img" />
      ) : (
        <span className="avatar-face">
          {member.avatarUrl || (['may', 'nan', 'ploy', 'beam', 'offline-0', 'offline-5'].includes(member.id) ? '👩🏻‍💻' : '👨🏻‍💻')}
        </span>
      )}
      <i className={`status-dot ${member.online ? member.status : 'offline'}`} />
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
  const [activeVideoRoom, setActiveVideoRoom] = useState<Room | null>(null);
  
  // Voice Huddle State (Discord/Slack style voice channels)
  const [inHuddle, setInHuddle] = useState(false);
  const [huddleRoomId, setHuddleRoomId] = useState<RoomId | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const audioStreamRef = useRef<MediaStream | null>(null);

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

  // Attendance & Leave State
  const todayDateStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
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
    ? { id: 'me', name: demoName, role: 'ทีม PRIME', room: demoState.room as RoomId, status: demoState.status as Status, online: true, color: 'blue', note: demoState.note, isAdmin: true, avatarUrl: demoAvatar }
    : (currentLive ? { ...currentLive, avatarUrl: currentLive.avatarUrl || userAvatar } : { id: session?.user?.id || '', name: session?.user?.user_metadata?.full_name || 'สมาชิก', role: 'ทีม PRIME', room: 'hub', status: 'available', online: false, color: 'blue', avatarUrl: userAvatar });

  // Effective Attendance & Leaves data
  const attendanceList = demo ? demoAttendance : liveAttendance;
  const leavesList = demo ? demoLeaves : liveLeaves;
  const todayMyAttendance = attendanceList.find(a => a.user_id === me.id && a.work_date === todayDateStr);

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
  const joinHuddle = useCallback(async (targetRoomId: RoomId) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((err) => {
          console.warn('Microphone permission or hardware access issue:', err);
          return null;
        });
        audioStreamRef.current = stream;
      }
    } catch (err) {
      console.warn('getUserMedia check error:', err);
    }
    setInHuddle(true);
    setHuddleRoomId(targetRoomId);
    setIsMuted(false);
    setIsDeafened(false);
    const roomObj = rooms.find(r => r.id === targetRoomId);
    notify(`เชื่อมต่อ Voice Huddle ในห้อง ${roomObj?.name || 'ทำงาน'} แล้ว 🎙️`);
  }, [rooms]);

  const leaveHuddle = useCallback(() => {
    try {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => {
          try { track.stop(); } catch {}
        });
        audioStreamRef.current = null;
      }
    } catch {}
    setInHuddle(false);
    setHuddleRoomId(null);
    notify('ออกจาก Voice Huddle แล้ว 👋');
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      try {
        if (audioStreamRef.current) {
          audioStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
        }
      } catch {}
      return next;
    });
  }, []);

  const startHoldTalk = useCallback(() => {
    if (!inHuddle) return;
    setIsMuted(false);
    try {
      if (audioStreamRef.current) {
        audioStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
      }
    } catch {}
  }, [inHuddle]);

  const stopHoldTalk = useCallback(() => {
    if (!inHuddle) return;
    setIsMuted(true);
    try {
      if (audioStreamRef.current) {
        audioStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
      }
    } catch {}
  }, [inHuddle]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened(prev => {
      const next = !prev;
      if (next) {
        setIsMuted(true);
        try {
          if (audioStreamRef.current) {
            audioStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
          }
        } catch {}
      }
      return next;
    });
  }, []);

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

  // Floating Pop-up Window for Google Meet (Opens on top of screen, not a new full tab)
  const launchGoogleMeetWindow = useCallback((url?: string) => {
    const meetUrl = url && validMeetUrl(url) ? url : 'https://meet.google.com/new';
    const popupWidth = 1080;
    const popupHeight = 720;
    const left = Math.max(0, Math.round((window.screen.width - popupWidth) / 2));
    const top = Math.max(0, Math.round((window.screen.height - popupHeight) / 2));
    window.open(
      meetUrl,
      'GoogleMeetPopup',
      `width=${popupWidth},height=${popupHeight},top=${top},left=${left},popup=yes,menubar=no,toolbar=no,location=no,status=no`
    );
    notify('เปิด Google Meet หน้าต่าง Pop-up ลอยแล้ว 📹');
  }, []);

  const openGoogleMeet = useCallback((targetRoom: Room) => {
    // Open in-app popup modal overlay directly over webpage
    setActiveVideoRoom(targetRoom);
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

  // Attendance Handlers (Work hours: 08:00 - 17:00)
  async function handleCheckIn() {
    await action(async () => {
      const now = new Date();
      const status = checkAttendanceStatus(now);
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
      notify(`เช็คอินเข้างานแล้ว เวลา ${formatThaiTime(now.toISOString())} (${status === 'on_time' ? 'ตรงเวลา 👍' : 'สาย'})`);
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
      notify(`ยื่น${cfg.label}สำเร็จ (อนุมัติทันที) มีผล ${leaveStart === leaveEnd ? leaveStart : `${leaveStart} ถึง ${leaveEnd}`}`);
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
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage('office'); }}>
          <span className="brand-mark">P</span>
          <span>PRIME<small>VIRTUAL OFFICE</small></span>
        </a>
        <p className="nav-caption">WORKSPACE</p>
        <nav>
          {nav.filter(n => n.id !== 'admin' || me.isAdmin).map(n => (
            <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => { setPage(n.id); setMenu(false); }}>
              <n.icon size={19} />
              {n.label}
              {n.id === 'team' && <span className="nav-count">{members.length}</span>}
              {n.id === 'attendance' && onLeaveCount > 0 && <span className="nav-count leave-cnt">{onLeaveCount} ลา</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <span className="tiny-dot" />พื้นที่ของทีมเรา
            <small>ไพร์มดิจิทัลคอนซัลแทนท์ จำกัด</small>
          </div>
          <button className="logout" onClick={logout} disabled={busy}>
            <LogOut size={17} />{demo ? 'เข้าสู่ระบบจริง' : 'ออกจากระบบ'}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main">
        {/* Topbar Header */}
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-button mobile-menu" aria-label="เปิดเมนู" onClick={() => setMenu(!menu)}>
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{nav.find(n => n.id === page)?.label}</strong>
          </div>

          <div className="topbar-right">
            {/* Quick Check-in Button in Topbar */}
            {todayMyAttendance ? (
              !todayMyAttendance.check_out_at ? (
                <button 
                  className="topbar-checkin-pill active" 
                  onClick={handleCheckOut} 
                  disabled={busy}
                  title="คลิกเพื่อเช็คเอาท์เลิกงาน"
                >
                  <span className="tiny-dot" />
                  <span className="pill-time">เข้า {formatThaiTime(todayMyAttendance.check_in_at)}</span>
                  <span className={`pill-badge ${todayMyAttendance.status}`}>
                    {todayMyAttendance.status === 'on_time' ? 'ตรงเวลา' : 'สาย'}
                  </span>
                  <span className="pill-action">· เช็คเอาท์</span>
                </button>
              ) : (
                <div className="topbar-checkin-pill completed" title={`เข้า ${formatThaiTime(todayMyAttendance.check_in_at)} - ออก ${formatThaiTime(todayMyAttendance.check_out_at)}`}>
                  <CheckCircle2 size={13} color="#40947a" />
                  <span>ออกงานแล้ว {formatThaiTime(todayMyAttendance.check_out_at)}</span>
                </div>
              )
            ) : (
              <button 
                className="topbar-checkin-pill cta" 
                onClick={handleCheckIn} 
                disabled={busy}
                title="คลิกเพื่อเช็คอินเข้างานประจำวัน (เวลาเริ่มงาน 08:00 น.)"
              >
                <Clock size={14} />
                <span>เช็คอินเข้างาน</span>
                <span className="pill-target">08:00</span>
              </button>
            )}

            <span className="connection">
              {demo ? (
                <><span className="tiny-dot amber" />สาธิต</>
              ) : connected ? (
                <><Wifi size={15} />เชื่อมต่อแล้ว</>
              ) : (
                <><WifiOff size={15} />กำลังเชื่อมต่อใหม่</>
              )}
            </span>

            <button className="icon-button bell" aria-label={`การแจ้งเตือน ${incoming.length} รายการ`} onClick={() => setNoticeOpen(true)}>
              <Bell size={20} />
              {incoming.length > 0 && <b>{incoming.length}</b>}
            </button>

            <button 
              className="profile-badge-btn" 
              aria-label="แก้ไขโปรไฟล์ของคุณ" 
              title="คลิกเพื่อแก้ไขชื่อและรูปประจำตัว" 
              onClick={() => { setEditName(me.name); setEditAvatar(me.avatarUrl || ''); setProfileOpen(true); }}
            >
              <Avatar member={me} small />
              <span className="my-name-tag">{me.name}</span>
            </button>
          </div>
        </header>

        <main className="content">
          {demo && (
            <div className="demo-banner">
              <span><span className="tiny-dot amber" />โหมดสาธิต · สมาชิก การเช็คอิน และการลาเป็นตัวอย่าง บันทึกเฉพาะเครื่องนี้</span>
              <button onClick={() => { setDemo(false); setError(''); }}>เชื่อมต่อทีมจริง <ArrowUpRight size={14} /></button>
            </div>
          )}
          {errorBanner}

          <div className="page-heading">
            <div>
              <p className="eyebrow">PRIME VIRTUAL OFFICE · 08:00 - 17:00</p>
              <h1>
                {page === 'office' ? 'ออฟฟิศของเรา' : nav.find(n => n.id === page)?.label}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {page === 'office' ? 'วันนี้ก็ทำงานไปด้วยกัน เลือกห้องแล้วแวะทักทายทีมได้เลย' :
                 page === 'attendance' ? 'ระบบลงเวลาทำงาน เช็คอินเข้า-ออก และยื่นลากิจ ลาป่วย (อนุมัติทันที)' :
                 'พื้นที่สำหรับทีมไพร์มดิจิทัลคอนซัลแทนท์'}
              </p>
            </div>
            <div className="my-status">
              <label htmlFor="my-status">สถานะของคุณ</label>
              <select id="my-status" value={me.status} disabled={busy} onChange={e => void updateProfile({ status: e.target.value as Status })}>
                {Object.entries(statuses).map(([v, l]) => <option value={v} key={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* PAGE: Office Map */}
          {page === 'office' && (
            <>
              <div className="office-toolbar">
                <div className="online-summary">
                  <span className="tiny-dot" />
                  <strong>{online.length}</strong>
                  <span>ออนไลน์ จาก {members.length} คน</span>
                  {onLeaveCount > 0 && <span className="leave-pill-tag">· ลางาน {onLeaveCount} คน</span>}
                  <span className="separator" />
                  <span>คุณอยู่ที่ <b>{rooms.find(r => r.id === me.room)?.name}</b></span>
                </div>
                <div className="segmented">
                  <button aria-pressed={layout === 'map'} onClick={() => setLayout('map')}><Map size={16} />แผนผัง</button>
                  <button aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={16} />ห้องทั้งหมด</button>
                </div>
              </div>

              <div className="office-grid">
                <section className="office-stage" aria-label="แผนผังออฟฟิศ">
                  {layout === 'map' ? (
                    <div className="map-scene">
                      <img src="/assets/office.png" alt="ฉากออฟฟิศการ์ตูนสี่ห้อง" />
                      {rooms.map(r => {
                        const people = online.filter(m => m.room === r.id);
                        return (
                          <div className={`map-room ${r.id}`} key={r.id}>
                            <button className={`room-pin ${selected === r.id ? 'selected' : ''}`} onClick={() => setSelected(r.id)} aria-pressed={selected === r.id}>
                              <span className="tiny-dot" />{r.name}
                              <span className="pin-count">{people.length}</span>
                            </button>
                            <div className="map-avatars">
                              {people.slice(0, 4).map(m => (
                                <button key={m.id} className="map-person" onClick={() => { setSelected(r.id); if (m.id !== me.id) setKnockTarget(m); }} aria-label={`${m.name} ${statuses[m.status]}`}>
                                  <Avatar member={m} small />
                                  <span>{m.id === me.id ? 'คุณ' : m.name}</span>
                                </button>
                              ))}
                              {people.length > 4 && <span className="more-people">+{people.length - 4}</span>}
                            </div>
                          </div>
                        );
                      })}
                      <span className="map-caption">เลือกป้ายห้องเพื่อดูรายละเอียด</span>
                    </div>
                  ) : (
                    <div className="room-list">
                      {rooms.map(r => (
                        <button key={r.id} onClick={() => setSelected(r.id)} className={`room-card ${selected === r.id ? 'selected' : ''}`}>
                          <span className={'room-illustration ' + r.id}>
                            {r.id === 'coffee' ? <Coffee /> : r.id === 'focus' ? <Focus /> : r.id === 'project' ? <Video /> : <Home />}
                          </span>
                          <strong>{r.name}</strong>
                          <span>{r.thai}</span>
                          <small>{online.filter(m => m.room === r.id).length} คนในห้อง</small>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="map-legend">
                    <span><i className="tiny-dot" />พร้อมคุย</span>
                    <span><i className="tiny-dot amber" />กำลังโฟกัส</span>
                    <span><i className="tiny-dot gray" />ไม่อยู่</span>
                    <span className="muted">ไมค์และกล้องเปิดในวิดีโอคอลเท่านั้น</span>
                  </div>
                </section>

                <aside className="room-detail">
                  <div className={'room-detail-icon ' + room.id}>
                    {room.id === 'coffee' ? <Coffee size={24} /> : room.id === 'focus' ? <Focus size={24} /> : room.id === 'project' ? <Video size={24} /> : <Home size={24} />}
                  </div>
                  <p className="eyebrow">YOUR SPACE TO CONNECT</p>
                  <h2>{room.name}</h2>
                  <p>{room.description}</p>
                  <div className="detail-divider" />
                  <div className="section-label">สมาชิกในห้อง <span>{occupants.length} คน</span></div>
                  <div className="occupants">
                    {occupants.length === 0 ? (
                      <p className="empty-inline">ห้องว่าง แวะเข้ามาเป็นคนแรกได้เลย</p>
                    ) : occupants.map(m => (
                      <div className="person-row" key={m.id}>
                        <Avatar member={m} small />
                        <div>
                          <strong>{m.name}{m.id === me.id ? ' (คุณ)' : ''}</strong>
                          <small>{m.leaveToday ? `${m.leaveToday.emoji} ${m.leaveToday.label}` : statuses[m.status]}</small>
                        </div>
                        {m.id !== me.id && (
                          <button className="icon-button" aria-label={'เคาะประตูคุยกับ ' + m.name} onClick={() => setKnockTarget(m)}>
                            <Hand size={17} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button className="primary" disabled={busy || me.room === room.id} onClick={() => void updateProfile({ room_id: room.id })}>
                    {me.room === room.id ? <Check size={18} /> : <DoorOpen size={18} />} {me.room === room.id ? 'คุณอยู่ในห้องนี้' : 'เข้าห้องนี้'}
                  </button>

                  {/* Rule 1: Must enter room first before Voice Huddle */}
                  {me.room !== room.id ? (
                    <div className="huddle-locked-notice">
                      <MicOff size={15} />
                      <span>กด <strong>เข้าห้องนี้</strong> ก่อน ถึงจะเปิดไมค์คุยกับเพื่อนได้</span>
                    </div>
                  ) : (
                    /* Rule 2: Push-to-talk or click-to-talk once inside the room */
                    inHuddle && huddleRoomId === room.id ? (
                      <div className="talk-console">
                        <button 
                          type="button"
                          className={`talk-btn-large ${!isMuted ? 'speaking' : ''}`}
                          onPointerDown={startHoldTalk}
                          onPointerUp={stopHoldTalk}
                          onPointerLeave={stopHoldTalk}
                          onClick={toggleMute}
                          title="คลิกเพื่อเปิด/ปิดไมค์ หรือกดค้างเพื่อพูด (Spacebar)"
                        >
                          {!isMuted ? <Mic size={24} className="pulse-icon" /> : <MicOff size={24} />}
                          <div className="talk-btn-text">
                            <strong>{!isMuted ? 'กำลังเปิดไมค์พูด…' : 'กดเพื่อเปิดไมค์ (หรือกดค้าง)'}</strong>
                            <small>{!isMuted ? 'คลิกอีกครั้งเพื่อปิดไมค์' : 'กด 1 ครั้งพูด / กดค้าง / Spacebar'}</small>
                          </div>
                        </button>
                        <div className="talk-quick-row">
                          <button type="button" className={`talk-sub-btn ${isMuted ? 'muted' : 'active'}`} onClick={toggleMute}>
                            {isMuted ? <MicOff size={14}/> : <Mic size={14}/>} {isMuted ? 'ไมค์ปิดอยู่' : 'ไมค์เปิด'}
                          </button>
                          <button type="button" className={`talk-sub-btn ${isDeafened ? 'muted' : ''}`} onClick={toggleDeafen}>
                            <Headphones size={14}/> {isDeafened ? 'หูฟังปิด' : 'หูฟังเปิด'}
                          </button>
                          <button type="button" className="talk-sub-btn hangup" onClick={leaveHuddle}>
                            <PhoneOff size={14}/> ออกจาก Huddle
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="primary huddle-join-btn" onClick={() => joinHuddle(room.id)}>
                        <Mic size={17} /><span>🎙️ เปิดไมค์ Voice Huddle (ในห้องนี้)</span>
                      </button>
                    )
                  )}

                  {/* Rule 3: Google Meet popup overlay (no new full tab) */}
                  <button className="secondary meet-btn" onClick={() => openGoogleMeet(room)}>
                    <Video size={17} /><span>เปิด Google Meet (Popup ทับหน้าเว็บ)</span><ArrowUpRight size={13} />
                  </button>
                  <small className="room-hint">
                    {room.meet_url ? 'มีลิงก์ Google Meet ประจำห้องแล้ว' : 'เปิด Google Meet แบบ Pop-up ทับหน้าเว็บ ไม่เปิดแท็บใหม่'}
                  </small>
                </aside>
              </div>

              <div className="bottom-grid">
                <section className="note-card">
                  <div className="section-label">
                    <span><ClipboardList size={18} />วันนี้โฟกัสอะไร?</span>
                    <small>แชร์ให้ทีมรู้</small>
                  </div>
                  <form onSubmit={e => { e.preventDefault(); void updateProfile({ daily_note: note }); }}>
                    <input aria-label="งานวันนี้" value={note} maxLength={240} onChange={e => setNote(e.target.value)} placeholder="เช่น ออกแบบหน้าเว็บไซต์ให้ลูกค้า…" />
                    <button className="text-button" disabled={busy}><Save size={16} />บันทึก</button>
                  </form>
                </section>
                <section className="notice-card">
                  <span className="announcement-icon"><Megaphone size={22} /></span>
                  <div>
                    <small>จากบอร์ดประกาศ</small>
                    <strong>{notices[0]?.title || 'ยังไม่มีประกาศใหม่'}</strong>
                    <button className="text-button" onClick={() => setPage('announcements')}>ดูประกาศทั้งหมด <ArrowUpRight size={14} /></button>
                  </div>
                </section>
              </div>
            </>
          )}

          {/* PAGE: Attendance & Leave Management */}
          {page === 'attendance' && (
            <div className="attendance-page">
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

          {/* PAGE: Today's Tasks */}
          {page === 'today' && (
            <section className="panel">
              <h2>เป้าหมายเล็ก ๆ ของวันนี้</h2>
              <form className="note-form" onSubmit={e => { e.preventDefault(); void updateProfile({ daily_note: note }); }}>
                <label htmlFor="daily-note">งานของคุณ</label>
                <textarea id="daily-note" value={note} maxLength={240} onChange={e => setNote(e.target.value)} placeholder="วันนี้ทำอะไร หรือมีอะไรอยากให้ทีมช่วย?" />
                <button className="primary" disabled={busy}>บันทึกงานวันนี้</button>
              </form>
              <div className="daily-list">
                {members.filter(m => m.note).map(m => (
                  <article key={m.id}>
                    <Avatar member={m} small />
                    <div>
                      <strong>{m.name}</strong>
                      <p>{m.note}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* PAGE: Announcements */}
          {page === 'announcements' && (
            <section className="panel">
              <h2>เรื่องที่ทีมควรรู้</h2>
              {notices.length === 0 && <p className="empty-inline">ยังไม่มีประกาศ ผู้ดูแลสามารถเพิ่มประกาศแรกได้</p>}
              {notices.map(n => (
                <article className="announcement" key={n.id}>
                  <Megaphone size={22} />
                  <div>
                    <h3>{n.title}</h3>
                    <p>{n.body}</p>
                  </div>
                </article>
              ))}
              {me.isAdmin && (
                <form className="admin-form" onSubmit={e => {
                  e.preventDefault();
                  void action(async () => {
                    if (demo) {
                      setNotices(n => [{ id: crypto.randomUUID(), title: newTitle, body: newBody }, ...n]);
                    } else {
                      const { error } = await supabase!.rpc('admin_post_announcement', { p_title: newTitle, p_body: newBody });
                      if (error) throw error;
                      await refresh();
                    }
                    setNewTitle('');
                    setNewBody('');
                    notify(demo ? 'เพิ่มประกาศสาธิตในหน้านี้แล้ว' : 'เผยแพร่ประกาศแล้ว');
                  });
                }}>
                  <h3>เพิ่มประกาศ</h3>
                  <label>หัวข้อ<input required value={newTitle} maxLength={120} onChange={e => setNewTitle(e.target.value)} /></label>
                  <label>รายละเอียด<textarea required value={newBody} maxLength={2000} onChange={e => setNewBody(e.target.value)} /></label>
                  <button className="primary" disabled={busy}>เผยแพร่ประกาศ{demo ? 'สาธิต' : ''}</button>
                </form>
              )}
            </section>
          )}

          {/* PAGE: Admin Dashboard */}
          {page === 'admin' && me.isAdmin && (
            <div className="admin-grid">
              <section className="panel">
                <h2><Video size={21} />ลิงก์ประชุมประจำห้อง</h2>
                <p>ใช้ลิงก์ Google Meet รูปแบบ https://meet.google.com/abc-defg-hij</p>
                <form className="admin-form" onSubmit={e => {
                  e.preventDefault();
                  void action(async () => {
                    if (meetingUrl && !validMeetUrl(meetingUrl)) throw Error('กรุณาใส่ลิงก์ Google Meet ให้ถูกต้อง');
                    if (demo) {
                      setRooms(rs => rs.map(r => r.id === selected ? { ...r, meet_url: meetingUrl } : r));
                    } else {
                      const { error } = await supabase!.rpc('admin_set_meeting', { p_room: selected, p_url: meetingUrl });
                      if (error) throw error;
                      await refresh();
                    }
                    notify(demo ? 'บันทึกลิงก์สาธิตชั่วคราวแล้ว' : 'บันทึกลิงก์ประชุมแล้ว');
                  });
                }}>
                  <label>ห้อง<select value={selected} onChange={e => setSelected(e.target.value as RoomId)}>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
                  <label>ลิงก์ประชุม<input type="url" value={meetingUrl} onChange={e => setMeetingUrl(e.target.value.trim())} placeholder="https://meet.google.com/abc-defg-hij" /></label>
                  <button className="primary" disabled={busy}>บันทึกลิงก์</button>
                </form>
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
        </main>
      </div>

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

      {/* MODAL: Video Meeting Pop-up */}
      {activeVideoRoom && (
        <div className="video-backdrop" onClick={() => setActiveVideoRoom(null)}>
          <section className="video-window" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setActiveVideoRoom(null); }}>
            <header className="video-window-header">
              <strong><Video size={19} />{activeVideoRoom.name} <span className="tiny-tag">Google Meet / Popup Window</span></strong>
              <div className="video-window-controls">
                <button
                  type="button"
                  className="btn-popup-launch"
                  onClick={() => launchGoogleMeetWindow(activeVideoRoom.meet_url)}
                  title="เปิดเป็นหน้าต่าง Google Meet ลอยทับหน้าจอ ไม่เปิดแท็บใหม่"
                >
                  <ArrowUpRight size={14} />เปิดหน้าต่าง Meet Pop-up
                </button>
                <button className="btn-close" onClick={() => setActiveVideoRoom(null)}>
                  <X size={15} />ปิดห้องประชุม
                </button>
              </div>
            </header>
            <div className="video-body">
              {activeVideoRoom.meet_url ? (
                <div className="meet-url-bar">
                  <span>🔗 ลิงก์ห้อง: <strong>{activeVideoRoom.meet_url}</strong></span>
                  <button type="button" onClick={() => launchGoogleMeetWindow(activeVideoRoom.meet_url)}>
                    <ArrowUpRight size={12} />เปิดหน้าต่าง Meet ลอยทับ
                  </button>
                </div>
              ) : null}
              <iframe
                src={`https://meet.jit.si/PrimeOffice-2026-${activeVideoRoom.id}#userInfo.displayName="${encodeURIComponent(me.name)}"`}
                allow="camera; microphone; display-capture; autoplay; clipboard-write"
                className="video-iframe"
                title={`วิดีโอคอล ${activeVideoRoom.name}`}
              />
            </div>
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
                <label style={{ fontSize: '12px', color: '#688090', display: 'block', marginBottom: '6px' }}>เลือกการ์ตูนประจำตัว</label>
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
              <small>{isDeafened ? 'ปิดเสียงลำโพง' : isMuted ? 'ไมโครโฟนปิดอยู่ (Muted)' : 'กำลังเชื่อมต่อเสียง (เปิดไมค์)'}</small>
            </div>
          </div>
          <div className="huddle-dock-actions">
            <button 
              type="button"
              className={`huddle-dock-btn ${!isMuted ? 'active speaking' : 'muted'}`}
              onPointerDown={startHoldTalk}
              onPointerUp={stopHoldTalk}
              onPointerLeave={stopHoldTalk}
              onClick={toggleMute}
              title="คลิกเพื่อเปิด/ปิดไมค์ หรือกดค้างเพื่อพูด (Spacebar)"
            >
              {!isMuted ? <Mic size={16} className="pulse-icon" /> : <MicOff size={16} />}
              <span>{!isMuted ? 'กำลังพูด…' : 'กดพูด (หรือกดค้าง)'}</span>
            </button>
            <button 
              className={`huddle-dock-btn ${isDeafened ? 'muted' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'เปิดเสียงลำโพง' : 'ปิดเสียงลำโพง'}
            >
              <Headphones size={16} />
            </button>
            <button 
              className="huddle-dock-btn meet-link"
              onClick={() => openGoogleMeet(rooms.find(r => r.id === huddleRoomId) || room)}
              title="เปิด Google Meet ของห้องนี้"
            >
              <Video size={16} />
              <span>Google Meet</span>
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

      {/* Background Audio Gateway for Voice Huddle */}
      {inHuddle && huddleRoomId && (
        <div 
          id="huddle-audio-gateway"
          style={{ position: 'fixed', width: '1px', height: '1px', top: '-100px', left: '-100px', opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
          aria-hidden="true"
        >
          <iframe
            key={`huddle-audio-${huddleRoomId}`}
            src={`https://meet.jit.si/PrimeHuddle2026-${huddleRoomId}#config.startWithVideoMuted=true&config.startWithAudioMuted=${isMuted}&config.prejoinPageEnabled=false&config.disableDeepLinking=true&userInfo.displayName="${encodeURIComponent(me.name)}"`}
            allow="microphone; autoplay"
            style={{ width: '1px', height: '1px', border: 0 }}
            title="Voice Huddle Audio Stream"
          />
        </div>
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
