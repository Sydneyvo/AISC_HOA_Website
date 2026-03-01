import { useUser } from '@clerk/clerk-react';
import CommunityBoard from '../components/CommunityBoard';

export default function CommunityPage({ onViewed }) {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-blue-900 mb-6">Community Board</h1>
      <CommunityBoard currentUserEmail={email} isAdmin={true} onViewed={onViewed} />
    </div>
  );
}
