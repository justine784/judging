'use client';

import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

export default function AdminSidebar() {
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
      name: 'Scoring',
      icon: '🏆',
      path: '/admin/scoring',
      description: 'View and manage scores'
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
    <div className="w-64 bg-white shadow-lg h-screen sticky top-0 border-r border-gray-200">
      {/* Logo Section */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white shadow p-1">
            <Image
              src="/logo.jpg"
              alt="Admin Logo"
              width={40}
              height={40}
              className="rounded-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Admin Panel</h1>
            <p className="text-xs text-gray-500">Judging System</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="p-4">
        <div className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`w-full text-left p-3 rounded-lg transition-all duration-200 group ${
                isActive(item.path)
                  ? 'bg-purple-100 text-purple-700 border-l-4 border-purple-600'
                  : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <div className="flex-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs opacity-70">{item.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
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
          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
        >
          <span className="text-xl">🚪</span>
          <div className="flex-1">
            <div className="font-medium">Logout</div>
            <div className="text-xs opacity-70">Sign out of admin</div>
          </div>
        </button>
      </div>
    </div>
  );
}
