'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalContestants: 0,
    totalJudges: 0,
    totalEvents: 0,
    scoringProgress: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load dashboard statistics
    const loadStats = async () => {
      try {
        // Fetch actual judge count from Firestore
        const judgesCollection = collection(db, 'judges');
        const judgesSnapshot = await getDocs(judgesCollection);
        const actualJudgeCount = judgesSnapshot.size;
        
        // For now, keep other stats as sample data until we implement those collections
        setStats({
          totalContestants: 12,
          totalJudges: actualJudgeCount,
          totalEvents: 3,
          scoringProgress: 85
        });
      } catch (error) {
        console.error('Error loading stats:', error);
        // Fallback to sample data on error
        setStats({
          totalContestants: 12,
          totalJudges: 0,
          totalEvents: 3,
          scoringProgress: 85
        });
      }
      setLoading(false);
    };

    loadStats();
  }, []);

  const getProgressColor = (progress) => {
    if (progress >= 80) return 'text-green-600';
    if (progress >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressBg = (progress) => {
    if (progress >= 80) return 'bg-green-100';
    if (progress >= 50) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
            <p className="text-gray-600 text-lg">Welcome back! Here's what's happening with your judging system today.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
              </svg>
              New Event
            </button>
            <button className="px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-300 flex items-center gap-2 shadow-md hover:shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
              Export
            </button>
          </div>
        </div>
        
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mt-6">
          <span className="hover:text-gray-700 cursor-pointer transition-colors">Home</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
          </svg>
          <span className="text-purple-600 font-medium">Dashboard</span>
        </nav>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Contestants Card */}
        <div className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-6 cursor-pointer group border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="h-14 w-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
              <span className="text-3xl">👥</span>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-8 w-12 bg-gray-200 rounded-lg"></div>
                </div>
              ) : (
                <span className="text-3xl font-bold text-gray-900">{stats.totalContestants}</span>
              )}
            </div>
          </div>
          <h3 className="font-bold text-gray-900 text-lg mb-1">Contestants</h3>
          <p className="text-sm text-gray-500 mb-4">Total registered</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-600 font-medium">
                {loading ? 'Loading...' : `+${Math.floor(stats.totalContestants * 0.2)} this month`}
              </span>
            </div>
            <svg className="w-4 h-4 text-purple-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>

        {/* Judges Card */}
        <div className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-6 cursor-pointer group border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="h-14 w-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
              <span className="text-3xl">🧑‍⚖️</span>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-8 w-12 bg-gray-200 rounded-lg"></div>
                </div>
              ) : (
                <span className="text-3xl font-bold text-gray-900">{stats.totalJudges}</span>
              )}
            </div>
          </div>
          <h3 className="font-bold text-gray-900 text-lg mb-1">Judges</h3>
          <p className="text-sm text-gray-500 mb-4">Active judges</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-blue-600 font-medium">
                {loading ? 'Loading...' : `${stats.totalJudges - 1} online now`}
              </span>
            </div>
            <svg className="w-4 h-4 text-blue-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>

        {/* Events Card */}
        <div className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-6 cursor-pointer group border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="h-14 w-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
              <span className="text-3xl">🎯</span>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-8 w-12 bg-gray-200 rounded-lg"></div>
                </div>
              ) : (
                <span className="text-3xl font-bold text-gray-900">{stats.totalEvents}</span>
              )}
            </div>
          </div>
          <h3 className="font-bold text-gray-900 text-lg mb-1">Events</h3>
          <p className="text-sm text-gray-500 mb-4">Total events</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-600 font-medium">
                {loading ? 'Loading...' : '1 ongoing'}
              </span>
            </div>
            <svg className="w-4 h-4 text-green-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>

        {/* Progress Card */}
        <div className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-6 cursor-pointer group border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className={`h-14 w-14 ${getProgressBg(stats.scoringProgress)} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg`}>
              <span className="text-3xl">📊</span>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-8 w-16 bg-gray-200 rounded-lg"></div>
                </div>
              ) : (
                <span className={`text-3xl font-bold ${getProgressColor(stats.scoringProgress)}`}>
                  {stats.scoringProgress}%
                </span>
              )}
            </div>
          </div>
          <h3 className="font-bold text-gray-900 text-lg mb-1">Progress</h3>
          <p className="text-sm text-gray-500 mb-4">Scoring completed</p>
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-3">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-2 bg-gray-200 rounded-full"></div>
                </div>
              ) : (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-700 ease-out ${
                      stats.scoringProgress >= 80 ? 'bg-gradient-to-r from-green-400 to-green-600' : 
                      stats.scoringProgress >= 50 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' : 'bg-gradient-to-r from-red-400 to-red-600'
                    }`}
                    style={{ width: `${stats.scoringProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
            <svg className="w-4 h-4 text-orange-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">📈</span>
            Recent Activity
          </h2>
          <p className="text-purple-100 text-sm mt-1">Latest updates from your judging system</p>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100 hover:bg-green-100 transition-colors cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white">👤</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">New contestant registered</p>
                  <p className="text-sm text-gray-500">Maria Santos joined Grand Vocal Showdown</p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                  2 min ago
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white">📝</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Judge scores submitted</p>
                  <p className="text-sm text-gray-500">Dr. Maria Santos completed scoring for Round 1</p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                  15 min ago
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl border border-purple-100 hover:bg-purple-100 transition-colors cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white">🎭</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Event status updated</p>
                  <p className="text-sm text-gray-500">Battle of the Bands moved to ongoing status</p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                  1 hour ago
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
