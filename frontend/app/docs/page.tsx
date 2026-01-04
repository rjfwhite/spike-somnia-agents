import { redirect } from 'next/navigation';

export default function DocsPage() {
  // Redirect to overview page
  redirect('/docs/overview');
}
