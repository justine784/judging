'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from "next/image";
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
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
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const router = useRouter();

  // Store unsubscribe functions for cleanup
  const [unsubscribeFunctions, setUnsubscribeFunctions] = useState([]);

  // Form state for scoring
  const [formData, setFormData] = useState({});

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

  // Load judge-specific scores from the scores collection
  const loadJudgeScores = async (judgeId) => {
    try {
      const scoresCollection = collection(db, 'scores');
      const scoresQuery = query(scoresCollection, where('judgeId', '==', judgeId));
      const scoresSnapshot = await getDocs(scoresQuery);
      
      const judgeScores = {};
      scoresSnapshot.docs.forEach(doc => {
        const scoreData = doc.data();
        const contestantId = scoreData.contestantId;
        judgeScores[contestantId] = scoreData.scores;
      });
      
      return judgeScores;
    } catch (error) {
      console.error('Error loading judge scores:', error);
      return {};
    }
  };

  // Load contestants data from Firestore
  const loadContestants = async (judge) => {
    try {
      const assignedEventIds = judge.assignedEvents || [];
      
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

      // Load current judge's scores
      const judgeScores = await loadJudgeScores(judge.uid || judge.id);

      // Filter contestants to only include those from assigned events
      // If no events are assigned, show all contestants (fallback for existing judges)
      let assignedContestants;
      if (assignedEventIds.length === 0) {
        // Fallback: show all contestants if no events are assigned
        assignedContestants = allContestants.map(contestant => ({
          ...contestant,
          // Add judge's own scores or default to 0
          ...judgeScores[contestant.id],
          // Add the fields expected by the judge dashboard
          contestantNo: contestant.contestantNumber || contestant.contestantNo || '',
          contestantName: `${contestant.firstName || ''} ${contestant.lastName || ''}`.trim() || contestant.contestantName || '',
          eventName: eventsMap[contestant.eventId]?.eventName || 'Unknown Event'
        }));
      } else {
        // Normal case: filter by assigned events
        assignedContestants = allContestants.filter(contestant => 
          assignedEventIds.includes(contestant.eventId)
        ).map(contestant => ({
          ...contestant,
          // Add judge's own scores or default to 0
          ...judgeScores[contestant.id],
          // Add the fields expected by the judge dashboard
          contestantNo: contestant.contestantNumber || contestant.contestantNo || '',
          contestantName: `${contestant.firstName || ''} ${contestant.lastName || ''}`.trim() || contestant.contestantName || '',
          eventName: eventsMap[contestant.eventId]?.eventName || 'Unknown Event'
        }));
      }

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
      [name]: parseFloat(value) || 0
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
    const editFormData = {};
    
    // Add criteria scores to form data
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      editFormData[key] = contestant[key] || 0;
    });
    
    setFormData(editFormData);
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({});
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
      // Update quick scores to match the previous contestant's saved scores
      const newQuickScores = initializeQuickScores(currentEvent, contestant);
      setQuickScores(newQuickScores);
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
      // Update quick scores to match the next contestant's saved scores
      const newQuickScores = initializeQuickScores(currentEvent, contestant);
      setQuickScores(newQuickScores);
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

  // Swipe handlers for mobile navigation
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentContestantIndex < contestants.length - 1) {
      // Swipe left - go to next contestant
      selectContestantByIndex(currentContestantIndex + 1);
    }
    
    if (isRightSwipe && currentContestantIndex > 0) {
      // Swipe right - go to previous contestant
      selectContestantByIndex(currentContestantIndex - 1);
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
      
      // Update ALL contestants with totalWeightedScore to make them visible on scoreboard
      const contestantsWithScores = contestants.map(contestant => {
        // Calculate weighted total for each individual contestant
        const criteria = getCurrentEventCriteria();
        let totalScore = 0;
        criteria.forEach(criterion => {
          const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
          const score = contestant[key] || 0;
          const weight = criterion.weight / 100;
          totalScore += score * weight;
        });
        
        return {
          ...contestant,
          totalWeightedScore: parseFloat(totalScore.toFixed(1))
        };
      });
      
      // Save all judge's individual scores to the scores collection for aggregation
      const batch = writeBatch(db);
      contestantsWithScores.forEach(contestant => {
        if (contestant.id) {
          // Calculate weighted total for this specific contestant
          const criteria = getCurrentEventCriteria();
          let totalScore = 0;
          criteria.forEach(criterion => {
            const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
            const score = contestant[key] || 0;
            const weight = criterion.weight / 100;
            totalScore += score * weight;
          });
          
          // Create score data for the scores collection
          const scoreData = {
            contestantId: contestant.id,
            contestantName: contestant.contestantName,
            contestantNo: contestant.contestantNo,
            eventId: contestant.eventId,
            eventName: contestant.eventName,
            judgeId: user.uid,
            judgeName: user.displayName || user.email,
            judgeEmail: user.email,
            scores: {},
            criteria: getCurrentEventCriteria(),
            totalScore: parseFloat(totalScore.toFixed(1)),
            timestamp: new Date().toISOString()
          };
          
          // Add individual criteria scores to the score data
          criteria.forEach(criterion => {
            const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
            scoreData.scores[key] = contestant[key] || 0;
          });
          
          // Save to scores collection
          const scoreRef = doc(db, 'scores', `${user.uid}_${contestant.id}_${Date.now()}_${Math.random()}`);
          batch.set(scoreRef, scoreData);
        }
      });
      
      await batch.commit();
      
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
        
        // Don't update contestant document directly to maintain score privacy between judges
        // Only update local state for the current judge's view
        
        // Update local state - update the current contestant with their new scores
        const updatedContestants = contestants.map((c, index) => {
          if (index === currentContestantIndex) {
            // Calculate weighted total for the current contestant with new scores
            const criteria = getCurrentEventCriteria();
            let totalScore = 0;
            criteria.forEach(criterion => {
              const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
              const score = quickScores[key] || 0;
              const weight = criterion.weight / 100;
              totalScore += score * weight;
            });
            
            return { 
              ...c, 
              ...quickScores,
              totalWeightedScore: parseFloat(totalScore.toFixed(1))
            };
          } else {
            // Calculate weighted total for other contestants with their existing scores
            const criteria = getCurrentEventCriteria();
            let totalScore = 0;
            criteria.forEach(criterion => {
              const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
              const score = c[key] || 0;
              const weight = criterion.weight / 100;
              totalScore += score * weight;
            });
            
            return { 
              ...c,
              totalWeightedScore: parseFloat(totalScore.toFixed(1))
            };
          }
        });
        
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
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
      <header className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 shadow-xl border-b border-blue-500/20 sticky top-0 z-40">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="py-4 sm:py-6">
            {/* Main Header Row */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Left Section - Title and Info */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm shadow-2xl p-1 border border-white/20">
                      <Image
                        src="/logo.jpg"
                        alt="Bongabong Logo"
                        width={40}
                        height={40}
                        className="rounded-full object-contain"
                      />
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg border-2 border-white">
                      <Image
                        src="/minsu_logo.jpg"
                        alt="Trophy"
                        width={16}
                        height={16}
                        className="rounded-full object-contain"
                      />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-cyan-100 bg-clip-text text-transparent">
                      Judge Dashboard
                    </h1>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <p className="text-sm text-blue-100 font-medium">
                        Welcome back,
                      </p>
                      <p className="text-sm font-semibold text-white bg-white/10 px-2 py-1 rounded-md backdrop-blur-sm border border-white/20">
                        {user?.displayName || user?.email?.split('@')[0] || 'Judge'}
                      </p>
                    </div>
                    {judgeData?.judgeId && (
                      <p className="text-xs text-blue-200/70 mt-1">
                        Judge ID: {judgeData.judgeId}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Section - Status and Controls */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-end">
                {/* Connection Status - Hidden on mobile */}
                <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                  <div className="flex items-center gap-2 text-cyan-300">
                    <div className="relative w-3 h-3 rounded-full bg-cyan-400">
                      <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping"></div>
                    </div>
                    <span className="font-medium text-sm">🟢 Live</span>
                  </div>
                  <div className="h-4 w-px bg-white/20"></div>
                  <div className="text-xs text-blue-100">
                    <div className="font-medium">Updated</div>
                    <div>{lastUpdated ? lastUpdated.toLocaleTimeString() : 'Just now'}</div>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="self-end sm:self-auto px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 flex items-center gap-2 shadow-lg border border-red-400/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      
      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-gradient-to-br from-white to-blue-50/30 rounded-xl sm:rounded-2xl shadow-lg border border-blue-100/50 p-4 sm:p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-xl sm:text-2xl">📝</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-blue-600/70 font-medium">Total Contestants</p>
                <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-700 to-blue-900 bg-clip-text text-transparent">{contestants.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-blue-50/30 rounded-xl sm:rounded-2xl shadow-lg border border-blue-100/50 p-4 sm:p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-xl sm:text-2xl">🎯</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-blue-600/70 font-medium">Criteria Count</p>
                <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-700 to-blue-900 bg-clip-text text-transparent">{getCurrentEventCriteria().length}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-green-50/30 rounded-xl sm:rounded-2xl shadow-lg border border-green-100/50 p-4 sm:p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-xl sm:text-2xl">✅</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-green-600/70 font-medium">Completed Evaluations</p>
                <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-green-700 to-green-900 bg-clip-text text-transparent">
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

          <div className="bg-gradient-to-br from-white to-orange-50/30 rounded-xl sm:rounded-2xl shadow-lg border border-orange-100/50 p-4 sm:p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-xl sm:text-2xl">⏳</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-orange-600/70 font-medium">Pending Evaluations</p>
                <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-orange-700 to-orange-900 bg-clip-text text-transparent">
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
          <div key={event.id} className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 text-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs sm:text-sm font-medium text-blue-100">Event Name</label>
                <p className="font-semibold text-white text-sm sm:text-base truncate">{event.eventName}</p>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-blue-100">Date & Time</label>
                <p className="font-semibold text-white text-sm sm:text-base">{event.date} at {event.time}</p>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-blue-100">Venue</label>
                <p className="font-semibold text-white text-sm sm:text-base truncate">{event.venue}</p>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-blue-100">Status</label>
                <span className={`inline-flex items-center gap-1 px-2 sm:px-3 py-1 text-xs font-bold rounded-full ${
                  event.status === 'upcoming' ? 'bg-yellow-100 text-yellow-800' :
                  event.status === 'ongoing' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  <span>{event.status === 'upcoming' ? '📅' : event.status === 'ongoing' ? '🎭' : '✅'}</span>
                  <span className="hidden sm:inline">{event.status.charAt(0).toUpperCase() + event.status.slice(1)}</span>
                  <span className="sm:hidden">{event.status === 'upcoming' ? 'Up' : event.status === 'ongoing' ? 'On' : 'Fi'}</span>
                </span>
              </div>
            </div>
            
                      </div>
        ))}

          {/* Scoring Table */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6 sm:mb-8">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">📊 Contestant Scoring</h2>
                <p className="text-blue-100 text-xs sm:text-sm">Evaluate and score contestants</p>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search contestants..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full sm:w-64 px-3 sm:px-4 py-2 pl-8 sm:pl-10 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-blue-50 text-white placeholder-blue-200 text-sm"
                />
                <span className="absolute left-2.5 sm:left-3 top-2.5 text-blue-200 text-sm">🔍</span>
              </div>
            </div>
          </div>
          
          {contestants.length > 0 ? (
            <div className="overflow-x-auto overflow-y-hidden max-w-full">
              {/* Horizontal scroll indicator - Mobile only */}
              <div className="flex justify-between items-center mb-2 px-2 lg:hidden">
                <div className="text-sm text-gray-500 font-medium">← Scroll for more criteria →</div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => document.querySelector('.judge-scoring-table')?.scrollBy({ left: -200, behavior: 'smooth' })}
                    className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded-lg text-xs font-medium text-blue-700 transition-colors"
                  >
                    ←
                  </button>
                  <button 
                    onClick={() => document.querySelector('.judge-scoring-table')?.scrollBy({ left: 200, behavior: 'smooth' })}
                    className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded-lg text-xs font-medium text-blue-700 transition-colors"
                  >
                    →
                  </button>
                </div>
              </div>
              <table className="w-full min-w-[800px] judge-scoring-table">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">No.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  {getCurrentEventCriteria().map((criterion, index) => (
                    <th key={index} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="hidden sm:block">{criterion.name} ({criterion.weight}%)</div>
                      <div className="sm:hidden">{criterion.name.substring(0, 6)}...</div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredContestants.map((contestant) => (
                  <tr key={contestant.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-bold ${getRankColor(contestant.rank)}`}>
                        {contestant.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs sm:text-sm font-medium text-gray-900">{contestant.contestantNo}</td>
                    <td className="px-4 py-3 text-xs sm:text-sm text-gray-900">
                      <div className="truncate">{contestant.contestantName}</div>
                    </td>
                    {getCurrentEventCriteria().map((criterion, index) => {
                      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                      const score = contestant[key] || 0;
                      const colors = ['bg-blue-100 text-blue-800', 'bg-cyan-100 text-cyan-800', 'bg-sky-100 text-sky-800', 'bg-green-100 text-green-800', 'bg-yellow-100 text-yellow-800'];
                      const colorClass = colors[index % colors.length];
                      return (
                        <td key={index} className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center px-2 py-1 text-xs sm:text-sm font-medium ${colorClass} rounded-full`}>
                            {score.toFixed(1)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-1 text-xs sm:text-sm font-bold bg-green-100 text-green-800 rounded-full">
                        {(contestant.totalWeightedScore || 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(contestant.status)}`}>
                        <span className="hidden sm:inline">{contestant.status || 'Not Rated'}</span>
                        <span className="sm:hidden">{(contestant.status || 'Not Rated').substring(0, 8)}...</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="text-center py-8 sm:py-12">
              <div className="text-4xl sm:text-6xl mb-4">👥</div>
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No contestants found</h3>
              <p className="text-xs sm:text-sm text-gray-500 mb-4">
                {assignedEvents.length === 0 
                  ? "You are currently viewing all contestants. Contact the admin to assign you to specific events for better organization."
                  : "No contestants have been added to your assigned events yet."
                }
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 max-w-md mx-auto">
                <p className="text-xs sm:text-sm text-yellow-800">
                  <strong>Note:</strong> {assignedEvents.length === 0 
                    ? "New judges are automatically assigned to all events. If you're a new judge and don't see contestants, please refresh the page."
                    : "Contestants will appear here once they are added to events you're assigned to judge."
                  }
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile-Optimized 3-Line Scoring Layout */}
        <div 
          className="lg:hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Line 1: Contestant Info & Navigation */}
          <div className="bg-white rounded-2xl shadow-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">🎤 {currentContestant.name}</h2>
                <p className="text-sm text-gray-600 truncate">#{currentContestant.number} • {currentContestant.category}</p>
                <p className="text-xs text-gray-400 mt-1">👆 Swipe left/right to navigate</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentContestantIndex(Math.max(0, currentContestantIndex - 1))}
                  disabled={currentContestantIndex === 0}
                  className="p-2 bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentContestantIndex(Math.min(contestants.length - 1, currentContestantIndex + 1))}
                  disabled={currentContestantIndex === contestants.length - 1}
                  className="p-2 bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Progress Indicator */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>Contestant {currentContestantIndex + 1} of {contestants.length}</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  {Math.round(((currentContestantIndex + 1) / contestants.length) * 100)}% Complete
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentContestantIndex + 1) / contestants.length) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
            
            {/* Contestant Selector */}
            <div className="bg-white rounded-2xl shadow-lg p-4 mb-4">
              <select
              value={currentContestantIndex}
              onChange={(e) => selectContestantByIndex(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
            >
              {contestants.map((contestant, index) => (
                <option key={contestant.id} value={index}>
                  {contestant.contestantNo} - {contestant.contestantName}
                </option>
              ))}
            </select>
            </div>

          {/* Line 2: Quick Scoring */}
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Quick Scoring</h3>
              <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                {currentContestant.name}
              </span>
            </div>
            <div className="space-y-4">
              {getCurrentEventCriteria().map((criterion, index) => {
                const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                const score = quickScores[key] || 0;
                const colors = ['blue', 'green', 'purple', 'orange', 'pink'];
                const color = colors[index % colors.length];
                
                return (
                  <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                      <label className="text-sm font-semibold text-gray-800 flex-1">
                        {criterion.name}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-1 rounded">
                          {criterion.weight}%
                        </span>
                        <span className={`text-sm font-bold text-${color}-600 bg-${color}-50 px-2 py-1 rounded`}>
                          {score.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
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
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-center text-sm font-medium"
                      />
                    </div>
                    <div className="mt-2 text-xs text-gray-500 text-right">
                      Weighted: {(score * criterion.weight / 100).toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Total Score */}
            <div className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4 border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-gray-700">Total Weighted Score</span>
                  <div className="text-xs text-gray-500">out of 100.0</div>
                </div>
                <span className="text-2xl font-bold text-green-800">{calculateQuickTotal()}</span>
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
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors font-medium shadow-lg text-sm"
              >
                ✏️ Advanced Edit
              </button>
              <button
                onClick={openSubmitModal}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors font-medium shadow-lg text-sm"
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
                  <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                    {currentContestantIndex + 1} of {contestants.length}
                  </span>
                </div>
                
                {/* Contestant Selector */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Contestant</label>
                  <select
                    value={currentContestantIndex}
                    onChange={(e) => selectContestantByIndex(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
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
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                    <p className="text-2xl font-bold text-blue-800">#{currentContestant.number}</p>
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
                        const colors = ['text-blue-800', 'text-pink-800', 'text-blue-800', 'text-green-800', 'text-yellow-800'];
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
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                    {currentContestant.name}
                  </span>
                </div>
                
                {/* Scoring Criteria */}
                <div className="space-y-6">
                  {getCurrentEventCriteria().map((criterion, index) => {
                    const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                    const score = quickScores[key] || 0;
                    const colors = ['blue', 'green', 'purple', 'orange', 'pink'];
                    const color = colors[index % colors.length];
                    
                    return (
                      <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-base font-semibold text-gray-800">
                            {criterion.name}
                          </label>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-500 bg-gray-200 px-3 py-1 rounded-full">
                              {criterion.weight}%
                            </span>
                            <span className={`text-lg font-bold text-${color}-600 bg-${color}-50 px-3 py-1 rounded-full`}>
                              {score.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={score}
                            onChange={(e) => handleQuickScoreChange(key, e.target.value)}
                            className={`flex-1 h-3 bg-${color}-200 rounded-lg appearance-none cursor-pointer`}
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={score}
                            onChange={(e) => handleQuickScoreChange(key, e.target.value)}
                            className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-center font-semibold text-base"
                          />
                        </div>
                        <div className="mt-3 text-sm text-gray-500 text-right font-medium">
                          Weighted contribution: {(score * criterion.weight / 100).toFixed(1)} points
                        </div>
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
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium shadow-lg"
                    >
                      ✏️ Advanced Edit
                    </button>
                    <button
                      onClick={openSubmitModal}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium shadow-lg"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
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
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
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
