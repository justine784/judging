'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';

export default function ManageScoreDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contestants, setContestants] = useState([]);
  const [events, setEvents] = useState([]);
  const [judgeData, setJudgeData] = useState(null);
  const [scores, setScores] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Check if this is the managescore@gmail.com account
        if (user.email !== 'managescore@gmail.com') {
          // Redirect to regular judge dashboard if not managescore
          router.push('/judge/dashboard');
          return;
        }

        try {
          // Verify user is a valid judge
          const judgeDoc = await getDoc(doc(db, 'judges', user.uid));
          
          if (!judgeDoc.exists()) {
            await auth.signOut();
            router.push('/judge/login');
            return;
          }
          
          const judgeData = judgeDoc.data();
          
          if (judgeData.status === 'inactive' || judgeData.role !== 'judge') {
            await auth.signOut();
            router.push('/judge/login');
            return;
          }
          
          setUser(user);
          setJudgeData(judgeData);
          
          // Load data
          await loadEvents();
          await loadContestants();
          await loadScores();
          
          // Set up real-time listeners
          setupRealtimeListeners();
          
        } catch (error) {
          console.error('Error verifying judge status:', error);
          await auth.signOut();
          router.push('/judge/login');
          return;
        }
      } else {
        router.push('/judge/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const loadEvents = async () => {
    try {
      const eventsCollection = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsCollection);
      const eventsList = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(eventsList);
    } catch (error) {
      console.error('Error loading events:', error);
    }
  };

  const loadContestants = async () => {
    try {
      const contestantsCollection = collection(db, 'contestants');
      const contestantsSnapshot = await getDocs(contestantsCollection);
      const contestantsList = contestantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContestants(contestantsList);
    } catch (error) {
      console.error('Error loading contestants:', error);
    }
  };

  const loadScores = async () => {
    try {
      const scoresCollection = collection(db, 'scores');
      const scoresSnapshot = await getDocs(scoresCollection);
      const scoresData = {};
      
      scoresSnapshot.docs.forEach(doc => {
        const scoreData = doc.data();
        const contestantId = scoreData.contestantId;
        if (!scoresData[contestantId]) {
          scoresData[contestantId] = [];
        }
        scoresData[contestantId].push(scoreData);
      });
      
      setScores(scoresData);
    } catch (error) {
      console.error('Error loading scores:', error);
    }
  };

  const setupRealtimeListeners = () => {
    // Real-time listener for contestants
    const contestantsUnsubscribe = onSnapshot(collection(db, 'contestants'), () => {
      loadContestants();
      setLastUpdated(new Date());
    });

    // Real-time listener for scores
    const scoresUnsubscribe = onSnapshot(collection(db, 'scores'), () => {
      loadScores();
      setLastUpdated(new Date());
    });

    return () => {
      contestantsUnsubscribe();
      scoresUnsubscribe();
    };
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const calculateAverageScore = (contestantId) => {
    const contestantScores = scores[contestantId] || [];
    if (contestantScores.length === 0) return 0;
    
    let totalScore = 0;
    let totalWeight = 0;
    
    contestantScores.forEach(scoreData => {
      if (scoreData.scores) {
        Object.values(scoreData.scores).forEach(score => {
          totalScore += score;
          totalWeight += 1;
        });
      }
    });
    
    return totalWeight > 0 ? (totalScore / totalWeight).toFixed(1) : 0;
  };

  const getContestantStatus = (contestant) => {
    const avgScore = calculateAverageScore(contestant.id);
    if (avgScore >= 90) return { text: 'Excellent', color: 'bg-green-100 text-green-800' };
    if (avgScore >= 80) return { text: 'Very Good', color: 'bg-blue-100 text-blue-800' };
    if (avgScore >= 70) return { text: 'Good', color: 'bg-yellow-100 text-yellow-800' };
    if (avgScore >= 60) return { text: 'Fair', color: 'bg-orange-100 text-orange-800' };
    return { text: 'Needs Improvement', color: 'bg-red-100 text-red-800' };
  };

  const getEventName = (eventId) => {
    const event = events.find(e => e.id === eventId);
    return event ? event.eventName : 'Unknown Event';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Manage Score Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Image
                  src="/logo.jpg"
                  alt="Logo"
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              </div>
              <div className="ml-4">
                <h1 className="text-xl font-bold text-gray-900">Manage Score Dashboard</h1>
                <p className="text-sm text-gray-500">Score Management System</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user?.email}</p>
                <p className="text-xs text-gray-500">Score Manager</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Contestants</p>
                <p className="text-2xl font-bold text-gray-900">{contestants.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Scored</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(scores).filter(id => scores[id].length > 0).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-full">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Events</p>
                <p className="text-2xl font-bold text-gray-900">{events.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 rounded-full">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Last Updated</p>
                <p className="text-sm font-bold text-gray-900">
                  {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contestants Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Contestant Scores Overview</h2>
            <p className="text-sm text-gray-500">Real-time scoring data for all contestants</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contestant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Event
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Average Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Judges Scored
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contestants.map((contestant) => {
                  const avgScore = calculateAverageScore(contestant.id);
                  const status = getContestantStatus(contestant);
                  const judgeCount = scores[contestant.id]?.length || 0;
                  
                  return (
                    <tr key={contestant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-blue-600">
                                {contestant.contestantNumber || contestant.contestantNo || '?'}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {contestant.displayName || 
                               (contestant.contestantType === 'group' 
                                 ? contestant.groupName || 'Unknown Group'
                                 : `${contestant.firstName || ''} ${contestant.lastName || ''}`.trim() || 'Unknown')}
                            </div>
                            <div className="text-sm text-gray-500">
                              {contestant.contestantType === 'group' ? 'Group' : 'Solo'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getEventName(contestant.eventId)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-900">{avgScore}</span>
                          <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${Math.min(avgScore, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <span>{judgeCount} judge{judgeCount !== 1 ? 's' : ''}</span>
                          {judgeCount > 0 && (
                            <svg className="w-4 h-4 text-green-500 ml-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {contestants.length === 0 && (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No contestants</h3>
                <p className="mt-1 text-sm text-gray-500">No contestants have been added yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/scoreboard')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                View Live Scoreboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Refresh Data
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">System Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">User Role:</span>
                <span className="font-medium">Score Manager</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Access Level:</span>
                <span className="font-medium">Full Access</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Account Status:</span>
                <span className="font-medium text-green-600">Active</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-2 text-sm">
              {lastUpdated ? (
                <p className="text-gray-600">
                  Last score update: {lastUpdated.toLocaleString()}
                </p>
              ) : (
                <p className="text-gray-500">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
