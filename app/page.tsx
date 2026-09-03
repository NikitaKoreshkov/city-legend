import HomeHeroRsc from './HomeHeroRsc';
import HomePageBelow from './HomePageBelow';
import { getHomepagePublicContent } from '@/lib/homepageContent';
import { mergeHero } from '@/lib/homepageMerge';

/** Кэш страницы и БД-запроса: контент героя уже в HTML, без скачка после fetch на клиенте. */
export const revalidate = 120;

export default async function Home() {
  const initialContent = await getHomepagePublicContent();
  const hero = mergeHero(initialContent);
  return (
    <main
      id="main-content"
      className="relative w-full overflow-x-hidden"
      style={{ overflowY: 'visible' }}
    >
      <HomeHeroRsc hero={hero} />
      <HomePageBelow initialContent={initialContent} />
    </main>
  );
}
