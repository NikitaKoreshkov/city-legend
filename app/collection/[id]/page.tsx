import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ensureDatabase } from '@/lib/db';
import { getAuctionDetailPayload, serializeAuctionDetailPayload } from '@/lib/auctionDetailPayload';
import {
  buildLotBreadcrumbJsonLd,
  buildLotPageMetadata,
  buildLotProductJsonLd,
  lotMetadataFallback,
} from '@/lib/seo/lotMetadata';
import AuctionDetailClient from './AuctionDetailClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: raw } = await params;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) {
    return lotMetadataFallback();
  }
  try {
    await ensureDatabase();
    const payload = await getAuctionDetailPayload(id);
    if (!payload) {
      return lotMetadataFallback();
    }
    return buildLotPageMetadata(id, payload);
  } catch {
    return lotMetadataFallback();
  }
}

export default async function AuctionPage({ params }: PageProps) {
  const { id: raw } = await params;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) {
    notFound();
  }

  await ensureDatabase();
  const payload = await getAuctionDetailPayload(id);
  if (!payload) {
    notFound();
  }

  const initialPayload = serializeAuctionDetailPayload(payload);
  const productLd = buildLotProductJsonLd(id, payload);
  const breadcrumbLd = buildLotBreadcrumbJsonLd(id, payload);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <AuctionDetailClient
        key={id}
        initialPayload={initialPayload}
      />
    </>
  );
}
