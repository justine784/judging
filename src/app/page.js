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
      {/* Animated Bubbles Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large Bubbles */}
        <div className="absolute w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-green-200/40 to-green-400/20 -top-5 left-[5%] animate-bubble" style={{animationDelay: '0s', animationDuration: '8s'}}></div>
        <div className="absolute w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-emerald-200/35 to-emerald-400/15 top-[20%] right-[8%] animate-bubble" style={{animationDelay: '2s', animationDuration: '10s'}}></div>
        <div className="absolute w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-green-300/30 to-green-500/10 bottom-[15%] left-[15%] animate-bubble" style={{animationDelay: '4s', animationDuration: '12s'}}></div>
        
        {/* Medium Bubbles */}
        <div className="absolute w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-emerald-300/35 to-emerald-500/15 top-[35%] left-[25%] animate-bubble" style={{animationDelay: '1s', animationDuration: '9s'}}></div>
        <div className="absolute w-14 h-14 sm:w-18 sm:h-18 rounded-full bg-gradient-to-br from-green-200/40 to-green-400/20 top-[50%] right-[20%] animate-bubble" style={{animationDelay: '3s', animationDuration: '11s'}}></div>
        <div className="absolute w-18 h-18 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-emerald-200/30 to-emerald-400/15 top-[10%] left-[45%] animate-bubble" style={{animationDelay: '5s', animationDuration: '7s'}}></div>
        <div className="absolute w-16 h-16 sm:w-22 sm:h-22 rounded-full bg-gradient-to-br from-green-300/35 to-green-500/15 bottom-[30%] right-[35%] animate-bubble" style={{animationDelay: '2.5s', animationDuration: '10s'}}></div>
        
        {/* Small Bubbles */}
        <div className="absolute w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-green-200/45 to-green-400/25 top-[15%] left-[35%] animate-bubble" style={{animationDelay: '0.5s', animationDuration: '6s'}}></div>
        <div className="absolute w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-emerald-300/40 to-emerald-500/20 top-[45%] left-[8%] animate-bubble" style={{animationDelay: '1.5s', animationDuration: '8s'}}></div>
        <div className="absolute w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-green-300/35 to-green-500/15 top-[60%] right-[12%] animate-bubble" style={{animationDelay: '3.5s', animationDuration: '9s'}}></div>
        <div className="absolute w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-emerald-200/40 to-emerald-400/20 bottom-[40%] left-[40%] animate-bubble" style={{animationDelay: '4.5s', animationDuration: '7s'}}></div>
        <div className="absolute w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-green-400/35 to-green-600/15 top-[25%] right-[40%] animate-bubble" style={{animationDelay: '5.5s', animationDuration: '8s'}}></div>
        
        {/* Tiny Bubbles */}
        <div className="absolute w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-emerald-300/50 to-emerald-500/25 top-[5%] left-[60%] animate-bubble" style={{animationDelay: '0.8s', animationDuration: '5s'}}></div>
        <div className="absolute w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-green-200/50 to-green-400/25 top-[30%] left-[70%] animate-bubble" style={{animationDelay: '2.2s', animationDuration: '6s'}}></div>
        <div className="absolute w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-emerald-400/45 to-emerald-600/20 top-[55%] left-[55%] animate-bubble" style={{animationDelay: '3.8s', animationDuration: '7s'}}></div>
        <div className="absolute w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-green-300/55 to-green-500/30 top-[70%] right-[45%] animate-bubble" style={{animationDelay: '1.2s', animationDuration: '5.5s'}}></div>
        <div className="absolute w-5 h-5 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-emerald-200/50 to-emerald-400/25 bottom-[10%] left-[65%] animate-bubble" style={{animationDelay: '4.2s', animationDuration: '6.5s'}}></div>
        <div className="absolute w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-green-400/40 to-green-600/20 top-[8%] right-[25%] animate-bubble" style={{animationDelay: '2.8s', animationDuration: '8s'}}></div>
        
        {/* Extra Bubbles for more density */}
        <div className="absolute w-7 h-7 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-emerald-300/35 to-emerald-500/15 top-[40%] right-[5%] animate-bubble" style={{animationDelay: '1.8s', animationDuration: '9s'}}></div>
        <div className="absolute w-9 h-9 sm:w-13 sm:h-13 rounded-full bg-gradient-to-br from-green-200/45 to-green-400/20 bottom-[25%] right-[55%] animate-bubble" style={{animationDelay: '3.2s', animationDuration: '7.5s'}}></div>
        <div className="absolute w-11 h-11 sm:w-15 sm:h-15 rounded-full bg-gradient-to-br from-emerald-400/30 to-emerald-600/15 top-[65%] left-[20%] animate-bubble" style={{animationDelay: '0.3s', animationDuration: '10s'}}></div>
        <div className="absolute w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-300/40 to-green-500/20 bottom-[5%] right-[30%] animate-bubble" style={{animationDelay: '4.8s', animationDuration: '6s'}}></div>
      </div>

      {/* Hero Section */}
      <main className="flex min-h-screen flex-col md:flex-row items-center justify-center md:justify-between px-4 sm:px-6 md:px-10 py-6 sm:py-8 md:py-10 relative z-10">
        {/* Left Side Content */}
        <div className="flex flex-col items-center md:items-start max-w-lg w-full md:w-auto pt-4 md:pt-0">
          {/* Event Logo */}
          <div className="mb-4 sm:mb-6">
            <div className="flex justify-center md:justify-start items-center gap-2 sm:gap-3 md:gap-5">
              <div>
                <Image
                  src="/logo.jpg"
                  alt="Government Logo"
                  width={90}
                  height={90}
                  className="rounded-full object-contain w-16 h-16 sm:w-20 sm:h-20 md:w-[90px] md:h-[90px]"
                />
              </div>
              <div>
                <Image
                  src="/logo1.png"
                  alt="Additional Logo"
                  width={90}
                  height={90}
                  className="rounded-full object-contain w-16 h-16 sm:w-20 sm:h-20 md:w-[90px] md:h-[90px]"
                />
              </div>
              <div>
                <Image
                  src="/logo5.jpg"
                  alt="Third Logo"
                  width={90}
                  height={90}
                  className="rounded-full object-contain w-16 h-16 sm:w-20 sm:h-20 md:w-[90px] md:h-[90px]"
                />
              </div>
            </div>
          </div>

          {/* System Title - Left Position */}
          <div className="mb-6 sm:mb-8 flex flex-col items-center md:items-start gap-0.5 sm:gap-1">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold bg-gradient-to-r from-green-700 via-green-600 to-emerald-600 bg-clip-text text-transparent text-center md:text-left drop-shadow-lg tracking-tight">
              JUDGING &
            </h1>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold bg-gradient-to-r from-emerald-600 via-green-600 to-green-700 bg-clip-text text-transparent text-center md:text-left drop-shadow-lg tracking-tight">
              TABULATION
            </h1>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold bg-gradient-to-r from-green-600 via-emerald-600 to-green-700 bg-clip-text text-transparent text-center md:text-left drop-shadow-lg tracking-tight">
              SYSTEM
            </h1>
            <div className="mt-3 sm:mt-4 w-24 sm:w-28 md:w-32 h-1 sm:h-1.5 bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 rounded-full shadow-lg shadow-green-500/40"></div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 sm:gap-3 mb-8 sm:mb-12 md:mb-16 items-center md:items-start w-full max-w-xs sm:max-w-sm md:max-w-none">
            <button 
              onClick={() => window.location.href = '/judge/login'}
              className="group flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 px-5 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/40 shadow-md shadow-green-500/30 transform border border-green-400/30 w-52 sm:w-56 md:w-60"
            >
              <span className="text-base sm:text-lg group-hover:scale-110 transition-transform duration-300">🔐</span>
              <span className="text-xs sm:text-sm md:text-base">Login as Judge</span>
            </button>
            <button 
              onClick={() => window.location.href = '/admin/login'}
              className="group flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 px-5 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-gray-700/30 shadow-md shadow-gray-700/30 transform border border-gray-600/30 w-52 sm:w-56 md:w-60"
            >
              <span className="text-base sm:text-lg group-hover:scale-110 transition-transform duration-300">🛠</span>
              <span className="text-xs sm:text-sm md:text-base">Admin Login</span>
            </button>
            <button 
              onClick={() => window.location.href = '/scoreboard'}
              className="group flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 px-5 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-emerald-500/40 shadow-md shadow-emerald-500/30 transform border border-emerald-400/30 w-52 sm:w-56 md:w-60"
            >
              <span className="text-base sm:text-lg group-hover:scale-110 transition-transform duration-300">📊</span>
              <span className="text-xs sm:text-sm md:text-base">View Scoreboard</span>
            </button>
          </div>
        </div>

        {/* Right Side Image */}
        <div className="hidden md:flex flex-col items-end justify-center relative">
          <div className="absolute top-0 right-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent drop-shadow-sm">
              Sulyog Festival 2026
            </h2>
          </div>
          <div className="flex justify-end animate-pulse" style={{animationDuration: '2s'}}>
            <Image
              src="/sulyog1.png"
              alt="Sulyog Festival"
              width={1500}
              height={1500}
              className="rounded-2xl object-contain hover:scale-105 transition-transform duration-500"
            />
          </div>
        </div>
      </main>

      {/* Live Events Information */}
      <div className="mt-8 sm:mt-12 md:mt-16 w-full mb-8 sm:mb-12 md:mb-16">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
            <div className="bg-gradient-to-b from-green-50 to-white backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-green-100 p-4 sm:p-6 md:p-8 lg:p-12">
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
                <div className="text-center mb-6 sm:mb-8 md:mb-12">
                  <div className="inline-block">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-green-700 via-green-600 to-emerald-600 bg-clip-text text-transparent mb-2 sm:mb-3">
                      {searchQuery ? 'Search Results' : 'Live Events'}
                    </h2>
                    <div className="h-1 w-20 sm:w-24 md:w-32 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 mx-auto rounded-full"></div>
                  </div>
                  <p className="text-sm sm:text-base md:text-lg text-gray-600 mt-3 sm:mt-4 mb-4 sm:mb-6 md:mb-8 max-w-2xl mx-auto px-2">
                    {searchQuery ? 'Events matching your search criteria' : 'Discover and join ongoing competitions'}
                  </p>
                  
                  {/* Search and Toggle Controls */}
                  <div className="max-w-xs sm:max-w-sm md:max-w-md mx-auto mb-4 sm:mb-6 px-2">
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
                        placeholder="Search events..."
                        className="w-full pl-10 pr-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-green-200 rounded-full focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none transition-all duration-200 bg-white shadow-md text-gray-800 placeholder-gray-400"
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
                    <div className="flex justify-center mb-4 sm:mb-6">
                      <button
                        onClick={() => setShowAllEvents(true)}
                        className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm sm:text-base font-medium rounded-full transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                      >
                        <span>📋</span>
                        <span className="hidden sm:inline">View All</span> {filteredEvents.length} Events
                      </button>
                    </div>
                  )}

                  {/* Show Less Button */}
                  {!searchQuery && showAllEvents && (
                    <div className="flex justify-center mb-4 sm:mb-6">
                      <button
                        onClick={() => setShowAllEvents(false)}
                        className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-600 hover:bg-gray-700 text-white text-sm sm:text-base font-medium rounded-full transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                      >
                        <span>⬆️</span>
                        Show Featured Only
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
                                <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl p-4 sm:p-6 text-center mx-2 sm:mx-4">
                                  <div className="text-gray-500 text-sm sm:text-base">📷 No contestant photos available</div>
                                  <p className="text-gray-400 text-xs sm:text-sm mt-2">Add photos to contestants to enable slideshow</p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        
                        {/* Event Details Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8 px-1 sm:px-0">
                          <div className="group text-center bg-white p-3 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-green-100">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-2 sm:mb-3 md:mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                              <span className="text-lg sm:text-xl md:text-2xl">📅</span>
                            </div>
                            <p className="text-[10px] sm:text-xs md:text-sm text-green-600 mb-1 font-medium uppercase tracking-wider">Date</p>
                            <p className="font-bold text-gray-800 text-xs sm:text-sm md:text-base">{event.date}</p>
                          </div>
                          
                          <div className="group text-center bg-white p-3 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-green-100">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-2 sm:mb-3 md:mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                              <span className="text-lg sm:text-xl md:text-2xl">⏰</span>
                            </div>
                            <p className="text-[10px] sm:text-xs md:text-sm text-emerald-600 mb-1 font-medium uppercase tracking-wider">Time</p>
                            <p className="font-bold text-gray-800 text-xs sm:text-sm md:text-base">{convertTo12Hour(event.time)}</p>
                          </div>
                          
                          <div className="group text-center bg-white p-3 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-green-100">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gradient-to-br from-green-600 to-emerald-500 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-2 sm:mb-3 md:mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                              <span className="text-lg sm:text-xl md:text-2xl">📍</span>
                            </div>
                            <p className="text-[10px] sm:text-xs md:text-sm text-green-600 mb-1 font-medium uppercase tracking-wider">Venue</p>
                            <p className="font-bold text-gray-800 text-xs sm:text-sm md:text-base truncate">{event.venue}</p>
                          </div>
                          
                          <div className="group text-center bg-white p-3 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-green-100">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gradient-to-br from-emerald-600 to-green-500 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-2 sm:mb-3 md:mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                              <span className="text-lg sm:text-xl md:text-2xl">🏆</span>
                            </div>
                            <p className="text-[10px] sm:text-xs md:text-sm text-emerald-600 mb-1 font-medium uppercase tracking-wider">Status</p>
                            <p className="font-bold text-gray-800 text-xs sm:text-sm md:text-base capitalize">{event.status}</p>
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
      <footer className="bg-gradient-to-b from-green-600 via-green-700 to-green-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* Logo & Title */}
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-xl sm:text-2xl">🏆</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold">Judging System</h3>
              </div>
              <p className="text-green-100 text-sm sm:text-base">
                Municipality of Bongabong, Oriental Mindoro
              </p>
            </div>
            
            {/* Contact Info */}
            <div className="text-center">
              <h4 className="font-semibold mb-3 text-green-100">Contact Us</h4>
              <div className="space-y-2 text-sm sm:text-base">
                <p className="flex items-center justify-center gap-2">
                  <span>📧</span>
                  <span className="text-green-100">contact@judgingsystem.com</span>
                </p>
                <p className="flex items-center justify-center gap-2">
                  <span>📱</span>
                  <span className="text-green-100">+63 912 345 6789</span>
                </p>
              </div>
            </div>
            
            {/* Quick Links */}
            <div className="text-center md:text-right">
              <h4 className="font-semibold mb-3 text-green-100">Quick Links</h4>
              <div className="space-y-2 text-sm sm:text-base">
                <p><a href="/judge/login" className="text-green-100 hover:text-white transition-colors">Judge Login</a></p>
                <p><a href="/admin/login" className="text-green-100 hover:text-white transition-colors">Admin Login</a></p>
                <p><a href="/scoreboard" className="text-green-100 hover:text-white transition-colors">Scoreboard</a></p>
              </div>
            </div>
          </div>
          
          {/* Bottom Bar */}
          <div className="border-t border-green-500/50 mt-6 sm:mt-8 pt-4 sm:pt-6 text-center">
            <p className="text-green-100 text-xs sm:text-sm">
              © 2026 Developed by BSIT Students – Mindoro State University Bongabong Campus
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
