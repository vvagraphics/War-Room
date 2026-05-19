// ============================================================================
// FILE LOCATION REFERENCE: app/page.tsx
// ============================================================================
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Task, TaskStatus, AccessStrategy, Profile, UserPresence, BroadcastPayload, AuditLog, ChecklistItem } from '@/types/warroom';

// --- TYPES & INTERFACES ---
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
  { id: 'todo', title: 'To Do Queue', border: 'border-blue-900/30', accent: 'bg-blue-500' },
  { id: 'in-progress', title: 'In Progress', border: 'border-amber-900/30', accent: 'bg-amber-500' },
  { id: 'done', title: 'Done', border: 'border-emerald-900/30', accent: 'bg-emerald-500' }
];

const TEST_USERS: Profile[] = [
  { id: 'dev_alpha_01', name: 'Alpha_Engineer', color: '#3b82f6', badge: 'Lead Arch', role: 'admin' },
  { id: 'dev_beta_02', name: 'Beta_Engineer', color: '#ef4444', badge: 'Core Dev', role: 'developer' },
  { id: 'dev_gamma_03', name: 'Gamma_Engineer', color: '#10b981', badge: 'Junior Contractor', role: 'guest' }
];

const STRATEGY_THEMES: Record<AccessStrategy, { text: string; bgCard: string }> = {
  anyone: { text: 'text-emerald-400', bgCard: 'border-l-4 border-l-emerald-500/70' },
  'just-me': { text: 'text-rose-400', bgCard: 'border-l-4 border-l-rose-500/70' },
  custom: { text: 'text-sky-400', bgCard: 'border-l-4 border-l-sky-500/70' }
};

