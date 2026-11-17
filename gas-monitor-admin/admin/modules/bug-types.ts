/** Shapes returned by /api/admin/bugs (beta-tester bug reports). */

export type BugStatus = 'NEW' | 'NEEDS_INFO' | 'CONFIRMED' | 'IN_PROGRESS' | 'FIXED' | 'VERIFIED' | 'WONT_FIX' | 'DUPLICATE';
export type BugSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface BugRow {
  id: string;
  number: number;
  title: string;
  area: string;
  screen: string | null;
  severity: BugSeverity;
  frequency: 'ALWAYS' | 'SOMETIMES' | 'ONCE';
  status: BugStatus;
  testerName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  fixedInBuild: string | null;
  appVersion: string | null;
  commentCount: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BugDetail {
  bug: Omit<BugRow, 'testerName' | 'commentCount' | 'attachmentCount'> & {
    steps: string;
    expected: string;
    actual: string;
    deviceModel: string | null;
    androidVersion: string | null;
    network: string | null;
    accountEmail: string | null;
    duplicateOfNumber: number | null;
    resolvedAt: string | null;
  };
  tester: { id: string; name: string; email: string; isActive: boolean } | null;
  attachments: { id: string; fileName: string; contentType: string; size: number; url: string | null }[];
  comments: { id: string; author: 'TESTER' | 'ADMIN'; authorName: string; body: string; internal: boolean; createdAt: string }[];
}

export interface BugSummary {
  new: number;
  criticalOpen: number;
  unassigned: number;
  awaitingRetest: number;
  needsInfo: number;
  assignedToMe: number;
  activeTesters: number;
}

export interface TesterRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  invitedByName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  reportCount: number;
}
