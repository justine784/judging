'use client';

import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

export default function AdminSidebar({ onCloseMobile }) {
  const router = useRouter();
  const pathname = usePathname();

  const menuItems = [
    {
      name: 'Dashboard',
      icon: '📊',
      path: '/admin/dashboard',
      description: 'Main dashboard'
    },
    {
      name: 'Event Management',
      icon: '📅',
      path: '/admin/events',
      description: 'Create and manage events'
    },
    {
      name: 'Judges',
      icon: '🧑‍⚖️',
      path: '/admin/judges',
      description: 'Manage judges'
    },
    {
      name: 'Settings',
      icon: '⚙️',
      path: '/admin/settings',
      description: 'System settings'
    }
  ];

  const isActive = (path) => pathname === path;

  return (
    <div className="w-64 lg:w-64 bg-gradient-to-b from-slate-50 to-white shadow-xl h-screen sticky top-0 border-r border-emerald-100/50 overflow-y-auto">
      {/* Enhanced Logo Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
        <div className="relative p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40 group-hover:opacity-60 transition duration-300"></div>
                <div className="relative h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white/95 shadow-xl p-1 overflow-hidden border-2 border-white/50 ring-2 ring-emerald-400/30">
                  <Image
                    src="/logo.jpg"
                    alt="Admin Logo"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover rounded-full"
                    priority
                  />
                </div>
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-white drop-shadow-md">Admin Panel</h1>
                <p className="text-xs text-emerald-100">Judging System</p>
              </div>
            </div>
            {/* Mobile Close Button */}
            <button
              onClick={onCloseMobile}
              className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors backdrop-blur-sm"
              title="Close Sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Navigation Menu */}
      <nav className="p-3 sm:p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">Main Menu</p>
        <div className="space-y-1.5">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => {
                router.push(item.path);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full text-left p-3 sm:p-3.5 rounded-xl transition-all duration-300 group ${
                isActive(item.path)
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 scale-[1.02]'
                  : 'hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center transition-all duration-300 ${
                  isActive(item.path)
                    ? 'bg-white/20 backdrop-blur-sm'
                    : 'bg-emerald-100 group-hover:bg-emerald-200 group-hover:scale-110'
                }`}>
                  <span className="text-lg sm:text-xl">{item.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-sm sm:text-base truncate ${
                    isActive(item.path) ? 'text-white' : 'text-gray-800 group-hover:text-emerald-700'
                  }`}>{item.name}</div>
                  <div className={`text-xs hidden sm:block ${
                    isActive(item.path) ? 'text-emerald-100' : 'text-gray-500'
                  }`}>{item.description}</div>
                </div>
                {isActive(item.path) && (
                  <div className="w-1.5 h-8 bg-white/40 rounded-full"></div>
                )}
              </div>
            </button>
          ))}
        </div>
      </nav>

      {/* Enhanced Bottom Section */}
      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-slate-50 to-transparent">
        <div className="border-t border-emerald-100 pt-3 sm:pt-4">
          <button
            onClick={async () => {
              try {
                await signOut(auth);
                router.push('/');
              } catch (error) {
                console.error('Logout error:', error);
                // Still redirect even if there's an error
                router.push('/');
              }
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100 text-red-600 transition-all duration-300 group border border-red-100 hover:border-red-200 hover:shadow-md"
          >
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-red-100 group-hover:bg-red-200 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm sm:text-base text-red-700">Logout</div>
              <div className="text-xs text-red-500 hidden sm:block">Sign out of admin</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
