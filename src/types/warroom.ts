// ============================================================================
// FILE LOCATION REFERENCE: src/types/warroom.ts
// ============================================================================

export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type AccessStrategy = 'anyone' | 'just-me' | 'custom';
export type UserRole = 'admin' | 'developer' | 'guest'; // Added 'guest' role for the bottom level

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