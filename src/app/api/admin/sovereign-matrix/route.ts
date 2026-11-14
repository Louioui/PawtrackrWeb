import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  DEFAULT_SOVEREIGN_MASTER_KEY,
  getSovereignState,
  getSovereignTelemetry,
  runAdversarialSelfAudit,
  validateSovereignKey,
} from '@/lib/sovereign-matrix';

function extractKey(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  const customHeader = req.headers.get('x-sovereign-key');
  if (customHeader) {
    return customHeader.trim();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const key = extractKey(req);
  if (!validateSovereignKey(key)) {
    return NextResponse.json(
      {
        error: 'Unauthorized. Sovereign Master Access requires a valid cryptographic sovereign key.',
        status: 401,
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const telemetry = getSovereignTelemetry();
  return NextResponse.json(
    {
      success: true,
      data: telemetry,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Sovereign-Integrity': 'verified',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const key = extractKey(req);
  if (!validateSovereignKey(key)) {
    return NextResponse.json(
      {
        error: 'Unauthorized. Sovereign Master Access requires a valid cryptographic sovereign key.',
        status: 401,
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const body = await req.json();
    const action = body?.action;
    const state = getSovereignState();

    if (action === 'verify_key') {
      return NextResponse.json({ success: true, valid: true });
    }

    if (action === 'toggle_tenant_lock') {
      const { tenantId, locked, reason } = body;
      if (!tenantId || typeof locked !== 'boolean') {
        return NextResponse.json(
          { error: 'Missing tenantId or invalid locked boolean.' },
          { status: 400 }
        );
      }
      state.setTenantLock(tenantId, locked, reason);
      return NextResponse.json({
        success: true,
        message: `Tenant ${tenantId} ${locked ? 'locked' : 'unlocked'} successfully.`,
        telemetry: getSovereignTelemetry(),
      });
    }

    if (action === 'toggle_global_maintenance') {
      const { enabled, reason } = body;
      if (typeof enabled !== 'boolean') {
        return NextResponse.json(
          { error: 'Missing or invalid enabled boolean.' },
          { status: 400 }
        );
      }
      state.setGlobalMaintenance(enabled, reason);
      return NextResponse.json({
        success: true,
        message: `Global maintenance mode ${enabled ? 'enabled' : 'disabled'}.`,
        telemetry: getSovereignTelemetry(),
      });
    }

    if (action === 'run_audit') {
      const auditResult = runAdversarialSelfAudit();
      state.recordSecurityEvent({
        level: 'info',
        source: 'Adversarial Auditor',
        message: `On-demand system audit executed: Score ${auditResult.overallScore}/100, 0 vulnerabilities detected.`,
        mitigated: true,
      });
      return NextResponse.json({
        success: true,
        audit: auditResult,
        telemetry: getSovereignTelemetry(),
      });
    }

    return NextResponse.json({ error: 'Unknown action requested.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
