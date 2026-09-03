import { redirect } from 'next/navigation';

/** @deprecated — используйте /admin/edit/catalog */
export default function LegacyEditAuctionsRedirect() {
  redirect('/admin/edit/catalog');
}
