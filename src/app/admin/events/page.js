'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, getDocs, collection, deleteDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function EventManagement() {
  const [events, setEvents] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    eventName: '',
    eventDescription: '',
    date: '',
    time: '',
    venue: '',
    status: 'upcoming',
    scoresLocked: false
  });

  // Load events from Firestore on component mount
  useEffect(() => {
    loadEvents();
  }, []);

  // Load events function
  const loadEvents = async () => {
    try {
      setLoading(true);
      const eventsCollection = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsCollection);
      const eventsList = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(eventsList);
    } catch (error) {
      console.error('Error loading events:', error);
      setError('Failed to load events from database. Please refresh the page.');
      // Load sample data as fallback
      const sampleEvents = [
        {
          id: 'sample-1',
          eventName: 'Grand Vocal Showdown 2026',
          eventDescription: 'Annual singing competition featuring best vocal talents in Bongabong',
          date: '2026-03-15',
          time: '6:00 PM',
          venue: 'University Auditorium',
          status: 'upcoming',
          scoresLocked: false,
          criteria: [
            { name: 'Vocal Quality', weight: 40, enabled: true },
            { name: 'Stage Presence', weight: 30, enabled: true },
            { name: 'Song Interpretation', weight: 20, enabled: true },
            { name: 'Audience Impact', weight: 10, enabled: true }
          ]
        },
        {
          id: 'sample-2',
          eventName: 'Battle of the Bands',
          eventDescription: 'Rock band competition for local musicians',
          date: '2026-02-28',
          time: '7:00 PM',
          venue: 'Municipal Gymnasium',
          status: 'ongoing',
          scoresLocked: false,
          criteria: [
            { name: 'Musical Performance', weight: 50, enabled: true },
            { name: 'Stage Presence', weight: 30, enabled: true },
            { name: 'Originality', weight: 20, enabled: true }
          ]
        },
        {
          id: 'sample-3',
          eventName: 'Acoustic Night 2025',
          eventDescription: 'Intimate acoustic performance showcase',
          date: '2025-12-20',
          time: '5:00 PM',
          venue: 'Community Center',
          status: 'finished',
          scoresLocked: true,
          criteria: [
            { name: 'Vocal Quality', weight: 60, enabled: true },
            { name: 'Song Choice', weight: 40, enabled: true }
          ]
        }
      ];
      setEvents(sampleEvents);
    } finally {
      setLoading(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeDropdown && !event.target.closest('.dropdown-menu')) {
        closeDropdown();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddEvent = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Add default criteria if not provided
      const eventData = {
        ...formData,
        criteria: [
          { name: 'Vocal Quality', weight: 40, enabled: true },
          { name: 'Stage Presence', weight: 30, enabled: true },
          { name: 'Song Interpretation', weight: 20, enabled: true },
          { name: 'Audience Impact', weight: 10, enabled: true }
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Save to Firestore
      const eventsCollection = collection(db, 'events');
      const docRef = await addDoc(eventsCollection, eventData);
      
      // Add the new event to local state with the Firestore ID
      const newEvent = {
        id: docRef.id,
        ...eventData
      };
      
      setEvents([...events, newEvent]);
      setShowAddModal(false);
      resetForm();
      
      alert(`Event "${formData.eventName}" has been created successfully!`);
    } catch (error) {
      console.error('Error adding event:', error);
      setError('Failed to create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditEvent = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Update event in Firestore
      const eventRef = doc(db, 'events', editingEvent.id);
      const updatedData = {
        ...formData,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(eventRef, updatedData);
      
      // Update local state
      setEvents(events.map(event => 
        event.id === editingEvent.id 
          ? { ...event, ...updatedData }
          : event
      ));
      
      setShowEditModal(false);
      setEditingEvent(null);
      resetForm();
      
      alert(`Event "${formData.eventName}" has been updated successfully!`);
    } catch (error) {
      console.error('Error updating event:', error);
      setError('Failed to update event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Delete from Firestore
      const eventRef = doc(db, 'events', eventId);
      await deleteDoc(eventRef);
      
      // Update local state
      setEvents(events.filter(event => event.id !== eventId));
      
      alert('Event has been deleted successfully!');
    } catch (error) {
      console.error('Error deleting event:', error);
      setError('Failed to delete event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleScoresLock = async (eventId) => {
    setLoading(true);
    setError('');
    
    try {
      const event = events.find(e => e.id === eventId);
      if (!event) return;
      
      // Update in Firestore
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, {
        scoresLocked: !event.scoresLocked,
        updatedAt: serverTimestamp()
      });
      
      // Update local state
      setEvents(events.map(event => 
        event.id === eventId 
          ? { ...event, scoresLocked: !event.scoresLocked }
          : event
      ));
      
      const status = !event.scoresLocked ? 'locked' : 'unlocked';
      alert(`Event scores have been ${status} successfully!`);
    } catch (error) {
      console.error('Error toggling scores lock:', error);
      setError('Failed to update scores lock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (event) => {
    setEditingEvent(event);
    setFormData({
      eventName: event.eventName,
      eventDescription: event.eventDescription,
      date: event.date,
      time: event.time,
      venue: event.venue,
      status: event.status,
      scoresLocked: event.scoresLocked
    });
    setShowEditModal(true);
  };

  const openCriteriaModal = (event) => {
    setSelectedEvent(event);
    setShowCriteriaModal(true);
  };

  const handleCriteriaChange = (index, field, value) => {
    const updatedEvent = { ...selectedEvent };
    updatedEvent.criteria[index][field] = value;
    setSelectedEvent(updatedEvent);
  };

  const handleSaveCriteria = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Update criteria in Firestore
      const eventRef = doc(db, 'events', selectedEvent.id);
      await updateDoc(eventRef, {
        criteria: selectedEvent.criteria,
        updatedAt: serverTimestamp()
      });
      
      // Update local state
      setEvents(events.map(event => 
        event.id === selectedEvent.id 
          ? { ...event, criteria: selectedEvent.criteria }
          : event
      ));
      
      setShowCriteriaModal(false);
      setSelectedEvent(null);
      
      alert('Criteria have been saved successfully!');
    } catch (error) {
      console.error('Error saving criteria:', error);
      setError('Failed to save criteria. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addCriteria = () => {
    const updatedEvent = { ...selectedEvent };
    updatedEvent.criteria.push({
      name: '',
      weight: 0,
      enabled: true
    });
    setSelectedEvent(updatedEvent);
  };

  const removeCriteria = (index) => {
    const updatedEvent = { ...selectedEvent };
    updatedEvent.criteria.splice(index, 1);
    setSelectedEvent(updatedEvent);
  };

  const toggleDropdown = (eventId, event) => {
    if (activeDropdown === eventId) {
      setActiveDropdown(null);
    } else {
      const rect = event.target.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      setDropdownPosition({
        top: rect.bottom + scrollTop + 4,
        right: window.innerWidth - rect.right - scrollLeft + 4
      });
      setActiveDropdown(eventId);
    }
  };

  const closeDropdown = () => {
    setActiveDropdown(null);
  };

  const resetForm = () => {
    setFormData({
      eventName: '',
      eventDescription: '',
      date: '',
      time: '',
      venue: '',
      status: 'upcoming',
      scoresLocked: false
    });
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'upcoming': return 'bg-blue-100 text-blue-800';
      case 'ongoing': return 'bg-green-100 text-green-800';
      case 'finished': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'upcoming': return '📅';
      case 'ongoing': return '🎭';
      case 'finished': return '✅';
      default: return '📋';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:hidden ${
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Event Management</h2>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="text-white hover:text-purple-200 transition-colors p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-purple-100 text-sm">Create and manage competition events</p>
          </div>
          
          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <button
              onClick={() => { setShowAddModal(true); setMobileSidebarOpen(false); }}
              disabled={loading}
              className="w-full flex items-center gap-3 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mb-6 touch-manipulation active:scale-95"
            >
              <span className="text-xl">➕</span>
              <span className="font-medium">{loading ? 'Loading...' : 'Add Event'}</span>
            </button>
            
            {/* Quick Stats */}
            <div className="space-y-3">
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">📋</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-purple-900">Total Events</p>
                    <p className="text-2xl font-bold text-purple-600">{events.length}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-green-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">🎭</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-900">Ongoing Events</p>
                    <p className="text-2xl font-bold text-green-600">{events.filter(e => e.status === 'ongoing').length}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">🔒</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-900">Locked Events</p>
                    <p className="text-2xl font-bold text-blue-600">{events.filter(e => e.scoresLocked).length}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Sidebar Footer */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={() => { router.push('/admin/dashboard'); setMobileSidebarOpen(false); }}
              className="w-full flex items-center gap-3 text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors touch-manipulation active:scale-95"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      
      {/* Main Content */}
      <div className="lg:pl-0">
        {/* Desktop Header */}
        <div className="hidden lg:flex justify-between items-center p-6 bg-white shadow-sm border-b border-gray-200">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Event Management</h2>
            <p className="text-gray-600">Create and manage competition events</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-xl">➕</span>
            {loading ? 'Loading...' : 'Add Event'}
          </button>
        </div>
        
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white shadow-sm border-b border-gray-200">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation active:scale-95"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Events</h1>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={loading}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation active:scale-95"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span>{error}</span>
              <button
                onClick={() => setError('')}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
              <span className="text-gray-700">Processing...</span>
            </div>
          </div>
        )}

        {/* Events Table */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 mx-4 lg:mx-6 mb-6">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 lg:px-6 py-3 lg:py-4">
            <h3 className="text-base lg:text-lg font-semibold text-white">Events List</h3>
            <p className="text-purple-100 text-xs lg:text-sm">Manage and track all competition events</p>
          </div>
          
          {/* Mobile Card View */}
          <div className="lg:hidden">
            {events.map((event) => (
              <div key={event.id} className="border-b border-gray-100 last:border-b-0 p-4 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all duration-200">
                {/* Event Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 rounded-lg flex items-center justify-center text-lg ${getStatusColor(event.status)}`}>
                      {getStatusIcon(event.status)}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{event.eventName}</h4>
                      <p className="text-xs text-gray-500">ID: #{event.id.toString().padStart(4, '0')}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => toggleDropdown(event.id, e)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 touch-manipulation active:scale-95"
                    title="More actions"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                </div>
                
                {/* Event Description */}
                <div className="mb-3">
                  <p className="text-xs text-gray-600 line-clamp-2">{event.eventDescription}</p>
                </div>
                
                {/* Event Details Grid */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <span className="text-blue-600">📅</span>
                      <span>Date</span>
                    </div>
                    <p className="text-xs font-medium text-gray-900">{event.date}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <span className="text-blue-600">🕐</span>
                      <span>Time</span>
                    </div>
                    <p className="text-xs font-medium text-gray-900">{event.time}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <span className="text-orange-600">📍</span>
                      <span>Venue</span>
                    </div>
                    <p className="text-xs font-medium text-gray-900 truncate">{event.venue}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <span className="text-green-600">📊</span>
                      <span>Status</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full ${getStatusColor(event.status)} shadow-sm`}>
                        <span>{getStatusIcon(event.status)}</span>
                        {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                      </span>
                      {event.scoresLocked && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                          <span>🔒</span>
                          Locked
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Mobile Dropdown Menu */}
                {activeDropdown === event.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { openEditModal(event); closeDropdown(); }}
                        className="flex items-center justify-center gap-1 px-2 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation active:scale-95"
                      >
                        <span className="text-blue-600">✏️</span>
                        Edit
                      </button>
                      <button
                        onClick={() => { openCriteriaModal(event); closeDropdown(); }}
                        className="flex items-center justify-center gap-1 px-2 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation active:scale-95"
                      >
                        <span className="text-blue-600">📋</span>
                        Criteria
                      </button>
                      <button
                        onClick={() => { router.push(`/admin/events/${event.id}/contestants`); closeDropdown(); }}
                        className="flex items-center justify-center gap-1 px-2 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation active:scale-95"
                      >
                        <span className="text-green-600">👥</span>
                        Contestants
                      </button>
                      <button
                        onClick={() => { handleToggleScoresLock(event.id); closeDropdown(); }}
                        className="flex items-center justify-center gap-1 px-2 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation active:scale-95"
                      >
                        <span>{event.scoresLocked ? '🔓' : '🔒'}</span>
                        {event.scoresLocked ? 'Unlock' : 'Lock'}
                      </button>
                      <button
                        onClick={() => { router.push(`/admin/scoreboard?eventId=${event.id}`); closeDropdown(); }}
                        className="flex items-center justify-center gap-1 px-2 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation active:scale-95"
                      >
                        <span className="text-blue-600">📊</span>
                        Scoreboard
                      </button>
                      <button
                        onClick={() => { handleDeleteEvent(event.id); closeDropdown(); }}
                        className="flex items-center justify-center gap-1 px-2 py-2 text-xs text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors touch-manipulation active:scale-95"
                      >
                        <span>🗑️</span>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Event Details</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Schedule</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all duration-200">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-lg ${getStatusColor(event.status)}`}>
                          {getStatusIcon(event.status)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{event.eventName}</div>
                          <div className="text-xs text-gray-500">ID: #{event.id.toString().padStart(4, '0')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-xs">
                        <p className="text-sm text-gray-700 line-clamp-2">{event.eventDescription}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                          <span className="text-blue-600">📅</span>
                          {event.date}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span className="text-blue-600">🕐</span>
                          {event.time}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-orange-600">📍</span>
                        <span className="text-sm text-gray-900">{event.venue}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full ${getStatusColor(event.status)} shadow-sm`}>
                          <span>{getStatusIcon(event.status)}</span>
                          {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                        </span>
                        {event.scoresLocked && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                            <span>🔒</span>
                            Locked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative dropdown-menu">
                        <button
                          onClick={(e) => toggleDropdown(event.id, e)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                          title="More actions"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>

                        {/* Dropdown Menu */}
                        {activeDropdown === event.id && (
                          <div 
                            className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
                            style={{
                              top: `${dropdownPosition.top}px`,
                              right: `${dropdownPosition.right}px`
                            }}
                          >
                            <button
                              onClick={() => { openEditModal(event); closeDropdown(); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <span className="text-blue-600">✏️</span>
                              Edit Event
                            </button>
                            <button
                              onClick={() => { openCriteriaModal(event); closeDropdown(); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <span className="text-blue-600">📋</span>
                              Manage Criteria
                            </button>
                            <button
                              onClick={() => { router.push(`/admin/events/${event.id}/contestants`); closeDropdown(); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <span className="text-green-600">👥</span>
                              Manage Contestants
                            </button>
                            <button
                              onClick={() => { handleToggleScoresLock(event.id); closeDropdown(); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <span>{event.scoresLocked ? '🔓' : '🔒'}</span>
                              {event.scoresLocked ? 'Unlock Scores' : 'Lock Scores'}
                            </button>
                            <button
                              onClick={() => { router.push(`/admin/scoreboard?eventId=${event.id}`); closeDropdown(); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <span className="text-blue-600">📊</span>
                              View Scoreboard
                            </button>
                            <hr className="my-1 border-gray-200" />
                            <button
                              onClick={() => { handleDeleteEvent(event.id); closeDropdown(); }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <span>🗑️</span>
                              Delete Event
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Empty State */}
        {events.length === 0 && (
          <div className="text-center py-8 lg:py-12 mx-4 lg:mx-6">
            <div className="text-4xl lg:text-6xl mb-3 lg:mb-4">📋</div>
            <h3 className="text-base lg:text-lg font-medium text-gray-900 mb-1 lg:mb-2">No events yet</h3>
            <p className="text-xs lg:text-sm text-gray-500 mb-3 lg:mb-4 px-4">Create your first event to get started</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 text-white px-4 lg:px-6 py-2 lg:py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm lg:text-base"
            >
              Add Event
            </button>
          </div>
        )}

        {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Add New Event</h3>
                  <p className="text-purple-100 text-sm mt-1">Create a new competition event</p>
                </div>
                <button
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="text-white hover:text-purple-200 transition-colors p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleAddEvent(); }} className="space-y-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⚠️</span>
                      <span>{error}</span>
                    </div>
                  </div>
                )}
                {/* Event Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Event Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="eventName"
                    value={formData.eventName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 bg-white"
                    placeholder="Enter event name"
                    required
                  />
                </div>

                {/* Event Description */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Event Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="eventDescription"
                    value={formData.eventDescription}
                    onChange={handleInputChange}
                    rows="4"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 bg-white resize-none"
                    placeholder="Describe the event details"
                    required
                  />
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={formData.date}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      name="time"
                      value={formData.time}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 bg-white"
                      required
                    />
                  </div>
                </div>

                {/* Venue */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Venue <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="venue"
                    value={formData.venue}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 bg-white"
                    placeholder="Enter venue location"
                    required
                  />
                </div>

                {/* Event Status */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Event Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 bg-white"
                  >
                    <option value="upcoming">📅 Upcoming</option>
                    <option value="ongoing">🎭 Ongoing</option>
                    <option value="finished">✅ Finished</option>
                  </select>
                </div>

                {/* Form Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    <span className="flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <span>➕</span>
                          <span>Add Event</span>
                        </>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-200 transition-all duration-200 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Event</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleEditEvent(); }} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    <span>{error}</span>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
                <input
                  type="text"
                  name="eventName"
                  value={formData.eventName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Description</label>
                <textarea
                  name="eventDescription"
                  value={formData.eventDescription}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                  <input
                    type="time"
                    name="time"
                    value={formData.time}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
                <input
                  type="text"
                  name="venue"
                  value={formData.venue}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="finished">Finished</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Updating...</span>
                    </div>
                  ) : (
                    'Update Event'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingEvent(null); resetForm(); }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Criteria Management Modal */}
      {showCriteriaModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Manage Criteria</h3>
                  <p className="text-purple-100 text-sm mt-1">Configure judging criteria for {selectedEvent.eventName}</p>
                </div>
                <button
                  onClick={() => { setShowCriteriaModal(false); setSelectedEvent(null); }}
                  className="text-white hover:text-purple-200 transition-colors p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="space-y-4">
                {selectedEvent.criteria.map((criterion, index) => (
                  <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">Criteria {index + 1}</h4>
                      <button
                        onClick={() => removeCriteria(index)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Remove Criteria"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Criteria Name</label>
                        <input
                          type="text"
                          value={criterion.name}
                          onChange={(e) => handleCriteriaChange(index, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                          placeholder="Enter criteria name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Weight (%)</label>
                        <input
                          type="number"
                          value={criterion.weight}
                          onChange={(e) => handleCriteriaChange(index, 'weight', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                          placeholder="Weight"
                          min="0"
                          max="100"
                        />
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={criterion.enabled}
                            onChange={(e) => handleCriteriaChange(index, 'enabled', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Enabled</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add Criteria Button */}
                <button
                  onClick={addCriteria}
                  className="w-full py-3 px-4 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <span className="text-xl">➕</span>
                  Add New Criteria
                </button>

                {/* Total Weight Display */}
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-blue-900">Total Weight:</span>
                    <span className={`font-bold ${selectedEvent.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0) === 100 ? 'text-green-600' : 'text-orange-600'}`}>
                      {selectedEvent.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)}%
                    </span>
                  </div>
                  {selectedEvent.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0) !== 100 && (
                    <p className="text-sm text-orange-600 mt-2">⚠️ Total weight should equal 100%</p>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100 mt-6">
                <button
                  onClick={handleSaveCriteria}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                >
                  <span className="flex items-center justify-center gap-2">
                    <span>💾</span>
                    Save Criteria
                  </span>
                </button>
                <button
                  onClick={() => { setShowCriteriaModal(false); setSelectedEvent(null); }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-200 transition-all duration-200 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
