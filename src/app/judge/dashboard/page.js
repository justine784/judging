'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function JudgeDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contestants, setContestants] = useState([]);
  const [assignedEvents, setAssignedEvents] = useState([]);
  const [judgeData, setJudgeData] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingContestant, setEditingContestant] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [currentContestant, setCurrentContestant] = useState({
    number: 1,
    name: "Maria Cruz",
    category: "Vocal Performance",
    performanceOrder: 3,
    photo: null
  });
  const [currentContestantIndex, setCurrentContestantIndex] = useState(0);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [quickScores, setQuickScores] = useState({});
  const router = useRouter();

  // Store unsubscribe functions for cleanup
  const [unsubscribeFunctions, setUnsubscribeFunctions] = useState([]);

  // Form state for scoring
  const [formData, setFormData] = useState({
    contestantNo: '',
    contestantName: ''
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Check if the user is the admin - if so, redirect to admin dashboard
        if (user.email === 'admin@gmail.com') {
          router.push('/admin/dashboard');
          return;
        }
        
        // Verify user is a valid judge by checking the judges collection
        try {
          const judgeDoc = await getDoc(doc(db, 'judges', user.uid));
          
          if (!judgeDoc.exists()) {
            // User is not in the judges collection, sign out and redirect
            await auth.signOut();
            router.push('/judge/login');
            return;
          }
          
          const judgeData = judgeDoc.data();
          
          // Check if judge is inactive
          if (judgeData.status === 'inactive') {
            await auth.signOut();
            router.push('/judge/login');
            return;
          }
          
          // Check if user has judge role
          if (judgeData.role !== 'judge') {
            await auth.signOut();
            router.push('/judge/login');
            return;
          }
          
          setUser(user);
          setJudgeData(judgeData);
          
          // Set up real-time listener for judge data updates
          setupRealtimeListener(user.uid);
          
          // Set up real-time listener for contestants updates
          setupContestantsListener(judgeData);
          
          // Load judge's assigned events and contestants
          loadAssignedEvents(judgeData);
          loadContestants(judgeData);
        } catch (error) {
          console.error('Error verifying judge status:', error);
          await auth.signOut();
          router.push('/judge/login');
          return;
        }
      } else {
        // User is not authenticated, redirect to login
        router.push('/judge/login');
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      // Clean up all real-time listeners
      unsubscribeFunctions.forEach(unsub => unsub());
      setUnsubscribeFunctions([]);
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Load judge's assigned events from Firestore
  const loadAssignedEvents = async (judge) => {
    try {
      const assignedEventIds = judge.assignedEvents || [];
      
      if (assignedEventIds.length === 0) {
        setAssignedEvents([]);
        return;
      }

      // Fetch real events from Firestore
      const eventsCollection = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsCollection);
      const allEvents = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter events to only include those assigned to this judge
      const assignedEvents = allEvents.filter(event => 
        assignedEventIds.includes(event.id)
      );

      setAssignedEvents(assignedEvents);
      
      // Set current event to the first assigned event for criteria display
      if (assignedEvents.length > 0) {
        setCurrentEvent(assignedEvents[0]);
      }
    } catch (error) {
      console.error('Error loading assigned events:', error);
      setAssignedEvents([]);
    }
  };

  // Set up real-time listener for judge data updates
  const setupRealtimeListener = (judgeId) => {
    const judgeRef = doc(db, 'judges', judgeId);
    
    const unsubscribe = onSnapshot(judgeRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const updatedJudgeData = docSnapshot.data();
        setJudgeData(updatedJudgeData);
        
        // Check if assignedEvents changed
        const currentEvents = judgeData?.assignedEvents || [];
        const newEvents = updatedJudgeData.assignedEvents || [];
        
        if (JSON.stringify(currentEvents) !== JSON.stringify(newEvents)) {
          // Events changed, show notification
          setShowUpdateNotification(true);
          setLastUpdated(new Date());
          
          // Hide notification after 3 seconds
          setTimeout(() => {
            setShowUpdateNotification(false);
          }, 3000);
        }
        
        // Reload assigned events when judge data changes
        loadAssignedEvents(updatedJudgeData);
        
        // Reload contestants when judge data changes
        loadContestants(updatedJudgeData);
      }
    }, (error) => {
      console.error('Error listening to judge updates:', error);
    });
    
    // Store unsubscribe function for cleanup
    setUnsubscribeFunctions(prev => [...prev, unsubscribe]);
    
    return unsubscribe;
  };

  // Set up real-time listener for contestants updates
  const setupContestantsListener = (judge) => {
    const assignedEventIds = judge.assignedEvents || [];
    
    if (assignedEventIds.length === 0) return;

    const contestantsCollection = collection(db, 'contestants');
    const unsubscribe = onSnapshot(contestantsCollection, (snapshot) => {
      console.log('Contestants updated in real-time');
      loadContestants(judge); // Reload contestants when any change occurs
    }, (error) => {
      console.error('Error listening to contestants updates:', error);
    });
    
    // Store unsubscribe function for cleanup
    setUnsubscribeFunctions(prev => [...prev, unsubscribe]);
    
    return unsubscribe;
  };

  // Load contestants data from Firestore
  const loadContestants = async (judge) => {
    try {
      const assignedEventIds = judge.assignedEvents || [];
      
      if (assignedEventIds.length === 0) {
        setContestants([]);
        return;
      }

      // Fetch real contestants from Firestore
      const contestantsCollection = collection(db, 'contestants');
      const contestantsSnapshot = await getDocs(contestantsCollection);
      const allContestants = contestantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Fetch events to get event names
      const eventsCollection = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsCollection);
      const eventsMap = {};
      eventsSnapshot.docs.forEach(doc => {
        eventsMap[doc.id] = {
          id: doc.id,
          ...doc.data()
        };
      });

      // Filter contestants to only include those from assigned events
      // and add eventName field, using correct field names
      const assignedContestants = allContestants.filter(contestant => 
        assignedEventIds.includes(contestant.eventId)
      ).map(contestant => ({
        ...contestant,
        // Add the fields expected by the judge dashboard
        contestantNo: contestant.contestantNumber || contestant.contestantNo || '',
        contestantName: `${contestant.firstName || ''} ${contestant.lastName || ''}`.trim() || contestant.contestantName || '',
        eventName: eventsMap[contestant.eventId]?.eventName || 'Unknown Event'
      }));

      setContestants(assignedContestants);
      
      // Set initial current contestant and initialize quick scores
      if (assignedContestants.length > 0) {
        const firstContestant = assignedContestants[0];
        setCurrentContestant({
          number: firstContestant.contestantNo || '1',
          name: firstContestant.contestantName || 'Unknown',
          category: firstContestant.category || 'Vocal Performance',
          performanceOrder: firstContestant.performanceOrder || 1,
          photo: null
        });
        
        // Initialize quick scores for the first contestant
        if (currentEvent) {
          const initialScores = initializeQuickScores(currentEvent, firstContestant);
          setQuickScores(initialScores);
        }
      }
    } catch (error) {
      console.error('Error loading contestants:', error);
      setContestants([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'contestantNo' || name === 'contestantName' ? value : parseFloat(value) || 0
    }));
  };

  // Initialize quick scores based on event criteria
  const initializeQuickScores = (event, contestant = null) => {
    if (!event || !event.criteria) return {};
    
    const scores = {};
    event.criteria.filter(c => c.enabled).forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      scores[key] = contestant ? (contestant[key] || 0) : 0;
    });
    return scores;
  };

  // Get current event criteria
  const getCurrentEventCriteria = () => {
    if (!currentEvent || !currentEvent.criteria) return [];
    return currentEvent.criteria.filter(c => c.enabled);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const filteredContestants = contestants.filter(contestant => 
    contestant.eventName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contestant.contestantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contestant.contestantNo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateWeightedScore = (contestant, event = null) => {
    const criteriaToUse = event?.criteria || currentEvent?.criteria || [];
    const enabledCriteria = criteriaToUse.filter(c => c.enabled);
    
    if (enabledCriteria.length === 0) return 0;
    
    let totalScore = 0;
    enabledCriteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const score = contestant[key] || 0;
      const weight = criterion.weight / 100;
      totalScore += score * weight;
    });
    
    return totalScore.toFixed(1);
  };

  const handleEditContestant = () => {
    const totalScore = calculateWeightedScore({ ...formData, ...quickScores });
    const updatedContestants = contestants.map(contestant => 
      contestant.id === editingContestant.id 
        ? { ...contestant, ...formData, ...quickScores, totalWeightedScore: parseFloat(totalScore) }
        : contestant
    );
    
    const rankedContestants = updateRankings(updatedContestants);
    setContestants(rankedContestants);
    setShowEditModal(false);
    setEditingContestant(null);
    resetForm();
  };

  const updateRankings = (contestantsList) => {
    return contestantsList
      .sort((a, b) => b.totalWeightedScore - a.totalWeightedScore)
      .map((contestant, index) => ({
        ...contestant,
        rank: index + 1,
        status: index === 0 ? '🏆 Top 1' : index === 1 ? 'Top 2' : index === 2 ? 'Top 3' : `Top ${index + 1}`
      }));
  };

  const openEditModal = (contestant) => {
    setEditingContestant(contestant);
    const criteria = getCurrentEventCriteria();
    const editFormData = {
      contestantNo: contestant.contestantNo,
      contestantName: contestant.contestantName
    };
    
    // Add criteria scores to form data
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      editFormData[key] = contestant[key] || 0;
    });
    
    setFormData(editFormData);
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      contestantNo: '',
      contestantName: ''
    });
  };

  const getRankColor = (rank) => {
    switch(rank) {
      case 1: return 'bg-yellow-500 text-white';
      case 2: return 'bg-gray-400 text-white';
      case 3: return 'bg-orange-500 text-white';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  const getStatusColor = (status) => {
    if (status.includes('🏆')) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (status.includes('Top 2')) return 'bg-gray-100 text-gray-800 border-gray-300';
    if (status.includes('Top 3')) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };

  // Navigation functions
  const goToPreviousContestant = () => {
    if (currentContestantIndex > 0) {
      const newIndex = currentContestantIndex - 1;
      const contestant = contestants[newIndex];
      setCurrentContestantIndex(newIndex);
      setCurrentContestant({
        number: contestant.contestantNo,
        name: contestant.contestantName,
        category: contestant.category || 'Vocal Performance',
        performanceOrder: contestant.performanceOrder || newIndex + 1,
        photo: null
      });
    }
  };

  const goToNextContestant = () => {
    if (currentContestantIndex < contestants.length - 1) {
      const newIndex = currentContestantIndex + 1;
      const contestant = contestants[newIndex];
      setCurrentContestantIndex(newIndex);
      setCurrentContestant({
        number: contestant.contestantNo,
        name: contestant.contestantName,
        category: contestant.category || 'Vocal Performance',
        performanceOrder: contestant.performanceOrder || newIndex + 1,
        photo: null
      });
    }
  };

  const selectContestantByIndex = (index) => {
    if (index >= 0 && index < contestants.length) {
      const contestant = contestants[index];
      setCurrentContestantIndex(index);
      setCurrentContestant({
        number: contestant.contestantNo,
        name: contestant.contestantName,
        category: contestant.category || 'Vocal Performance',
        performanceOrder: contestant.performanceOrder || index + 1,
        photo: null
      });
      // Update quick scores to match current contestant scores based on event criteria
      const newQuickScores = initializeQuickScores(currentEvent, contestant);
      setQuickScores(newQuickScores);
    }
  };

  // Quick scoring functions
  const handleQuickScoreChange = (criteria, value) => {
    const numValue = parseFloat(value) || 0;
    setQuickScores(prev => ({
      ...prev,
      [criteria]: numValue
    }));
  };

  const calculateQuickTotal = () => {
    const criteria = getCurrentEventCriteria();
    if (criteria.length === 0) return '0.0';
    
    let totalScore = 0;
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const score = quickScores[key] || 0;
      const weight = criterion.weight / 100;
      totalScore += score * weight;
    });
    
    return totalScore.toFixed(1);
  };

  const handleSubmitScores = async () => {
    if (!user || !judgeData) return;
    
    if (!confirm('Are you sure you want to submit your scores to the admin? This will mark your evaluation as completed.')) {
      return;
    }
    
    try {
      // Update judge's submission status in Firestore
      const judgeRef = doc(db, 'judges', user.uid);
      await updateDoc(judgeRef, { 
        submissionStatus: 'completed',
        submittedAt: new Date().toISOString()
      });
      
      // Update local state
      setJudgeData(prev => ({
        ...prev,
        submissionStatus: 'completed',
        submittedAt: new Date().toISOString()
      }));
      
      setShowSubmitModal(false);
      
      alert('Your scores have been successfully submitted to the admin!');
    } catch (error) {
      console.error('Error submitting scores:', error);
      alert('Failed to submit scores. Please try again.');
    }
  };

  const openSubmitModal = () => {
    setShowSubmitModal(true);
  };

  const saveQuickScores = async () => {
    if (contestants[currentContestantIndex] && user && currentEvent) {
      try {
        const contestant = contestants[currentContestantIndex];
        const totalScore = parseFloat(calculateQuickTotal());
        
        // Save score to Firestore scores collection
        const scoreData = {
          contestantId: contestant.id,
          contestantName: contestant.contestantName,
          contestantNo: contestant.contestantNo,
          eventId: contestant.eventId,
          eventName: contestant.eventName,
          judgeId: user.uid,
          judgeName: user.displayName || user.email,
          judgeEmail: user.email,
          scores: quickScores,
          criteria: getCurrentEventCriteria(),
          totalScore: totalScore,
          timestamp: new Date().toISOString()
        };
        
        // Save to scores collection
        await setDoc(doc(db, 'scores', `${user.uid}_${contestant.id}_${Date.now()}`), scoreData);
        
        // Update contestant in Firestore with latest scores
        const contestantRef = doc(db, 'contestants', contestant.id);
        await updateDoc(contestantRef, {
          ...quickScores,
          totalWeightedScore: totalScore,
          lastUpdatedBy: user.uid,
          lastUpdatedAt: new Date().toISOString()
        }, { merge: true });
        
        // Update local state
        const updatedContestants = contestants.map((c, index) => 
          index === currentContestantIndex 
            ? { 
                ...c, 
                ...quickScores,
                totalWeightedScore: totalScore
              }
            : c
        );
        
        const rankedContestants = updateRankings(updatedContestants);
        setContestants(rankedContestants);
        
        // Show success message
        alert(`Scores saved for ${currentContestant.name}!`);
      } catch (error) {
        console.error('Error saving scores:', error);
        alert('Error saving scores. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Real-time Update Notification */}
      {showUpdateNotification && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-pulse">
          <span className="text-lg">🔄</span>
          <div>
            <p className="font-semibold">Events Updated!</p>
            <p className="text-sm">Your assigned events have been updated in real-time.</p>
          </div>
          <button
            onClick={() => setShowUpdateNotification(false)}
            className="ml-4 text-white hover:text-green-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🎤 Judge Dashboard</h1>
              <p className="text-lg text-gray-700 mt-1">Welcome, Judge {user?.displayName || user?.email}</p>
              {lastUpdated && (
                <p className="text-sm text-gray-500 mt-1">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg transition-colors font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">📝</span>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Contestants</p>
                <p className="text-2xl font-bold text-gray-900">{contestants.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">🎯</span>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Criteria Count</p>
                <p className="text-2xl font-bold text-gray-900">{getCurrentEventCriteria().length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Completed Evaluations</p>
                <p className="text-2xl font-bold text-gray-900">
                  {contestants.filter(c => {
                    const criteria = getCurrentEventCriteria();
                    return criteria.every(criterion => {
                      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                      return c[key] && c[key] > 0;
                    });
                  }).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">⏳</span>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Pending Evaluations</p>
                <p className="text-2xl font-bold text-gray-900">
                  {contestants.filter(c => {
                    const criteria = getCurrentEventCriteria();
                    return criteria.some(criterion => {
                      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                      return !c[key] || c[key] === 0;
                    });
                  }).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Event Information */}
        {assignedEvents.length > 0 && assignedEvents.map((event) => (
          <div key={event.id} className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl p-6 mb-6 text-white">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-purple-100">Event Name</label>
                <p className="font-semibold text-white">{event.eventName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-purple-100">Date & Time</label>
                <p className="font-semibold text-white">{event.date} at {event.time}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-purple-100">Venue</label>
                <p className="font-semibold text-white">{event.venue}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-purple-100">Status</label>
                <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full ${
                  event.status === 'upcoming' ? 'bg-yellow-100 text-yellow-800' :
                  event.status === 'ongoing' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  <span>{event.status === 'upcoming' ? '📅' : event.status === 'ongoing' ? '🎭' : '✅'}</span>
                  {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                </span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-purple-200">
              <label className="text-sm font-medium text-purple-100 block mb-2">Judging Criteria</label>
              <div className="flex flex-wrap gap-2">
                {event.criteria && event.criteria.filter(c => c.enabled).map((criterion, index) => (
                  <span key={index} className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                    {criterion.name} ({criterion.weight}%)
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}

          {/* Scoring Table */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
              <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">📊 Contestant Scoring</h2>
                <p className="text-purple-100 text-sm">Evaluate and score contestants</p>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search contestants..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-64 px-4 py-2 pl-10 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-purple-50 text-white placeholder-purple-200"
                />
                <span className="absolute left-3 top-2.5 text-purple-200">🔍</span>
              </div>
            </div>
          </div>
          
          {contestants.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contestant No.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contestant Name</th>
                    {getCurrentEventCriteria().map((criterion, index) => (
                      <th key={index} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {criterion.name} ({criterion.weight}%)
                      </th>
                    ))}
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredContestants.map((contestant) => (
                    <tr key={contestant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getRankColor(contestant.rank)}`}>
                          {contestant.rank}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{contestant.contestantNo}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{contestant.contestantName}</td>
                      {getCurrentEventCriteria().map((criterion, index) => {
                        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                        const score = contestant[key] || 0;
                        const colors = ['bg-purple-100 text-purple-800', 'bg-pink-100 text-pink-800', 'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-yellow-100 text-yellow-800'];
                        const colorClass = colors[index % colors.length];
                        return (
                          <td key={index} className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center justify-center px-3 py-1 text-sm font-medium ${colorClass} rounded-full`}>
                              {score.toFixed(1)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-bold bg-green-100 text-green-800 rounded-full">
                          {(contestant.totalWeightedScore || 0).toFixed(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(contestant.status)}`}>
                          {contestant.status || 'Not Rated'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openEditModal(contestant)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                          title="Edit Scores"
                        >
                          ✏️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👥</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No contestants found</h3>
              <p className="text-gray-500 mb-4">
                {assignedEvents.length === 0 
                  ? "You need to be assigned to an event first to see contestants."
                  : "No contestants have been added to your assigned events yet."
                }
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Contestants will appear here once they are added to events you're assigned to judge.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile-Optimized 3-Line Scoring Layout */}
        <div className="lg:hidden">
          {/* Line 1: Contestant Info & Navigation */}
          <div className="bg-white rounded-2xl shadow-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">🎤 {currentContestant.name}</h2>
                <p className="text-sm text-gray-600">#{currentContestant.number} • {currentContestant.category}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={goToPreviousContestant}
                  disabled={currentContestantIndex === 0}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  ←
                </button>
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                  {currentContestantIndex + 1}/{contestants.length}
                </span>
                <button 
                  onClick={goToNextContestant}
                  disabled={currentContestantIndex === contestants.length - 1}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  →
                </button>
              </div>
            </div>
            
            {/* Contestant Selector */}
            <select
              value={currentContestantIndex}
              onChange={(e) => selectContestantByIndex(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent text-sm"
            >
              {contestants.map((contestant, index) => (
                <option key={contestant.id} value={index}>
                  {contestant.contestantNo} - {contestant.contestantName}
                </option>
              ))}
            </select>
          </div>

          {/* Line 2: Quick Scoring */}
          <div className="bg-white rounded-2xl shadow-lg p-4 mb-4">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Quick Scoring</h3>
            <div className="space-y-3">
              {getCurrentEventCriteria().map((criterion, index) => {
                const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                const score = quickScores[key] || 0;
                const colors = ['purple', 'pink', 'blue', 'green', 'yellow'];
                const color = colors[index % colors.length];
                
                return (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">
                        {criterion.name} ({criterion.weight}%)
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.1"
                          value={score}
                          onChange={(e) => handleQuickScoreChange(key, e.target.value)}
                          className={`flex-1 h-1 bg-${color}-200 rounded-lg appearance-none cursor-pointer`}
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={score}
                          onChange={(e) => handleQuickScoreChange(key, e.target.value)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent text-center text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Total Score */}
            <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Total Score:</span>
                <span className="text-xl font-bold text-green-800">{calculateQuickTotal()}</span>
              </div>
            </div>
          </div>

          {/* Line 3: Action Buttons */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Actions</h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={saveQuickScores}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors font-medium shadow-lg text-sm"
              >
                💾 Save Scores
              </button>
              <button
                onClick={() => openEditModal(contestants[currentContestantIndex])}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg transition-colors font-medium shadow-lg text-sm"
              >
                ✏️ Advanced Edit
              </button>
              <button
                onClick={openSubmitModal}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors font-medium shadow-lg text-sm"
                disabled={judgeData?.submissionStatus === 'completed'}
              >
                📤 Submit to Admin
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:block">
          {/* Current Contestant Score */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Current Contestant</h2>
                  <span className="text-sm font-medium text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                    {currentContestantIndex + 1} of {contestants.length}
                  </span>
                </div>
                
                {/* Contestant Selector */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Contestant</label>
                  <select
                    value={currentContestantIndex}
                    onChange={(e) => selectContestantByIndex(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  >
                    {contestants.map((contestant, index) => (
                      <option key={contestant.id} value={index}>
                        {contestant.contestantNo} - {contestant.contestantName}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contestant Number</label>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
                    <p className="text-2xl font-bold text-purple-800">#{currentContestant.number}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contestant Name</label>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <p className="text-lg font-semibold text-gray-900">{currentContestant.name}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                    <p className="text-lg font-medium text-blue-800">{currentContestant.category}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Performance Order</label>
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <p className="text-lg font-medium text-green-800">Performance #{currentContestant.performanceOrder}</p>
                  </div>
                </div>

                {/* Current Scores */}
                {contestants[currentContestantIndex] && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Current Scores</label>
                    <div className="space-y-2">
                      {getCurrentEventCriteria().map((criterion, index) => {
                        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                        const score = contestants[currentContestantIndex]?.[key] || 0;
                        const colors = ['text-purple-800', 'text-pink-800', 'text-blue-800', 'text-green-800', 'text-yellow-800'];
                        const colorClass = colors[index % colors.length];
                        return (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">{criterion.name}:</span>
                            <span className={`font-medium ${colorClass}`}>{score.toFixed(1)}</span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm font-medium text-gray-700">Total:</span>
                        <span className="font-bold text-green-800">{(contestants[currentContestantIndex]?.totalWeightedScore || 0).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-8">
                  <button 
                    onClick={goToPreviousContestant}
                    disabled={currentContestantIndex === 0}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <button 
                    onClick={goToNextContestant}
                    disabled={currentContestantIndex === contestants.length - 1}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Quick Scoring Form</h2>
                  <span className="text-sm font-medium text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                    {currentContestant.name}
                  </span>
                </div>
                
                {/* Scoring Criteria */}
                <div className="space-y-6">
                  {getCurrentEventCriteria().map((criterion, index) => {
                    const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                    const score = quickScores[key] || 0;
                    const colors = ['purple', 'pink', 'blue', 'green', 'yellow'];
                    const color = colors[index % colors.length];
                    
                    return (
                      <div key={index}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {criterion.name} Score ({criterion.weight}%) <span className={`text-${color}-600 font-bold`}>{score.toFixed(1)}</span>
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={score}
                            onChange={(e) => handleQuickScoreChange(key, e.target.value)}
                            className={`flex-1 h-2 bg-${color}-200 rounded-lg appearance-none cursor-pointer`}
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={score}
                            onChange={(e) => handleQuickScoreChange(key, e.target.value)}
                            className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent text-center"
                          />
                        </div>
                        <div className="mt-1 text-xs text-gray-500">Weighted: {(score * criterion.weight / 100).toFixed(1)}</div>
                      </div>
                    );
                  })}

                  {/* Total Score Display */}
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">Total Weighted Score</h3>
                        <p className="text-sm text-gray-600">Sum of weighted criteria</p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-green-800">{calculateQuickTotal()}</div>
                        <div className="text-sm text-gray-500">out of 100.0</div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-4">
                    <button
                      onClick={saveQuickScores}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors font-medium shadow-lg"
                    >
                      💾 Save Scores
                    </button>
                    <button
                      onClick={() => openEditModal(contestants[currentContestantIndex])}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors font-medium shadow-lg"
                    >
                      ✏️ Advanced Edit
                    </button>
                    <button
                      onClick={openSubmitModal}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium shadow-lg"
                      disabled={judgeData?.submissionStatus === 'completed'}
                    >
                      📤 Submit to Admin
                    </button>
                  </div>

                  {/* Instructions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">📝 Quick Scoring Instructions:</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Use the sliders or input fields to set scores (0-100)</li>
                      <li>• Scores are automatically weighted based on event criteria</li>
                      <li>• Click "Save Scores" to save and update rankings</li>
                      <li>• Use "Advanced Edit" for detailed editing in modal</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Edit Contestant Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Contestant Scores</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleEditContestant(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contestant Number</label>
                <input
                  type="text"
                  name="contestantNo"
                  value={formData.contestantNo}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contestant Name</label>
                <input
                  type="text"
                  name="contestantName"
                  value={formData.contestantName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  required
                />
              </div>
              
              {/* Dynamic Criteria Fields */}
              {getCurrentEventCriteria().map((criterion, index) => {
                const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                return (
                  <div key={index}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {criterion.name} Score ({criterion.weight}%)
                    </label>
                    <input
                      type="number"
                      name={key}
                      value={formData[key] || 0}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                      required
                    />
                  </div>
                );
              })}
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600">
                  {getCurrentEventCriteria().map((criterion, index) => {
                    const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                    const score = formData[key] || 0;
                    const weighted = (score * criterion.weight / 100).toFixed(1);
                    return (
                      <div key={index}>
                        {criterion.name} ({criterion.weight}%): {weighted}
                      </div>
                    );
                  })}
                  <div className="font-semibold text-gray-900 pt-1 border-t">
                    Total: {calculateWeightedScore(formData)}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Update Scores
                </button>
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingContestant(null); resetForm(); }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Scores Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">📤</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900">Submit Scores to Admin</h3>
            </div>
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Are you sure you want to submit your scores to the admin? This will mark your evaluation as completed and you won't be able to make further changes.
              </p>
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="font-medium text-gray-900">Judge: {user?.displayName || user?.email}</div>
                <div className="text-sm text-gray-500">Event: {currentEvent?.eventName || 'Assigned Events'}</div>
                <div className="text-sm text-gray-500 mt-1">Contestants Score: {contestants.filter(c => {
                  const criteria = getCurrentEventCriteria();
                  return criteria.every(criterion => {
                    const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                    return c[key] && c[key] > 0;
                  });
                }).length} of {contestants.length}</div>
              </div>
              <p className="text-sm text-blue-600 mt-4">
                📋 This action will update your submission status to 'completed' in the admin dashboard.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSubmitScores}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Submit Scores
              </button>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
