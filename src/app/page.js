'use client';

import Image from "next/image";
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function Home() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [contestants, setContestants] = useState([]);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [currentContestant, setCurrentContestant] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentEventSlideIndex, setCurrentEventSlideIndex] = useState({});
  const [isMobile, setIsMobile] = useState(false);

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  useEffect(() => {
    // Fetch all events from Firestore
    const eventsCollection = collection(db, 'events');
    
    const unsubscribeEvents = onSnapshot(eventsCollection, (snapshot) => {
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

    // Fetch contestants from Firestore
    const contestantsCollection = collection(db, 'contestants');
    
    const unsubscribeContestants = onSnapshot(contestantsCollection, (snapshot) => {
      const allContestants = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Loaded contestants:', allContestants);
      console.log('Contestants with photos:', allContestants.filter(c => c.photo && c.photo.trim() !== ''));
      setContestants(allContestants);
    }, (error) => {
      console.error('Error fetching contestants:', error);
      setContestants([]);
    });

    return () => {
      unsubscribeEvents();
      unsubscribeContestants();
    };
  }, []);

  // Add keyboard event listener for ESC key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && showSlideshow) {
        closeSlideshow();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSlideshow]);

  // Get contestants for a specific event
  const getEventContestants = (eventId) => {
    // Only show contestants with actual photos
    const eventContestants = contestants.filter(contestant => 
      contestant.eventId === eventId && 
      contestant.photo && 
      contestant.photo.trim() !== '' &&
      contestant.photo.startsWith('data:')
    );
    console.log('Event ID:', eventId);
    console.log('All contestants for event:', contestants.filter(c => c.eventId === eventId));
    console.log('Contestants with photos:', eventContestants);
    return eventContestants.slice(0, 6); // Limit to 6 contestants for display
  };

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

  // Filter events based on search query
  const filteredEvents = events.filter(event => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    return (
      event.eventName?.toLowerCase().includes(query) ||
      event.eventDescription?.toLowerCase().includes(query) ||
      event.date?.toLowerCase().includes(query) ||
      event.venue?.toLowerCase().includes(query)
    );
  });

  // Slideshow functions
  const openSlideshow = (contestant) => {
    setCurrentContestant(contestant);
    setCurrentImageIndex(0);
    setShowSlideshow(true);
  };

  const closeSlideshow = () => {
    setShowSlideshow(false);
    setCurrentContestant(null);
    setCurrentImageIndex(0);
  };

  const nextImage = () => {
    if (currentContestant && currentContestant.photo) {
      // For now, we only have one image per contestant, but this prepares for multiple images
      setCurrentImageIndex((prev) => (prev + 1) % 1);
    }
  };

  const prevImage = () => {
    if (currentContestant && currentContestant.photo) {
      // For now, we only have one image per contestant, but this prepares for multiple images
      setCurrentImageIndex((prev) => (prev - 1 + 1) % 1);
    }
  };

  // Event slideshow functions
  const nextEventSlide = (eventId) => {
    const contestants = getEventContestants(eventId);
    const imagesToShow = isMobile ? 1 : 6;
    const maxIndex = Math.max(0, contestants.length - imagesToShow + 1);
    
    setCurrentEventSlideIndex(prev => ({
      ...prev,
      [eventId]: Math.min((prev[eventId] || 0) + 1, maxIndex)
    }));
  };

  const prevEventSlide = (eventId) => {
    setCurrentEventSlideIndex(prev => ({
      ...prev,
      [eventId]: Math.max((prev[eventId] || 0) - 1, 0)
    }));
  };

  const goToEventSlide = (eventId, index) => {
    const contestants = getEventContestants(eventId);
    const imagesToShow = isMobile ? 1 : 6;
    const maxIndex = Math.max(0, contestants.length - imagesToShow + 1);
    
    setCurrentEventSlideIndex(prev => ({
      ...prev,
      [eventId]: Math.min(index, maxIndex)
    }));
  };

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
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  {searchQuery ? 'Search Results' : 'Live Events'}
                </h2>
                <p className="text-lg text-gray-600 mb-6">
                  {searchQuery 
                    ? `Events matching "${searchQuery}"`
                    : showAllEvents 
                      ? 'All competitions and events'
                      : 'Featured competition'
                  }
                </p>
                
                {/* Search and Toggle Controls */}
                <div className="max-w-md mx-auto mb-6">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400">🔍</span>
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowAllEvents(true); // Show all events when searching
                      }}
                      placeholder="Search events by name, description, venue, status..."
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 bg-white shadow-sm"
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
                  {(showAllEvents || searchQuery ? filteredEvents : [getFeaturedEvent()]).map((event) => {
                    const eventContestants = getEventContestants(event.id);
                    return (
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
                    
                    {/* Contestants Photos Section */}
                    {eventContestants.length > 0 && (
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="text-md font-semibold text-gray-900">Featured Contestants</h5>
                          <span className="text-sm text-gray-500">
                            {(currentEventSlideIndex[event.id] || 0) + 1} of {eventContestants.length}
                          </span>
                        </div>
                        
                        <div className="relative">
                          <div className="flex items-center justify-center gap-4">
                            {/* Previous Button */}
                            {eventContestants.length > 1 && (
                              <button
                                onClick={() => prevEventSlide(event.id)}
                                className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors shadow-md"
                                aria-label="Previous contestant"
                              >
                                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                            )}
                            
                            {/* Contestant Images - Show 1 on mobile, 2 on larger screens */}
                            <div className="flex gap-4 justify-center">
                              {eventContestants.slice(
                                currentEventSlideIndex[event.id] || 0, 
                                (currentEventSlideIndex[event.id] || 0) + (isMobile ? 1 : 6)
                              ).map((contestant, index) => (
                                <div 
                                  key={contestant.id}
                                  className="relative group cursor-pointer"
                                  onClick={() => openSlideshow(contestant)}
                                >
                                  <div className="w-40 h-56 sm:w-48 sm:h-72 rounded-lg overflow-hidden bg-gray-100 border-2 border-gray-200 group-hover:border-blue-400 transition-all duration-200 group-hover:shadow-lg">
                                    <img
                                      src={contestant.photo}
                                      alt={contestant.displayName || `${contestant.firstName} ${contestant.lastName}`}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                    />
                                  </div>
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                                    <div className="absolute bottom-0 left-0 right-0 p-2">
                                      <p className="text-white text-xs font-medium truncate">
                                        {contestant.displayName || `${contestant.firstName} ${contestant.lastName}`}
                                      </p>
                                      <p className="text-white/80 text-xs">
                                        #{contestant.contestantNumber}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Next Button */}
                            {eventContestants.length > 1 && (
                              <button
                                onClick={() => nextEventSlide(event.id)}
                                className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors shadow-md"
                                aria-label="Next contestant"
                              >
                                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            )}
                          </div>
                          
                          {/* Dots Indicator */}
                          {eventContestants.length > 1 && (
                            <div className="flex justify-center gap-2 mt-4">
                              {Array.from({ 
                                length: Math.max(1, eventContestants.length - (isMobile ? 0 : 5)) 
                              }).map((_, index) => (
                                <button
                                  key={index}
                                  onClick={() => goToEventSlide(event.id, index)}
                                  className={`w-2 h-2 rounded-full transition-colors ${
                                    index === (currentEventSlideIndex[event.id] || 0)
                                      ? 'bg-blue-600'
                                      : 'bg-gray-300 hover:bg-gray-400'
                                  }`}
                                  aria-label={`Go to slide ${index + 1}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {eventContestants.length >= 2 && (
                          <p className="text-sm text-gray-500 mt-3 text-center">
                            Click on any contestant to view details • View all in scoreboard
                          </p>
                        )}
                      </div>
                    )}
                    
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
                      <div className="flex items-center justify-between mb-4">
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
                  );
                  })}
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

      {/* Contestant Photo Slideshow Modal */}
      {showSlideshow && currentContestant && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={closeSlideshow}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* Close Button */}
            <button
              onClick={closeSlideshow}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Main Image Container */}
            <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
              {/* Contestant Info Header */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">
                      {currentContestant.displayName || `${currentContestant.firstName} ${currentContestant.lastName}`}
                    </h3>
                    <p className="text-blue-100">
                      Contestant #{currentContestant.contestantNumber} • {currentContestant.contestantType === 'group' ? 'Group' : `Age ${currentContestant.age}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-blue-100">Photo</p>
                    <p className="text-lg font-bold">1 of 1</p>
                  </div>
                </div>
              </div>

              {/* Image Display */}
              <div className="relative bg-gray-100" style={{ paddingBottom: '75%' }}>
                <img
                  src={currentContestant.photo}
                  alt={currentContestant.displayName || `${currentContestant.firstName} ${currentContestant.lastName}`}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>

              {/* Navigation Controls */}
              <div className="bg-gray-50 p-4 flex items-center justify-between">
                <button
                  onClick={prevImage}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 p-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={true} // Disabled since we only have one image
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="text-center">
                  <p className="text-sm text-gray-500">Click outside or press ESC to close</p>
                </div>

                <button
                  onClick={nextImage}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 p-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={true} // Disabled since we only have one image
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Additional Contestant Details */}
            <div className="mt-4 bg-white rounded-lg p-4 shadow-lg">
              <h4 className="font-semibold text-gray-900 mb-2">Contestant Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Full Name:</span>
                  <span className="ml-2 font-medium">
                    {currentContestant.displayName || `${currentContestant.firstName} ${currentContestant.lastName}`}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className="ml-2 font-medium">
                    {currentContestant.contestantType === 'group' ? 'Group Performance' : 'Solo Performance'}
                  </span>
                </div>
                {currentContestant.contestantType === 'solo' && (
                  <div>
                    <span className="text-gray-500">Age:</span>
                    <span className="ml-2 font-medium">{currentContestant.age}</span>
                  </div>
                )}
                {currentContestant.contestantType === 'group' && currentContestant.groupName && (
                  <div>
                    <span className="text-gray-500">Group Name:</span>
                    <span className="ml-2 font-medium">{currentContestant.groupName}</span>
                  </div>
                )}
                {currentContestant.contestantType === 'group' && currentContestant.groupLeader && (
                  <div>
                    <span className="text-gray-500">Group Leader:</span>
                    <span className="ml-2 font-medium">{currentContestant.groupLeader}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Contact:</span>
                  <span className="ml-2 font-medium">{currentContestant.contactNumber}</span>
                </div>
                <div>
                  <span className="text-gray-500">Address:</span>
                  <span className="ml-2 font-medium">{currentContestant.address}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
