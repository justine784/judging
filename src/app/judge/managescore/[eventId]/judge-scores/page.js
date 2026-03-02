'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export default function JudgeScoresPage({ params }) {
  const unwrappedParams = React.use(params);
  const [user, setUser] = useState(null);
  const [judgeData, setJudgeData] = useState(null);
  const [event, setEvent] = useState(null);
  const [judges, setJudges] = useState([]);
  const [contestants, setContestants] = useState([]);
  const [judgeScores, setJudgeScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
    const fetchData = async () => {
      if (!unwrappedParams.eventId) return;

      // Fetch event details
      const fetchEvent = async () => {
        try {
          const eventDoc = await getDoc(doc(db, 'events', unwrappedParams.eventId));
          if (eventDoc.exists()) {
            setEvent({ id: eventDoc.id, ...eventDoc.data() });
          } else {
            setError('Event not found');
          }
        } catch (err) {
          console.error('Error fetching event:', err);
          setError('Failed to load event');
        }
      };

      // Fetch contestants for this event
      const fetchContestants = async () => {
        try {
          const contestantsQuery = query(
            collection(db, 'contestants'),
            where('eventId', '==', unwrappedParams.eventId)
          );
          const contestantsSnapshot = await getDocs(contestantsQuery);
          const contestantsData = contestantsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setContestants(contestantsData);
        } catch (err) {
          console.error('Error fetching contestants:', err);
        }
      };

      // Fetch judges for this event
      const fetchJudges = async () => {
        try {
          const judgesQuery = query(
            collection(db, 'judges'),
            where('eventId', '==', unwrappedParams.eventId)
          );
          const judgesSnapshot = await getDocs(judgesQuery);
          const judgesData = judgesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setJudges(judgesData);
          return judgesData;
        } catch (err) {
          console.error('Error fetching judges:', err);
          return [];
        }
      };

      // Fetch scores for this event
      const fetchScores = async (judgesData) => {
        try {
          const scoresQuery = query(
            collection(db, 'scores'),
            where('eventId', '==', unwrappedParams.eventId)
          );
          const scoresSnapshot = await getDocs(scoresQuery);
          const scoresData = scoresSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          // Process scores by judge
          const processedScores = processJudgeScores(scoresData, judgesData);
          setJudgeScores(processedScores);
        } catch (err) {
          console.error('Error fetching scores:', err);
        }
      };

      await fetchEvent();
      await fetchContestants();
      const judgesData = await fetchJudges();
      await fetchScores(judgesData);
      setLoading(false);
    };

    fetchData();
  }, [unwrappedParams.eventId]);

  const processJudgeScores = (scoresData, judgesData) => {
    const scoresByJudge = {};
    
    // Group scores by judge
    scoresData.forEach(score => {
      if (!scoresByJudge[score.judgeId]) {
        scoresByJudge[score.judgeId] = {
          judgeId: score.judgeId,
          scores: [],
          totalScore: 0,
          criteria: {}
        };
      }
      
      scoresByJudge[score.judgeId].scores.push(score);
      scoresByJudge[score.judgeId].totalScore += score.total || 0;
      
      // Aggregate criteria scores
      Object.keys(score).forEach(key => {
        if (key.startsWith('criteria') || key.includes('criteria')) {
          if (!scoresByJudge[score.judgeId].criteria[key]) {
            scoresByJudge[score.judgeId].criteria[key] = 0;
          }
          scoresByJudge[score.judgeId].criteria[key] += score[key] || 0;
        }
      });
    });

    // Convert to array and add judge info
    const scoresArray = Object.values(scoresByJudge).map(judgeScore => {
      const judge = judgesData.find(j => j.id === judgeScore.judgeId);
      return {
        ...judgeScore,
        judgeName: judge?.displayName || 'Unknown Judge',
        judgeEmail: judge?.email || 'unknown@example.com'
      };
    });

    return scoresArray;
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/judge/login');
    } catch (err) {
      console.error('Logout error:', err);
      setError('Failed to logout');
    }
  };

  const handleBackToEvents = () => {
    router.push('/judge/managescore');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Judge Scores...</p>
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
            onClick={() => router.push('/judge/managescore')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Events
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
                <h1 className="text-xl font-bold text-gray-900">JUDGE SCORES VIEW</h1>
                <p className="text-sm text-gray-500">Individual Judge Performance</p>
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
        {/* Event Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                📊 {event?.eventName || 'Event Scores'}
              </h2>
              <p className="text-gray-600">
                Date: {event?.date} | Venue: {event?.venue}
              </p>
            </div>
            <button
              onClick={handleBackToEvents}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              ← Back to Events
            </button>
          </div>
        </div>

        {/* Judges Overview */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">👥 Judges Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {judges.map((judge, index) => (
              <div key={judge.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                    <span className="text-white font-bold">J{index + 1}</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Judge {index + 1}</h4>
                    <p className="text-sm text-gray-500">{judge.email}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      judge.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {judge.status || 'Active'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Experience:</span>
                    <span className="font-medium">{judge.experience || 'Senior'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Judge Scores Table */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">📝 Individual Judge Scores</h3>
          
          {judgeScores.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📝</div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Scores Available</h4>
              <p className="text-gray-600">
                No scores have been recorded for this event yet.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {judgeScores.map((judgeScore, judgeIndex) => (
                <div key={judgeScore.judgeId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <span className="text-white font-bold">J{judgeIndex + 1}</span>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">Judge {judgeIndex + 1}</h4>
                      <p className="text-sm text-gray-500">{judgeScore.judgeEmail}</p>
                    </div>
                    <div className="ml-auto">
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Total Score Given:</p>
                        <p className="text-2xl font-bold text-purple-600">{judgeScore.totalScore}</p>
                      </div>
                    </div>
                  </div>

                  {/* Judge's Scores Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Contestant
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Criteria 1
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Criteria 2
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Criteria 3
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {judgeScore.scores.map((score) => {
                          const contestant = contestants.find(c => c.id === score.contestantId);
                          return (
                            <tr key={score.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {contestant?.name || 'Unknown'}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm text-gray-900">
                                  {score.criteria1 || 0}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm text-gray-900">
                                  {score.criteria2 || 0}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm text-gray-900">
                                  {score.criteria3 || 0}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm font-bold text-blue-600">
                                  {score.total || 0}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
