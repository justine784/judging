'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import AdminSidebar from '@/components/AdminSidebar';

export default function AdminLayout({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check for current user immediately
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      // Only set user if it's the allowed admin email
      if (currentUser.email === 'admin@gmail.com') {
        setUser(currentUser);
      } else {
        // Sign out unauthorized user
        signOut(auth);
        router.push('/admin/login');
      }
      setLoading(false);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/');
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      // Check if we're in the middle of creating a judge account
      const isCreatingJudge = typeof window !== 'undefined' && window.creatingJudge;
      
      if (user) {
        // Check if the user is the allowed admin email
        if (user.email === 'admin@gmail.com') {
          setUser(user);
        } else if (!isCreatingJudge) {
          // Sign out unauthorized user and redirect to login
          signOut(auth);
          router.push('/admin/login');
        }
      } else {
        setUser(null);
        // Only redirect if not on login page and not creating a judge
        if (typeof window !== 'undefined' && !isCreatingJudge) {
          const currentPath = window.location.pathname;
          if (!currentPath.includes('/admin/login')) {
            router.push('/admin/login');
          }
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Check if current page is login page
  const isLoginPage = typeof window !== 'undefined' && window.location.pathname.includes('/admin/login');

  // Show minimal loading for better UX
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  // For login page, render children without layout
  if (isLoginPage) {
    return children;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1">
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <h1 className="text-xl font-semibold text-gray-900">
                    Welcome back, {user.email.split('@')[0]}
                  </h1>
                  <p className="text-sm text-gray-500">Admin Dashboard</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* Notifications */}
                <button className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
                  </svg>
                  <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
                </button>
                
                {/* Date & Time */}
                <div className="hidden md:flex items-center gap-2 text-sm text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <span>
                    {new Date().toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </span>
                </div>
                
                {/* User Profile */}
                <div className="flex items-center gap-3">
                  <div className="hidden md:block text-right">
                    <p className="text-sm font-medium text-gray-900">{user.email.split('@')[0]}</p>
                    <p className="text-xs text-gray-500">Administrator</p>
                  </div>
                  <div className="relative">
                    <div className="h-10 w-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold shadow-lg">
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-white rounded-full"></div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Logout"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
