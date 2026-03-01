import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, UserButton, useAuth } from '@clerk/clerk-react';
import { setTokenGetter } from './api';
import Dashboard      from './pages/Dashboard';
import PropertyDetail from './pages/PropertyDetail';
import ViolationForm  from './pages/ViolationForm';
import ViolationEdit  from './pages/ViolationEdit';
import LoginPage      from './pages/LoginPage';

// Registers the Clerk token getter with api.js once on mount
function AuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => { setTokenGetter(getToken); }, [getToken]);
  return null;
}

export default function App() {
  return (
    <>
      <SignedIn>
        <AuthBridge />
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-blue-900 text-white px-8 py-4 flex items-center justify-between">
            <a href="/" className="font-bold text-lg hover:opacity-80">HOA Compliance</a>
            <UserButton afterSignOutUrl="/login" />
          </nav>
          <Routes>
            <Route path="/"                                            element={<Dashboard />} />
            <Route path="/properties/:id"                              element={<PropertyDetail />} />
            <Route path="/properties/:id/violations/new"               element={<ViolationForm />} />
            <Route path="/properties/:id/violations/:violId/edit"      element={<ViolationEdit />} />
            <Route path="/login"                                       element={<Navigate to="/" replace />} />
          </Routes>
        </div>
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
