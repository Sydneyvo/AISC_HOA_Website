import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, UserButton, useAuth } from '@clerk/clerk-react';
import { setTokenGetter, getTenantMe, getCommunityUnreadCount } from './api';
import Dashboard       from './pages/Dashboard';
import PropertyDetail  from './pages/PropertyDetail';
import ViolationForm   from './pages/ViolationForm';
import ViolationEdit   from './pages/ViolationEdit';
import LoginPage       from './pages/LoginPage';
import TenantDashboard from './pages/TenantDashboard';
import CommunityPage   from './pages/CommunityPage';

// Sets the token getter then immediately resolves the user's role
function AuthBridge({ onRoleLoaded }) {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(getToken);
    getTenantMe().then(onRoleLoaded).catch(() => onRoleLoaded({ role: 'admin' }));
  }, [getToken]);
  return null;
}

export default function App() {
  const [roleData, setRoleData]           = useState(null); // null = still loading
  const [communityUnread, setCommunityUnread] = useState(false);

  useEffect(() => {
    if (roleData?.role !== 'admin') return;
    const since = localStorage.getItem('community_last_seen');
    getCommunityUnreadCount(since).then(({ count }) => setCommunityUnread(count > 0)).catch(() => {});
  }, [roleData]);

  return (
    <>
      <SignedIn>
        <AuthBridge onRoleLoaded={setRoleData} />

        {roleData === null ? (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        ) : roleData.role === 'tenant' ? (
          <TenantDashboard initialData={roleData} />
        ) : (
          <div className="min-h-screen bg-gray-50">
            <nav className="bg-blue-900 text-white px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <a href="/" className="font-bold text-lg hover:opacity-80">HOA Compliance</a>
                <a href="/community" className="text-sm font-medium hover:opacity-80 relative">
                  Community
                  {communityUnread && (
                    <span className="absolute -top-1 -right-2 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </a>
              </div>
              <UserButton />
            </nav>
            <Routes>
              <Route path="/"                                       element={<Dashboard />} />
              <Route path="/properties/:id"                         element={<PropertyDetail />} />
              <Route path="/properties/:id/violations/new"          element={<ViolationForm />} />
              <Route path="/properties/:id/violations/:violId/edit" element={<ViolationEdit />} />
              <Route path="/community"                              element={<CommunityPage onViewed={() => setCommunityUnread(false)} />} />
              <Route path="/login"                                  element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        )}
      </SignedIn>

      <SignedOut>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*"      element={<Navigate to="/login" replace />} />
        </Routes>
      </SignedOut>
    </>
  );
}
