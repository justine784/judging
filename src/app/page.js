'use client';

import Image from "next/image";
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function Home() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Fetch all events from Firestore
    const eventsCollection = collection(db, 'events');
    
    const unsubscribe = onSnapshot(eventsCollection, (snapshot) => {
      const allEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by status priority (ongoing first), then by createdAt (newest first)
      allEvents.sort((a, b) => {
        // Priority order: ongoing > upcoming > finished
        const statusPriority = { ongoing: 0, upcoming: 1, finished: 2 };
        const priorityA = statusPriority[a.status] || 3;
        const priorityB = statusPriority[b.status] || 3;
        
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        
        // If same status, sort by createdAt (newest first)
        const dateA = a.createdAt?.toMillis?.() || 0;
        const dateB = b.createdAt?.toMillis?.() || 0;
        return dateB - dateA;
      });
      
      setEvents(allEvents);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching events:', error);
      setEvents([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter events based on search query
  const filteredEvents = events.filter(event => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    return (
      event.eventName?.toLowerCase().includes(query) ||
      event.eventDescription?.toLowerCase().includes(query) ||
      event.venue?.toLowerCase().includes(query) ||
      event.status?.toLowerCase().includes(query) ||
      event.date?.toLowerCase().includes(query) ||
      event.time?.toLowerCase().includes(query)
    );
  });
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-white to-blue-50">
      {/* Hero Section */}
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
        {/* Event Logo */}
        <div className="mb-8">
          <div className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full shadow-xl p-2">
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
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <button 
            onClick={() => window.location.href = '/judge/login'}
            className="flex items-center justify-center gap-3 rounded-xl bg-blue-600 px-6 py-4 font-medium text-white transition-all duration-200 hover:bg-blue-700 hover:scale-105 shadow-lg w-full sm:w-auto order-1 sm:order-1"
          >
            <span className="text-lg">🔐</span>
            <span className="font-semibold">Login as Judge</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin/login'}
            className="flex items-center justify-center gap-3 rounded-xl bg-gray-800 px-6 py-4 font-medium text-white transition-all duration-200 hover:bg-gray-900 hover:scale-105 shadow-lg w-full sm:w-auto order-2 sm:order-2"
          >
            <span className="text-lg">🛠</span>
            <span className="font-semibold">Admin Login</span>
          </button>
          <button 
            onClick={() => window.location.href = '/scoreboard'}
            className="flex items-center justify-center gap-3 rounded-xl border-2 border-blue-600 bg-transparent px-6 py-4 font-medium text-blue-600 transition-all duration-200 hover:bg-blue-50 hover:scale-105 shadow-lg w-full sm:w-auto order-3 sm:order-3"
          >
            <span className="text-lg">📊</span>
            <span className="font-semibold">View Live Scoreboard</span>
          </button>
        </div>

        {/* Live Events Information */}
        <div className="mt-16 w-full max-w-6xl">
          {loading ? (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ) : events.length > 0 ? (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Live Events</h2>
                <p className="text-lg text-gray-600 mb-6">Check out our current and upcoming competitions</p>
                
                {/* Search Box */}
                <div className="max-w-md mx-auto">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400">🔍</span>
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search events by name, description, venue, status..."
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 bg-white shadow-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        <span className="text-gray-400 hover:text-gray-600">✕</span>
                      </button>
                    )}
                  </div>
                  {searchQuery && (
                    <p className="mt-2 text-sm text-gray-600">
                      Found {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'} matching "{searchQuery}"
                    </p>
                  )}
                </div>
              </div>
              
              {filteredEvents.length > 0 ? (
                filteredEvents.map((event) => (
                <div key={event.id} className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                  <div className="text-center mb-6">
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 ${
                      event.status === 'ongoing' 
                        ? 'bg-blue-100 text-blue-800' 
                        : event.status === 'upcoming'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        event.status === 'ongoing' ? 'bg-blue-500 animate-pulse' : 
                        event.status === 'upcoming' ? 'bg-blue-500' : 'bg-gray-500'
                      }`}></div>
                      <span className="font-medium capitalize">
                        {event.status === 'ongoing' ? 'LIVE EVENT' : 
                         event.status === 'upcoming' ? 'UPCOMING EVENT' : 'FINISHED EVENT'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{event.eventName}</h3>
                    <p className="text-gray-600">{event.eventDescription}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
                    <div className="text-center">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-xl sm:text-2xl">📅</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mb-1 font-medium">Date</p>
                      <p className="font-semibold text-gray-900 text-sm sm:text-base">{event.date}</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-xl sm:text-2xl">⏰</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mb-1 font-medium">Time</p>
                      <p className="font-semibold text-gray-900 text-sm sm:text-base">{event.time}</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-xl sm:text-2xl">📍</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mb-1 font-medium">Venue</p>
                      <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">{event.venue}</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-xl sm:text-2xl">🏆</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mb-1 font-medium">Status</p>
                      <p className="font-semibold text-gray-900 text-sm sm:text-base capitalize">{event.status}</p>
                    </div>
                  </div>
                  
                  <div className="border-t pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-1">Event Details</h4>
                        <p className="text-sm text-gray-600">
                          {event.status === 'ongoing' 
                            ? 'Join us for this exciting live competition!' 
                            : event.status === 'upcoming'
                            ? 'Get ready for this upcoming competition!'
                            : 'This competition has concluded.'
                          }
                        </p>
                        {event.scoresLocked && (
                          <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                            <span>🔒</span>
                            Scores Locked
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => window.location.href = '/scoreboard'}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium shadow-lg"
                      >
                        <span>📊</span>
                        View Scoreboard
                      </button>
                    </div>
                  </div>
                </div>
                ))
              ) : (
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Events Found</h3>
                  <p className="text-gray-600">
                    {searchQuery 
                      ? `No events found matching "${searchQuery}". Try a different search term.`
                      : 'No events have been created yet. Check back later for upcoming competitions.'
                    }
                  </p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
              <div className="text-6xl mb-4">📅</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Events</h3>
              <p className="text-gray-600">No events have been created yet. Check back later for upcoming competitions.</p>
            </div>
          )}
        </div>

        
              </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white">
        <div className="mx-auto px-4 py-8">
          <div className="text-center">
            {/* Logos */}
            <div className="flex justify-center items-center gap-4 mb-4">
              <div className="h-16 w-16 rounded-full">
                <Image
                  src="/logo.jpg"
                  alt="Bongabong Logo"
                  width={64}
                  height={64}
                  className="rounded-full object-contain"
                />
              </div>
              <div className="h-16 w-16 rounded-full">
                <Image
                  src="/minsu_logo.jpg"
                  alt="Trophy Logo"
                  width={64}
                  height={64}
                  className="rounded-full object-contain"
                />
              </div>
            </div>
            <h3 className="mb-2 text-xl font-bold">JUDGING & TABULATION SYSTEM</h3>
            <p className="mb-4 text-gray-300">
              Municipality of Bongabong, Oriental Mindoro
            </p>
            <div className="mb-4 text-sm text-gray-400">
              <p>📧 contact@judgingsystem.com</p>
              <p>📱 +63 912 345 6789</p>
            </div>
            <div className="border-t border-gray-700 pt-4 text-sm text-gray-400">
              <p>@ Developed by BSIT Students – Mindoro State University Bongabong Campus</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
