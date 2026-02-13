'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, getDocs, collection, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function EventJudgeManagement() {
  const [events, setEvents] = useState([]);
  const [judges, setJudges] = useState([]);
  const [eventJudges, setEventJudges] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Get eventId from URL
  const [eventId, setEventId] = useState(null);

  useEffect(() => {
    // Get eventId from URL
    if (typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/');
      const id = pathParts[pathParts.length - 2];
      setEventId(id);
      
    }
  }, []);

  // Load events and judges
  useEffect(() => {
    loadEvents();
    loadJudges();
  }, []);

  // Load event judges when eventId is set
  useEffect(() => {
    if (eventId) {
      loadEventJudges(eventId);
    }
  }, [eventId]);


  const loadEvents = async () => {
    try {
      // For now, use sample data since events are not in Firestore yet
      const sampleEvents = [
        {
          id: 1,
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
          id: 2,
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
        }
      ];
      setEvents(sampleEvents);
      
      // Set selected event based on eventId
      const event = sampleEvents.find(e => e.id.toString() === eventId);
      setSelectedEvent(event);
    } catch (error) {
      console.error('Error loading events:', error);
    }
  };

  const loadJudges = async () => {
    try {
      const judgesCollection = collection(db, 'judges');
      const judgesSnapshot = await getDocs(judgesCollection);
      const judgesList = judgesSnapshot.docs.map(doc => ({
        id: doc.id,
        uid: doc.id,
        ...doc.data()
      }));
      setJudges(judgesList);
    } catch (error) {
      console.error('Error loading judges:', error);
      setJudges([]);
    }
  };

  const loadEventJudges = async (id) => {
    try {
      // For now, use empty array since event-judge assignments are not in Firestore yet
      setEventJudges([]);
    } catch (error) {
      console.error('Error loading event judges:', error);
      setEventJudges([]);
    }
  };


  const handleRemoveJudge = async (eventJudgeId) => {
    if (!confirm('Are you sure you want to remove this judge from the event?')) return;

    try {
      // Remove judge from event
      const eventJudge = eventJudges.find(ej => ej.id === eventJudgeId);
      if (eventJudge) {
        setEventJudges(eventJudges.filter(ej => ej.id !== eventJudgeId));
        
        // Update judge's assigned events in Firestore
        const judge = judges.find(j => j.id === eventJudge.judgeId);
        if (judge) {
          const judgeRef = doc(db, 'judges', judge.uid);
          const judgeDoc = await getDoc(judgeRef);
          if (judgeDoc.exists()) {
            const currentData = judgeDoc.data();
            const assignedEvents = currentData.assignedEvents || [];
            await updateDoc(judgeRef, {
              assignedEvents: assignedEvents.filter(id => id !== selectedEvent.id)
            });
          }
        }
      }
    } catch (error) {
      console.error('Error removing judge:', error);
      setError('Failed to remove judge from event');
    }
  };


  const getStatusColor = (status) => {
    return status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Event Judge Management</h1>
          <p className="text-gray-600">
            {selectedEvent ? `Manage judges for: ${selectedEvent.eventName}` : 'Loading event...'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors shadow-lg"
          >
            <span className="text-xl">←</span>
            Back to Events
          </button>
        </div>
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

      {/* Event Details */}
      {selectedEvent && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Event Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Event Name</p>
              <p className="font-semibold text-gray-900">{selectedEvent.eventName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Date & Time</p>
              <p className="font-semibold text-gray-900">{selectedEvent.date} at {selectedEvent.time}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Venue</p>
              <p className="font-semibold text-gray-900">{selectedEvent.venue}</p>
            </div>
          </div>
        </div>
      )}

      {/* Assigned Judges Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Assigned Judges</h3>
          <p className="text-blue-100 text-sm">Judges currently assigned to this event</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Judge Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {eventJudges.map((eventJudge) => (
                <tr key={eventJudge.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{eventJudge.judgeName}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{eventJudge.judgeEmail}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {new Date(eventJudge.assignedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(eventJudge.status)}`}>
                      <span>{eventJudge.status === 'active' ? '✅' : '❌'}</span>
                      {eventJudge.status.charAt(0).toUpperCase() + eventJudge.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleRemoveJudge(eventJudge.id)}
                      className="text-red-600 hover:text-red-800 font-medium text-sm"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {eventJudges.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🧑‍⚖️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No judges assigned yet</h3>
          <p className="text-gray-500">Judges can be assigned to this event from the main Judge Management page</p>
        </div>
      )}

    </div>
  );
}
