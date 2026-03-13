'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import AdminSidebar from '@/components/AdminSidebar';

export default function AdminLayout({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  // Check for current user immediately
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      // Check if we're in the middle of creating a judge account
      const isCreatingJudge = typeof window !== 'undefined' && window.creatingJudge;
      
      if (user) {
        // Check if the user is the allowed admin email
        const ADMIN_EMAIL = 'admin@gmail.com'; // Change this to your email
        if (user.email === ADMIN_EMAIL) {
          setUser(user);
        } else if (!isCreatingJudge) {
          // Sign out unauthorized user and redirect to login
          signOut(auth).then(() => {
            router.push('/admin/login');
          });
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

  // Auto-close sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };
    
    // Set initial state based on screen size
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Check if current page is login page
  const isLoginPage = typeof window !== 'undefined' && window.location.pathname.includes('/admin/login');

  // Show minimal loading for better UX
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur opacity-40 animate-pulse"></div>
            <div className="relative animate-spin rounded-full h-12 w-12 border-4 border-emerald-200 border-t-emerald-600"></div>
          </div>
          <p className="text-emerald-700 font-medium">Loading admin panel...</p>
        </div>
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
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/50">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Collapsible Sidebar */}
      <div className={`fixed top-0 left-0 z-50 h-screen transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <AdminSidebar onCloseMobile={() => setSidebarOpen(false)} />
      </div>

      {/* Main Content Container */}
      <div className={`flex-1 min-w-0 transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}`}>
        {/* Top Header with Hamburger Menu */}
        <header className="sticky top-0 z-30 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
          <div className="relative px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex justify-between items-center gap-3">
              {/* Left Section: Hamburger + Title */}
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                {/* Hamburger Menu Button */}
                <button
                  onClick={toggleSidebar}
                  className="p-2 sm:p-2.5 text-white/90 hover:text-white hover:bg-white/20 rounded-xl transition-all duration-300 flex-shrink-0 group"
                  title={sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {sidebarOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>

                {/* User Avatar - Mobile */}
                <div className="lg:hidden relative group flex-shrink-0">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40"></div>
                  <div className="relative h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-white/95 flex items-center justify-center text-emerald-600 font-bold text-sm sm:text-base shadow-lg border-2 border-white/50">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                </div>

                {/* Welcome Text */}
                <div className="min-w-0 flex-1">
                  <h1 className="text-sm sm:text-xl font-bold text-white drop-shadow-md truncate">
                    <span className="hidden sm:inline">Welcome back, </span>
                    <span className="sm:hidden">Hi, </span>
                    {user.email.split('@')[0]}
                  </h1>
                  <p className="text-xs text-emerald-100 hidden sm:block">Admin Dashboard • Manage your judging system</p>
                </div>
              </div>

              {/* Right Section: Status & Profile - Desktop */}
              <div className="hidden lg:flex items-center gap-4 flex-shrink-0">
                {/* System Status Badge */}
                <div className="flex items-center gap-3 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50"></div>
                      <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></div>
                    </div>
                    <span className="font-semibold text-sm text-white">🟢 System Online</span>
                  </div>
                </div>
                
                {/* Date & Time */}
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                  <svg className="w-4 h-4 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <span className="text-sm text-white font-medium">
                    {new Date().toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </span>
                </div>
                
                {/* User Profile */}
                <div className="flex items-center gap-3 pl-4 border-l border-white/20">
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">{user.email.split('@')[0]}</p>
                    <p className="text-xs text-emerald-200">Administrator</p>
                  </div>
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40 group-hover:opacity-60 transition duration-300"></div>
                    <div className="relative h-11 w-11 bg-white/95 rounded-full flex items-center justify-center text-emerald-600 font-bold shadow-xl border-2 border-white/50">
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute bottom-0 right-0 h-3 w-3 bg-emerald-400 border-2 border-white rounded-full shadow-lg"></div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2.5 text-white/80 hover:text-white hover:bg-red-500/80 rounded-xl transition-all duration-300 hover:shadow-lg"
                    title="Logout"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Right Section: Mobile Logout */}
              <button
                onClick={handleLogout}
                className="lg:hidden p-2 text-white/80 hover:text-white hover:bg-red-500/80 rounded-xl transition-all duration-300 flex-shrink-0"
                title="Logout"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
              </button>
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
