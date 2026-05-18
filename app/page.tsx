// ============================================================================
// FILE LOCATION REFERENCE: app/page.tsx
// ============================================================================
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// --- TYPES & INTERFACES ---
export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type AccessStrategy = 'anyone' | 'just-me' | 'custom';
export type UserRole = 'admin' | 'developer';

export interface AuditLog {
  movedBy: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  timestamp: string;
  notes?: string;
  actionType?: 'status_change' | 'session_handover' | 'timeout_recovery' | 'checklist_toggle';
  checklistText?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface ActiveWorkSession {
  userId: string;
  userName: string;
  startedAt: string;
  lastCheckedInAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  position: number;
  createdBy: string;
  createdByName: string;
  lastMovedBy?: string;
  history: AuditLog[];
  editStrategy: AccessStrategy;
  moveStrategy: AccessStrategy;
  permittedEditors: string[];
  permittedMovers: string[];
  checklist: ChecklistItem[];
  activeSession?: ActiveWorkSession;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  badge: string;
  role: UserRole;
}

export interface UserPresence {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
}

export interface BroadcastPayload {
  type: 'cursor';
  userId: string;
  userName: string;
  color: string;
  payload: { x: number; y: number };
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseClient: any = null;
const getSupabase = () => {
  if (!supabaseClient && typeof window !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabaseClient;
};

const COLUMNS: { id: TaskStatus; title: string; border: string; accent: string }[] = [
  { id: 'todo', title: 'Backlog Queue', border: 'border-blue-900/30', accent: 'bg-blue-500' },
  { id: 'in-progress', title: 'Active Sprints', border: 'border-amber-900/30', accent: 'bg-amber-500' },
  { id: 'done', title: 'Production Ready (Admins Only)', border: 'border-emerald-900/30', accent: 'bg-emerald-500' },
];

const TEST_USERS: Profile[] = [
  { id: 'dev_alpha_01', name: 'Alpha_Engineer', color: '#3b82f6', badge: 'Lead Arch', role: 'admin' },
  { id: 'dev_beta_02', name: 'Beta_Engineer', color: '#ef4444', badge: 'Core Dev', role: 'developer' },
  { id: 'dev_gamma_03', name: 'Gamma_Engineer', color: '#10b981', badge: 'QA Analyst', role: 'developer' }
];

const STRATEGY_THEMES: Record<AccessStrategy, { btn: string; active: string; text: string; bgCard: string }> = {
  anyone: {
    btn: 'bg-zinc-900 text-emerald-400 border-emerald-900/40 hover:border-emerald-700/60',
    active: 'bg-emerald-500 text-zinc-950 border-emerald-400 font-bold',
    text: 'text-emerald-400',
    bgCard: 'border-l-4 border-l-emerald-500/70'
  },
  'just-me': {
    btn: 'bg-zinc-900 text-rose-400 border-rose-900/40 hover:border-rose-700/60',
    active: 'bg-rose-500 text-zinc-950 border-rose-400 font-bold',
    text: 'text-rose-400',
    bgCard: 'border-l-4 border-l-rose-500/70'
  },
  custom: {
    btn: 'bg-zinc-900 text-sky-400 border-sky-900/40 hover:border-sky-700/60',
    active: 'bg-sky-500 text-zinc-950 border-sky-400 font-bold',
    text: 'text-sky-400',
    bgCard: 'border-l-4 border-l-sky-500/70'
  }
};

export default function WarRoom() {
  const [mounted, setMounted] = useState<boolean>(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [presences, setPresences] = useState<Record<string, UserPresence>>({});
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [timeTicker, setTimeTicker] = useState<number>(Date.now());
  const [savedTasks, setSavedTasks] = useState<Record<string, boolean>>({});

  const [activeHistoryTask, setActiveHistoryTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editEditStrategy, setEditEditStrategy] = useState<AccessStrategy>('anyone');
  const [editMoveStrategy, setEditMoveStrategy] = useState<AccessStrategy>('anyone');
  const [editPermittedEditors, setEditPermittedEditors] = useState<string[]>([]);
  const [editPermittedMovers, setEditPermittedMovers] = useState<string[]>([]);
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItemText, setNewChecklistItemText] = useState<string>('');

  const [isAddingTask, setIsAddingTask] = useState<boolean>(false);
  const [addTaskStatus, setAddTaskStatus] = useState<TaskStatus>('todo');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newEditStrategy, setNewEditStrategy] = useState<AccessStrategy>('anyone');
  const [newMoveStrategy, setNewMoveStrategy] = useState<AccessStrategy>('anyone');
  const [newPermittedEditors, setNewPermittedEditors] = useState<string[]>([]);
  const [newPermittedMovers, setNewPermittedMovers] = useState<string[]>([]);
  const [newChecklist, setNewChecklist] = useState<ChecklistItem[]>([]);
  const [creationChecklistInput, setCreationChecklistInput] = useState<string>('');

  const [handoffTask, setHandoffTask] = useState<Task | null>(null);
  const [handoffNotes, setHandoffNotes] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const lastBroadcast = useRef<number>(0);
  const interactionChannelRef = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastAlertPlayedRef = useRef<number>(0);

  const normalizeTaskPayload = (item: any): Task => ({
    id: item.id ? item.id.toString() : Math.random().toString(),
    title: item.title || '',
    description: item.description || '',
    status: (item.status as TaskStatus) || 'todo',
    position: Number(item.position) || 0,
    createdBy: item.created_by || '',
    createdByName: item.created_by_name || 'System Node',
    lastMovedBy: item.last_moved_by || undefined,
    history: item.history || [],
    editStrategy: (item.edit_strategy as AccessStrategy) || 'anyone',
    moveStrategy: (item.move_strategy as AccessStrategy) || 'anyone',
    permittedEditors: item.permitted_editors || [],
    permittedMovers: item.permitted_movers || [],
    checklist: item.checklist || [],
    activeSession: item.active_session || undefined
  });

  // --- NATIVE REALTIME LIFECYCLE SYNC ---
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('warroom_user_profile');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.id && !parsed.role) {
            const staticMatch = TEST_USERS.find(u => u.id === parsed.id);
            parsed.role = staticMatch ? staticMatch.role : 'developer';
          }
          setCurrentUser(parsed);
        } catch (e) {
          console.error('Profile parsing structural abort:', e);
        }
      }
    }

    const supabase = getSupabase();
    if (!supabase) return;

    supabase
      .from('tasks')
      .select('*')
      .order('position', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('Snapshot baseline error:', error);
        if (data) setTasks(data.map(normalizeTaskPayload));
      });

    const dbChannel = supabase
      .channel('tasks-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newTask = normalizeTaskPayload(payload.new);
          setTasks((prev) => {
            if (prev.some(t => t.id === newTask.id)) return prev;
            return [...prev, newTask].sort((a, b) => a.position - b.position);
          });
        } else if (payload.eventType === 'UPDATE') {
          const updatedTask = normalizeTaskPayload(payload.new);
          setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)).sort((a, b) => a.position - b.position));
          setActiveHistoryTask((current) => current && current.id === updatedTask.id ? updatedTask : current);
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old?.id?.toString();
          if (deletedId) {
            setTasks((prev) => prev.filter((t) => t.id !== deletedId));
            setActiveHistoryTask((current) => current && current.id === deletedId ? null : current);
          }
        }
      })
      .subscribe();

    interactionChannelRef.current = supabase.channel('room-interactions', { config: { broadcast: { self: false } } });
    interactionChannelRef.current
      .on('broadcast', { event: 'ui-event' }, ({ payload }: { payload: BroadcastPayload }) => {
        if (payload.type === 'cursor') {
          setPresences((prev) => ({
            ...prev,
            [payload.userId]: {
              id: payload.userId,
              name: payload.userName,
              color: payload.color,
              x: payload.payload.x,
              y: payload.payload.y,
            },
          }));
        }
      })
      .subscribe();

    presenceChannelRef.current = supabase.channel('room-presence-sync');
    presenceChannelRef.current
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannelRef.current.presenceState();
        const activeUsers: Record<string, UserPresence> = {};
        Object.keys(state).forEach((key) => {
          const userTrack = state[key]?.[0];
          if (userTrack && userTrack.id) {
            activeUsers[userTrack.id] = {
              id: userTrack.id,
              name: userTrack.name,
              color: userTrack.color,
              x: userTrack.x || 0,
              y: userTrack.y || 0
            };
          }
        });
        setPresences((prev) => {
          const merged = { ...prev };
          Object.keys(merged).forEach((id) => {
            if (!activeUsers[id]) delete merged[id];
          });
          return { ...merged, ...activeUsers };
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
        if (!leftPresences) return;
        leftPresences.forEach((p: any) => {
          if (p.id) {
            setPresences((prev) => {
              const next = { ...prev };
              delete next[p.id];
              return next;
            });
          }
        });
      })
      .subscribe();

    const tickerInterval = setInterval(() => {
      setTimeTicker(Date.now());
    }, 1000);

    return () => {
      supabase.removeChannel(dbChannel);
      if (interactionChannelRef.current) supabase.removeChannel(interactionChannelRef.current);
      if (presenceChannelRef.current) supabase.removeChannel(presenceChannelRef.current);
      clearInterval(tickerInterval);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!presenceChannelRef.current || !currentUser) return;
    presenceChannelRef.current.track({
      id: currentUser.id,
      name: currentUser.name,
      color: currentUser.color,
      online_at: new Date().toISOString()
    });
  }, [currentUser]);

  useEffect(() => {
    const checkDeadSessionsAndAlert = async () => {
      if (!currentUser) return;
      const testingTimeoutThreshold = 60000;
      const warningAudioHorizon = 30000;
      const now = Date.now();
      let playWarningBeep = false;

      const supabase = getSupabase();
      if (!supabase) return;

      for (const task of tasks) {
        if (task.activeSession) {
          const lastCheckIn = new Date(task.activeSession.lastCheckedInAt).getTime();
          const contextAge = now - lastCheckIn;

          if (contextAge > testingTimeoutThreshold) {
            const systemLog: AuditLog = {
              movedBy: 'System Engine Protocol',
              fromStatus: task.status,
              toStatus: task.status,
              timestamp: new Date().toISOString(),
              actionType: 'timeout_recovery',
              notes: `Testing level timeout recovery triggered. Session dropped for user ${task.activeSession.userName} due to activity ping starvation (> 1 minute missing verification).`
            };
            await supabase
              .from('tasks')
              .update({
                active_session: null,
                history: [systemLog, ...(task.history || [])]
              })
              .eq('id', parseInt(task.id, 10));
          } else if (task.activeSession.userId === currentUser.id && (testingTimeoutThreshold - contextAge) <= warningAudioHorizon) {
            playWarningBeep = true;
          }
        }
      }

      if (playWarningBeep && now - lastAlertPlayedRef.current >= 1200) {
        lastAlertPlayedRef.current = now;
        triggerNativeAlarmNotification();
      }
    };

    const runCheck = setInterval(checkDeadSessionsAndAlert, 2000);
    return () => clearInterval(runCheck);
  }, [tasks, currentUser]);

  const triggerNativeAlarmNotification = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

      const nowTime = ctx.currentTime;
      const playToneNode = (freq: number, startOffset: number, length: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, nowTime + startOffset);
        gainNode.gain.setValueAtTime(0.001, nowTime + startOffset);
        gainNode.gain.linearRampToValueAtTime(0.2, nowTime + startOffset + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, nowTime + startOffset + length - 0.02);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(nowTime + startOffset);
        osc.stop(nowTime + startOffset + length);
      };

      playToneNode(880, 0, 0.25);
      playToneNode(1320, 0.05, 0.2);
      playToneNode(880, 0.4, 0.25);
      playToneNode(1320, 0.45, 0.2);
    } catch (err) {
      console.warn('Audio feedback context delayed:', err);
    }
  };

  const isSoftLocked = (task: Task): boolean => {
    if (!task.activeSession) return false;
    if (!currentUser) return true;
    return task.activeSession.userId !== currentUser.id;
  };

  const canMoveTask = (task: Task): boolean => {
    if (!currentUser) return false;
    if (isSoftLocked(task)) return false;
    if (task.createdBy === currentUser.id) return true;
    if (task.moveStrategy === 'anyone') return true;
    if (task.moveStrategy === 'custom' && task.permittedMovers.includes(currentUser.id)) return true;
    return false;
  };

  const canEditTask = (task: Task): boolean => {
    if (!currentUser) return false;
    if (isSoftLocked(task)) return false;
    if (task.status === 'done' && currentUser.role !== 'admin') return false;
    if (task.createdBy === currentUser.id) return true;
    if (task.editStrategy === 'anyone') return true;
    if (task.editStrategy === 'custom' && task.permittedEditors.includes(currentUser.id)) return true;
    return false;
  };

  const toggleHistoryDrawer = (task: Task) => {
    if (activeHistoryTask && activeHistoryTask.id === task.id) {
      setActiveHistoryTask(null);
    } else {
      setActiveHistoryTask(task);
    }
  };

  const executeExportTaskFile = (task: Task) => {
    if (!currentUser) return;
    if (task.status === 'done' && currentUser.role !== 'admin') {
      alert('Access Denied: Production release protocols require Administrator level Clearance keys.');
      return;
    }

    let fileOutputString = `==================================================\n`;
    fileOutputString += `TASK CLOSURE SUMMARY & METADATA LOG REPORT\n`;
    fileOutputString += `==================================================\n`;
    fileOutputString += `Task Title: ${task.title}\n`;
    fileOutputString += `Description: ${task.description || 'N/A'}\n`;
    fileOutputString += `Created By: ${task.createdByName}\n`;
    fileOutputString += `Exported By: ${currentUser.name} [ROLE: ${(currentUser.role || 'developer').toUpperCase()}]\n`;
    fileOutputString += `Export Timestamp: ${new Date().toLocaleString()}\n\n`;

    fileOutputString += `--------------------------------------------------\n`;
    fileOutputString += `CHECKLIST TARGETS STATUS\n`;
    fileOutputString += `--------------------------------------------------\n`;
    if (task.checklist && task.checklist.length > 0) {
      task.checklist.forEach((item) => {
        fileOutputString += `[${item.isCompleted ? 'X' : ' '}] ${item.text}`;
        if (item.updatedByName) {
          fileOutputString += ` (Verified by ${item.updatedByName} at ${new Date(item.updatedAt || '').toLocaleString()})`;
        }
        fileOutputString += `\n`;
      });
    } else {
      fileOutputString += `No checklists were defined for this card.\n`;
    }
    fileOutputString += `\n`;

    fileOutputString += `--------------------------------------------------\n`;
    fileOutputString += `AUDIT TRAIL LOG HISTORY (${task.history?.length || 0} Events)\n`;
    fileOutputString += `--------------------------------------------------\n`;
    if (task.history && task.history.length > 0) {
      task.history.forEach((log, idx) => {
        fileOutputString += `${idx + 1}. [${new Date(log.timestamp).toLocaleString()}] User: ${log.movedBy}\n`;
        fileOutputString += `   Action: ${log.actionType || 'Status Change'} (${log.fromStatus} -> ${log.toStatus})\n`;
        if (log.notes) fileOutputString += `   Notes: ${log.notes}\n`;
        fileOutputString += `\n`;
      });
    } else {
      fileOutputString += `No historical event logs registered on ledger.\n`;
    }

    fileOutputString += `==================================================\n`;
    fileOutputString += `END OF REPORT\n`;

    const blob = new Blob([fileOutputString], { type: 'text/plain;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = downloadUrl;
    downloadAnchor.download = `Task_Logs_${task.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(downloadUrl);

    setSavedTasks(prev => ({ ...prev, [task.id]: true }));
  };

  const executeCompleteTaskOnly = async (task: Task) => {
    if (!currentUser || !savedTasks[task.id]) return;
    if (task.status === 'done' && currentUser.role !== 'admin') return;

    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', parseInt(task.id, 10));

    if (error) {
      console.error('Error purging completed task card:', error);
    } else {
      setSavedTasks(prev => {
        const updated = { ...prev };
        delete updated[task.id];
        return updated;
      });
    }
  };

  const selectIdentity = (profile: Profile) => {
    setCurrentUser(profile);
    if (typeof window !== 'undefined') localStorage.setItem('warroom_user_profile', JSON.stringify(profile));
    setTimeout(() => {
      try { audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch (e) {}
    }, 100);
  };

  const logoutIdentity = () => {
    setCurrentUser(null);
    if (typeof window !== 'undefined') localStorage.removeItem('warroom_user_profile');
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !currentUser || !interactionChannelRef.current) return;
    const now = Date.now();
    if (now - lastBroadcast.current < 45) return;
    lastBroadcast.current = now;

    const rect = containerRef.current.getBoundingClientRect();
    interactionChannelRef.current.send({
      type: 'broadcast',
      event: 'ui-event',
      payload: {
        type: 'cursor',
        userId: currentUser.id,
        userName: currentUser.name,
        color: currentUser.color,
        payload: { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 }
      },
    });
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    if (!canMoveTask(task)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId || !currentUser) return;

    const currentTask = tasks.find((t) => t.id === taskId);
    if (!currentTask || currentTask.status === targetStatus || !canMoveTask(currentTask)) return;

    if ((targetStatus === 'done' || currentTask.status === 'done') && currentUser.role !== 'admin') {
      alert('Access Matrix Error: Deploying or mutating tasks within the Production Ready terminal column requires elevated Admin configuration credentials.');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    const columnTasks = tasks.filter((t) => t.status === targetStatus);
    const newPosition = columnTasks.length > 0 ? Math.max(...columnTasks.map((t) => t.position)) + 1000 : 1000;
    const updatedHistory: AuditLog = { movedBy: currentUser.name, fromStatus: currentTask.status, toStatus: targetStatus, timestamp: new Date().toISOString(), actionType: 'status_change' };
    const mergedHistory = [updatedHistory, ...(currentTask.history || [])];

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus, position: newPosition, lastMovedBy: currentUser.name, history: mergedHistory } : t)).sort((a, b) => a.position - b.position));

    await supabase
      .from('tasks')
      .update({ status: targetStatus, position: newPosition, last_moved_by: currentUser.name, history: mergedHistory })
      .eq('id', parseInt(taskId, 10));
  };

  const claimWorkSession = async (task: Task) => {
    if (!currentUser || task.activeSession) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const sessionPayload = { userId: currentUser.id, userName: currentUser.name, startedAt: new Date().toISOString(), lastCheckedInAt: new Date().toISOString() };
    await supabase
      .from('tasks')
      .update({ active_session: sessionPayload })
      .eq('id', parseInt(task.id, 10));
  };

  const pingCheckIn = async (task: Task) => {
    if (!currentUser || !task.activeSession || task.activeSession.userId !== currentUser.id) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const sessionPayload = { ...task.activeSession, lastCheckedInAt: new Date().toISOString() };
    await supabase
      .from('tasks')
      .update({ active_session: sessionPayload })
      .eq('id', parseInt(task.id, 10));
  };

  const startReleaseHandoff = (task: Task) => {
    setHandoffTask(task);
    setHandoffNotes('');
  };

  const commitReleaseHandoff = async () => {
    if (!handoffTask || !currentUser) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const systemLog: AuditLog = { movedBy: currentUser.name, fromStatus: handoffTask.status, toStatus: handoffTask.status, timestamp: new Date().toISOString(), actionType: 'session_handover', notes: handoffNotes.trim() ? handoffNotes.trim() : 'Session explicitly released without incremental notes.' };
    await supabase
      .from('tasks')
      .update({ active_session: null, history: [systemLog, ...(handoffTask.history || [])] })
      .eq('id', parseInt(handoffTask.id, 10));
    setHandoffTask(null);
  };

  const toggleChecklistItem = async (task: Task, itemId: string) => {
    if (!currentUser || isSoftLocked(task)) return;
    if (task.status === 'done' && currentUser.role !== 'admin') return;

    const supabase = getSupabase();
    if (!supabase) return;

    let checklistItemName = '';
    let targetCompletionState = false;

    const updatedChecklist = task.checklist.map(item => {
      if (item.id === itemId) {
        targetCompletionState = !item.isCompleted;
        checklistItemName = item.text;
        return { ...item, isCompleted: targetCompletionState, updatedBy: currentUser.id, updatedByName: currentUser.name, updatedAt: new Date().toISOString() };
      }
      return item;
    });

    const trackingLogEntry: AuditLog = { movedBy: currentUser.name, fromStatus: task.status, toStatus: task.status, timestamp: new Date().toISOString(), actionType: 'checklist_toggle', checklistText: checklistItemName, notes: `${targetCompletionState ? 'Marked complete' : 'Reverted to incomplete'}: "${checklistItemName}"` };
    const combinedHistory = [trackingLogEntry, ...(task.history || [])];

    await supabase
      .from('tasks')
      .update({ checklist: updatedChecklist, history: combinedHistory })
      .eq('id', parseInt(task.id, 10));
  };

  const addCreationChecklistItem = () => {
    if (!creationChecklistInput.trim()) return;
    const item: ChecklistItem = { id: Math.random().toString(36).substring(2, 9), text: creationChecklistInput.trim(), isCompleted: false };
    setNewChecklist([...newChecklist, item]);
    setCreationChecklistInput('');
  };

  const removeCreationChecklistItem = (id: string) => {
    setNewChecklist(newChecklist.filter(item => item.id !== id));
  };

  const addModificationChecklistItem = () => {
    if (!newChecklistItemText.trim()) return;
    const item: ChecklistItem = { id: Math.random().toString(36).substring(2, 9), text: newChecklistItemText.trim(), isCompleted: false };
    setEditChecklist([...editChecklist, item]);
    setNewChecklistItemText('');
  };

  const removeModificationChecklistItem = (id: string) => {
    setEditChecklist(editChecklist.filter(item => item.id !== id));
  };

  const McKTask = (strategy: AccessStrategy) => strategy;

  const saveNewTask = async () => {
    if (!newTitle.trim() || !currentUser) return;
    if (addTaskStatus === 'done' && currentUser.role !== 'admin') {
      alert('Access Matrix Error: Inserting assets directly into Production Ready column requires Admin access.');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    const columnTasks = tasks.filter((t) => t.status === addTaskStatus);
    const position = columnTasks.length > 0 ? Math.max(...columnTasks.map((t) => t.position)) + 1000 : 1000;

    const { error } = await supabase.from('tasks').insert([{ title: newTitle, description: newDesc, status: addTaskStatus, position, created_by: currentUser.id, created_by_name: currentUser.name, edit_strategy: newEditStrategy, move_strategy: newMoveStrategy, permitted_editors: newPermittedEditors, permitted_movers: newPermittedMovers, checklist: newChecklist, history: [] }]);
    if (error) console.error('Card insertion block dropped:', error);
    setIsAddingTask(false);
  };

  const saveEditedTask = async () => {
    if (!editingTask || !currentUser) return;
    if (editingTask.status === 'done' && currentUser.role !== 'admin') return;

    const supabase = getSupabase();
    if (!supabase) return;

    await supabase
      .from('tasks')
      .update({ title: editTitle, description: editDesc, edit_strategy: editEditStrategy, move_strategy: editMoveStrategy, permitted_editors: editPermittedEditors, permitted_movers: editPermittedMovers, checklist: editChecklist })
      .eq('id', parseInt(editingTask.id, 10));
    setEditingTask(null);
  };

  const formatTimerDuration = (startedAtStr: string): string => {
    const elapsed = timeTicker - new Date(startedAtStr).getTime();
    if (elapsed <= 0) return '00:00';
    const totalSecs = Math.floor(elapsed / 1000);
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getRemainingTimeInSeconds = (lastPingStr: string): number => {
    const expiresAt = new Date(lastPingStr).getTime() + 60000;
    const diff = expiresAt - timeTicker;
    return diff <= 0 ? 0 : Math.ceil(diff / 1000);
  };

  if (!mounted) {
    return <div className="w-screen h-screen bg-zinc-950 flex items-center justify-center font-mono text-xs text-zinc-600">BOOTING VIRTUAL ROOM ENVIRONMENT...</div>;
  }

  if (!currentUser) {
    return (
      <div className="w-screen h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <h2 className="text-sm font-bold tracking-tight text-white mb-2 uppercase">Select Workspace Identity</h2>
          <p className="text-xs text-zinc-400 mb-6 leading-relaxed">Choose an identity to run granular access tests across simultaneous browser panels.</p>
          <div className="space-y-3">
            {TEST_USERS.map((user) => (
              <button key={user.id} onClick={() => selectIdentity(user)} className="w-full flex items-center justify-between p-4 bg-zinc-950/60 border border-zinc-800 hover:border-zinc-700 rounded-lg text-left cursor-pointer transition-colors" >
                <div>
                  <div className="text-xs font-mono font-bold text-zinc-200">{user.name}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{user.badge} ({user.role.toUpperCase()})</div>
                </div>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: user.color }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} className="w-screen h-screen bg-zinc-950 text-zinc-100 p-8 select-none overflow-hidden font-sans relative">
      
      {/* --- RENDER OTHER USER CURSORS --- */}
      {Object.values(presences).map((p) => {
        if (p.id === currentUser.id) return null;
        return (
          <div key={p.id} className="absolute pointer-events-none z-50 transition-all duration-75 ease-out" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <svg width="12" height="12" viewBox="0 0 32 32" style={{ fill: p.color }}>
              <path d="M0,0 L0,28 L8,20 L18,30 L22,26 L12,16 L22,16 Z" />
            </svg>
            <div className="absolute left-3 top-3 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-white whitespace-nowrap shadow-md" style={{ backgroundColor: p.color }}>
              {p.name}
            </div>
          </div>
        );
      })}

      <header className="flex items-center justify-between mb-8 border-b border-zinc-900 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-md font-black tracking-wider text-white uppercase">War Room</h1>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-widest">ROLE PROTECTED ARCHITECTURE</span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Real-time team configuration desk and task priority manager.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentUser.color }} />
            <div>
              <div className="text-xs font-mono font-bold text-zinc-300">{currentUser.name}</div>
              <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                {currentUser.badge} • {(currentUser.role || 'developer').toUpperCase()}
              </div>
            </div>
          </div>
          <button onClick={logoutIdentity} className="text-[10px] font-mono font-bold text-zinc-400 hover:text-white uppercase tracking-wider border border-zinc-800 px-3 py-2.5 rounded-lg bg-zinc-900/50 hover:bg-zinc-900 cursor-pointer">Exit Environment</button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-6 h-[calc(100vh-180px)] overflow-hidden">
        {COLUMNS.map((col) => {
          const filteredTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, col.id)} className={`bg-zinc-900/40 border ${col.border} rounded-xl p-4 flex flex-col h-full min-h-[300px]`}>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-900/60 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-3 ${col.accent} rounded-sm`} />
                  <h3 className="text-xs font-bold font-mono tracking-wider text-zinc-300 uppercase">{col.title} ({filteredTasks.length})</h3>
                </div>
                <button onClick={() => {
                  setAddTaskStatus(col.id);
                  setIsAddingTask(true);
                  setNewTitle('');
                  setNewDesc('');
                  setNewEditStrategy('anyone');
                  setNewMoveStrategy('anyone');
                  setNewPermittedEditors([]);
                  setNewPermittedMovers([]);
                  setNewChecklist([]);
                  setCreationChecklistInput('');
                }} className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white hover:text-emerald-400 rounded-lg border border-zinc-800 hover:border-emerald-500/40 text-xs font-mono font-black uppercase tracking-widest shadow-lg cursor-pointer transition-all duration-150 transform active:scale-95" >
                  + Add Task
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                {filteredTasks.map((task) => {
                  const moveOk = canMoveTask(task);
                  const editOk = canEditTask(task);
                  const softLocked = isSoftLocked(task);
                  const strategyTheme = STRATEGY_THEMES[task.editStrategy] || STRATEGY_THEMES.anyone;

                  return (
                    <div key={task.id} draggable={moveOk} onDragStart={(e) => handleDragStart(e, task)} className={`bg-zinc-900 border border-zinc-800/80 rounded-lg p-4 relative transition-all duration-150 ${moveOk ? 'cursor-grab active:cursor-grabbing hover:border-zinc-700' : 'opacity-80 cursor-not-allowed'} ${strategyTheme.bgCard}`}>
                      {task.activeSession && (
                        <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-500 to-orange-600 animate-pulse rounded-t-lg" />
                      )}

                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-xs font-bold text-zinc-100 tracking-tight line-clamp-1">{task.title}</h4>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => toggleHistoryDrawer(task)} className="p-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-tight cursor-pointer">Logs</button>
                          {editOk && (
                            <button onClick={() => {
                              setEditingTask(task);
                              setEditTitle(task.title);
                              setEditDesc(task.description || '');
                              setEditEditStrategy(task.editStrategy);
                              setEditMoveStrategy(task.moveStrategy);
                              setEditPermittedEditors(task.permittedEditors || []);
                              setEditPermittedMovers(task.permittedMovers || []);
                              setEditChecklist(task.checklist || []);
                              setNewChecklistItemText('');
                            }} className="p-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-tight cursor-pointer" >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-relaxed mb-3 line-clamp-2">{task.description || 'No supplementary manifest descriptive summary declared.'}</p>

                      {task.checklist && task.checklist.length > 0 && (
                        <div className="bg-zinc-950/40 border border-zinc-900/60 rounded-md p-2 mb-3 space-y-1">
                          {task.checklist.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-[10px]">
                              <button onClick={() => toggleChecklistItem(task, item.id)} disabled={softLocked || (task.status === 'done' && currentUser.role !== 'admin')} className="flex items-center gap-1.5 text-left text-zinc-400 hover:text-zinc-200 transition-colors disabled:cursor-not-allowed" >
                                <span className={`w-3 h-3 flex items-center justify-center border font-mono rounded-sm text-[8px] font-bold ${item.isCompleted ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-zinc-700 bg-zinc-900'}`}>
                                  {item.isCompleted ? '✓' : ''}
                                </span>
                                <span className={item.isCompleted ? 'line-through text-zinc-600' : ''}>{item.text}</span>
                              </button>
                              {item.updatedByName && (
                                <span className="text-[8px] text-zinc-500 italic">By {item.updatedByName}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* --- CLAIM & PING INTERACTION FOOTER --- */}
                      <div className="flex items-center justify-between border-t border-zinc-900/80 pt-2.5 mt-2.5 text-[9px] font-mono">
                        <div className="text-zinc-500">
                          By <span className="text-zinc-400 font-bold">{task.createdByName}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {task.activeSession ? (
                            <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">
                              <span className="w-1 h-1 bg-amber-400 rounded-full animate-ping" />
                              <span className="font-bold">{task.activeSession.userName}</span>
                              <span className="text-zinc-500">({formatTimerDuration(task.activeSession.startedAt)})</span>
                              
                              {task.activeSession.userId === currentUser.id ? (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); pingCheckIn(task); }}
                                  className="ml-1.5 px-1 py-0.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded uppercase text-[8px] transition-colors cursor-pointer"
                                >
                                  Ping ({getRemainingTimeInSeconds(task.activeSession.lastCheckedInAt)}s)
                                </button>
                              ) : (
                                <span className="text-[7px] text-rose-400 px-1 bg-rose-500/10 rounded border border-rose-500/20 uppercase font-black ml-1">LOCKED</span>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); claimWorkSession(task); }}
                              className="px-2 py-0.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded text-[8px] font-bold uppercase transition-colors cursor-pointer"
                            >
                              Claim
                            </button>
                          )}

                          {task.activeSession && task.activeSession.userId === currentUser.id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); startReleaseHandoff(task); }}
                              className="px-1 py-0.5 bg-zinc-950 hover:bg-rose-950 border border-zinc-800 hover:border-rose-900 text-zinc-400 hover:text-rose-400 rounded text-[8px] transition-colors cursor-pointer"
                              title="Release Task Session Lock"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- SIDEBAR LEDGER AUDIT TRAIL VIEW --- */}
      {activeHistoryTask && (
        <div className="absolute top-0 right-0 w-96 h-full bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col font-mono animate-slide-in select-text">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">Ledger Audit Trail</h3>
              <p className="text-[10px] text-zinc-500 truncate max-w-[240px] mt-0.5">{activeHistoryTask.title}</p>
            </div>
            <button 
              onClick={() => setActiveHistoryTask(null)}
              className="text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 bg-zinc-950 px-2 py-1 rounded cursor-pointer uppercase text-[9px] font-bold"
            >
              Close
            </button>
          </div>

          <div className="p-4 bg-zinc-950/20 border-b border-zinc-800/60 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[10px] text-zinc-400">Export Ledger Baseline Archive:</span>
            <button
              onClick={() => executeExportTaskFile(activeHistoryTask)}
              className="px-2 py-1 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 rounded font-bold uppercase text-[9px] tracking-wider transition-colors cursor-pointer"
            >
              Download .TXT
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {activeHistoryTask.history && activeHistoryTask.history.length > 0 ? (
              activeHistoryTask.history.map((log, index) => {
                let badgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                if (log.actionType === 'timeout_recovery') badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                if (log.actionType === 'session_handover') badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                if (log.actionType === 'checklist_toggle') badgeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';

                return (
                  <div key={index} className="p-3 bg-zinc-950/50 border border-zinc-800/60 rounded-md text-[10px]">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="text-zinc-300 font-bold truncate">{log.movedBy}</span>
                      <span className="text-[8px] text-zinc-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 my-1">
                      <span className={`text-[8px] border px-1 rounded uppercase font-bold tracking-tight ${badgeColor}`}>
                        {log.actionType ? log.actionType.replace('_', ' ') : 'Status Move'}
                      </span>
                      <span className="text-zinc-500">
                        {log.fromStatus === log.toStatus ? `on ${log.fromStatus}` : `${log.fromStatus} ➔ ${log.toStatus}`}
                      </span>
                    </div>

                    {log.notes && (
                      <p className="text-[10px] text-zinc-400 mt-2 bg-zinc-950 border border-zinc-900 p-1.5 rounded leading-normal break-words">
                        {log.notes}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center p-8">
                <div className="mb-2">⚠️</div>
                <div className="text-[10px] uppercase tracking-wider font-bold">No Records Found</div>
                <div className="text-[9px] text-zinc-600 mt-1">Ledger sequence state is pristine.</div>
              </div>
            )}
          </div>

          {savedTasks[activeHistoryTask.id] && (
            <div className="p-4 border-t border-zinc-800 bg-emerald-950/20 shrink-0">
              <button
                onClick={() => executeCompleteTaskOnly(activeHistoryTask)}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-xs rounded tracking-widest transition-colors cursor-pointer"
              >
                Purge & Commit Done Ledger
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- ADD TASK MODAL PANEL --- */}
      {isAddingTask && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl p-6 font-mono text-xs">
            <h3 className="text-sm font-bold text-white uppercase mb-4 tracking-wider">Initialize Operational Node Task</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-zinc-500 uppercase font-bold block mb-1">Title</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded px-3 py-2 text-zinc-200 outline-none" />
              </div>
              
              <div>
                <label className="text-zinc-500 uppercase font-bold block mb-1">Description Summary</label>
                <textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded px-3 py-2 text-zinc-200 outline-none resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-500 uppercase font-bold block mb-1">Edit Strategy Policy</label>
                  <div className="flex gap-1 bg-zinc-950 p-1 border border-zinc-800 rounded">
                    {(['anyone', 'just-me'] as AccessStrategy[]).map((strat) => (
                      <button key={strat} onClick={() => setNewEditStrategy(strat)} className={`flex-1 py-1.5 rounded text-[10px] uppercase font-bold ${newEditStrategy === strat ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-400'}`}>
                        {strat}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-zinc-500 uppercase font-bold block mb-1">Move Strategy Policy</label>
                  <div className="flex gap-1 bg-zinc-950 p-1 border border-zinc-800 rounded">
                    {(['anyone', 'just-me'] as AccessStrategy[]).map((strat) => (
                      <button key={strat} onClick={() => setNewMoveStrategy(strat)} className={`flex-1 py-1.5 rounded text-[10px] uppercase font-bold ${newMoveStrategy === strat ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-400'}`}>
                        {strat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-zinc-500 uppercase font-bold block mb-1">Manifest Checklists</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={creationChecklistInput} onChange={(e) => setCreationChecklistInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCreationChecklistItem()} placeholder="Add granular item checklist target..." className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-zinc-200 outline-none" />
                  <button onClick={addCreationChecklistItem} className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-3 rounded font-bold uppercase">Add</button>
                </div>
                {newChecklist.length > 0 && (
                  <div className="max-h-24 overflow-y-auto bg-zinc-950/60 rounded border border-zinc-800/80 p-2 space-y-1">
                    {newChecklist.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-[11px] text-zinc-400 bg-zinc-900/40 px-2 py-1 rounded">
                        <span>• {item.text}</span>
                        <button onClick={() => removeCreationChecklistItem(item.id)} className="text-rose-500 hover:text-rose-400 font-bold px-1">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-zinc-800/60">
              <button onClick={() => setIsAddingTask(false)} className="px-4 py-2 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 rounded font-bold uppercase cursor-pointer">Cancel</button>
              <button onClick={saveNewTask} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold uppercase cursor-pointer">Deploy Node</button>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL INTERFACE --- */}
      {editingTask && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl p-6 font-mono text-xs">
            <h3 className="text-sm font-bold text-white uppercase mb-4 tracking-wider">Mutate Baseline Parameters</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-zinc-500 uppercase font-bold block mb-1">Title</label>
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded px-3 py-2 text-zinc-200 outline-none" />
              </div>

              <div>
                <label className="text-zinc-500 uppercase font-bold block mb-1">Manifest Checklist Configuration</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={newChecklistItemText} onChange={(e) => setNewChecklistItemText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addModificationChecklistItem()} placeholder="Append incremental requirements..." className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-zinc-200 outline-none" />
                  <button onClick={addModificationChecklistItem} className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-3 rounded font-bold uppercase">Inject</button>
                </div>
                {editChecklist.length > 0 && (
                  <div className="max-h-32 overflow-y-auto bg-zinc-950/60 rounded border border-zinc-800/80 p-2 space-y-1">
                    {editChecklist.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-[11px] text-zinc-400 bg-zinc-900/40 px-2 py-1 rounded">
                        <span className={item.isCompleted ? 'line-through text-zinc-600' : ''}>• {item.text}</span>
                        <button onClick={() => removeModificationChecklistItem(item.id)} className="text-rose-500 hover:text-rose-400 font-bold px-1">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-zinc-800/60">
              <button onClick={() => setEditingTask(null)} className="px-4 py-2 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 rounded font-bold uppercase cursor-pointer">Abort</button>
              <button onClick={saveEditedTask} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold uppercase cursor-pointer">Commit Mutations</button>
            </div>
          </div>
        </div>
      )}

      {/* --- HANDOFF RELEASE MODAL PANEL --- */}
      {handoffTask && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 font-mono text-xs">
            <h3 className="text-sm font-bold text-rose-400 uppercase mb-2 tracking-wider">Release Work Token Session</h3>
            <p className="text-[11px] text-zinc-400 mb-4 leading-relaxed">Explicit handover protocols logged directly to task history sequence registry database.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-zinc-500 uppercase font-bold block mb-1">Handoff Summary Notes</label>
                <textarea rows={3} value={handoffNotes} onChange={(e) => setHandoffNotes(e.target.value)} placeholder="Specify modifications complete or hurdles encountered..." className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded px-3 py-2 text-zinc-200 outline-none resize-none" />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setHandoffTask(null)} className="px-3 py-1.5 border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 rounded font-bold uppercase cursor-pointer">Cancel</button>
                <button onClick={commitReleaseHandoff} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold uppercase cursor-pointer">Release Lock</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}