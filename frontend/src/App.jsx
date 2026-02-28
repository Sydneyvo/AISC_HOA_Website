import { Routes, Route } from 'react-router-dom';
import Dashboard      from './pages/Dashboard';
import PropertyDetail from './pages/PropertyDetail';
import ViolationForm  from './pages/ViolationForm';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-900 text-white px-8 py-4">
        <a href="/" className="font-bold text-lg hover:opacity-80">HOA Compliance</a>
      </nav>
      <Routes>
        <Route path="/"                              element={<Dashboard />} />
        <Route path="/properties/:id"                element={<PropertyDetail />} />
        <Route path="/properties/:id/violations/new" element={<ViolationForm />} />
      </Routes>
    </div>
  );
}
