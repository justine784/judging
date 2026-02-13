'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, where, deleteDoc } from 'firebase/firestore';

export default function ComprehensiveScoring() {
  const [allScores, setAllScores] = useState([]);
  const [events, setEvents] = useState([]);
  const [judges, setJudges] = useState([]);
  const [contestants, setContestants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedJudge, setSelectedJudge] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // 'all', 'by-event', 'by-judge'

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch events
      const eventsSnapshot = await getDocs(collection(db, 'events'));
      const eventsData = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(eventsData);

      // Fetch judges
      const judgesSnapshot = await getDocs(collection(db, 'judges'));
      const judgesData = judgesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJudges(judgesData);

      // Fetch contestants
      const contestantsSnapshot = await getDocs(collection(db, 'contestants'));
      const contestantsData = contestantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContestants(contestantsData);

      // Fetch scores (assuming scores are stored in a 'scores' collection)
      const scoresSnapshot = await getDocs(collection(db, 'scores'));
      const scoresData = scoresSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllScores(scoresData);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const handleDeleteContestant = async (contestantId) => {
    if (!confirm('Are you sure you want to delete this contestant and all their scores? This action cannot be undone.')) {
      return;
    }

    try {
      // Delete contestant from Firestore
      await deleteDoc(doc(db, 'contestants', contestantId));
      
      // Delete all scores associated with this contestant
      const scoresToDelete = allScores.filter(score => score.contestantId === contestantId);
      for (const score of scoresToDelete) {
        await deleteDoc(doc(db, 'scores', score.id));
      }
      
      // Refresh data
      await fetchData();
      
      console.log('Contestant and associated scores deleted successfully');
    } catch (error) {
      console.error('Error deleting contestant:', error);
      alert('Error deleting contestant. Please try again.');
    }
  };

  // Sample data for demonstration
  const sampleEvents = [
    {
      id: '1',
      name: 'Grand Vocal Showdown 2026',
      date: '2026-03-15',
      venue: 'University Auditorium',
      status: 'ongoing'
    },
    {
      id: '2',
      name: 'Battle of the Bands',
      date: '2026-02-28',
      venue: 'Municipal Gymnasium',
      status: 'finished'
    },
    {
      id: '3',
      name: 'Acoustic Night 2025',
      date: '2025-12-20',
      venue: 'Community Center',
      status: 'finished'
    }
  ];

  const sampleJudges = [
    { id: '1', name: 'John Smith', email: 'john@example.com', specialty: 'Vocal Performance' },
    { id: '2', name: 'Sarah Johnson', email: 'sarah@example.com', specialty: 'Music Theory' },
    { id: '3', name: 'Michael Chen', email: 'michael@example.com', specialty: 'Stage Performance' }
  ];

  const sampleContestants = [
    { id: '1', name: 'Maria Cruz', number: '001', eventId: '1' },
    { id: '2', name: 'David Kim', number: '002', eventId: '1' },
    { id: '3', name: 'Lisa Thompson', number: '003', eventId: '2' },
    { id: '4', name: 'Emily Rodriguez', number: '004', eventId: '2' },
    { id: '5', name: 'James Wilson', number: '005', eventId: '3' }
  ];

  const sampleScores = [
    {
      id: '1',
      contestantId: '1',
      judgeId: '1',
      eventId: '1',
      scores: {
        vocalQuality: 92,
        stagePresence: 88,
        songInterpretation: 85,
        audienceImpact: 90
      },
      totalScore: 89,
      timestamp: '2026-03-15T10:30:00Z'
    },
    {
      id: '2',
      contestantId: '1',
      judgeId: '2',
      eventId: '1',
      scores: {
        vocalQuality: 88,
        stagePresence: 90,
        songInterpretation: 87,
        audienceImpact: 85
      },
      totalScore: 87.5,
      timestamp: '2026-03-15T10:35:00Z'
    },
    {
      id: '3',
      contestantId: '2',
      judgeId: '1',
      eventId: '1',
      scores: {
        vocalQuality: 85,
        stagePresence: 92,
        songInterpretation: 88,
        audienceImpact: 86
      },
      totalScore: 87.8,
      timestamp: '2026-03-15T10:40:00Z'
    },
    {
      id: '4',
      contestantId: '3',
      judgeId: '3',
      eventId: '2',
      scores: {
        musicalPerformance: 90,
        stagePresence: 85,
        originality: 88
      },
      totalScore: 88,
      timestamp: '2026-02-28T19:20:00Z'
    }
  ];

  // Use sample data if no real data
  const eventsToUse = events.length > 0 ? events : sampleEvents;
  const judgesToUse = judges.length > 0 ? judges : sampleJudges;
  const contestantsToUse = contestants.length > 0 ? contestants : sampleContestants;
  const scoresToUse = allScores.length > 0 ? allScores : sampleScores;

  // Filter data based on search and selections
  const filteredScores = scoresToUse.filter(score => {
    const contestant = contestantsToUse.find(c => c.id === score.contestantId);
    const judge = judgesToUse.find(j => j.id === score.judgeId);
    const event = eventsToUse.find(e => e.id === score.eventId);

    const matchesSearch = searchTerm === '' || 
      (contestant && contestant.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (judge && judge.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (event && event.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesEvent = !selectedEvent || score.eventId === selectedEvent;
    const matchesJudge = !selectedJudge || score.judgeId === selectedJudge;

    return matchesSearch && matchesEvent && matchesJudge;
  });

  // Group scores by event
  const scoresByEvent = eventsToUse.map(event => {
    const eventScores = filteredScores.filter(score => score.eventId === event.id);
    const contestantScores = {};
    
    eventScores.forEach(score => {
      if (!contestantScores[score.contestantId]) {
        contestantScores[score.contestantId] = {
          contestant: contestantsToUse.find(c => c.id === score.contestantId),
          scores: [],
          averageScore: 0
        };
      }
      contestantScores[score.contestantId].scores.push(score);
    });

    // Calculate average scores
    Object.values(contestantScores).forEach(contestantData => {
      const totalScore = contestantData.scores.reduce((sum, score) => sum + score.totalScore, 0);
      contestantData.averageScore = totalScore / contestantData.scores.length;
    });

    return {
      event,
      contestants: Object.values(contestantScores).sort((a, b) => b.averageScore - a.averageScore)
    };
  });

  // Group scores by judge
  const scoresByJudge = judgesToUse.map(judge => {
    const judgeScores = filteredScores.filter(score => score.judgeId === judge.id);
    
    return {
      judge,
      scores: judgeScores.map(score => ({
        ...score,
        contestant: contestantsToUse.find(c => c.id === score.contestantId),
        event: eventsToUse.find(e => e.id === score.eventId)
      }))
    };
  });

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 80) return 'text-blue-600 bg-blue-50';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading scoring data...</p>
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
                onClick={() => window.location.href = '/'}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Home
              </button>
              <h1 className="text-2xl font-bold text-gray-900">📊 Comprehensive Scoring</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">Live Data</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search Box */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Search Events, Judges, or Contestants</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
                />
                <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
              </div>
            </div>

            {/* Event Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Event</label>
              <select
                value={selectedEvent || ''}
                onChange={(e) => setSelectedEvent(e.target.value || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
              >
                <option value="">All Events</option>
                {eventsToUse.map(event => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Judge Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Judge</label>
              <select
                value={selectedJudge || ''}
                onChange={(e) => setSelectedJudge(e.target.value || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
              >
                <option value="">All Judges</option>
                {judgesToUse.map(judge => (
                  <option key={judge.id} value={judge.id}>
                    {judge.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setViewMode('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'all' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Scores
            </button>
            <button
              onClick={() => setViewMode('by-event')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'by-event' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Event
            </button>
            <button
              onClick={() => setViewMode('by-judge')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'by-judge' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Judge
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-500">Total Events</div>
            <div className="text-2xl font-bold text-gray-900">{eventsToUse.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-500">Total Judges</div>
            <div className="text-2xl font-bold text-gray-900">{judgesToUse.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-500">Total Contestants</div>
            <div className="text-2xl font-bold text-gray-900">{contestantsToUse.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-500">Total Scores</div>
            <div className="text-2xl font-bold text-gray-900">{filteredScores.length}</div>
          </div>
        </div>

        {/* Content based on view mode */}
        {viewMode === 'all' && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
              <h2 className="text-xl font-bold">📊 All Scores</h2>
              <p className="text-purple-100 text-sm">Complete list of all judge scores</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contestant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Judge</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scores</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredScores.map((score) => {
                    const contestant = contestantsToUse.find(c => c.id === score.contestantId);
                    const judge = judgesToUse.find(j => j.id === score.judgeId);
                    const event = eventsToUse.find(e => e.id === score.eventId);
                    
                    return (
                      <tr key={score.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                              <span className="text-purple-600 font-bold text-xs">
                                {contestant?.name?.charAt(0).toUpperCase() || 'C'}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{contestant?.name || 'Unknown'}</div>
                              <div className="text-sm text-gray-500">#{contestant?.number || 'N/A'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{judge?.name || 'Unknown'}</div>
                          <div className="text-sm text-gray-500">{judge?.specialty || ''}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{event?.name || 'Unknown'}</div>
                          <div className="text-sm text-gray-500">{event?.date || ''}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {Object.entries(score.scores || {}).map(([key, value]) => (
                              <div key={key} className="text-sm">
                                <span className="font-medium">{key}:</span> {value}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(score.totalScore)}`}>
                            {score.totalScore?.toFixed(1) || '0'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(score.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleDeleteContestant(score.contestantId)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                            title="Delete Contestant"
                          >
                            <span className="text-lg">🗑️</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredScores.length === 0 && (
                <div className="p-12 text-center">
                  <div className="text-6xl mb-4">📊</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No scores found</h3>
                  <p className="text-gray-600">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'by-event' && (
          <div className="space-y-6">
            {scoresByEvent.map(({ event, contestants }) => (
              <div key={event.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
                  <h3 className="text-xl font-bold">{event.name}</h3>
                  <p className="text-purple-100 text-sm">{event.date} • {event.venue}</p>
                </div>
                <div className="p-6">
                  {contestants.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contestant</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Judge Scores</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Average Score</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {contestants.map((contestantData, index) => (
                            <tr key={contestantData.contestant.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4">
                                <span className="text-2xl">{getRankIcon(index + 1)}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                                    <span className="text-purple-600 font-bold text-xs">
                                      {contestantData.contestant.name?.charAt(0).toUpperCase() || 'C'}
                                    </span>
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-900">{contestantData.contestant.name}</div>
                                    <div className="text-sm text-gray-500">#{contestantData.contestant.number}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  {contestantData.scores.map((score, scoreIndex) => {
                                    const judge = judgesToUse.find(j => j.id === score.judgeId);
                                    return (
                                      <div key={scoreIndex} className="flex items-center justify-between text-sm">
                                        <span className="font-medium">{judge?.name || 'Unknown'}:</span>
                                        <span className={`px-2 py-1 rounded-full text-xs ${getScoreColor(score.totalScore)}`}>
                                          {score.totalScore?.toFixed(1)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className={`px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(contestantData.averageScore)}`}>
                                  {contestantData.averageScore.toFixed(1)}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => handleDeleteContestant(contestantData.contestant.id)}
                                  className="p-2 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                                  title="Delete Contestant"
                                >
                                  <span className="text-lg">🗑️</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500">No scores available for this event</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'by-judge' && (
          <div className="space-y-6">
            {scoresByJudge.map(({ judge, scores }) => (
              <div key={judge.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
                  <h3 className="text-xl font-bold">{judge.name}</h3>
                  <p className="text-purple-100 text-sm">{judge.specialty} • {judge.email}</p>
                </div>
                <div className="p-6">
                  {scores.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contestant</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scores</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {scores.map((score) => (
                            <tr key={score.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                                    <span className="text-purple-600 font-bold text-xs">
                                      {score.contestant?.name?.charAt(0).toUpperCase() || 'C'}
                                    </span>
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-900">{score.contestant?.name || 'Unknown'}</div>
                                    <div className="text-sm text-gray-500">#{score.contestant?.number || 'N/A'}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-medium text-gray-900">{score.event?.name || 'Unknown'}</div>
                                <div className="text-sm text-gray-500">{score.event?.date || ''}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  {Object.entries(score.scores || {}).map(([key, value]) => (
                                    <div key={key} className="text-sm">
                                      <span className="font-medium">{key}:</span> {value}
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(score.totalScore)}`}>
                                  {score.totalScore?.toFixed(1) || '0'}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => handleDeleteContestant(score.contestantId)}
                                  className="p-2 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                                  title="Delete Contestant"
                                >
                                  <span className="text-lg">🗑️</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500">No scores available from this judge</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
