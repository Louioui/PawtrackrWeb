import { NextRequest, NextResponse } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { formatScopedCsv, formatTenantArchiveJson } from '@/lib/live-import-export';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Tenant export', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
  const scope = url.searchParams.get('scope') || 'full';
  const businessId = auth.ctx.membership.business_id;

  // Log export in export_jobs
  await auth.ctx.supabase.from('export_jobs').insert({
    business_id: businessId,
    export_type: format === 'json' ? 'full_tenant_archive' : (scope === 'clients' ? 'clients_pets' : 'appointments'),
    status: 'completed',
    file_format: format,
    record_count: 0,
    metadata: { scope, format },
  });

  // Log audit event (WF34)
  await auth.ctx.supabase.from('workflow_events').insert({
    business_id: businessId,
    workflow_id: 'WF34',
    event_type: 'export.generated',
    source_record_type: 'export_jobs',
    source_record_id: businessId,
    source_version: 1,
    actor_user_id: auth.ctx.user.id,
    actor_role: auth.ctx.membership.role,
    previous_state: null,
    new_state: 'completed',
    reason: `Tenant data export generated (${format.toUpperCase()}, scope: ${scope})`,
    metadata: { scope, format },
  });

  const nowStr = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    if (scope === 'clients') {
      const { data: clients } = await auth.ctx.supabase
        .from('clients')
        .select('id, name, phone, email, address, notes, created_at')
        .order('name', { ascending: true });

      const headers = ['id', 'name', 'phone', 'email', 'address', 'notes', 'created_at'];
      const csvContent = formatScopedCsv(headers, (clients || []) as Record<string, unknown>[]);
      const filename = `pawtrackr-clients-${nowStr}.csv`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // Default to appointments/visits CSV
    const { data: visits } = await auth.ctx.supabase
      .from('visits')
      .select('id, scheduled_time, duration_minutes, service_package, total_amount, status, curbside_status, curbside_address, client:clients(name, phone), pet:pets(name, breed)')
      .order('scheduled_time', { ascending: false });

    const flattened = (visits || []).map((v: Record<string, unknown>) => {
      const c = (v.client as Record<string, unknown>) || {};
      const p = (v.pet as Record<string, unknown>) || {};
      return {
        visit_id: v.id,
        scheduled_time: v.scheduled_time,
        client_name: c.name || '',
        client_phone: c.phone || '',
        pet_name: p.name || '',
        pet_breed: p.breed || '',
        service_package: v.service_package,
        total_amount: v.total_amount,
        status: v.status,
        curbside_status: v.curbside_status,
        curbside_address: v.curbside_address || '',
      };
    });

    const headers = ['visit_id', 'scheduled_time', 'client_name', 'client_phone', 'pet_name', 'pet_breed', 'service_package', 'total_amount', 'status', 'curbside_status', 'curbside_address'];
    const csvContent = formatScopedCsv(headers, flattened as Record<string, unknown>[]);
    const filename = `pawtrackr-visits-${nowStr}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Full JSON Tenant Archive
  const [bRes, sRes, cRes, pRes, vRes, tRes] = await Promise.all([
    auth.ctx.supabase.from('businesses').select('*').limit(1).single(),
    auth.ctx.supabase.from('staff_members').select('id, name, email, role, is_active, created_at'),
    auth.ctx.supabase.from('clients').select('*'),
    auth.ctx.supabase.from('pets').select('*'),
    auth.ctx.supabase.from('visits').select('*'),
    auth.ctx.supabase.from('transactions').select('*'),
  ]);

  const jsonArchive = formatTenantArchiveJson({
    business: bRes.data || {},
    staff: sRes.data || [],
    clients: cRes.data || [],
    pets: pRes.data || [],
    visits: vRes.data || [],
    transactions: tRes.data || [],
    exportedAt: new Date().toISOString(),
    exportVersion: '2026.1',
  });

  const filename = `pawtrackr-tenant-archive-${nowStr}.json`;

  return new NextResponse(jsonArchive, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