export default function WarRoom() {
  // --- STATE & INITIALIZATION ---
  const [mounted, setMounted] = useState<boolean>(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [presences, setPresences] = useState<Record<string, UserPresence>>({});
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [timeTicker, setTimeTicker] = useState<number>(Date.now());
  const [savedTasks, setSavedTasks] = useState<Record<string, boolean>>({});

  // Mobile / Screen View Controls
  const [activeMobileTab, setActiveMobileTab] = useState<TaskStatus>('todo');
  const [activeMoveMenuId, setActiveMoveMenuId] = useState<string | null>(null);

  // Modals and Drawers
  const [activeHistoryTask, setActiveHistoryTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Edit Form Fields State
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editEditStrategy, setEditEditStrategy] = useState<AccessStrategy>('anyone');
  const [editMoveStrategy, setEditMoveStrategy] = useState<AccessStrategy>('anyone');
  const [editPermittedEditors, setEditPermittedEditors] = useState<string[]>([]);
  const [editPermittedMovers, setEditPermittedMovers] = useState<string[]>([]);
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItemText, setNewChecklistItemText] = useState<string>('');

  // Creation Form Fields State
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

  // Session Handover Release Form State
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
    createdBy: item.created_by || item.createdBy || '',
    createdByName: item.created_by_name || item.createdByName || 'System User',
    lastMovedBy: item.last_moved_by || item.lastMovedBy || undefined,
    history: item.history || [],
    editStrategy: (item.edit_strategy || item.editStrategy || 'anyone') as AccessStrategy,
    moveStrategy: (item.move_strategy || item.moveStrategy || 'anyone') as AccessStrategy,
    permittedEditors: item.permitted_editors || item.permittedEditors || [],
    permittedMovers: item.permitted_movers || item.permittedMovers || [],
    checklist: item.checklist || [],
    activeSession: item.active_session || item.activeSession || undefined
  });

  // --- NATIVE API INTEGRATION LOOP ---
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('warroom_user_profile');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.id) {
            const staticMatch = TEST_USERS.find(u => u.id === parsed.id);
            if (staticMatch) parsed.role = staticMatch.role;
            setCurrentUser(parsed);
          }
        } catch (e) {
          console.error('Failed to parse user session profile:', e);
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
        if (error) console.error('Error fetching database items:', error);
        if (data) setTasks(data.map(normalizeTaskPayload));
      });

    const dbChannel = supabase
      .channel('tasks-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newTask = normalizeTaskPayload(payload.new);
          setTasks((prev) => {
            if (prev.some((t) => t.id === newTask.id)) return prev;
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
            }
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

  // Session Timeout Heartbeat Loop (Strict 1 minute testing limit)
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
              movedBy: 'System Auto-Drop',
              fromStatus: task.status,
              toStatus: task.status,
              timestamp: new Date().toISOString(),
              actionType: 'timeout_recovery',
              notes: `Time limit exceeded. Session cleared for user ${task.activeSession.userName}.`
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

      if (playWarningBeep && now - lastAlertPlayedRef.current >= 1500) {
        lastAlertPlayedRef.current = now;
        triggerNativeAlarmNotification();
      }
    };

    const runCheck = setInterval(checkDeadSessionsAndAlert, 1000);
    return () => clearInterval(runCheck);
  }, [tasks, currentUser]);

  const triggerNativeAlarmNotification = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
      const nowTime = ctx.currentTime;

      const playToneNode = (freq: number, startOffset: number, length: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, nowTime + startOffset);
        gainNode.gain.setValueAtTime(0.001, nowTime + startOffset);
        gainNode.gain.linearRampToValueAtTime(0.15, nowTime + startOffset + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, nowTime + startOffset + length - 0.02);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(nowTime + startOffset);
        osc.stop(nowTime + startOffset + length);
      };

      playToneNode(660, 0, 0.2);
      playToneNode(660, 0.25, 0.2);
    } catch (err) {
      console.warn('Audio feedback blocked by browser interaction rules:', err);
    }
  };

  // --- EVENT HANDLERS & VALIDATION ---
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
    if (task.moveStrategy === 'custom' && task.permittedMovers?.includes(currentUser.id)) return true;
    return false;
  };

  const canEditTask = (task: Task): boolean => {
    if (!currentUser) return false;
    if (isSoftLocked(task)) return false;
    if (task.createdBy === currentUser.id) return true;
    if (task.editStrategy === 'anyone') return true;
    if (task.editStrategy === 'custom' && task.permittedEditors?.includes(currentUser.id)) return true;
    return false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const now = Date.now();
    if (!containerRef.current || !currentUser || !interactionChannelRef.current || now - lastBroadcast.current < 50) return;
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
        payload: {
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100
        }
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

  const executeMoveOperation = async (taskId: string, targetStatus: TaskStatus) => {
    if (!currentUser) return;
    const currentTask = tasks.find((t) => t.id === taskId);
    if (!currentTask || currentTask.status === targetStatus) return;

    if (targetStatus === 'done' && currentUser.role === 'guest') {
      alert('Permission Denied: Guests cannot move tasks into Done.');
      return;
    }
    if (currentTask.status === 'done' && currentUser.role !== 'admin') {
      alert('Permission Denied: Only Admins can move tasks back out of the Done column.');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    const columnTasks = tasks.filter((t) => t.status === targetStatus);
    const newPosition = columnTasks.length > 0 ? Math.max(...columnTasks.map((t) => t.position)) + 1000 : 1000;

    const moveLog: AuditLog = {
      movedBy: currentUser.name,
      fromStatus: currentTask.status,
      toStatus: targetStatus,
      timestamp: new Date().toISOString(),
      actionType: 'status_change',
      notes: `Task moved from [${currentTask.status}] to [${targetStatus}].`
    };

    const mergedHistory = [moveLog, ...(currentTask.history || [])];

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus, position: newPosition, lastMovedBy: currentUser.name, history: mergedHistory } : t)).sort((a, b) => a.position - b.position));
    setActiveMoveMenuId(null);

    await supabase
      .from('tasks')
      .update({
        status: targetStatus,
        position: newPosition,
        last_moved_by: currentUser.name,
        history: mergedHistory
      })
      .eq('id', parseInt(taskId, 10));
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) executeMoveOperation(taskId, targetStatus);
  };

  const claimWorkSession = async (task: Task) => {
    if (!currentUser || task.activeSession) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const sessionPayload = {
      userId: currentUser.id,
      userName: currentUser.name,
      startedAt: new Date().toISOString(),
      lastCheckedInAt: new Date().toISOString()
    };

    const log: AuditLog = {
      movedBy: currentUser.name,
      fromStatus: task.status,
      toStatus: task.status,
      timestamp: new Date().toISOString(),
      notes: `${currentUser.name} started working on this task.`
    };

    await supabase
      .from('tasks')
      .update({ active_session: sessionPayload, history: [log, ...(task.history || [])] })
      .eq('id', parseInt(task.id, 10));
  };

  const pingCheckIn = async (task: Task) => {
    if (!currentUser || !task.activeSession || task.activeSession.userId !== currentUser.id) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const updatedSession = {
      ...task.activeSession,
      lastCheckedInAt: new Date().toISOString()
    };

    await supabase
      .from('tasks')
      .update({ active_session: updatedSession })
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

    const systemLog: AuditLog = {
      movedBy: currentUser.name,
      fromStatus: handoffTask.status,
      toStatus: handoffTask.status,
      timestamp: new Date().toISOString(),
      actionType: 'session_handover',
      notes: handoffNotes.trim() ? handoffNotes.trim() : 'Session released.'
    };

    await supabase
      .from('tasks')
      .update({ active_session: null, history: [systemLog, ...(handoffTask.history || [])] })
      .eq('id', parseInt(handoffTask.id, 10));

    setHandoffTask(null);
  };

  const toggleChecklistItem = async (task: Task, itemId: string) => {
    if (!currentUser || isSoftLocked(task)) return;

    const updatedChecklist = task.checklist.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          isCompleted: !item.isCompleted,
          updatedBy: currentUser.id,
          updatedByName: currentUser.name,
          updatedAt: new Date().toISOString()
        };
      }
      return item;
    });

    const supabase = getSupabase();
    if (!supabase) return;

    await supabase
      .from('tasks')
      .update({ checklist: updatedChecklist })
      .eq('id', parseInt(task.id, 10));
  };

  const saveNewTask = async () => {
    if (!newTitle.trim() || !currentUser) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const columnTasks = tasks.filter((t) => t.status === addTaskStatus);
    const position = columnTasks.length > 0 ? Math.max(...columnTasks.map((t) => t.position)) + 1000 : 1000;

    await supabase.from('tasks').insert([{
      title: newTitle,
      description: newDesc,
      status: addTaskStatus,
      position,
      created_by: currentUser.id,
      created_by_name: currentUser.name,
      edit_strategy: newEditStrategy,
      move_strategy: newMoveStrategy,
      permitted_editors: newEditStrategy === 'custom' ? newPermittedEditors : [],
      permitted_movers: newMoveStrategy === 'custom' ? newPermittedMovers : [],
      checklist: newChecklist,
      history: []
    }]);

    setIsAddingTask(false);
  };

  const saveEditedTask = async () => {
    if (!editingTask || !currentUser) return;
    const supabase = getSupabase();
    if (!supabase) return;

    await supabase
      .from('tasks')
      .update({
        title: editTitle,
        description: editDesc,
        edit_strategy: editEditStrategy,
        move_strategy: editMoveStrategy,
        permitted_editors: editEditStrategy === 'custom' ? editPermittedEditors : [],
        permitted_movers: editMoveStrategy === 'custom' ? editPermittedMovers : [],
        checklist: editChecklist
      })
      .eq('id', parseInt(editingTask.id, 10));

    setEditingTask(null);
  };

  const executeExportTaskFile = (task: Task) => {
    if (!currentUser || currentUser.role !== 'admin') return;

    let fileOutputString = `==================================================\n`;
    fileOutputString += `TASK ACTION LOG REPORT: ${task.title}\n`;
    fileOutputString += `==================================================\n`;
    task.history.forEach((log, idx) => {
      fileOutputString += `[${log.timestamp}] User: ${log.movedBy} | Action: ${log.actionType || 'Log'}\nNotes: ${log.notes || 'None'}\n\n`;
    });

    const blob = new Blob([fileOutputString], { type: 'text/plain;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = downloadUrl;
    downloadAnchor.download = `Log_Export_${task.id}.txt`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    setSavedTasks(prev => ({ ...prev, [task.id]: true }));
  };

  const executeCompleteTaskOnly = async (task: Task) => {
    if (!currentUser || !savedTasks[task.id]) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('tasks').delete().eq('id', parseInt(task.id, 10));
    if (!error) {
      setSavedTasks(prev => {
        const updated = { ...prev };
        delete updated[task.id];
        return updated;
      });
    }
  };

  const toggleSelectionUser = (userId: string, target: 'new-edit' | 'new-move' | 'edit-edit' | 'edit-move') => {
    if (target === 'new-edit') {
      setNewPermittedEditors(p => p.includes(userId) ? p.filter(id => id !== userId) : [...p, userId]);
    } else if (target === 'new-move') {
      setNewPermittedMovers(p => p.includes(userId) ? p.filter(id => id !== userId) : [...p, userId]);
    } else if (target === 'edit-edit') {
      setEditPermittedEditors(p => p.includes(userId) ? p.filter(id => id !== userId) : [...p, userId]);
    } else if (target === 'edit-move') {
      setEditPermittedMovers(p => p.includes(userId) ? p.filter(id => id !== userId) : [...p, userId]);
    }
  };

  const handleSelectUserIdentity = (user: Profile) => {
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('warroom_user_profile', JSON.stringify(user));
    }
  };

  const getRemainingTimeSeconds = (lastPingStr: string): number => {
    const diff = (new Date(lastPingStr).getTime() + 60000) - timeTicker;
    return diff <= 0 ? 0 : Math.ceil(diff / 1000);
  };

  if (!currentUser) {
    return (
      <div className="w-screen h-screen bg-zinc-950 flex items-center justify-center p-4 font-mono">
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center shadow-2xl">
          <h2 className="text-white text-sm font-bold uppercase tracking-wider mb-2">Select User Account Identity</h2>
          <p className="text-zinc-500 text-[11px] mb-5">Choose a testing operator role card profile to access the workspace board metrics.</p>
          <div className="space-y-2">
            {TEST_USERS.map((user) => (
              <button key={user.id} onClick={() => handleSelectUserIdentity(user)} className="w-full text-left px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:bg-zinc-800/80 transition-all flex items-center justify-between text-xs cursor-pointer group">
                <div>
                  <span className="font-bold text-zinc-200 group-hover:text-white">{user.name}</span>
                  <div className="text-[10px] text-zinc-500 capitalize">{user.role} Profile Strategy</div>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded font-bold border" style={{ borderColor: `${user.color}30`, backgroundColor: `${user.color}10`, color: user.color }}>{user.badge}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Find dynamic layout accent context colors for the add task popup panel header decoration line
  const activeColMeta = COLUMNS.find(c => c.id === addTaskStatus) || COLUMNS[0];

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} className="w-screen h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 lg:p-8 overflow-hidden font-sans relative flex flex-col">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 border-b border-zinc-900 pb-4 gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black tracking-wider text-white uppercase">Workspace Dashboard</h1>
            <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono font-bold">V1.0.8</span>
          </div>
          <p className="text-[11px] text-zinc-500 font-mono mt-0.5">Logged in as: <span className="text-zinc-300 font-bold">{currentUser.name} ({currentUser.role.toUpperCase()})</span></p>
        </div>
        <button onClick={() => setCurrentUser(null)} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white rounded self-start sm:self-auto cursor-pointer">Switch Account</button>
      </header>

      {/* Mobile Column Navigation bar tabs */}
      <div className="flex sm:hidden bg-zinc-900 p-1 border border-zinc-800 rounded-lg mb-4 shrink-0 font-mono text-[10px]">
        {COLUMNS.map(c => (
          <button key={c.id} onClick={() => setActiveMobileTab(c.id)} className={`flex-1 py-1.5 rounded uppercase font-bold text-center ${activeMobileTab === c.id ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>
            {c.title}
          </button>
        ))}
      </div>

      {/* Primary Kanban Columns Grid layout */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 overflow-hidden h-full">
        {COLUMNS.map((col) => {
          const filteredTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, col.id)} className={`bg-zinc-900/30 border ${col.border} rounded-xl p-4 flex flex-col h-full overflow-hidden ${activeMobileTab === col.id ? 'flex' : 'hidden sm:flex'}`}>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-900/50 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-3 ${col.accent} rounded-sm`} />
                  <h3 className="text-[11px] font-bold font-mono tracking-wider text-zinc-400 uppercase">{col.title} ({filteredTasks.length})</h3>
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
                }} className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-mono text-[10px] uppercase rounded cursor-pointer">
                  Add Task
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 minimal-scrollbar">
                {filteredTasks.length === 0 ? (
                  <div className="border border-dashed border-zinc-800/50 rounded-lg py-8 text-center text-zinc-600 font-mono text-[10px]">No tasks inside this column</div>
                ) : (
                  filteredTasks.map((task) => {
                    const softLocked = isSoftLocked(task);
                    const moveAllowed = canMoveTask(task);
                    const editAllowed = canEditTask(task);
                    const isWorker = task.activeSession?.userId === currentUser.id;
                    const strategy = STRATEGY_THEMES[task.editStrategy] || STRATEGY_THEMES.anyone;
                    const remSeconds = task.activeSession ? getRemainingTimeSeconds(task.activeSession.lastCheckedInAt) : 60;

                    return (
                      <div key={task.id} draggable={moveAllowed && !softLocked} onDragStart={(e) => handleDragStart(e, task)} className={`bg-zinc-900 border ${softLocked ? 'border-rose-900/40 opacity-70' : task.activeSession ? 'border-amber-500/50 shadow-lg shadow-amber-500/5' : 'border-zinc-800'} rounded-lg p-3 relative ${strategy.bgCard}`}>
                        {softLocked && (
                          <div className="absolute top-2 right-2 text-[9px] font-mono text-rose-400 bg-rose-950/40 border border-rose-900/50 px-1.5 py-0.5 rounded uppercase font-bold animate-pulse">Locked by {task.activeSession?.userName}</div>
                        )}

                        <div className="text-[9px] font-mono text-zinc-500 mb-1 flex justify-between">
                          <span>Created by: {task.createdByName}</span>
                          <span className={`uppercase font-bold text-[8px] px-1 bg-zinc-950 rounded ${strategy.text}`}>{task.editStrategy}</span>
                        </div>

                        <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-tight truncate">{task.title}</h4>
                        {task.description && <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-normal">{task.description}</p>}

                        {task.activeSession && (
                          <div className="mt-3 p-2 bg-zinc-950/60 border border-zinc-800/80 rounded font-mono text-[10px] flex items-center justify-between">
                            <span className="text-amber-400 font-bold truncate max-w-[90px]">Active: {task.activeSession.userName}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={remSeconds <= 20 ? 'text-rose-500 font-black animate-pulse' : 'text-zinc-400'}>Time left: {remSeconds}s</span>
                            </div>
                          </div>
                        )}

                        {task.checklist && task.checklist.length > 0 && (
                          <div className="mt-3 space-y-1 bg-zinc-950/30 p-1.5 rounded border border-zinc-900">
                            {task.checklist.map(item => (
                              <button key={item.id} onClick={() => toggleChecklistItem(task, item.id)} disabled={softLocked} className="w-full flex items-center gap-2 text-left text-[10px] font-mono text-zinc-400 hover:text-zinc-200">
                                <span className={`w-2.5 h-2.5 border rounded-sm flex items-center justify-center text-[7px] font-black ${item.isCompleted ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-zinc-800 bg-zinc-900'}`}>{item.isCompleted ? '✓' : ''}</span>
                                <span className={`truncate ${item.isCompleted ? 'line-through text-zinc-600' : ''}`}>{item.text}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 pt-2 border-t border-zinc-950 flex items-center justify-between gap-2 font-mono text-[10px]">
                          <div className="flex items-center gap-1">
                            {!task.activeSession ? (
                              <button onClick={() => claimWorkSession(task)} className="px-2 py-0.5 bg-zinc-950 hover:bg-zinc-800 text-amber-500 border border-zinc-800 rounded text-[9px] uppercase font-bold cursor-pointer">Claim Task</button>
                            ) : isWorker ? (
                              <>
                                <button onClick={() => pingCheckIn(task)} className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900/60 rounded text-[9px] font-black uppercase cursor-pointer animate-pulse">Ping Timer</button>
                                <button onClick={() => startReleaseHandoff(task)} className="px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded text-[9px] uppercase cursor-pointer">Release Task</button>
                              </>
                            ) : null}

                            {editAllowed && !softLocked && (
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
                              }} className="px-1.5 py-0.5 bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 rounded text-[9px] uppercase cursor-pointer">Edit</button>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {moveAllowed && !softLocked && (
                              <div className="relative">
                                <button onClick={() => setActiveMoveMenuId(activeMoveMenuId === task.id ? null : task.id)} className="px-1.5 py-0.5 bg-zinc-950 border border-zinc-800 text-zinc-300 rounded text-[9px] font-bold cursor-pointer uppercase">Move Column</button>
                                {activeMoveMenuId === task.id && (
                                  <div className="absolute right-0 bottom-full mb-1 w-28 bg-zinc-900 border border-zinc-800 rounded shadow-xl z-50 py-1 text-[9px]">
                                    {COLUMNS.map(c => (
                                      <button key={c.id} disabled={task.status === c.id} onClick={() => executeMoveOperation(task.id, c.id)} className={`w-full px-2 py-1 text-left uppercase font-bold ${task.status === c.id ? 'text-zinc-600 bg-zinc-950/40 cursor-not-allowed' : 'text-zinc-300 hover:bg-zinc-800'}`}>to {c.id === 'todo' ? 'To Do' : c.id === 'in-progress' ? 'In Progress' : 'Done'}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {currentUser.role === 'admin' && (
                              <div className="flex items-center gap-1 bg-zinc-950/40 p-0.5 border border-zinc-800 rounded">
                                <button onClick={() => setActiveHistoryTask(task)} className="px-1 py-0.5 bg-zinc-900 hover:bg-zinc-800 rounded text-[9px] text-zinc-400 hover:text-white cursor-pointer">View Logs</button>
                                <button onClick={() => executeExportTaskFile(task)} className="px-1 py-0.5 bg-zinc-900 hover:bg-zinc-800 rounded text-[9px] text-zinc-400 hover:text-white cursor-pointer">Save File</button>
                                {savedTasks[task.id] && task.status === 'done' && (
                                  <button onClick={() => executeCompleteTaskOnly(task)} className="px-1 py-0.5 bg-emerald-950 text-emerald-400 hover:bg-emerald-900 rounded text-[9px] font-bold cursor-pointer">Delete Task</button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- RE-STYLED ADD TASK ACTION MODAL LAYOUT --- */}
      {isAddingTask && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 font-mono">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto minimal-scrollbar">
            
            {/* Header section decorated dynamically with the targeted column accent lines */}
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-800/80">
              <span className={`w-1.5 h-3.5 ${activeColMeta.accent} rounded-sm`} />
              <h3 className="text-[11px] font-bold text-white uppercase tracking-wider">New Task &rarr; {activeColMeta.title}</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Title</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task summary..." className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 outline-none placeholder:text-zinc-700" />
              </div>
              <div>
                <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Description</label>
                <textarea rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Task details..." className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 outline-none resize-none placeholder:text-zinc-700" />
              </div>

              {/* Grid block grouping the editing and movement configuration rules safely */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Editing Access</label>
                  <select value={newEditStrategy} onChange={(e) => setNewEditStrategy(e.target.value as AccessStrategy)} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300 outline-none uppercase font-bold text-[10px]">
                    <option value="anyone">Anyone</option>
                    <option value="just-me">Just Me</option>
                    <option value="custom">Custom Whitelist</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Moving Access</label>
                  <select value={newMoveStrategy} onChange={(e) => setNewMoveStrategy(e.target.value as AccessStrategy)} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300 outline-none uppercase font-bold text-[10px]">
                    <option value="anyone">Anyone</option>
                    <option value="just-me">Just Me</option>
                    <option value="custom">Custom Whitelist</option>
                  </select>
                </div>
              </div>

              {/* Whitelist selection filters for Edit strategies */}
              {newEditStrategy === 'custom' && (
                <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded animate-fadeIn">
                  <label className="block text-zinc-500 uppercase font-bold text-[8px] mb-1.5 tracking-wider">Permitted Editors Whitelist</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEST_USERS.map(u => (
                      <button key={u.id} type="button" onClick={() => toggleSelectionUser(u.id, 'new-edit')} className={`px-2 py-1 border rounded text-[9px] font-bold transition-all ${newPermittedEditors.includes(u.id) ? 'bg-blue-950/40 text-blue-400 border-blue-800' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'}`}>{u.name}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Whitelist selection filters for Move strategies */}
              {newMoveStrategy === 'custom' && (
                <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded animate-fadeIn">
                  <label className="block text-zinc-500 uppercase font-bold text-[8px] mb-1.5 tracking-wider">Permitted Movers Whitelist</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEST_USERS.map(u => (
                      <button key={u.id} type="button" onClick={() => toggleSelectionUser(u.id, 'new-move')} className={`px-2 py-1 border rounded text-[9px] font-bold transition-all ${newPermittedMovers.includes(u.id) ? 'bg-amber-950/40 text-amber-400 border-amber-800' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'}`}>{u.name}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist Builder Block Section */}
              <div>
                <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Checklist Items ({newChecklist.length})</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={creationChecklistInput} onChange={(e) => setCreationChecklistInput(e.target.value)} onKeyDown={(e) => {
                    if (e.key === 'Enter' && creationChecklistInput.trim()) {
                      e.preventDefault();
                      setNewChecklist([...newChecklist, { id: Math.random().toString(), text: creationChecklistInput.trim(), isCompleted: false }]);
                      setCreationChecklistInput('');
                    }
                  }} placeholder="Add checklist target entry..." className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-200 outline-none placeholder:text-zinc-700" />
                  <button type="button" onClick={() => {
                    if (!creationChecklistInput.trim()) return;
                    setNewChecklist([...newChecklist, { id: Math.random().toString(), text: creationChecklistInput.trim(), isCompleted: false }]);
                    setCreationChecklistInput('');
                  }} className="px-3 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] uppercase font-bold">&bull;&bull;&bull;</button>
                </div>

                {newChecklist.length > 0 && (
                  <div className="max-h-24 overflow-y-auto space-y-1 bg-zinc-950/40 p-2 border border-zinc-800 rounded">
                    {newChecklist.map((item, idx) => (
                      <div key={item.id} className="flex items-center justify-between text-[10px] text-zinc-400 font-mono bg-zinc-900/50 px-2 py-1 rounded border border-zinc-950">
                        <span className="truncate pr-2">{idx + 1}. {item.text}</span>
                        <button type="button" onClick={() => setNewChecklist(newChecklist.filter(i => i.id !== item.id))} className="text-zinc-600 hover:text-rose-400 font-bold px-1">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal action button footers layout links */}
            <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-zinc-800/80">
              <button onClick={() => setIsAddingTask(false)} className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded font-bold text-[10px] uppercase cursor-pointer">Cancel</button>
              <button onClick={saveNewTask} disabled={!newTitle.trim()} className={`px-4 py-1.5 rounded font-bold text-[10px] uppercase border transition-all ${newTitle.trim() ? 'bg-zinc-100 text-zinc-950 hover:bg-white border-white cursor-pointer' : 'bg-zinc-800 text-zinc-600 border-zinc-800 cursor-not-allowed'}`}>Save Task</button>
            </div>

          </div>
        </div>
      )}

      {/* --- EDIT TASK DRAWER MODAL WINDOW --- */}
      {editingTask && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto minimal-scrollbar">
            <h3 className="text-[11px] font-bold text-white uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">Modify Task Settings</h3>
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Task Title</label>
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 outline-none" />
              </div>
              <div>
                <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Task Description</label>
                <textarea rows={2} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 outline-none resize-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Edit Strategy Rule</label>
                  <select value={editEditStrategy} onChange={(e) => setEditEditStrategy(e.target.value as AccessStrategy)} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300 outline-none uppercase font-bold text-[10px]">
                    <option value="anyone">Anyone</option>
                    <option value="just-me">Just Me</option>
                    <option value="custom">Custom Whitelist</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Move Strategy Rule</label>
                  <select value={editMoveStrategy} onChange={(e) => setEditMoveStrategy(e.target.value as AccessStrategy)} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300 outline-none uppercase font-bold text-[10px]">
                    <option value="anyone">Anyone</option>
                    <option value="just-me">Just Me</option>
                    <option value="custom">Custom Whitelist</option>
                  </select>
                </div>
              </div>

              {editEditStrategy === 'custom' && (
                <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                  <label className="block text-zinc-500 uppercase font-bold text-[8px] mb-1">Permitted Editors Whitelist</label>
                  <div className="flex flex-wrap gap-1">
                    {TEST_USERS.map(u => (
                      <button key={u.id} type="button" onClick={() => toggleSelectionUser(u.id, 'edit-edit')} className={`px-2 py-0.5 border rounded text-[9px] ${editPermittedEditors.includes(u.id) ? 'bg-blue-950 text-blue-400 border-blue-900' : 'bg-zinc-900 text-zinc-500 border-zinc-800'}`}>{u.name}</button>
                    ))}
                  </div>
                </div>
              )}

              {editMoveStrategy === 'custom' && (
                <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                  <label className="block text-zinc-500 uppercase font-bold text-[8px] mb-1">Permitted Movers Whitelist</label>
                  <div className="flex flex-wrap gap-1">
                    {TEST_USERS.map(u => (
                      <button key={u.id} type="button" onClick={() => toggleSelectionUser(u.id, 'edit-move')} className={`px-2 py-0.5 border rounded text-[9px] ${editPermittedMovers.includes(u.id) ? 'bg-amber-950 text-amber-400 border-amber-900' : 'bg-zinc-900 text-zinc-500 border-zinc-800'}`}>{u.name}</button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-zinc-500 uppercase font-bold text-[9px] mb-1">Task Checklist Node Entries</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={newChecklistItemText} onChange={(e) => setNewChecklistItemText(e.target.value)} placeholder="Append checklist criteria line..." className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 outline-none" />
                  <button type="button" onClick={() => {
                    if (!newChecklistItemText.trim()) return;
                    setEditChecklist([...editChecklist, { id: Math.random().toString(), text: newChecklistItemText.trim(), isCompleted: false }]);
                    setNewChecklistItemText('');
                  }} className="px-2 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] uppercase font-bold">Add</button>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {editChecklist.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-[10px] bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                      <span className={item.isCompleted ? 'line-through text-zinc-600' : 'text-zinc-300'}>{item.text}</span>
                      <button type="button" onClick={() => setEditChecklist(editChecklist.filter(i => i.id !== item.id))} className="text-rose-400 hover:text-rose-300 font-bold px-1">&times;</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 pt-2 border-t border-zinc-800">
              <button onClick={() => setEditingTask(null)} className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded text-[10px] uppercase cursor-pointer">Close</button>
              <button onClick={saveEditedTask} className="px-4 py-1.5 bg-zinc-100 text-zinc-950 hover:bg-white rounded font-bold text-[10px] uppercase cursor-pointer">Apply Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* --- HANDOFF RELEASE FLOW DIALOG WINDOW --- */}
      {handoffTask && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl">
            <h3 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">Release Workspace Token</h3>
            <p className="text-zinc-500 text-[10px] mb-4">Provide clear handover summary parameters before abandoning the active testing operations cycle context.</p>
            <div className="space-y-3">
              <textarea rows={3} value={handoffNotes} onChange={(e) => setHandoffNotes(e.target.value)} placeholder="Provide optional notes..." className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 text-xs outline-none resize-none" />
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setHandoffTask(null)} className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white rounded text-[9px] uppercase cursor-pointer">Cancel</button>
                <button onClick={commitReleaseHandoff} className="px-3 py-1.5 bg-amber-500 text-zinc-950 font-bold hover:bg-amber-400 rounded text-[9px] uppercase cursor-pointer">Confirm Release</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- AUDITING TRANSACTION HISTORY LOG MODAL WINDOW --- */}
      {activeHistoryTask && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <h3 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2 shrink-0">Security Audit Transaction History Ledger</h3>
            <p className="text-zinc-500 text-[10px] mb-4 shrink-0">Historic ledger trace logs for task reference: <span className="text-zinc-300 font-bold">{activeHistoryTask.title}</span></p>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 minimal-scrollbar">
              {(!activeHistoryTask.history || activeHistoryTask.history.length === 0) ? (
                <div className="text-center py-6 text-zinc-600 text-[10px]">No historic entries located within database memory ledger store</div>
              ) : (
                activeHistoryTask.history.map((log, idx) => (
                  <div key={idx} className="p-2 bg-zinc-950 rounded border border-zinc-800 text-[10px]">
                    <div className="flex justify-between text-zinc-500 font-bold text-[9px] mb-1">
                      <span>Operator: {log.movedBy}</span>
                      <span>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Unknown Time'}</span>
                    </div>
                    {log.actionType && <div className="text-blue-400 font-bold text-[9px] uppercase mb-0.5">Action: {log.actionType}</div>}
                    <p className="text-zinc-400 font-mono leading-relaxed">{log.notes || 'No contextual telemetry notes appended to this action row.'}</p>
                  </div>
                ))
              )}
            </div>
            
            <button onClick={() => setActiveHistoryTask(null)} className="mt-4 w-full py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded text-[10px] uppercase font-bold cursor-pointer shrink-0">Dismiss View Ledger</button>
          </div>
        </div>
      )}

      {/* Dynamic Cursor Telemetry presence map tracker overlay layout */}
      {mounted && Object.values(presences).map((p) => {
        if (!p || p.id === currentUser.id) return null;
        return (
          <div key={p.id} className="absolute pointer-events-none transition-all duration-75 z-50 text-[9px] font-mono font-bold uppercase tracking-tighter shadow-lg rounded px-1.5 py-0.5 text-white" style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: p.color }}>
            &bull; {p.name}
          </div>
        );
      })}

    </div>
  );
}