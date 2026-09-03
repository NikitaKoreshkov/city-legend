import { NextResponse } from 'next/server';
import {
  cdekFlatDeliveryRub,
  isCdekApiConfigured,
  isCdekDeliveryEnabled,
} from '@/lib/cdekConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  const enabled = isCdekDeliveryEnabled();
  return NextResponse.json({
    cdekEnabled: enabled,
    cdekApiAvailable: enabled && isCdekApiConfigured(),
    flatDeliveryRub: enabled ? cdekFlatDeliveryRub() : 0,
    countryIso: 'RU',
  });
}
