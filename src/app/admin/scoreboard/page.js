'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, where } from 'firebase/firestore';

export default function AdminScoreboard() {
  const [user, setUser] = useState(null);
  const [contestants, setContestants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contestInfo, setContestInfo] = useState(null);
  const [selectedContestant, setSelectedContestant] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [highestScorer, setHighestScorer] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedRound, setSelectedRound] = useState('all'); // Round filter state
  const [scores, setScores] = useState([]); // Store individual judge scores
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLive, setIsLive] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [updatedContestants, setUpdatedContestants] = useState(new Set()); // Track recently updated contestants

  // Check authentication status
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email === 'admin@gmail.com') {
        // User is authenticated admin, allow access
      } else if (currentUser) {
        // User is authenticated but not admin
        setLoading(false);
        alert('Access denied. Admin privileges required.');
        window.location.href = '/admin/login';
      } else {
        // User not authenticated
        window.location.href = '/admin/login';
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Check if user is authenticated and is admin before fetching events
    if (!auth.currentUser || auth.currentUser.email !== 'admin@gmail.com') {
      setLoading(false);
      return;
    }
    
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
    if (!auth.currentUser || auth.currentUser.email !== 'admin@gmail.com') {
      console.error('User not authenticated or not admin for scores');
      return;
    }
    
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
          updateIndicator.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm z-50 animate-pulse shadow-lg flex items-center gap-2';
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
    
    // Get the latest score from each judge
    const latestScoresByJudge = {};
    contestantScores.forEach(score => {
      if (!latestScoresByJudge[score.judgeId] || 
          new Date(score.timestamp) > new Date(latestScoresByJudge[score.judgeId].timestamp)) {
        latestScoresByJudge[score.judgeId] = score;
      }
    });
    
    // Calculate average of all judges' pre-calculated totalScores
    const judgeScoresList = Object.values(latestScoresByJudge);
    const totalScoreSum = judgeScoresList.reduce((sum, score) => sum + (score.totalScore || 0), 0);
    const averageTotalScore = judgeScoresList.length > 0 ? totalScoreSum / judgeScoresList.length : 0;
    
    // Also calculate criteriaScores for breakdown display
    const event = events.find(e => e.id === eventId);
    const criteria = event?.criteria?.filter(c => c.enabled) || [];
    const criteriaScores = {};
    
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const criteriaValues = judgeScoresList
        .filter(score => score.scores?.[key] > 0)
        .map(score => score.scores[key]);
      
      if (criteriaValues.length > 0) {
        criteriaScores[key] = criteriaValues.reduce((sum, val) => sum + val, 0) / criteriaValues.length;
      } else {
        criteriaScores[key] = 0;
      }
    });
    
    return {
      totalScore: parseFloat(averageTotalScore.toFixed(1)),
      judgeCount: uniqueJudges.length,
      criteriaScores
    };
  };

  useEffect(() => {
    // Fetch contestants filtered by selected event
    if (!selectedEvent) return;
    
    // Check if user is authenticated and is admin
    if (!auth.currentUser || auth.currentUser.email !== 'admin@gmail.com') {
      console.error('User not authenticated or not admin for contestants');
      return;
    }

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
        updateIndicator.className = 'fixed top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-lg text-sm z-50 animate-pulse';
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

  // Function to filter contestants by selected round
  const filterContestantsByRound = (contestantsList, roundFilter) => {
    if (!selectedEvent || roundFilter === 'all') {
      return contestantsList;
    }
    
    // If event has no rounds, return all contestants
    if (!selectedEvent.rounds || selectedEvent.rounds.length === 0) {
      return contestantsList;
    }
    
    // Find the selected round
    const selectedRoundData = selectedEvent.rounds.find(round => round.name === roundFilter);
    if (!selectedRoundData) {
      return contestantsList;
    }
    
    // Filter contestants who have scores for this round
    return contestantsList.filter(contestant => {
      // Check if contestant has scores for this specific round
      const roundScores = scores.filter(score => 
        score.contestantId === contestant.id && 
        score.eventId === selectedEvent.id &&
        score.roundName === roundFilter
      );
      
      // If no round-specific scores, check if they have general scores (for compatibility)
      if (roundScores.length === 0) {
        const generalScores = scores.filter(score => 
          score.contestantId === contestant.id && 
          score.eventId === selectedEvent.id &&
          !score.roundName
        );
        return generalScores.length > 0;
      }
      
      return roundScores.length > 0;
    });
  };

  // Function to get individual judge scores for breakdown
  const getJudgeBreakdown = (contestantId) => {
    const contestantScores = scores.filter(score => 
      score.contestantId === contestantId && score.eventId === selectedEvent.id
    );
    
    // Group by judge ID and get latest scores
    const judgeScores = {};
    contestantScores.forEach(score => {
      if (!judgeScores[score.judgeId] || 
          new Date(score.timestamp) > new Date(judgeScores[score.judgeId].timestamp)) {
        judgeScores[score.judgeId] = score;
      }
    });
    
    return Object.values(judgeScores);
  };

  // Function to get judge name by ID
  const getJudgeName = (judgeId) => {
    // This would ideally come from a judges collection, but for now use a generic format
    return `Judge ${judgeId.slice(-4)}`;
  };

  const getContestantCriteriaScore = (contestant, criteriaName) => {
    // Use the aggregated criteria scores calculated from all judges (same as live scoreboard)
    const key = criteriaName.toLowerCase().replace(/\s+/g, '_');
    return contestant.criteriaScores?.[key] || 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin scoreboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 shadow-xl">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => window.location.href = '/admin/events'}
                className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                <span className="text-2xl sm:text-3xl">🏆</span>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white">Admin Scoreboard</h1>
                <p className="text-emerald-100 text-xs sm:text-sm hidden sm:block">Real-time scoring dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm ${
                connectionStatus === 'connected' && isLive 
                  ? 'bg-green-500/20 text-white' 
                  : connectionStatus === 'connected' 
                  ? 'bg-yellow-500/20 text-white' 
                  : 'bg-red-500/20 text-white'
              }`}>
                <div className={`relative w-2.5 h-2.5 rounded-full ${
                  connectionStatus === 'connected' && isLive 
                    ? 'bg-green-400 animate-pulse' 
                    : connectionStatus === 'connected' 
                    ? 'bg-yellow-400' 
                    : 'bg-red-400'
                }`}>
                  {connectionStatus === 'connected' && isLive && (
                    <div className="absolute inset-0 rounded-full bg-green-400 animate-ping"></div>
                  )}
                </div>
                <span className="font-semibold text-xs sm:text-sm">
                  {connectionStatus === 'connected' && isLive 
                    ? '🔴 Live' 
                    : connectionStatus === 'connected' 
                    ? '🟡 Connected' 
                    : '🔴 Disconnected'
                  }
                </span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2">
                <div className="text-xs text-emerald-100 font-medium">Last Updated</div>
                <div className="text-sm text-white font-semibold">{lastUpdate.toLocaleTimeString()}</div>
              </div>
              <span className="px-3 py-2 bg-white/20 backdrop-blur-sm text-white text-xs font-semibold rounded-xl">
                Admin View
              </span>
            </div>
            {/* Reconnect Button */}
            {connectionStatus === 'disconnected' && (
              <button 
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors duration-200 flex items-center justify-center gap-2 shadow-lg text-sm font-semibold"
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
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                  <span className="text-2xl sm:text-3xl">🎭</span>
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">Event Selection</h2>
                  <p className="text-emerald-100 text-xs sm:text-sm">Choose an event to view scores</p>
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3">
                <p className="text-emerald-100 text-xs font-medium">Total Events</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">{events.length}</p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="w-full">
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span>📋</span> Select Event
                </label>
                <select
                  value={selectedEvent?.id || ''}
                  onChange={(e) => {
                    const event = events.find(ev => ev.id === e.target.value);
                    setSelectedEvent(event);
                    setSelectedRound('all'); // Reset round filter when event changes
                  }}
                  className="block w-full px-4 py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200 bg-white shadow-sm hover:border-gray-300"
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.status === 'ongoing' ? '🎭' : event.status === 'upcoming' ? '📅' : '✅'} {event.eventName} ({event.status})
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Round Filter */}
              {selectedEvent && selectedEvent.rounds && selectedEvent.rounds.length > 0 && (
                <div className="w-full">
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span>🏆</span> Filter by Round
                  </label>
                  <select
                    value={selectedRound}
                    onChange={(e) => setSelectedRound(e.target.value)}
                    className="block w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 bg-white shadow-sm hover:border-gray-400"
                  >
                    <option value="all">🏆 All Rounds</option>
                    {selectedEvent.rounds.map((round, index) => (
                      <option key={index} value={round.name}>
                        🎯 {round.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Contest Info */}
      {selectedEvent && (
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6">
          <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{selectedEvent.eventName}</h2>
                <p className="text-sm sm:text-base text-gray-600">{selectedEvent.date} • {selectedEvent.venue}</p>
              </div>
              <div className="flex items-center gap-3 sm:gap-6 text-sm">
                <div className="text-center">
                  <p className="text-xs sm:text-sm text-gray-500">Contestants</p>
                  <p className="font-bold text-gray-900 text-base sm:text-lg">{contestants.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs sm:text-sm text-gray-500">Status</p>
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
                    <p className="text-xs sm:text-sm text-gray-500">🏆 Leading</p>
                    <p className="font-bold text-blue-600 text-sm sm:text-base truncate max-w-20 sm:max-w-none">{highestScorer.name}</p>
                    <p className="text-xs sm:text-sm text-blue-500">{highestScorer.totalScore.toFixed(1)} pts</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Info Banner */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-2">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
          <div className="flex items-center gap-2">
            <span className="text-blue-600 text-sm sm:text-base">ℹ️</span>
            <p className="text-xs sm:text-sm text-blue-700">
              This is the admin-only view of the scoreboard. Scores cannot be edited from this page. Use the judge dashboard to modify scores.
            </p>
          </div>
        </div>
      </div>

      {/* Scoreboard - Card Layout */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 pb-8 sm:pb-12">
        {contestants.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-6 sm:p-12 text-center">
            <div className="text-4xl sm:text-6xl mb-4">👥</div>
            <h3 className="text-base sm:text-xl font-semibold text-gray-900 mb-2">No contestants for this event</h3>
            <p className="text-sm sm:text-base text-gray-600">Contestants will appear here once they are registered for "{selectedEvent?.eventName || 'this event'}" by the administrator.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            {filterContestantsByRound(contestants, selectedRound).map((contestant, index) => {
              const isUpdated = updatedContestants.has(contestant.id);
              const judgeBreakdown = getJudgeBreakdown(contestant.id);
              const rank = index + 1;
              
              return (
                <div 
                  key={contestant.id} 
                  className={`bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] touch-manipulation ${
                    isUpdated ? 'ring-2 ring-blue-500 animate-pulse' : ''
                  } ${
                    rank === 1 ? 'ring-2 ring-yellow-400' : ''
                  }`}
                >
                  {/* Card Header - Rank and Status */}
                  <div className={`bg-gradient-to-r p-4 ${
                    rank === 1 ? 'from-yellow-400 to-yellow-500' : 
                    rank === 2 ? 'from-gray-300 to-gray-400' :
                    rank === 3 ? 'from-orange-300 to-orange-400' :
                    'from-blue-500 to-blue-600'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{getRankIcon(rank)}</span>
                        <div className="text-white">
                          <div className="text-sm font-medium opacity-90">Rank</div>
                          <div className="text-2xl font-bold">#{rank}</div>
                        </div>
                      </div>
                      {isUpdated && (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-white/20 text-white backdrop-blur-sm">
                          🔄 Updated
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contestant Profile Section */}
                  <div className="p-3 sm:p-4 lg:p-6">
                    <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4 lg:mb-6">
                      <div className="relative flex-shrink-0">
                        {contestant.photo ? (
                          <img 
                            src={contestant.photo} 
                            alt={contestant.name}
                            className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full object-cover border-2 border-white shadow-lg"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center border-2 border-white shadow-lg">
                            <span className="text-white text-xs sm:text-sm lg:text-xl font-bold">
                              {contestant.name ? contestant.name.charAt(0).toUpperCase() : 'C'}
                            </span>
                          </div>
                        )}
                        {contestant.totalScore === highestScorer?.totalScore && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 bg-yellow-400 rounded-full flex items-center justify-center border-2 border-white">
                            <span className="text-xs">🏆</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 mb-1 truncate">{contestant.name || 'Contestant ' + rank}</h3>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                          <span className="font-medium">#{contestant.number || rank}</span>
                          {contestant.judgeCount > 0 && (
                            <span className="inline-flex items-center px-1 sm:px-1.5 lg:px-2 py-0.5 sm:py-1 rounded text-xs font-medium flex-shrink-0 bg-blue-100 text-blue-700">
                              👤 {contestant.judgeCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Total Score Display */}
                    <div className="bg-gradient-to-r from-blue-50 to-blue-50 rounded-lg p-2.5 sm:p-3 lg:p-4 mb-3 sm:mb-4 lg:mb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-gray-600">Total Score</div>
                          <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-blue-600">
                            {contestant.totalScore === 0 ? '—' : contestant.totalScore.toFixed(1)}
                            <span className="text-xs sm:text-sm lg:text-lg text-gray-500">/100</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs sm:text-sm font-medium text-gray-600">Average</div>
                          <div className="text-base sm:text-lg lg:text-xl font-bold text-blue-600">
                            {getCriteriaAverage(contestant)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Criteria Scores */}
                    <div className="mb-3 sm:mb-4 lg:mb-6">
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2 lg:mb-3">Criteria Scores</h4>
                      <div className="space-y-1 sm:space-y-1.5 lg:space-y-2">
                        {selectedEvent?.criteria?.filter(criteria => criteria.enabled).map((criteria, criteriaIndex) => {
                          const score = getContestantCriteriaScore(contestant, criteria.name);
                          const criteriaIcons = {
                            'Vocal Quality': '�',
                            'Stage Presence': '🎭',
                            'Song Interpretation': '🎵',
                            'Audience Impact': '👏',
                            'Talent': '⭐',
                            'Beauty': '👗',
                            'QA': '🧠',
                            'Poise and Bearing': '👑',
                            'Intelligence': '🧠',
                            'Production Number': '🎭'
                          };
                          
                          return (
                            <div key={criteriaIndex} className="flex items-center justify-between p-1.5 sm:p-2 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 min-w-0 flex-1">
                                <span className="text-xs sm:text-sm flex-shrink-0">{criteriaIcons[criteria.name] || '📋'}</span>
                                <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">{criteria.name}</span>
                                {criteria.weight && (
                                  <span className="text-xs text-gray-500 flex-shrink-0 hidden sm:inline">({criteria.weight}%)</span>
                                )}
                              </div>
                              <div className={`px-1 sm:px-1.5 lg:px-2 py-0.5 sm:py-1 rounded text-xs font-medium flex-shrink-0 ${
                                score === 0 ? 'bg-gray-200 text-gray-500' :
                                score >= 90 ? 'bg-green-100 text-green-700' :
                                score >= 80 ? 'bg-blue-100 text-blue-700' :
                                score >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-200 text-gray-700'
                              }`}>
                                {score === 0 ? '—' : `${score.toFixed(1)}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Judge Breakdown */}
                    {judgeBreakdown.length > 0 && (
                      <div className="mb-3 sm:mb-4 lg:mb-6">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2 lg:mb-3">Judge Breakdown</h4>
                        <div className="space-y-1 sm:space-y-1.5 lg:space-y-2">
                          {judgeBreakdown.map((judgeScore, judgeIndex) => {
                            const judgeTotal = selectedEvent?.criteria
                              ?.filter(criteria => criteria.enabled)
                              ?.reduce((sum, criteria) => {
                                const key = criteria.name.toLowerCase().replace(/\s+/g, '_');
                                const score = judgeScore.scores?.[key] || 0;
                                const weight = criteria.weight / 100;
                                return sum + (score * weight);
                              }, 0) || 0;
                            
                            return (
                              <div key={judgeIndex} className="flex items-center justify-between p-1.5 sm:p-2 bg-blue-50 rounded-lg">
                                <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 min-w-0 flex-1">
                                  <div className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-blue-700">J{judgeIndex + 1}</span>
                                  </div>
                                  <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">
                                    {getJudgeName(judgeScore.judgeId)}
                                  </span>
                                </div>
                                <div className="text-xs sm:text-sm font-bold text-blue-600 flex-shrink-0">
                                  {judgeTotal.toFixed(1)}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* View Details Button */}
                    <button
                      onClick={() => handleContestantClick(contestant)}
                      className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-1.5 sm:py-2 lg:py-2.5 px-3 sm:px-4 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 font-medium text-xs sm:text-sm active:scale-[0.98] touch-manipulation"
                    >
                      View Full Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contestant Detail Modal (View Only) */}
      {showModal && selectedContestant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-600 px-4 sm:px-6 py-3 sm:py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">Contestant Details</h3>
                  <p className="text-blue-100 text-xs sm:text-sm mt-1">View detailed scores and information</p>
                </div>
                <button
                  onClick={closeModal}
                  className="text-white hover:text-blue-200 transition-colors p-1"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6">
              {/* Unified Contestant Information Box */}
              <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50 rounded-2xl border border-blue-200 overflow-hidden">
                {/* Profile Header Section */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-600 p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Contestant Photo */}
                    <div className="flex-shrink-0 mx-auto sm:mx-0">
                      {selectedContestant.photo ? (
                        <img 
                          src={selectedContestant.photo} 
                          alt={selectedContestant.name}
                          className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl object-cover border-4 border-white shadow-lg"
                        />
                      ) : (
                        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border-4 border-white shadow-lg">
                          <span className="text-2xl sm:text-4xl font-bold text-white">
                            {selectedContestant.name ? selectedContestant.name.charAt(0).toUpperCase() : 'C'}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Profile Info */}
                    <div className="flex-1 text-white text-center sm:text-left">
                      <h4 className="text-lg sm:text-2xl font-bold mb-2">{selectedContestant.name}</h4>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-blue-100">
                        <span className="font-medium">#{selectedContestant.number || 'N/A'}</span>
                        <div className="flex items-center gap-2 justify-center sm:justify-start">
                          <span className="font-medium">Judges:</span>
                          <span className="font-bold text-white">{selectedContestant.judgeCount || 0}</span>
                        </div>
                        {selectedContestant.totalScore === highestScorer?.totalScore && (
                          <div className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full bg-yellow-400 text-yellow-900">
                            <span>🏆</span>
                            Leading
                          </div>
                        )}
                      </div>
                      <div className="mt-3 text-2xl sm:text-3xl font-bold text-white">
                        {selectedContestant.totalScore.toFixed(1)}%
                        <span className="text-sm sm:text-lg font-normal text-blue-200">/100</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scores Section */}
                <div className="p-4 sm:p-6">
                  {/* Criteria Scores and Judge Breakdown Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    {/* Criteria Scores Column */}
                    <div>
                      <h5 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                        <span className="w-5 h-5 sm:w-6 sm:h-6 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-blue-600">📊</span>
                        </span>
                        Criteria Breakdown
                      </h5>
                      <div className="space-y-2 sm:space-y-3">
                        {selectedEvent?.criteria?.filter(criteria => criteria.enabled).map((criteria, index) => {
                          const score = getContestantCriteriaScore(selectedContestant, criteria.name);
                          const criteriaIcons = {
                            'Vocal Quality': '�',
                            'Stage Presence': '🎭',
                            'Song Interpretation': '🎵',
                            'Audience Impact': '👏',
                            'Talent': '⭐',
                            'Beauty': '👗',
                            'QA': '🧠',
                            'Poise and Bearing': '👑',
                            'Intelligence': '🧠',
                            'Production Number': '🎭'
                          };
                          
                          return (
                            <div key={index} className="flex items-center justify-between p-2 sm:p-3 bg-white rounded-lg border border-gray-200">
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs sm:text-sm">{criteriaIcons[criteria.name] || '📋'}</span>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-700 text-sm">{criteria.name}</span>
                                  {criteria.weight && (
                                    <span className="block text-xs text-gray-500">Weight: {criteria.weight}%</span>
                                  )}
                                </div>
                              </div>
                              <div className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getScoreColor(score)}`}>
                                {score === 0 ? 'Not Scored' : `${score}%`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Judge Breakdown Column */}
                    <div>
                      <h5 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                        <span className="w-5 h-5 sm:w-6 sm:h-6 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-blue-600">👥</span>
                        </span>
                        Judge Breakdown
                      </h5>
                      {(() => {
                        const judgeBreakdown = getJudgeBreakdown(selectedContestant.id);
                        return judgeBreakdown.length > 0 ? (
                          <div className="space-y-2 sm:space-y-3">
                            {judgeBreakdown.map((judgeScore, judgeIndex) => {
                              const judgeTotal = selectedEvent?.criteria
                                ?.filter(criteria => criteria.enabled)
                                ?.reduce((sum, criteria) => {
                                  const key = criteria.name.toLowerCase().replace(/\s+/g, '_');
                                  const score = judgeScore.scores?.[key] || 0;
                                  const weight = criteria.weight / 100;
                                  return sum + (score * weight);
                                }, 0) || 0;
                              
                              return (
                                <div key={judgeIndex} className="flex items-center justify-between p-2 sm:p-3 bg-blue-50 rounded-lg border border-blue-200">
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                                      <span className="text-xs font-bold text-blue-700">J{judgeIndex + 1}</span>
                                    </div>
                                    <div>
                                      <span className="font-medium text-gray-700 text-sm">
                                        {getJudgeName(judgeScore.judgeId)}
                                      </span>
                                      <div className="text-xs text-gray-500">
                                        {new Date(judgeScore.timestamp).toLocaleDateString()}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-xs sm:text-sm font-bold text-blue-600">
                                    {judgeTotal.toFixed(1)}%
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-6 sm:py-8 text-gray-500">
                            <div className="text-3xl sm:text-4xl mb-2">📝</div>
                            <p className="text-sm">No judge scores available yet</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div className="bg-gradient-to-r from-blue-100 to-blue-50 rounded-lg p-3 sm:p-4 text-center">
                      <div className="text-xl sm:text-2xl font-bold text-blue-600">
                        {selectedContestant.totalScore.toFixed(1)}%
                      </div>
                      <div className="text-xs sm:text-sm text-blue-700 font-medium">Total Score</div>
                    </div>
                    <div className="bg-gradient-to-r from-blue-100 to-blue-50 rounded-lg p-3 sm:p-4 text-center">
                      <div className="text-xl sm:text-2xl font-bold text-blue-600">
                        {getCriteriaAverage(selectedContestant)}%
                      </div>
                      <div className="text-xs sm:text-sm text-blue-700 font-medium">Criteria Average</div>
                    </div>
                    <div className="bg-gradient-to-r from-green-100 to-green-50 rounded-lg p-3 sm:p-4 text-center">
                      <div className="text-xl sm:text-2xl font-bold text-green-600">
                        {selectedContestant.judgeCount || 0}
                      </div>
                      <div className="text-xs sm:text-sm text-green-700 font-medium">Judges Scored</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Notice */}
              <div className="mt-4 sm:mt-6 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="text-blue-600 text-sm sm:text-base">🔒</span>
                  <p className="text-xs sm:text-sm text-blue-700">
                    This is a read-only view. To edit scores, please use judge dashboard or scoring management system.
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <div className="mt-4 sm:mt-6 flex justify-end">
                <button
                  onClick={closeModal}
                  className="bg-gray-100 text-gray-700 px-4 sm:px-6 py-2 sm:py-3 rounded-xl hover:bg-gray-200 transition-colors font-medium text-sm sm:text-base"
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
