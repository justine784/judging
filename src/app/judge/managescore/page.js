'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, updateDoc, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export default function AdminScoresDashboard() {
  const [user, setUser] = useState(null);
  const [judgeData, setJudgeData] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventScores, setEventScores] = useState([]);
  const [contestants, setContestants] = useState([]);
  const [judges, setJudges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [showJudgeBreakdown, setShowJudgeBreakdown] = useState(false);
  const [selectedContestant, setSelectedContestant] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        router.push('/judge/login');
        return;
      }

      // Check if this is the managescore judge
      if (currentUser.email !== 'managescore@gmail.com') {
        await signOut(auth);
        router.push('/judge/login');
        return;
      }

      setUser(currentUser);

      try {
        // Get judge data from Firestore
        const judgeDoc = await getDoc(doc(db, 'judges', currentUser.uid));
        if (judgeDoc.exists()) {
          const data = judgeDoc.data();
          setJudgeData(data);

          // Update last login
          await updateDoc(doc(db, 'judges', currentUser.uid), {
            lastLogin: new Date()
          });
        } else {
          setError('Judge profile not found');
        }
      } catch (err) {
        console.error('Error fetching judge data:', err);
        setError('Failed to load judge profile');
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    // Fetch events
    const eventsQuery = query(
      collection(db, 'events'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(eventsData);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching events:', err);
      setError('Failed to load events');
      setLoading(false);
    });

    return () => unsubscribeEvents();
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/judge/login');
    } catch (err) {
      console.error('Logout error:', err);
      setError('Failed to logout');
    }
  };

  const fetchEventScores = async (eventId) => {
    try {
      // Fetch contestants for this event
      const contestantsQuery = query(
        collection(db, 'contestants'),
        where('eventId', '==', eventId)
      );
      const contestantsSnapshot = await getDocs(contestantsQuery);
      const contestantsData = contestantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContestants(contestantsData);

      // Fetch scores for this event
      const scoresQuery = query(
        collection(db, 'scores'),
        where('eventId', '==', eventId)
      );
      const scoresSnapshot = await getDocs(scoresQuery);
      const scoresData = scoresSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Process scores to get totals and rankings
      const processedScores = processScoresData(scoresData, contestantsData);
      setEventScores(processedScores);

      // Fetch judges for this event
      const judgesQuery = query(
        collection(db, 'judges'),
        where('eventId', '==', eventId)
      );
      const judgesSnapshot = await getDocs(judgesQuery);
      const judgesData = judgesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJudges(judgesData);

    } catch (err) {
      console.error('Error fetching event scores:', err);
      setError('Failed to load scores');
    }
  };

  const processScoresData = (scoresData, contestantsData) => {
    const contestantScores = {};
    
    // Group scores by contestant
    scoresData.forEach(score => {
      if (!contestantScores[score.contestantId]) {
        contestantScores[score.contestantId] = {
          contestantId: score.contestantId,
          scores: [],
          totalScore: 0,
          criteria: {},
          judgeCount: 0
        };
      }
      
      contestantScores[score.contestantId].scores.push(score);
      contestantScores[score.contestantId].judgeCount += 1;
      
      // Aggregate criteria scores
      Object.keys(score).forEach(key => {
        if (key.startsWith('criteria') || key.includes('criteria')) {
          if (!contestantScores[score.contestantId].criteria[key]) {
            contestantScores[score.contestantId].criteria[key] = 0;
          }
          contestantScores[score.contestantId].criteria[key] += score[key] || 0;
        }
      });
    });

    // Calculate averages
    Object.values(contestantScores).forEach(contestantScore => {
      const judgeCount = contestantScore.judgeCount;
      if (judgeCount > 0) {
        // Average the total score
        contestantScore.totalScore = contestantScore.totalScore / judgeCount;
        
        // Average each criteria score
        Object.keys(contestantScore.criteria).forEach(key => {
          contestantScore.criteria[key] = contestantScore.criteria[key] / judgeCount;
        });
      }
    });

    // Convert to array and sort by total score
    const scoresArray = Object.values(contestantScores).map(contestantScore => {
      const contestant = contestantsData.find(c => c.id === contestantScore.contestantId);
      return {
        ...contestantScore,
        contestantName: contestant?.name || 'Unknown',
        contestantNumber: contestant?.number || 0
      };
    });

    return scoresArray.sort((a, b) => b.totalScore - a.totalScore);
  };

  const handleJudgeScores = (eventId) => {
    // Navigate to judge-specific scores view
    router.push(`/judge/managescore/${eventId}/judge-scores`);
  };

  const handleEventSelect = (eventId) => {
    const event = events.find(e => e.id === eventId);
    setSelectedEvent(event);
    fetchEventScores(eventId);
  };

  const handleViewJudgeBreakdown = (contestant) => {
    setSelectedContestant(contestant);
    setShowJudgeBreakdown(true);
  };

  const exportToPDF = () => {
    // Placeholder for PDF export functionality
    alert('PDF export functionality would be implemented here');
  };

  const exportToExcel = () => {
    // Placeholder for Excel export functionality
    alert('Excel export functionality would be implemented here');
  };

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.eventName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || event.status === statusFilter;
    const matchesDate = !dateFilter || event.date === dateFilter;
    return matchesSearch && matchesStatus && matchesDate;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Admin Scores Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/judge/login')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold">🏆</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">VIEW ALL EVENTS SCORES</h1>
                <p className="text-sm text-gray-500">Scores Management Panel</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {judgeData?.displayName || user?.displayName || 'Admin'}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedEvent ? (
          /* Events List View */
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">📊 Events Overview</h2>
            
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-400">🔎</span>
                </div>
                <input
                  type="text"
                  placeholder="Search Event"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <input
                type="date"
                placeholder="Filter by Date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
              
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>

            {/* Events Table */}
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">📭</div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">No Events Found</h4>
                <p className="text-gray-600">
                  No events match your current filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Event Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Contestants
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {event.eventName}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{event.date}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                            event.status === 'ongoing' 
                              ? 'bg-green-100 text-green-800' 
                              : event.status === 'upcoming'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${
                              event.status === 'ongoing' ? 'bg-green-500 animate-pulse' : 
                              event.status === 'upcoming' ? 'bg-blue-500' : 'bg-gray-500'
                            }`}></div>
                            {event.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {contestants.filter(c => c.eventId === event.id).length || 0}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEventSelect(event.id)}
                              className="text-blue-600 hover:text-blue-900 px-3 py-1 rounded border border-blue-300 hover:bg-blue-50"
                            >
                              View Scores
                            </button>
                            <button
                              onClick={() => handleJudgeScores(event.id)}
                              className="text-purple-600 hover:text-purple-900 px-3 py-1 rounded border border-purple-300 hover:bg-purple-50"
                            >
                              Judge Scores
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Event Scores View */
          <div className="space-y-6">
            {/* Event Header */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    📊 {selectedEvent.eventName}
                  </h2>
                  <p className="text-gray-600">Event Scoreboard</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportToPDF}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    📄 Export PDF
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    📊 Export Excel
                  </button>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                  >
                    ← Back to Events
                  </button>
                </div>
              </div>

              {/* Scores Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contestant
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Criteria 1
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Criteria 2
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Criteria 3
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {eventScores.map((score, index) => (
                      <tr key={score.contestantId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {index === 0 && <span className="text-2xl mr-2">🥇</span>}
                            {index === 1 && <span className="text-2xl mr-2">🥈</span>}
                            {index === 2 && <span className="text-2xl mr-2">🥉</span>}
                            <span className="text-sm font-bold text-gray-900">
                              #{index + 1}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {score.contestantName}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {score.criteria?.criteria1 || 0}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {score.criteria?.criteria2 || 0}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {score.criteria?.criteria3 || 0}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-blue-600">
                            {score.totalScore}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleViewJudgeBreakdown(score)}
                            className="text-purple-600 hover:text-purple-900 px-3 py-1 rounded border border-purple-300 hover:bg-purple-50"
                          >
                            👨‍⚖️ Judge Breakdown
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Judge Breakdown Modal */}
            {showJudgeBreakdown && selectedContestant && (
              <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-lg bg-white">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900">
                      👨‍⚖️ Anonymous Judge Breakdown
                    </h3>
                    <button
                      onClick={() => setShowJudgeBreakdown(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">
                      <strong>Event:</strong> {selectedEvent.eventName}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Contestant:</strong> {selectedContestant.contestantName}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Judge
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Criteria 1
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Criteria 2
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Criteria 3
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedContestant.scores.map((score, index) => (
                          <tr key={score.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                Judge {index + 1}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {score.criteria1 || 0}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {score.criteria2 || 0}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {score.criteria3 || 0}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-bold text-blue-600">
                                {score.total || 0}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">
                      Average Total Score: <span className="text-xl font-bold">
                        {selectedContestant.totalScore.toFixed(1)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

          </div>
  );
}
