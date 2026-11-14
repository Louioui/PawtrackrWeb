import { NextRequest } from 'next/server';
import { appendWorkflowEvent, noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { validateRetailBarcode } from '@/lib/barcode-scanner';
import { fromCents, toCents } from '@/lib/pos-math';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Retail inventory catalog');
  if (!auth.ok) return auth.response;

  const businessId = auth.ctx.membership.business_id;
  const barcode = req.nextUrl.searchParams.get('barcode')?.trim() || '';
  const sku = req.nextUrl.searchParams.get('sku')?.trim() || '';

  let query = auth.ctx.supabase
    .from('retail_inventory')
    .select('id, business_id, sku, barcode, product_name, category, unit_price, stock_quantity, reorder_threshold, is_active, updated_at')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('product_name', { ascending: true })
    .limit(200);

  if (barcode) {
    query = query.eq('barcode', barcode);
  } else if (sku) {
    query = query.eq('sku', sku.toUpperCase());
  }

  const { data, error } = await query;
  if (error) {
    return noStoreJson({ error: error.message || 'Retail inventory could not be loaded.' }, 502);
  }

  const items = (data || []).map((item) => {
    const unitPriceDollars = Number(item.unit_price || 0);
    const unitPriceCents = toCents(unitPriceDollars);
    const stockQty = Number(item.stock_quantity || 0);
    const threshold = Number(item.reorder_threshold || 5);
    return {
      ...item,
      unit_price: fromCents(unitPriceCents),
      unit_price_cents: unitPriceCents,
      stock_quantity: stockQty,
      reorder_threshold: threshold,
      low_stock_alert: stockQty <= threshold,
    };
  });

  return noStoreJson(
    {
      ok: true,
      business_id: businessId,
      items,
    },
    200
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Retail inventory mutation', [
    'owner',
    'manager',
    'front_desk',
  ]);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : 'deduct';
  const businessId = auth.ctx.membership.business_id;

  if (action === 'deduct') {
    const barcodeOrSku = typeof body.barcodeOrSku === 'string' ? body.barcodeOrSku.trim() : '';
    const quantity = Number(body.quantity ?? 1);
    if (!barcodeOrSku || !Number.isInteger(quantity) || quantity <= 0 || quantity > 500) {
      return noStoreJson({ error: 'Valid barcodeOrSku and positive integer quantity (1..500) are required.' }, 400);
    }

    const { data, error } = await auth.ctx.supabase.rpc('deduct_retail_inventory_atomic', {
      p_business_id: businessId,
      p_sku_or_barcode: barcodeOrSku,
      p_quantity: quantity,
    });

    if (error) {
      if (error.code === 'P0075' || error.message?.includes('PW075')) {
        return noStoreJson({ error: error.message || 'SKU or barcode not found.', code: 'PW075' }, 404);
      }
      if (error.code === 'P0076' || error.message?.includes('PW076')) {
        return noStoreJson({ error: error.message || 'Insufficient retail stock available.', code: 'PW076' }, 409);
      }
      return noStoreJson({ error: error.message || 'Atomic inventory deduction failed.' }, 502);
    }

    return noStoreJson({ ok: true, deduction: data }, 200);
  }

  if (action === 'upsert') {
    if (auth.ctx.membership.role !== 'owner' && auth.ctx.membership.role !== 'manager') {
      return noStoreJson({ error: 'Creating or restocking retail SKUs requires owner or manager role.' }, 403);
    }

    const sku = typeof body.sku === 'string' ? body.sku.trim().toUpperCase().slice(0, 64) : '';
    const productName = typeof body.product_name === 'string' ? body.product_name.trim().slice(0, 140) : '';
    const category = typeof body.category === 'string' ? body.category.trim().slice(0, 64) : 'Coat Care';
    const rawBarcode = typeof body.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : null;
    const unitPriceDollars = Number(body.unit_price ?? 0);
    const stockQuantity = Number(body.stock_quantity ?? 0);
    const reorderThreshold = Number(body.reorder_threshold ?? 5);

    if (!sku || !productName) {
      return noStoreJson({ error: 'SKU and product_name are required.' }, 400);
    }
    if (!Number.isFinite(unitPriceDollars) || unitPriceDollars < 0 || unitPriceDollars > 5000) {
      return noStoreJson({ error: 'unit_price must be between $0.00 and $5,000.00.' }, 400);
    }
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100_000) {
      return noStoreJson({ error: 'stock_quantity must be a non-negative integer.' }, 400);
    }
    if (!Number.isInteger(reorderThreshold) || reorderThreshold < 0 || reorderThreshold > 10_000) {
      return noStoreJson({ error: 'reorder_threshold must be a non-negative integer.' }, 400);
    }

    let normalizedBarcode: string | null = null;
    if (rawBarcode) {
      const checked = validateRetailBarcode(rawBarcode);
      if (!checked.valid) {
        return noStoreJson({ error: checked.error || 'Invalid retail barcode.' }, 400);
      }
      normalizedBarcode = checked.normalized;
    }

    const unitPriceCents = toCents(unitPriceDollars);

    const { data: item, error } = await auth.ctx.supabase
      .from('retail_inventory')
      .upsert(
        {
          business_id: businessId,
          sku,
          barcode: normalizedBarcode,
          product_name: productName,
          category,
          unit_price: fromCents(unitPriceCents),
          stock_quantity: stockQuantity,
          reorder_threshold: reorderThreshold,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,sku' }
      )
      .select('*')
      .single();

    if (error || !item) {
      return noStoreJson({ error: error?.message || 'Could not upsert retail SKU.' }, 502);
    }

    await appendWorkflowEvent(auth.ctx, {
      workflow_id: 'WF37',
      event_type: 'inventory.sku_upserted',
      source_record_type: 'retail_inventory',
      source_record_id: item.id,
      metadata: {
        sku,
        barcode: normalizedBarcode,
        unit_price_cents: unitPriceCents,
        stock_quantity: stockQuantity,
      },
    });

    return noStoreJson({ ok: true, item }, 201);
  }

  return noStoreJson({ error: 'Unsupported inventory action.' }, 400);
}
