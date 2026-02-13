'use client';

import Image from "next/image";
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function Home() {
  const [contestInfo, setContestInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch contest info from Firestore
    const unsubscribeContest = onSnapshot(doc(db, 'contest', 'info'), (doc) => {
      if (doc.exists()) {
        setContestInfo(doc.data());
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching contest info:', error);
      setLoading(false);
    });

    return () => unsubscribeContest();
  }, []);
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Hero Section */}
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
        {/* Event Logo */}
        <div className="mb-8">
          <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-white shadow-xl p-2">
            <Image
              src="/logo.jpg"
              alt="Bongabong Logo"
              width={120}
              height={120}
              className="rounded-full object-contain"
            />
          </div>
        </div>

        {/* System Title */}
        <div className="mb-6">
          <h1 className="mb-4 text-4xl font-bold text-gray-900 md:text-6xl">
            JUDGING & TABULATION SYSTEM
          </h1>
          <h2 className="text-2xl font-semibold text-gray-700 md:text-3xl">
            Contest Judging & Tabulation System
          </h2>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <button 
            onClick={() => window.location.href = '/judge/login'}
            className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-6 py-3 font-medium text-white transition-colors hover:bg-purple-700 shadow-lg"
          >
            <span>🔐</span>
            Login as Judge
          </button>
          <button 
            onClick={() => window.location.href = '/admin/login'}
            className="flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-6 py-3 font-medium text-white transition-colors hover:bg-gray-900 shadow-lg"
          >
            <span>🛠</span>
            Admin Login
          </button>
          <button 
            onClick={() => window.location.href = '/scoreboard'}
            className="flex items-center justify-center gap-2 rounded-lg border-2 border-blue-600 bg-transparent px-6 py-3 font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            <span>📊</span>
            View Live Scoreboard
          </button>
        </div>

        {/* Live Event Information */}
        <div className="mt-16">
          {loading ? (
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-4xl mx-auto">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ) : contestInfo ? (
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="font-medium">LIVE EVENT</span>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">{contestInfo.title || 'Grand Vocal Showdown 2026'}</h2>
                <p className="text-lg text-gray-600">{contestInfo.description || 'Annual Singing Competition'}</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl">📅</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">Date</p>
                  <p className="font-semibold text-gray-900">{contestInfo.date || 'March 15, 2026'}</p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl">⏰</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">Time</p>
                  <p className="font-semibold text-gray-900">{contestInfo.time || '6:00 PM'}</p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl">📍</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">Venue</p>
                  <p className="font-semibold text-gray-900">{contestInfo.venue || 'University Auditorium'}</p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl">🏆</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">Prize Pool</p>
                  <p className="font-semibold text-gray-900">{contestInfo.prizePool || '$10,000'}</p>
                </div>
              </div>
              
              <div className="border-t pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Event Status</h3>
                    <p className="text-sm text-gray-600">Join us for an exciting competition!</p>
                  </div>
                  <button 
                    onClick={() => window.location.href = '/scoreboard'}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium shadow-lg"
                  >
                    <span>📊</span>
                    View Live Scoreboard
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-4xl mx-auto text-center">
              <div className="text-6xl mb-4">📅</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Live Event</h3>
              <p className="text-gray-600">Check back later for upcoming events and live scoring.</p>
            </div>
          )}
        </div>

        
              </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white">
        <div className="mx-auto px-4 py-8">
          <div className="text-center">
            <h3 className="mb-2 text-xl font-bold">JUDGING & TABULATION SYSTEM</h3>
            <p className="mb-4 text-gray-300">
              Municipality of Bongabong, Oriental Mindoro
            </p>
            <div className="mb-4 text-sm text-gray-400">
              <p>📧 contact@judgingsystem.com</p>
              <p>📱 +63 912 345 6789</p>
            </div>
            <div className="border-t border-gray-700 pt-4 text-sm text-gray-400">
              <p>@ Developed by BSIT Students – Mindoro State University</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
