'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, where } from 'firebase/firestore';

export default function AdminScoreboard() {
  const [contestants, setContestants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contestInfo, setContestInfo] = useState(null);
  const [selectedContestant, setSelectedContestant] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [highestScorer, setHighestScorer] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [scores, setScores] = useState([]); // Store individual judge scores
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLive, setIsLive] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [updatedContestants, setUpdatedContestants] = useState(new Set()); // Track recently updated contestants

  useEffect(() => {
    // Fetch events and auto-select the first ongoing or upcoming event
    const eventsCollection = collection(db, 'events');
    const unsubscribeEvents = onSnapshot(eventsCollection, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort events: ongoing first, then upcoming, then finished
      eventsData.sort((a, b) => {
        const statusPriority = { ongoing: 0, upcoming: 1, finished: 2 };
        const priorityA = statusPriority[a.status] || 3;
        const priorityB = statusPriority[b.status] || 3;
        
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        
        const dateA = a.createdAt?.toMillis?.() || 0;
        const dateB = b.createdAt?.toMillis?.() || 0;
        return dateB - dateA;
      });
      
      setEvents(eventsData);
      
      // Auto-select the first ongoing or upcoming event
      if (eventsData.length > 0) {
        setSelectedEvent(eventsData[0]);
      }
    });

    // Fetch scores for aggregation
    const scoresCollection = collection(db, 'scores');
    const unsubscribeScores = onSnapshot(scoresCollection, (snapshot) => {
      const scoresData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setScores(scoresData);
      
      // Trigger contestant recalculation when scores change
      if (selectedEvent && snapshot.docChanges().length > 0) {
        const changes = snapshot.docChanges();
        const relevantChanges = changes.filter(change => 
          change.doc.data().eventId === selectedEvent.id
        );
        
        if (relevantChanges.length > 0) {
          console.log(`Admin score update: ${relevantChanges.length} score(s) updated for event ${selectedEvent.id}`);
          
          // Track which contestants were updated
          const updatedIds = new Set();
          relevantChanges.forEach(change => {
            const contestantId = change.doc.data().contestantId;
            if (contestantId) {
              updatedIds.add(contestantId);
            }
          });
          
          // Update the tracking set
          setUpdatedContestants(prev => new Set([...prev, ...updatedIds]));
          
          // Clear the updated indicators after 3 seconds
          setTimeout(() => {
            setUpdatedContestants(prev => {
              const newSet = new Set(prev);
              updatedIds.forEach(id => newSet.delete(id));
              return newSet;
            });
          }, 3000);
          
          // Show update notification
          const updateIndicator = document.createElement('div');
          updateIndicator.className = 'fixed top-4 right-4 bg-purple-500 text-white px-4 py-2 rounded-lg text-sm z-50 animate-pulse shadow-lg flex items-center gap-2';
          updateIndicator.innerHTML = `
            <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>🔄 Admin Score Update</span>
          `;
          document.body.appendChild(updateIndicator);
          
          setTimeout(() => {
            if (document.body.contains(updateIndicator)) {
              document.body.removeChild(updateIndicator);
            }
          }, 3000);
        }
      }
    });

    return () => {
      unsubscribeEvents();
      unsubscribeScores();
    };
  }, []);

  // Calculate aggregated scores from all judges for a contestant (same as live scoreboard)
  const calculateAggregatedScore = (contestantId, eventId) => {
    const contestantScores = scores.filter(score => 
      score.contestantId === contestantId && score.eventId === eventId
    );
    
    if (contestantScores.length === 0) {
      return { totalScore: 0, judgeCount: 0, criteriaScores: {} };
    }
    
    // Count unique judges (not total score entries)
    const uniqueJudges = [...new Set(contestantScores.map(score => score.judgeId))];
    
    // Get criteria from the event
    const event = events.find(e => e.id === eventId);
    const criteria = event?.criteria?.filter(c => c.enabled) || [];
    
    // Calculate average for each criteria using only the latest score from each judge
    const criteriaScores = {};
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      
      // Get the latest score from each judge for this criteria
      const latestScoresByJudge = {};
      contestantScores.forEach(score => {
        if (score.scores?.[key] > 0) {
          if (!latestScoresByJudge[score.judgeId] || 
              new Date(score.timestamp) > new Date(latestScoresByJudge[score.judgeId].timestamp)) {
            latestScoresByJudge[score.judgeId] = score;
          }
        }
      });
      
      const criteriaValues = Object.values(latestScoresByJudge).map(score => score.scores[key]);
      
      if (criteriaValues.length > 0) {
        criteriaScores[key] = criteriaValues.reduce((sum, val) => sum + val, 0) / criteriaValues.length;
      } else {
        criteriaScores[key] = 0;
      }
    });
    
    // Calculate weighted total score
    let totalScore = 0;
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const score = criteriaScores[key] || 0;
      const weight = criterion.weight / 100;
      totalScore += score * weight;
    });
    
    return {
      totalScore: parseFloat(totalScore.toFixed(1)),
      judgeCount: uniqueJudges.length,
      criteriaScores
    };
  };

  useEffect(() => {
    // Fetch contestants filtered by selected event
    if (!selectedEvent) return;

    const contestantsQuery = query(
      collection(db, 'contestants'),
      where('eventId', '==', selectedEvent.id)
    );

    const unsubscribeContestants = onSnapshot(contestantsQuery, (snapshot) => {
      setConnectionStatus('connected');
      setLastUpdate(new Date()); // Update last update time
      
      const contestantsData = snapshot.docs.map(doc => {
        const data = doc.data();
        const contestantId = doc.id;
        
        // Calculate aggregated scores from all judges (same as live scoreboard)
        const aggregatedScore = calculateAggregatedScore(contestantId, selectedEvent.id);
        
        return {
          id: contestantId,
          ...data,
          // Map display names but preserve the actual score fields from judge dashboard
          name: data.contestantName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown Contestant',
          number: data.contestantNumber || data.contestantNo || '',
          totalScore: aggregatedScore.totalScore,
          judgeCount: aggregatedScore.judgeCount,
          criteriaScores: aggregatedScore.criteriaScores,
          photo: data.photo || data.imageUrl || null
        };
      });
      
      // Sort client-side by aggregated totalScore in descending order
      contestantsData.sort((a, b) => b.totalScore - a.totalScore);
      
      setContestants(contestantsData);
      
      // Set highest scorer
      if (contestantsData.length > 0 && contestantsData[0].totalScore > 0) {
        setHighestScorer(contestantsData[0]);
      } else {
        setHighestScorer(null);
      }
      
      setLoading(false);
      
      // Show real-time update notification
      if (snapshot.docChanges().length > 0) {
        const changes = snapshot.docChanges();
        console.log(`Admin contestant update: ${changes.length} contestant(s) updated`);
        
        // Flash a subtle update indicator
        const updateIndicator = document.createElement('div');
        updateIndicator.className = 'fixed top-4 right-4 bg-purple-500 text-white px-3 py-1 rounded-lg text-sm z-50 animate-pulse';
        updateIndicator.textContent = '👤 Contestant Updated';
        document.body.appendChild(updateIndicator);
        
        setTimeout(() => {
          if (document.body.contains(updateIndicator)) {
            document.body.removeChild(updateIndicator);
          }
        }, 2000);
      }
    },
    (error) => {
      console.error('Firestore listener error:', error);
      setConnectionStatus('disconnected');
      setIsLive(false);
      
      // Show error indicator
      const errorIndicator = document.createElement('div');
      errorIndicator.className = 'fixed top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-lg text-sm z-50';
      errorIndicator.textContent = '⚠️ Connection Lost';
      document.body.appendChild(errorIndicator);
      
      setTimeout(() => {
        if (document.body.contains(errorIndicator)) {
          document.body.removeChild(errorIndicator);
        }
      }, 3000);
    });

    return () => {
      unsubscribeContestants();
    };
  }, [selectedEvent, scores]); // Add scores as dependency to recalculate when scores change

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getScoreColor = (score) => {
    if (score === 0) return 'text-gray-400 bg-gray-50'; // Unsored
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 80) return 'text-blue-600 bg-blue-50';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const handleContestantClick = (contestant) => {
    setSelectedContestant(contestant);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedContestant(null);
  };

  const getCriteriaAverage = (contestant) => {
    if (!selectedEvent?.criteria) return 0;
    
    const scores = selectedEvent.criteria
      .filter(criteria => criteria.enabled)
      .map(criteria => {
        const score = getContestantCriteriaScore(contestant, criteria.name);
        return score > 0 ? score : null;
      })
      .filter(score => score !== null);
    
    if (scores.length === 0) return 0;
    return (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1);
  };

  const getContestantCriteriaScore = (contestant, criteriaName) => {
    // Use the aggregated criteria scores calculated from all judges (same as live scoreboard)
    const key = criteriaName.toLowerCase().replace(/\s+/g, '_');
    return contestant.criteriaScores?.[key] || 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin scoreboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => window.location.href = '/admin/events'}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Events
              </button>
              <h1 className="text-2xl font-bold text-gray-900">🏆 Admin Scoreboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 ${
                connectionStatus === 'connected' && isLive 
                  ? 'text-green-600' 
                  : connectionStatus === 'connected' 
                  ? 'text-yellow-600' 
                  : 'text-red-600'
              }`}>
                <div className={`relative w-3 h-3 rounded-full ${
                  connectionStatus === 'connected' && isLive 
                    ? 'bg-green-500 animate-pulse' 
                    : connectionStatus === 'connected' 
                    ? 'bg-yellow-500' 
                    : 'bg-red-500'
                }`}>
                  {connectionStatus === 'connected' && isLive && (
                    <div className="absolute inset-0 rounded-full bg-green-500 animate-ping"></div>
                  )}
                </div>
                <span className="font-medium text-sm">
                  {connectionStatus === 'connected' && isLive 
                    ? '🔴 Live' 
                    : connectionStatus === 'connected' 
                    ? '🟡 Connected' 
                    : '🔴 Disconnected'
                  }
                </span>
              </div>
              <div className="h-4 w-px bg-gray-300"></div>
              <div className="text-xs text-gray-500">
                <div className="font-medium">Updated</div>
                <div>{lastUpdate.toLocaleTimeString()}</div>
              </div>
              <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">Admin View</span>
            </div>
            {/* Reconnect Button */}
            {connectionStatus === 'disconnected' && (
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center gap-2 shadow-lg"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Event Selector */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="bg-gradient-to-r from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <span className="text-2xl">🎭</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Event Selection</h2>
                  <p className="text-purple-100 text-sm">Choose an event to view scores</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-purple-100 text-sm font-medium">Total Events</p>
                <p className="text-3xl font-bold text-white">{events.length}</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1 max-w-full sm:max-w-md">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Event</label>
                <select
                  value={selectedEvent?.id || ''}
                  onChange={(e) => {
                    const event = events.find(ev => ev.id === e.target.value);
                    setSelectedEvent(event);
                  }}
                  className="block w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white shadow-sm hover:border-gray-400"
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.status === 'ongoing' ? '🎭' : event.status === 'upcoming' ? '📅' : '✅'} {event.eventName} ({event.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Contest Info */}
      {selectedEvent && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedEvent.eventName}</h2>
                <p className="text-gray-600">{selectedEvent.date} • {selectedEvent.venue}</p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-gray-500">Contestants</p>
                  <p className="font-bold text-gray-900">{contestants.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Status</p>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                    selectedEvent.status === 'ongoing' ? 'bg-green-100 text-green-800' :
                    selectedEvent.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    <span>{selectedEvent.status === 'ongoing' ? '🎭' : selectedEvent.status === 'upcoming' ? '📅' : '✅'}</span>
                    {selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}
                  </div>
                </div>
                {highestScorer && (
                  <div className="text-center">
                    <p className="text-gray-500">🏆 Leading</p>
                    <p className="font-bold text-purple-600">{highestScorer.name}</p>
                    <p className="text-sm text-purple-500">{highestScorer.totalScore.toFixed(1)} pts</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Info Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-purple-600">ℹ️</span>
            <p className="text-sm text-purple-700">
              This is the admin-only view of the scoreboard. Scores cannot be edited from this page. Use the judge dashboard to modify scores.
            </p>
          </div>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {contestants.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">👥</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No contestants for this event</h3>
              <p className="text-gray-600">Contestants will appear here once they are registered for "{selectedEvent?.eventName || 'this event'}" by the administrator.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contestant</th>
                    {selectedEvent?.criteria?.filter(criteria => criteria.enabled).map((criteria, index) => (
                      <th key={index} className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {criteria.name}
                        {criteria.weight && (
                          <span className="block text-xs text-gray-400 normal-case">({criteria.weight}%)</span>
                        )}
                      </th>
                    ))}
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {contestants.map((contestant, index) => {
                    const isUpdated = updatedContestants.has(contestant.id);
                    return (
                      <tr key={contestant.id} className={`hover:bg-gray-50 transition-colors ${
                        isUpdated ? 'animate-pulse bg-purple-50 border-purple-200' : ''
                      }`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{getRankIcon(index + 1)}</span>
                            {isUpdated && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700 animate-pulse">
                                🔄 Updated
                              </span>
                            )}
                          </div>
                        </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <span className="text-purple-600 font-bold">
                              {contestant.name ? contestant.name.charAt(0).toUpperCase() : 'C'}
                            </span>
                          </div>
                          <div>
                            <button 
                              onClick={() => handleContestantClick(contestant)}
                              className="font-medium text-gray-900 hover:text-purple-600 transition-colors text-left"
                            >
                              {contestant.name || 'Contestant ' + (index + 1)}
                            </button>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <span>#{contestant.number || index + 1}</span>
                              {contestant.judgeCount > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                  👤 {contestant.judgeCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      {selectedEvent?.criteria?.filter(criteria => criteria.enabled).map((criteria, criteriaIndex) => {
                        const score = getContestantCriteriaScore(contestant, criteria.name);
                        const colors = ['bg-purple-100 text-purple-800', 'bg-pink-100 text-pink-800', 'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-yellow-100 text-yellow-800'];
                        const colorClass = colors[criteriaIndex % colors.length];
                        return (
                          <td key={criteriaIndex} className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center justify-center px-3 py-1 text-sm font-medium ${colorClass} rounded-full`}>
                              {score.toFixed(1)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-purple-600">
                            {contestant.totalScore === 0 ? '—' : contestant.totalScore.toFixed(1)}
                          </span>
                          {contestant.totalScore > 0 && <span className="text-sm text-gray-500">/100</span>}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Contestant Detail Modal (View Only) */}
      {showModal && selectedContestant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Contestant Details</h3>
                  <p className="text-purple-100 text-sm mt-1">View detailed scores and information</p>
                </div>
                <button
                  onClick={closeModal}
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
              {/* Contestant Photo and Basic Info */}
              <div className="flex items-center gap-8 mb-8">
                {/* Left Side - Image */}
                <div className="flex-shrink-0">
                  {selectedContestant.photo ? (
                    <img 
                      src={selectedContestant.photo} 
                      alt={selectedContestant.name}
                      className="w-48 h-48 rounded-2xl object-cover border-4 border-purple-100 shadow-lg"
                    />
                  ) : (
                    <div className="w-48 h-48 rounded-2xl bg-purple-100 flex items-center justify-center border-4 border-purple-100 shadow-lg">
                      <span className="text-6xl font-bold text-purple-600">
                        {selectedContestant.name ? selectedContestant.name.charAt(0).toUpperCase() : 'C'}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Right Side - Info */}
                <div className="flex-1 text-left">
                  <h4 className="text-3xl font-bold text-gray-900 mb-2">{selectedContestant.name}</h4>
                  <p className="text-lg text-gray-600 mb-4">Contestant #{selectedContestant.number || 'N/A'}</p>
                  <div className="flex items-center gap-4">
                    <div className="text-xl font-bold text-purple-600">
                      Total Score: {selectedContestant.totalScore.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Judges: </span>
                      <span className="font-bold text-purple-600">{selectedContestant.judgeCount || 0}</span>
                    </div>
                    {selectedContestant.totalScore === highestScorer?.totalScore && (
                      <div className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full bg-yellow-100 text-yellow-800">
                        <span>🏆</span>
                        Leading
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Criteria Scores */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <h5 className="text-lg font-semibold text-gray-900 mb-4">Criteria Breakdown</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedEvent?.criteria?.filter(criteria => criteria.enabled).map((criteria, index) => {
                    const score = getContestantCriteriaScore(selectedContestant, criteria.name);
                    const criteriaIcons = {
                      'Vocal Quality': '🎤',
                      'Stage Presence': '🎭',
                      'Song Interpretation': '🎵',
                      'Audience Impact': '👏',
                      'Talent': '🎤',
                      'Beauty': '👗',
                      'QA': '🧠',
                      'Poise and Bearing': '👑',
                      'Intelligence': '🧠',
                      'Production Number': '🎭'
                    };
                    
                    return (
                      <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <span className="text-purple-600">{criteriaIcons[criteria.name] || '📋'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">{criteria.name}</span>
                            {criteria.weight && (
                              <span className="block text-xs text-gray-500">Weight: {criteria.weight}%</span>
                            )}
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(score)}`}>
                          {score === 0 ? 'Not Scored' : `${score}%`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Average Score */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-lg font-semibold text-gray-900">Criteria Average</h5>
                    <p className="text-gray-600 text-sm">Average score across all criteria</p>
                  </div>
                  <div className="text-3xl font-bold text-purple-600">
                    {getCriteriaAverage(selectedContestant)}%
                  </div>
                </div>
              </div>

              {/* Admin Notice */}
              <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <span className="text-purple-600">🔒</span>
                  <p className="text-sm text-purple-700">
                    This is a read-only view. To edit scores, please use the judge dashboard or scoring management system.
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={closeModal}
                  className="bg-gray-100 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
