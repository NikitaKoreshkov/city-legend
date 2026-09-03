import { Metadata } from 'next';
import pool from '@/lib/db';
import { DEFAULT_LOGO_URL } from '@/lib/siteShellDefaults';
import WishPageClient from './WishPageClient';

type Props = { params: Promise<{ token: string }> };

async function getWish(token: string) {
  try {
    const res = await pool.query<{
      token: string;
      auction_id: number;
      name: string;
      starting_price: string;
      compare_at_price: string | null;
      images: string[];
      additional_info: string | null;
      category: string | null;
    }>(`
      SELECT wl.token, wl.auction_id, wl.created_at,
             a.name, a.starting_price, a.compare_at_price, a.images,
             a.additional_info, a.category
      FROM wish_links wl
      JOIN auctions a ON a.id = wl.auction_id
      WHERE wl.token = $1
    `, [token]);
    return res.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const wish = await getWish(token);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://citylegend.art';

  if (!wish) {
    return { title: 'Желание не найдено — City Legend' };
  }

  const image = wish.images?.[0] ?? `${baseUrl}${DEFAULT_LOGO_URL}`;
  const description = `Мне очень нравится "${wish.name}" из коллекции City Legend — я хочу это в подарок 🎁`;

  return {
    title: `${wish.name} — подарочный выбор | City Legend`,
    description,
    openGraph: {
      title: `🎁 ${wish.name}`,
      description,
      images: [{ url: image.startsWith('http') ? image : `${baseUrl}${image}`, width: 800, height: 800 }],
      type: 'website',
      siteName: 'City Legend',
    },
    twitter: {
      card: 'summary_large_image',
      title: `🎁 ${wish.name}`,
      description,
      images: [image.startsWith('http') ? image : `${baseUrl}${image}`],
    },
  };
}

export default async function WishPage({ params }: Props) {
  const { token } = await params;
  const wish = await getWish(token);
  return <WishPageClient wish={wish} token={token} />;
}
