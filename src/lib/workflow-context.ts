// ============================================================================
// PAWTRACKR CROSS-WORKFLOW CONTEXT & SIX-ROLE PERMISSION MATRIX (WF00 / WF40)
// ============================================================================

export type LiveStaffRole =
  | 'owner'
  | 'manager'
  | 'front_desk'
  | 'senior_groomer'
  | 'groomer'
  | 'bather';

export type OperatingModel = 'salon' | 'mobile_van' | 'hybrid';
export type SalonBookingStatus = 'draft' | 'published' | 'paused';

export type CapabilityStatus =
  | 'ready'
  | 'partly_ready'
  | 'not_connected'
  | 'preview_only';

export type WorkflowContext = {
  salonId: string;
  role: LiveStaffRole;
  date?: string;
  sourceRecordType: string;
  sourceRecordId: string;
  sourceVersion: number;
  workflowId: string;
  returnPath: string;
  filters: Record<string, string>;
};

export const LIVE_STAFF_ROLES: readonly LiveStaffRole[] = [
  'owner',
  'manager',
  'front_desk',
  'senior_groomer',
  'groomer',
  'bather',
];

export function isLiveStaffRole(value: unknown): value is LiveStaffRole {
  return typeof value === 'string' && (LIVE_STAFF_ROLES as readonly string[]).includes(value);
}

export function formatStaffRoleLabel(role: LiveStaffRole | string): string {
  switch (role) {
    case 'owner': return 'Owner';
    case 'manager': return 'Manager';
    case 'front_desk': return 'Front desk';
    case 'senior_groomer': return 'Senior groomer';
    case 'groomer': return 'Groomer';
    case 'bather': return 'Bather';
    default: return role;
  }
}

export function canConfigureSalon(role: LiveStaffRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canPublishSalon(role: LiveStaffRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canApproveOwnerFinancials(role: LiveStaffRole): boolean {
  return role === 'owner';
}

export function canManageFrontDeskVisits(role: LiveStaffRole): boolean {
  return role === 'owner' || role === 'manager' || role === 'front_desk';
}

export function isBookableGroomerRole(role: LiveStaffRole | string): boolean {
  return role === 'groomer' || role === 'senior_groomer';
}

export function canHandleHighRiskPet(role: LiveStaffRole): boolean {
  // Bathers and front desk staff must never be assigned high-risk ('biter') pets (WF04/WF09).
  return role === 'owner' || role === 'manager' || role === 'senior_groomer' || role === 'groomer';
}

const safeInternalPath = (value: unknown): string => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 300) {
    return '/dashboard/settings/live';
  }
  return value;
};

export function serializeWorkflowContextParams(ctx: Partial<WorkflowContext>): string {
  const params = new URLSearchParams();
  if (ctx.salonId) params.set('salon', ctx.salonId);
  if (ctx.role) params.set('role', ctx.role);
  if (ctx.date && /^\d{4}-\d\d-\d\d$/.test(ctx.date)) params.set('date', ctx.date);
  if (ctx.sourceRecordType) params.set('src_type', ctx.sourceRecordType);
  if (ctx.sourceRecordId) params.set('src_id', ctx.sourceRecordId);
  if (typeof ctx.sourceVersion === 'number' && Number.isInteger(ctx.sourceVersion) && ctx.sourceVersion >= 1) {
    params.set('src_v', String(ctx.sourceVersion));
  }
  if (ctx.workflowId) params.set('wf', ctx.workflowId);
  if (ctx.returnPath) params.set('return_to', safeInternalPath(ctx.returnPath));
  if (ctx.filters) {
    for (const [k, v] of Object.entries(ctx.filters)) {
      if (/^[a-z0-9_]{1,32}$/.test(k) && typeof v === 'string' && v.length <= 80) {
        params.set(`f_${k}`, v);
      }
    }
  }
  return params.toString();
}

export function parseWorkflowContextParams(search: URLSearchParams): Partial<WorkflowContext> {
  const filters: Record<string, string> = {};
  for (const [key, value] of search.entries()) {
    if (key.startsWith('f_') && key.length > 2 && value.length <= 80) {
      filters[key.slice(2)] = value;
    }
  }
  const rawRole = search.get('role');
  const rawVersion = Number(search.get('src_v'));
  const rawDate = search.get('date');
  const rawReturn = search.get('return_to');
  return {
    ...(search.get('salon') ? { salonId: search.get('salon')! } : {}),
    ...(isLiveStaffRole(rawRole) ? { role: rawRole } : {}),
    ...(rawDate && /^\d{4}-\d\d-\d\d$/.test(rawDate) ? { date: rawDate } : {}),
    ...(search.get('src_type') ? { sourceRecordType: search.get('src_type')! } : {}),
    ...(search.get('src_id') ? { sourceRecordId: search.get('src_id')! } : {}),
    ...(Number.isInteger(rawVersion) && rawVersion >= 1 ? { sourceVersion: rawVersion } : {}),
    ...(search.get('wf') ? { workflowId: search.get('wf')! } : {}),
    ...(rawReturn ? { returnPath: safeInternalPath(rawReturn) } : {}),
    filters,
  };
}
