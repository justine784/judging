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
    <div className="w-64 lg:w-64 bg-white shadow-lg h-screen sticky top-0 border-r border-gray-200 overflow-y-auto">
      {/* Logo Section */}
      <div className="p-3 sm:p-6 border-b border-gray-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-full bg-white shadow p-1 overflow-hidden">
              <Image
                src="/logo.jpg"
                alt="Admin Logo"
                width={48}
                height={48}
                className="w-full h-full object-cover rounded-full"
                priority
              />
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-bold text-gray-900">Admin Panel</h1>
              <p className="text-xs text-gray-500">Judging System</p>
            </div>
          </div>
          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="p-2 sm:p-4">
        <div className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => {
                router.push(item.path);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full text-left p-2.5 sm:p-3 rounded-lg transition-all duration-200 group ${
                isActive(item.path)
                  ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-600'
                  : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-base sm:text-xl">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm sm:text-base truncate">{item.name}</div>
                  <div className="text-xs opacity-70 hidden sm:block">{item.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4 border-t border-gray-200">
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
          className="w-full flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
        >
          <span className="text-base sm:text-xl">🚪</span>
          <div className="flex-1">
            <div className="font-medium text-sm sm:text-base">Logout</div>
            <div className="text-xs opacity-70 hidden sm:block">Sign out of admin</div>
          </div>
        </button>
      </div>
    </div>
  );
}
