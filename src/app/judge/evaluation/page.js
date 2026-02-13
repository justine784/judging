'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

export default function ContestantEvaluation() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentContestant, setCurrentContestant] = useState({
    number: 1,
    name: "Sarah Johnson",
    category: "Vocal Performance",
    performanceOrder: 3,
    photo: null
  });
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // Check if the user is the admin - if so, redirect to admin dashboard
        if (user.email === 'admin@gmail.com') {
          router.push('/admin/dashboard');
          return;
        }
        setUser(user);
      } else {
        router.push('/judge/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">🎤 Contestant Evaluation</h1>
              <p className="text-sm text-gray-600">Judge {user?.displayName || user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Side - Contestant Information */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Contestant Information</h2>
              
              {/* Contestant Number */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Contestant Number</label>
                <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
                  <p className="text-2xl font-bold text-purple-800">#{currentContestant.number}</p>
                </div>
              </div>

              {/* Contestant Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Contestant Name</label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <p className="text-lg font-semibold text-gray-900">{currentContestant.name}</p>
                </div>
              </div>

              {/* Category */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <p className="text-lg font-medium text-blue-800">{currentContestant.category}</p>
                </div>
              </div>

              {/* Performance Order */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Performance Order</label>
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <p className="text-lg font-medium text-green-800">Performance #{currentContestant.performanceOrder}</p>
                </div>
              </div>

              {/* Photo (optional) */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Photo</label>
                <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  {currentContestant.photo ? (
                    <img 
                      src={currentContestant.photo} 
                      alt={currentContestant.name}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  ) : (
                    <div>
                      <div className="text-gray-400 text-4xl mb-2">👤</div>
                      <p className="text-gray-500 text-sm">No photo available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex gap-3 mt-8">
                <button className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors font-medium">
                  ← Previous
                </button>
                <button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors font-medium">
                  Next →
                </button>
              </div>
            </div>
          </div>

          {/* Right Side - Evaluation Form (placeholder for now) */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Evaluation Criteria</h2>
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">📝</div>
                <p className="text-gray-600 text-lg">Evaluation form will be implemented here</p>
                <p className="text-gray-500 mt-2">This section will contain scoring criteria and rating options</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
