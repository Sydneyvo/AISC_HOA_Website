import { SignIn } from '@clerk/clerk-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-blue-900">HOA Compliance</h1>
        <p className="text-gray-500 mt-1 text-sm">Admin Dashboard</p>
      </div>
      <SignIn routing="hash" />
    </div>
  );
}
