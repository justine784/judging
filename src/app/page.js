'use client';

import Image from "next/image";
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import ContestantSlideshow from '@/components/ContestantSlideshow';

export default function Home() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [contestants, setContestants] = useState({}); // Store contestants by eventId

  // Load contestants for the given events
  const loadContestantsForEvents = async (eventsList) => {
    const contestantsCollection = collection(db, 'contestants');
    const contestantsSnapshot = await getDocs(contestantsCollection);
    
    const contestantsList = contestantsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Group contestants by eventId
    const contestantsByEvent = {};
    eventsList.forEach(event => {
      contestantsByEvent[event.id] = contestantsList.filter(contestant => 
        contestant.eventId && (contestant.eventId.toString() === event.id.toString() || contestant.eventId === event.id)
      );
    });
    
    setContestants(contestantsByEvent);
  };

  useEffect(() => {
    // Fetch all events from Firestore
    const eventsCollection = collection(db, 'events');
    
    const unsubscribe = onSnapshot(eventsCollection, async (snapshot) => {
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
      
      // Fetch contestants for all events (since we now show showcases for all events)
      if (allEvents.length > 0) {
        await loadContestantsForEvents(allEvents);
      }
      
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

  // Get featured event (first ongoing or upcoming event, or first event if none are ongoing/upcoming)
  const getFeaturedEvent = () => {
    if (filteredEvents.length === 0) return null;
    
    // Prioritize ongoing events
    const ongoingEvent = filteredEvents.find(event => event.status === 'ongoing');
    if (ongoingEvent) return ongoingEvent;
    
    // Then upcoming events
    const upcomingEvent = filteredEvents.find(event => event.status === 'upcoming');
    if (upcomingEvent) return upcomingEvent;
    
    // Otherwise return the first event
    return filteredEvents[0];
  };

  // Function to convert military time to 12-hour format
  const convertTo12Hour = (timeString) => {
    if (!timeString) return '';
    
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  return (
    <div className="min-h-screen bg-gradient-to-t from-green-500/50 to-white relative overflow-hidden">
      {/* Hero Section */}
      <main className="flex min-h-screen flex-row items-center justify-between px-10 py-10 relative">
        {/* Left Side Content */}
        <div className="flex flex-col items-center md:items-start max-w-lg w-full md:w-auto pt-0">
          {/* Event Logo */}
          <div className="mb-4">
            <div className="flex justify-center md:justify-start items-center gap-2 sm:gap-4">
              <div className="">
                <Image
                  src="/logo.jpg"
                  alt="Government Logo"
                  width={90}
                  height={90}
                  className="rounded-full object-contain"
                />
              </div>
              <div className="">
                <Image
                  src="/logo1.png"
                  alt="Additional Logo"
                  width={90}
                  height={90}
                  className="rounded-full object-contain"
                />
              </div>
              <div className="">
                <Image
                  src="/logo5.jpg"
                  alt="Third Logo"
                  width={90}
                  height={90}
                  className="rounded-full object-contain"
                />
              </div>
            </div>
          </div>

          {/* System Title - Left Position */}
          <div className="mb-8 flex flex-col items-center md:items-start gap-1">
            <h1 className="text-5xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-green-600 text-center md:text-left drop-shadow-lg tracking-tight">
              JUDGING &
            </h1>
            <h1 className="text-5xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-green-600 text-center md:text-left drop-shadow-lg tracking-tight">
              TABULATION
            </h1>
            <h1 className="text-5xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-green-600 text-center md:text-left drop-shadow-lg tracking-tight">
              SYSTEM
            </h1>
            <div className="mt-4 w-24 h-1 bg-gradient-to-r from-green-500 to-green-700 rounded-full"></div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-5 mb-16 items-center md:items-center">
            <button 
              onClick={() => window.location.href = '/judge/login'}
              className="group flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 px-10 py-5 font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-green-500/30 w-full shadow-lg shadow-green-500/20 transform"
            >
              <span className="text-xl group-hover:scale-110 transition-transform duration-300">🔐</span>
              <span className="text-lg">Login as Judge</span>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/login'}
              className="group flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black px-10 py-5 font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-gray-800/30 w-full shadow-lg shadow-gray-800/20 transform"
            >
              <span className="text-xl group-hover:scale-110 transition-transform duration-300">🛠</span>
              <span className="text-lg">Admin Login</span>
            </button>
            <button 
              onClick={() => window.location.href = '/scoreboard'}
              className="group flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 px-10 py-5 font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-gray-500/30 w-full shadow-lg shadow-gray-500/20 transform"
            >
              <span className="text-xl group-hover:scale-110 transition-transform duration-300">📊</span>
              <span className="text-lg">View Live Scoreboard</span>
            </button>
          </div>
        </div>

        {/* Right Side Image */}
        <div className="hidden md:flex flex-col items-end justify-center relative">
          <div className="absolute top-0 right-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-black">
              Sulyog Festival 2026
            </h2>
          </div>
          <div className="flex justify-end">
            <Image
              src="/sulyog1.png"
              alt="Sulyog Festival"
              width={1500}
              height={1500}
              className="rounded-2xl object-contain"
            />
          </div>
        </div>
      </main>

      {/* Live Events Information */}
      <div className="mt-16 w-full mb-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 p-8 md:p-12">
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
                <div className="text-center mb-12">
                  <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 drop-shadow-sm">
                    {searchQuery ? 'Search Results' : 'Live Events'}
                  </h2>
                  <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                    {searchQuery ? 'Events matching your search criteria' : 'Discover and join ongoing competitions'}
                  </p>
                  
                  {/* Search and Toggle Controls */}
                  <div className="max-w-md mx-auto mb-6">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400">🔍</span>
                      </div>
                      <input
                        type="text"
                        id="event-search"
                        name="eventSearch"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setShowAllEvents(true); // Show all events when searching
                        }}
                        placeholder="Search events by name, description, venue, status..."
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 bg-white shadow-sm text-black"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            setShowAllEvents(false);
                          }}
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

                  {/* Show All Events Button - Only show when not searching */}
                  {!searchQuery && !showAllEvents && filteredEvents.length > 1 && (
                    <div className="flex justify-center mb-6">
                      <button
                        onClick={() => setShowAllEvents(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-lg"
                      >
                        <span>📋</span>
                        View All {filteredEvents.length} Events
                      </button>
                    </div>
                  )}

                  {/* Show Less Button */}
                  {!searchQuery && showAllEvents && (
                    <div className="flex justify-center mb-6">
                      <button
                        onClick={() => setShowAllEvents(false)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors shadow-lg"
                      >
                        <span>⬆️</span>
                        Show Featured Event Only
                      </button>
                    </div>
                  )}
                </div>
                
                {filteredEvents.length > 0 ? (
                  <div className="space-y-6">
                    {/* Display either featured event only or all events */}
                    {(showAllEvents || searchQuery ? filteredEvents : [getFeaturedEvent()]).map((event) => (
                      <div key={event.id} className="">
                        {/* Contestant Showcase for All Events */}
                        {(() => {
                          const eventContestants = contestants[event.id] || [];
                          const contestantsWithPhotos = eventContestants.filter(contestant => contestant.photo);
                          
                          return (
                            <div className="mb-6">
                              {contestantsWithPhotos.length > 0 ? (
                                <ContestantSlideshow 
                                  contestants={contestantsWithPhotos} 
                                  autoPlay={true}
                                  interval={5000}
                                  eventName={event.eventName}
                                  eventStatus={event.status}
                                />
                              ) : (
                                <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl p-6 text-center mx-4">
                                  <div className="text-gray-500 text-base">📷 No contestant photos available</div>
                                  <p className="text-gray-400 text-sm mt-2">Add photos to contestants to enable slideshow</p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        
                        {/* Event Details Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                          <div className="text-center bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-blue-200">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                              <span className="text-2xl sm:text-3xl">📅</span>
                            </div>
                            <p className="text-sm sm:text-base text-blue-700 mb-2 font-semibold">Date</p>
                            <p className="font-bold text-blue-900 text-base sm:text-lg">{event.date}</p>
                          </div>
                          
                          <div className="text-center bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-green-200">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                              <span className="text-2xl sm:text-3xl">⏰</span>
                            </div>
                            <p className="text-sm sm:text-base text-green-700 mb-2 font-semibold">Time</p>
                            <p className="font-bold text-green-900 text-base sm:text-lg">{convertTo12Hour(event.time)}</p>
                          </div>
                          
                          <div className="text-center bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-purple-200">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                              <span className="text-2xl sm:text-3xl">📍</span>
                            </div>
                            <p className="text-sm sm:text-base text-purple-700 mb-2 font-semibold">Venue</p>
                            <p className="font-bold text-purple-900 text-base sm:text-lg truncate">{event.venue}</p>
                          </div>
                          
                          <div className="text-center bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-orange-200">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                              <span className="text-2xl sm:text-3xl">🏆</span>
                            </div>
                            <p className="text-sm sm:text-base text-orange-700 mb-2 font-semibold">Status</p>
                            <p className="font-bold text-orange-900 text-base sm:text-lg capitalize">{event.status}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
          </div>
        </div>

      {/* Footer */}
      <footer className="bg-white text-gray-900">
        <div className="mx-auto px-4 py-8">
          <div className="text-center">
            <h3 className="mb-2 text-xl font-bold">JUDGING & TABULATION SYSTEM</h3>
            <p className="mb-4 text-gray-600">
              Municipality of Bongabong, Oriental Mindoro
            </p>
            <div className="mb-4 text-sm text-gray-500">
              <p>📧 contact@judgingsystem.com</p>
              <p>📱 +63 912 345 6789</p>
            </div>
            <div className="border-t border-gray-300 pt-4 text-sm text-gray-500">
              <p>@ Developed by BSIT Students – Mindoro State University Bongabong Campus</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
