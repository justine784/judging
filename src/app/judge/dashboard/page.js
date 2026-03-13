'use client';

import { useState, useEffect, useRef } from 'react';
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
  const [selectorKey, setSelectorKey] = useState(0); // Force re-render for selectors
  const [usingFinalRoundCriteria, setUsingFinalRoundCriteria] = useState(false); // Track if using final round criteria
  const [originalEventCriteria, setOriginalEventCriteria] = useState(null); // Store original criteria
  const [currentContestant, setCurrentContestant] = useState({
    number: 1,
    name: "Maria Cruz",
    category: "Vocal Performance",
    performanceOrder: 3,
    photo: null
  });
  const [currentContestantIndex, setCurrentContestantIndex] = useState(0);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [contestantScores, setContestantScores] = useState({});
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [slideDirection, setSlideDirection] = useState('right'); // 'left' or 'right' for slide animation
  const [isAnimating, setIsAnimating] = useState(false);
  const [lockedContestants, setLockedContestants] = useState(new Set()); // Track which contestants have locked scoring forms (format: contestantId_main or contestantId_final)
  const [lockedScores, setLockedScores] = useState({}); // Track locked scores per contestant (key format: contestantId_main or contestantId_final)
  const [scoredContestants, setScoredContestants] = useState(new Set()); // Track which contestants have been scored in main criteria
  const [scoredContestantsFinal, setScoredContestantsFinal] = useState(new Set()); // Track which contestants have been scored in final rounds
  const [showFinalistsOnly, setShowFinalistsOnly] = useState(false); // Track if showing finalists only
  const [eventCurrentRound, setEventCurrentRound] = useState('preliminary'); // Track admin-set current round from event
  const [previousContestantInfo, setPreviousContestantInfo] = useState(null); // Track previous contestant score when navigating
  const [showPreviousScore, setShowPreviousScore] = useState(false); // Control visibility of previous score notification
  const [submittedCriteria, setSubmittedCriteria] = useState({}); // Track submitted criteria per contestant
  const [submittedSlides, setSubmittedSlides] = useState({}); // Track submitted slides per contestant
  const router = useRouter();

  // Store unsubscribe functions for cleanup
  const unsubscribeFunctionsRef = useRef([]);

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
          if (judgeData.isActive === false) {
            await auth.signOut();
            alert('🚫 Your judge account has been deactivated. You cannot access the dashboard. Please contact the administrator for assistance.');
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
          
          // Set up real-time listener for scores collection updates
          setupScoresListener(judgeData);
          
          // Set up real-time listener for event updates (admin round changes)
          setupEventsListener(judgeData);
          
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
      unsubscribeFunctionsRef.current.forEach(unsub => unsub());
      unsubscribeFunctionsRef.current = [];
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

  // Initialize contestant scores when currentEvent changes
  useEffect(() => {
    if (currentEvent && contestants.length > 0) {
      const currentContestant = contestants[currentContestantIndex];
      if (currentContestant) {
        // Only initialize if we don't have any scores yet for this contestant
        if (!contestantScores[currentContestant.id]) {
          const initialScores = initializeQuickScores(currentEvent, currentContestant);
          setContestantScores(prev => ({
            ...prev,
            [currentContestant.id]: initialScores
          }));
          console.log('Initialized contestant scores for event change:', currentContestant.contestantName, initialScores);
        } else {
          console.log('Preserving existing contestant scores during event change:', contestantScores[currentContestant.id]);
        }
      }
    }
  }, [currentEvent, contestants, currentContestantIndex]);

  // Update contestant scores when contestant changes - preserve locked scores
  useEffect(() => {
    if (currentEvent && contestants.length > 0 && currentContestantIndex >= 0) {
      const currentContestant = contestants[currentContestantIndex];
      if (currentContestant) {
        // Check if contestant is locked for current round (main or final)
        const lockKey = `${currentContestant.id}_${usingFinalRoundCriteria ? 'final' : 'main'}`;
        const isContestantLocked = currentContestant.id && lockedContestants.has(lockKey);
        
        if (isContestantLocked && lockedScores[lockKey]) {
          // If contestant is locked and we have saved locked scores, restore them
          const savedLockedScores = lockedScores[lockKey];
          setContestantScores(prev => ({
            ...prev,
            [currentContestant.id]: savedLockedScores
          }));
          console.log('Restored locked scores for contestant:', currentContestant.contestantName, 'round:', usingFinalRoundCriteria ? 'final' : 'main', savedLockedScores);
        } else if (contestantScores[currentContestant.id]) {
          // If we already have contestant scores (from unlock or previous navigation), preserve them
          console.log('Preserving existing contestant scores for contestant:', currentContestant.contestantName, contestantScores[currentContestant.id]);
        } else {
          // Initialize with saved scores from contestant data (for page refresh scenario)
          const savedScores = initializeQuickScores(currentEvent, currentContestant);
          setContestantScores(prev => ({
            ...prev,
            [currentContestant.id]: savedScores
          }));
          console.log('Initialized scores from contestant data:', currentContestant.contestantName, savedScores);
        }
        
        // Load submitted criteria state
        loadSubmittedCriteria(currentContestant);
      }
    }
  }, [currentContestantIndex, currentEvent?.id, contestants.length, lockedContestants, lockedScores, usingFinalRoundCriteria]);

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
      const allEvents = eventsSnapshot.docs.map(doc => {
        const data = doc.data();
        // Normalize event data: ensure criteriaCategories field exists
        // This prevents fallback to legacy criteria for events that should have empty criteria
        return {
          id: doc.id,
          ...data,
          criteriaCategories: data.criteriaCategories || [] // Ensure field exists
        };
      });

      // Filter events to only include those assigned to this judge
      const assignedEvents = allEvents.filter(event => 
        assignedEventIds.includes(event.id)
      );

      setAssignedEvents(assignedEvents);
      
      // Set current event to the first assigned event for criteria display
      if (assignedEvents.length > 0) {
        setCurrentEvent(assignedEvents[0]);
        // Also set the current round from the event (admin-controlled)
        setEventCurrentRound(assignedEvents[0].currentRound || 'preliminary');
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
        
        // Load scored contestants from judge data
        if (updatedJudgeData.scoredContestants) {
          setScoredContestants(new Set(updatedJudgeData.scoredContestants));
        }
        if (updatedJudgeData.scoredContestantsFinal) {
          setScoredContestantsFinal(new Set(updatedJudgeData.scoredContestantsFinal));
        }
        
        // Load locked contestants from judge data (persisted)
        if (updatedJudgeData.lockedContestants) {
          setLockedContestants(new Set(updatedJudgeData.lockedContestants));
        }
        // Load locked scores from judge data (persisted)
        if (updatedJudgeData.lockedScores) {
          setLockedScores(updatedJudgeData.lockedScores);
        }
        
        // Check if assignedEvents changed
        const currentEvents = judgeData?.assignedEvents || [];
        const newEvents = updatedJudgeData.assignedEvents || [];
        
        // Check if only lock/unlock data changed (to avoid unnecessary contestant reload)
        const currentLockData = {
          lockedContestants: judgeData?.lockedContestants || [],
          lockedScores: judgeData?.lockedScores || {},
          scoredContestants: judgeData?.scoredContestants || [],
          scoredContestantsFinal: judgeData?.scoredContestantsFinal || []
        };
        const newLockData = {
          lockedContestants: updatedJudgeData.lockedContestants || [],
          lockedScores: updatedJudgeData.lockedScores || {},
          scoredContestants: updatedJudgeData.scoredContestants || [],
          scoredContestantsFinal: updatedJudgeData.scoredContestantsFinal || []
        };
        
        const onlyLockDataChanged = 
          JSON.stringify(currentEvents) === JSON.stringify(newEvents) &&
          JSON.stringify(currentLockData) !== JSON.stringify(newLockData);
        
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
        
        // Only reload contestants when significant data changed (not just lock/unlock)
        if (!onlyLockDataChanged) {
          console.log('🔄 Reloading contestants due to significant judge data change');
          loadContestants(updatedJudgeData);
        } else {
          console.log('🔒 Lock/unlock data changed, skipping contestants reload to preserve navigation');
        }
      }
    }, (error) => {
      console.error('Error listening to judge updates:', error);
    });
    
    // Store unsubscribe function for cleanup
    unsubscribeFunctionsRef.current.push(unsubscribe);
    
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
    unsubscribeFunctionsRef.current.push(unsubscribe);
    
    return unsubscribe;
  };

  // Set up real-time listener for scores collection to update rankings
  const setupScoresListener = (judge) => {
    const scoresCollection = collection(db, 'scores');
    const unsubscribe = onSnapshot(scoresCollection, (snapshot) => {
      console.log('Scores updated in real-time - updating rankings');
      // Reload contestants to recalculate rankings with new scores
      loadContestants(judge);
    }, (error) => {
      console.error('Error listening to scores updates:', error);
    });
    
    // Store unsubscribe function for cleanup
    unsubscribeFunctionsRef.current.push(unsubscribe);
    
    return unsubscribe;
  };

  // Set up real-time listener for event updates (to track currentRound changes by admin)
  const setupEventsListener = (judge) => {
    const assignedEventIds = judge.assignedEvents || [];
    
    if (assignedEventIds.length === 0) return;

    const eventsCollection = collection(db, 'events');
    const unsubscribe = onSnapshot(eventsCollection, (snapshot) => {
      console.log('Events updated in real-time');
      
      // Update event current round if the current event is updated
      snapshot.docs.forEach(doc => {
        const eventData = doc.data();
        if (assignedEventIds.includes(doc.id)) {
          // Update the currentRound state when admin changes it
          if (currentEvent && currentEvent.id === doc.id) {
            setEventCurrentRound(eventData.currentRound || 'preliminary');
            
            // Also update currentEvent with any changes
            setCurrentEvent(prev => {
              if (prev && prev.id === doc.id) {
                return {
                  ...prev,
                  ...eventData,
                  id: doc.id,
                  currentRound: eventData.currentRound || 'preliminary'
                };
              }
              return prev;
            });
          }
          
          // Update assignedEvents array with latest data
          setAssignedEvents(prev => {
            return prev.map(event => {
              if (event.id === doc.id) {
                return {
                  ...event,
                  ...eventData,
                  id: doc.id,
                  currentRound: eventData.currentRound || 'preliminary'
                };
              }
              return event;
            });
          });
        }
      });
    }, (error) => {
      console.error('Error listening to events updates:', error);
    });
    
    // Store unsubscribe function for cleanup
    unsubscribeFunctionsRef.current.push(unsubscribe);
    
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
        
        // Merge scores from all documents for the same contestant
        // This ensures both main round and final round scores are preserved
        if (judgeScores[contestantId]) {
          // Merge with existing scores - newer scores overwrite older ones for the same key
          judgeScores[contestantId] = {
            ...judgeScores[contestantId],
            ...scoreData.scores
          };
        } else {
          judgeScores[contestantId] = scoreData.scores;
        }
      });
      
      console.log('📊 Loaded judge scores (merged):', judgeScores);
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

      // Filter contestants to only include those from assigned events and not eliminated
      // If no events are assigned, show empty list
      let assignedContestants;
      if (assignedEventIds.length === 0) {
        // No events assigned - show empty contestant list
        assignedContestants = [];
      } else {
        // Normal case: filter by assigned events and exclude eliminated ones
        assignedContestants = allContestants.filter(contestant => {
          console.log('Processing contestant (normal):', {
            id: contestant.id,
            contestantType: contestant.contestantType,
            displayName: contestant.displayName,
            groupName: contestant.groupName,
            firstName: contestant.firstName,
            lastName: contestant.lastName,
            contestantName: contestant.contestantName,
            eventId: contestant.eventId,
            assignedEventIds: assignedEventIds
          });
          return assignedEventIds.includes(contestant.eventId) && !contestant.eliminated;
        }).map(contestant => ({
          ...contestant,
          // Add judge's own scores or default to 0
          ...judgeScores[contestant.id],
          // Add the fields expected by the judge dashboard
          contestantNo: contestant.contestantNumber || contestant.contestantNo || '',
          contestantName: (() => {
            const finalName = contestant.displayName || 
              (contestant.contestantType === 'group' 
                ? contestant.groupName || 'Unknown Group'
                : `${contestant.firstName || ''} ${contestant.lastName || ''}`.trim() || 'Unknown Solo');
            console.log('Final contestant name constructed:', {
              original: contestant,
              finalName: finalName,
              contestantType: contestant.contestantType
            });
            return finalName;
          })(),
          eventName: eventsMap[contestant.eventId]?.eventName || 'Unknown Event',
          // Calculate totalWeightedScore for ranking
          totalWeightedScore: (() => {
            const criteria = getCurrentEventCriteria();
            if (criteria.length === 0) return 0;
            
            let totalScore = 0;
            const useFinalRoundPrefix = usingFinalRoundCriteria;
            
            criteria.forEach((criterion, index) => {
              const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
              
              // Check if this is "AVERAGE OF THE 1ST ROUND" criterion (by name or by position)
              const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                                     criterion.name.toUpperCase().includes('1ST') && 
                                     criterion.name.toUpperCase().includes('ROUND');
              const isPositionBased = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
              const isFirstRoundAverage = isNameBased || isPositionBased;
              
              let score;
              if (isFirstRoundAverage) {
                // For first round average criterion, use saved value if it exists, otherwise calculate
                const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
              } else {
                // For other criteria, use stored score with appropriate prefix
                score = contestant[key] || judgeScores[contestant.id]?.[key] || 0;
              }
              
              const weight = criterion.weight / 100;
              totalScore += score * weight;
            });
            
            return parseFloat(totalScore.toFixed(1));
          })()
        })).sort((a, b) => {
          const numA = parseInt(a.contestantNo) || 0;
          const numB = parseInt(b.contestantNo) || 0;
          return numA - numB;
        });
      }

      const rankedContestants = updateRankings(assignedContestants);
      
      // Preserve current contestant position when reloading
      // Check if we have a current contestant and if they're still in the list
      setContestants(prevContestants => {
        // Get the current contestant ID we're viewing from currentContestant state instead of prevContestants
        const currentViewingId = currentContestant?.id || 
                                (currentContestantIndex >= 0 && prevContestants[currentContestantIndex]?.id);
        
        // Find if the current contestant is still in the new list
        const newIndex = currentViewingId ? rankedContestants.findIndex(c => c.id === currentViewingId) : -1;
        
        if (rankedContestants.length > 0) {
          let targetContestant;
          let targetIndex;
          
          if (newIndex !== -1) {
            // Current contestant is still in the list, keep viewing them
            targetContestant = rankedContestants[newIndex];
            targetIndex = newIndex;
            console.log('✅ Preserving current contestant:', targetContestant.contestantName, 'at index:', targetIndex);
          } else if (currentViewingId && prevContestants.length > 0) {
            // Current contestant was eliminated, navigate to next available or first
            // Try to keep same position if possible
            targetIndex = Math.min(currentContestantIndex, rankedContestants.length - 1);
            targetContestant = rankedContestants[targetIndex];
            console.log('⚠️ Contestant was eliminated, navigating to index:', targetIndex);
          } else {
            // First load or no previous state - ONLY set to 0 if we don't have a valid current index
            if (currentContestantIndex >= 0 && currentContestantIndex < rankedContestants.length) {
              targetIndex = currentContestantIndex;
              targetContestant = rankedContestants[targetIndex];
              console.log('🔄 Keeping current index:', targetIndex);
            } else {
              targetContestant = rankedContestants[0];
              targetIndex = 0;
              console.log('🏠 Setting to first contestant (initial load)');
            }
          }
          
          // Update current contestant index - ONLY if it actually needs to change
          if (targetIndex !== currentContestantIndex) {
            console.log('📍 Updating contestant index from', currentContestantIndex, 'to', targetIndex);
            setCurrentContestantIndex(targetIndex);
          }
          
          // Update current contestant display
          setCurrentContestant({
            number: targetContestant.contestantNo || '1',
            name: targetContestant.contestantName || 'Unknown',
            category: targetContestant.category || 'Vocal Performance',
            performanceOrder: targetContestant.performanceOrder || 1,
            photo: null,
            contestantType: targetContestant.contestantType || 'solo'
          });
          
          // Initialize contestant scores for the target contestant
          setTimeout(() => {
            if (currentEvent) {
              const initialScores = initializeQuickScores(currentEvent, targetContestant);
              setContestantScores(prev => ({
                ...prev,
                [targetContestant.id]: initialScores
              }));
            }
          }, 100);
        }
        
        return rankedContestants;
      });
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

  // Handle individual criterion score changes
  const handleScoreChange = (criteriaId, value) => {
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant) return;
    
    const contestantId = currentContestant.id;
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    const key = getCriteriaKey(criteriaId, useFinalRoundPrefix);
    
    setFormData(prev => ({
      ...prev,
      [key]: parseFloat(value) || 0
    }));
  };

  // Handle slide-level score submission
  const submitSlideScores = async (contestantId) => {
    if (!user || !judgeData || !currentEvent) return;
    
    const contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) return;
    
    // Get all current scores for this contestant
    const currentScores = contestantScores[contestantId] || {};
    
    // Confirm submission
    if (!confirm(`Are you sure you want to submit all scores for "${contestant.contestantName}"? This will submit the entire slide.`)) {
      return;
    }
    
    try {
      // Create slide submission record
      const slideSubmissionKey = `${contestantId}_slide_${usingFinalRoundCriteria ? 'final' : 'main'}`;
      const submissionData = {
        judgeId: user.uid,
        judgeName: user.displayName || user.email,
        contestantId: contestantId,
        contestantName: contestant.contestantName,
        contestantNumber: contestant.contestantNo,
        scores: currentScores,
        submittedAt: new Date().toISOString(),
        round: usingFinalRoundCriteria ? 'final' : 'main',
        eventId: currentEvent.id,
        eventName: currentEvent.eventName || currentEvent.name || 'Unknown Event'
      };
      
      // Save slide submission to Firestore
      await setDoc(doc(db, 'slideSubmissions', slideSubmissionKey), submissionData);
      
      // Update local state to mark slide as submitted
      setSubmittedSlides(prev => ({
        ...prev,
        [slideSubmissionKey]: true
      }));
      
      // Show success message
      alert(`✅ All scores submitted for "${contestant.contestantName}"!`);
      
    } catch (error) {
      console.error('Error submitting slide scores:', error);
      alert('❌ Failed to submit slide scores. Please try again.');
    }
  };

  // Handle individual criterion submission
  const submitScore = async (criteriaId) => {
    if (!user || !judgeData || !currentEvent) return;
    
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant) return;
    
    const contestantId = currentContestant.id;
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    const key = getCriteriaKey(criteriaId, useFinalRoundPrefix);
    
    // Get the actual score from contestantScores, not formData
    const score = contestantScores[contestantId]?.[key] || 0;
    
    // Confirm submission
    if (!confirm(`Are you sure you want to submit your score for "${criteriaId}"? Score: ${score}`)) {
      return;
    }
    
    try {
      const contestantRef = doc(db, 'contestants', contestantId);
      
      // Create submission data for contestant document (for individual submission tracking)
      const submissionData = {
        [key]: score,
        [`${key}_submitted`]: {
          judgeId: user.uid,
          judgeName: judgeData.name || user.displayName || user.email,
          contestantId: contestantId,
          criterionName: criteriaId,
          criterionKey: key,
          score: score,
          submittedAt: new Date().toISOString(),
          round: useFinalRoundPrefix ? 'final' : 'main'
        }
      };
      
      await updateDoc(contestantRef, submissionData);
      
      // Also save to scores collection for Live Scoreboard to see immediately
      const criteria = getCurrentEventCriteria();
      const isPointsGrading = currentEvent?.gradingType === 'points';
      let totalScore = 0;
      
      // Calculate total score with this single criterion
      criteria.forEach((criterion, index) => {
        const usePrefix = usingFinalRoundCriteria;
        const critKey = getCriteriaKey(criterion.name, usePrefix);
        
        // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
        const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                               criterion.name.toUpperCase().includes('1ST') && 
                               criterion.name.toUpperCase().includes('ROUND');
        const isPositionBased = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
        const isFirstRoundAverage = isNameBased || isPositionBased;
        
        let critScore;
        if (isFirstRoundAverage) {
          const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
          critScore = currentContestant[originalKey] !== undefined ? currentContestant[originalKey] : calculateFirstRoundAverage(currentContestant);
        } else {
          // Use the score from contestantScores for this criterion, or 0 for others
          critScore = (critKey === key) ? score : (contestantScores[contestantId]?.[critKey] || 0);
        }
        
        if (isPointsGrading) {
          totalScore += critScore;
        } else {
          const weight = criterion.weight / 100;
          totalScore += critScore * weight;
        }
      });
      
      // Create individual score document for Live Scoreboard
      const individualScoreData = {
        contestantId: contestantId,
        contestantName: currentContestant.contestantName,
        contestantNo: currentContestant.contestantNo,
        eventId: currentEvent.id,
        eventName: currentEvent.name || 'Unknown Event',
        judgeId: user.uid,
        judgeName: judgeData.name || user.displayName || user.email,
        judgeEmail: user.email,
        scores: {
          [key]: score
        },
        criteria: criteria,
        totalScore: parseFloat(totalScore.toFixed(1)),
        isFinalRound: usingFinalRoundCriteria,
        timestamp: new Date().toISOString(),
        isIndividualSubmission: true // Flag to identify this as individual submission
      };
      
      // Save to scores collection
      const scoreRef = doc(db, 'scores', `${user.uid}_${contestantId}_${key}_${Date.now()}`);
      await setDoc(scoreRef, individualScoreData);
      
      // Update local state
      setSubmittedCriteria(prev => ({
        ...prev,
        [`${contestantId}_${key}`]: true
      }));
      
      // Show success feedback
      alert(`✅ Score submitted for "${criteriaId}"!`);
      
    } catch (error) {
      console.error('Error submitting score:', error);
      alert('❌ Failed to submit score. Please try again.');
    }
  };

  // Load submitted criteria state from contestant data
  const loadSubmittedCriteria = (contestant) => {
    if (!contestant) return;
    
    const submitted = {};
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    
    // Check all possible criteria keys
    getCurrentEventCriteria().forEach(criterion => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      const submissionKey = `${key}_submitted`;
      
      // Check if this criterion has been submitted
      if (contestant[submissionKey]) {
        submitted[`${contestant.id}_${key}`] = true;
      }
    });
    
    setSubmittedCriteria(prev => ({
      ...prev,
      ...submitted
    }));
  };

  // Helper function to get criteria key with proper prefix for final rounds
  const getCriteriaKey = (criterionName, useFinalRoundPrefix = false) => {
    const baseKey = criterionName.toLowerCase().replace(/\s+/g, '_');
    return useFinalRoundPrefix ? `final_${baseKey}` : baseKey;
  };

  // Initialize quick scores based on event criteria
  // Optional forceFinalRound parameter to override state check (for use before state is updated)
  const initializeQuickScores = (event, contestant = null, forceFinalRound = null) => {
    if (!event) return {};
    
    const scores = {};
    // Use forceFinalRound if provided, otherwise use state
    const useFinalRoundPrefix = forceFinalRound !== null ? forceFinalRound : usingFinalRoundCriteria;
    
    // Get criteria using the updated getCurrentEventCriteria function
    const criteria = getCurrentEventCriteria(forceFinalRound);
    
    // Check if this contestant is locked for current round
    const lockKey = contestant ? `${contestant.id}_${useFinalRoundPrefix ? 'final' : 'main'}` : null;
    const isContestantLocked = lockKey && lockedContestants.has(lockKey);
    
    // Initialize scores for current criteria only
    criteria.forEach((criterion, index) => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      
      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion or similar (first criterion in final round with 30% or less weight)
      const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && criterion.name.toUpperCase().includes('1ST') && criterion.name.toUpperCase().includes('ROUND');
      
      // Also check if this is the first criterion in final round mode with weight <= 35% (likely main criteria average)
      const isFirstCriterionInFinalRound = useFinalRoundPrefix && index === 0 && criterion.weight <= 35;
      
      if ((isFirstRoundAverage || isFirstCriterionInFinalRound) && contestant) {
        // For "AVERAGE OF THE 1ST ROUND" or first criterion in final round, calculate from main criteria total
        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const finalKey = useFinalRoundPrefix ? `final_${originalKey}` : originalKey;
        
        // Check if we already have a saved value for this criterion
        const savedValue = contestant[finalKey] || contestant[originalKey];
        if (savedValue !== undefined && savedValue > 0) {
          scores[key] = savedValue;
        } else {
          // Calculate from main criteria total
          scores[key] = calculateFirstRoundAverage(contestant);
        }
        console.log(`📊 Auto-populated first round average criterion: ${criterion.name}, value: ${scores[key]}`);
      } else if (useFinalRoundPrefix) {
        // When using final round criteria, check for existing final round scores first
        const finalRoundKey = getCriteriaKey(criterion.name, true);
        scores[key] = contestant ? (contestant[finalRoundKey] || 0) : 0;
      } else {
        // Prioritize current contestant scores values over saved scores to preserve editing state
        if (contestant && contestantScores[contestant.id]?.[key] !== undefined) {
          scores[key] = contestantScores[contestant.id][key];
        } else {
          // Otherwise use existing score or default to 0
          let score = contestant ? (contestant[key] || 0) : 0;
          
          // Convert old points format to new percentage format if needed
          if (currentEvent?.gradingType === 'points' && score > 100) {
            score = (score / criterion.weight) * 100;
          }
          
          scores[key] = score;
        }
      }
    });
    
    return scores;
  };

  // Get current event criteria
  // Optional parameter to override the final round state check (for use before state is updated)
  const getCurrentEventCriteria = (forceFinalRound = null) => {
    if (!currentEvent) {
      console.log('🔍 No current event found');
      return [];
    }
    
    // Determine if we should use final round criteria
    // If forceFinalRound is not null, use it; otherwise use the state
    const shouldUseFinalRound = forceFinalRound !== null ? forceFinalRound : usingFinalRoundCriteria;
    
    console.log('🔍 Current event:', currentEvent);
    console.log('🔍 Event criteriaCategories:', currentEvent.criteriaCategories);
    console.log('🔍 Event legacy criteria:', currentEvent.criteria);
    console.log('🔍 Using final round criteria:', shouldUseFinalRound);
    
    // IMPORTANT: When using final round criteria, use currentEvent.criteria directly
    // because it was set to finalRound.criteria when the Final button was clicked
    if (shouldUseFinalRound && currentEvent.criteria && currentEvent.criteria.length > 0) {
      console.log('🔍 Using final round criteria from currentEvent.criteria');
      // Ensure final round criteria have proper structure
      const finalCriteria = currentEvent.criteria.filter(c => c.enabled !== false && c.name && c.name.trim() !== '').map(c => ({
        name: c.name,
        weight: c.weight || 0,
        enabled: c.enabled !== false,
        category: c.category || null,
        scoringType: c.scoringType || 'percentage',
        enableSubmitButton: c.enableSubmitButton !== false // Default to true if not specified
      }));
      console.log('🔍 Final round criteria:', finalCriteria);
      return finalCriteria;
    }
    
    // Use criteriaCategories if it exists (new structure)
    // If criteriaCategories field exists (even if empty), do NOT fall back to legacy criteria
    // This ensures admin must configure criteria via Manage Criteria for new events
    let criteria = [];
    
    // Check if criteriaCategories field exists (not just if it has items)
    const hasCriteriaCategoriesField = currentEvent.hasOwnProperty('criteriaCategories') || currentEvent.criteriaCategories !== undefined;
    
    if (hasCriteriaCategoriesField) {
      // New structure: extract sub-criteria from categories, or use categories as criteria if no sub-criteria
      if (currentEvent.criteriaCategories && currentEvent.criteriaCategories.length > 0) {
        console.log('🔍 Processing', currentEvent.criteriaCategories.length, 'categories');
        
        currentEvent.criteriaCategories.forEach((category, catIndex) => {
          // Skip categories without a valid name
          if (!category.name || category.name.trim() === '') {
            console.log(`🔍 Skipping category ${catIndex + 1} - no valid name`);
            return;
          }
          
          console.log(`🔍 Category ${catIndex + 1}:`, category.name);
          console.log('  - Has sub-criteria:', !!(category.subCriteria && category.subCriteria.length > 0));
          console.log('  - Sub-criteria count:', category.subCriteria ? category.subCriteria.length : 0);
          console.log('  - Total weight:', category.totalWeight);
          console.log('  - Enabled:', category.enabled);
          
          if (category.subCriteria && category.subCriteria.length > 0) {
            // Use sub-criteria if they exist
            console.log('  - Using sub-criteria');
            category.subCriteria.forEach((subCriterion, subIndex) => {
              // Skip sub-criteria without a valid name
              if (!subCriterion.name || subCriterion.name.trim() === '') {
                console.log(`    - Skipping sub-criteria ${subIndex + 1} - no valid name`);
                return;
              }
              
              console.log(`    - Sub-criteria ${subIndex + 1}:`, subCriterion.name, 'enabled:', subCriterion.enabled);
              if (subCriterion.enabled !== false) {
                criteria.push({
                  name: subCriterion.name,
                  weight: subCriterion.weight,
                  enabled: subCriterion.enabled !== false,
                  category: category.name,
                  scoringType: category.scoringType || 'percentage',
                  enableSubmitButton: subCriterion.enableSubmitButton !== false // Include enableSubmitButton field
                });
                console.log(`      ✓ Added sub-criteria: ${subCriterion.name} from category ${category.name}`);
              }
            });
          } else {
            // Use the category itself as a criterion if no sub-criteria exist
            console.log('  - Using category as direct criterion');
            if (category.enabled !== false && category.totalWeight > 0) {
              criteria.push({
                name: category.name,
                weight: category.totalWeight || 0,
                enabled: category.enabled !== false,
                category: null, // No parent category for the category itself
                scoringType: category.scoringType || 'percentage',
                enableSubmitButton: category.enableSubmitButton !== false // Default to true if not specified
              });
              console.log(`      ✓ Added category as criterion: ${category.name} with weight ${category.totalWeight}`);
            }
          }
        });
        console.log('🔍 Using criteriaCategories - extracted criteria:', criteria);
      } else {
        console.log('🔍 criteriaCategories field exists but is empty - admin needs to configure criteria');
      }
    } else if (currentEvent.criteria && currentEvent.criteria.length > 0) {
      // Legacy structure: use main event criteria (only for old events without criteriaCategories)
      console.log('🔍 Using legacy criteria structure (old event without criteriaCategories)');
      // Only include criteria that have a valid name and are enabled
      criteria = currentEvent.criteria.filter(c => c.enabled && c.name && c.name.trim() !== '').map(c => ({
        ...c,
        enableSubmitButton: c.enableSubmitButton !== false // Default to true if not specified
      }));
      console.log('🔍 Using legacy criteria - filtered enabled criteria:', criteria);
    } else {
      console.log('🔍 No criteria found in event');
    }
    
    console.log('🔍 Final criteria to use:', criteria);
    console.log('🔍 Total criteria count:', criteria.length);
    return criteria;
  };

  // Helper function to get the final round from current event
  const getFinalRound = () => {
    if (!currentEvent || !currentEvent.rounds || currentEvent.rounds.length === 0) return null;
    const enabledRounds = currentEvent.rounds.filter(round => round.enabled);
    return enabledRounds.length > 0 ? enabledRounds[enabledRounds.length - 1] : null;
  };

  // Helper function to check if a criterion should be locked (auto-calculated from first round)
  // This includes "AVERAGE OF THE 1ST ROUND" or first criterion in final round with weight <= 35%
  const isFirstRoundAverageCriterion = (criterion, globalIndex) => {
    // Check by name (explicit "AVERAGE OF THE 1ST ROUND")
    const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                        criterion.name.toUpperCase().includes('1ST') && 
                        criterion.name.toUpperCase().includes('ROUND');
    
    // Check by position (first criterion in final round with weight <= 35%)
    const isPositionBased = usingFinalRoundCriteria && globalIndex === 0 && criterion.weight <= 35;
    
    return isNameBased || isPositionBased;
  };

  // Group criteria by category for display
  const getGroupedCriteria = () => {
    const criteria = getCurrentEventCriteria();
    
    // Check if any criteria have a category (sub-criteria exist)
    const hasSubCriteria = criteria.some(c => c.category !== null && c.category !== undefined);
    
    if (!hasSubCriteria) {
      // No sub-criteria, return as single group (flat display)
      return [{ categoryName: null, criteria: criteria, isFlat: true }];
    }
    
    // Group criteria by category, maintaining order
    const groups = [];
    const categoryOrder = [];
    
    criteria.forEach(criterion => {
      const categoryName = criterion.category || 'General';
      
      if (!categoryOrder.includes(categoryName)) {
        categoryOrder.push(categoryName);
        groups.push({ categoryName, criteria: [], isFlat: false });
      }
      
      const groupIndex = categoryOrder.indexOf(categoryName);
      groups[groupIndex].criteria.push(criterion);
    });
    
    return groups;
  };

  // Get criteria separated for three-table layout (Category 1, Category 2, Combined)
  const getThreeTableCriteria = () => {
    const criteria = getCurrentEventCriteria();
    
    // Check if any criteria have a category (sub-criteria exist)
    const hasSubCriteria = criteria.some(c => c.category !== null && c.category !== undefined);
    
    if (!hasSubCriteria) {
      // No sub-criteria, return single table structure
      return {
        showSingleTable: true,
        category1: [],
        category2: [],
        combined: criteria
      };
    }
    
    // Group criteria by category
    const categoryGroups = {};
    criteria.forEach(criterion => {
      const categoryName = criterion.category || 'General';
      if (!categoryGroups[categoryName]) {
        categoryGroups[categoryName] = [];
      }
      categoryGroups[categoryName].push(criterion);
    });
    
    const categoryNames = Object.keys(categoryGroups);
    
    // If we have exactly 2 categories, create three tables
    if (categoryNames.length === 2) {
      return {
        showSingleTable: false,
        category1: categoryGroups[categoryNames[0]] || [],
        category2: categoryGroups[categoryNames[1]] || [],
        combined: criteria,
        category1Name: categoryNames[0],
        category2Name: categoryNames[1]
      };
    }
    
    // Fallback to single table for other cases
    return {
      showSingleTable: true,
      category1: [],
      category2: [],
      combined: criteria
    };
  };

  // Helper function to get the highest score for a specific criterion
  const getHighestScore = (criterion, index) => {
    if (!contestants || contestants.length === 0) return 0;
    
    // Check if this is a first round average criterion
    const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, index);
    
    const scores = contestants.map(contestant => {
      if (isFirstRoundAverage) {
        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const finalKey = `final_${originalKey}`;
        return (usingFinalRoundCriteria && contestant[finalKey] !== undefined) 
          ? contestant[finalKey] 
          : (contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant));
      } else {
        const key = getCriteriaKey(criterion.name, usingFinalRoundCriteria);
        return contestant[key] || 0;
      }
    });
    
    return Math.max(...scores);
  };

  // Helper function to render a single scoring table
  const renderScoringTable = (tableCriteria, tableName, showCategoryHeaders = true) => {
    if (!tableCriteria || tableCriteria.length === 0) return null;
    
    return (
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="text-xl">📊</span>
          {tableName}
        </h3>
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] sm:min-w-[700px] md:min-w-[800px]">
              <thead className="bg-gradient-to-r from-slate-50 via-slate-100 to-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-10 sm:w-12 md:w-16">Rank</th>
                  <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-10 sm:w-12 md:w-16">No.</th>
                  <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider min-w-[80px] sm:min-w-[100px] md:min-w-[120px]">Name</th>
                  {tableCriteria.map((criterion, index) => (
                    <th key={index} className="px-1.5 sm:px-2 md:px-4 py-2 sm:py-3 md:py-4 text-center text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">
                      <div className="hidden md:block">
                        <div className="font-bold truncate max-w-[100px]">{criterion.name}</div>
                        {showCategoryHeaders && criterion.category && (
                          <div className="text-[10px] text-black mt-0.5">{criterion.category}</div>
                        )}
                        <div className="text-[10px] text-black mt-0.5">
                          ({criterion.scoringType === 'points' || currentEvent?.gradingType === 'points' ? `${criterion.weight}pt` : `${criterion.weight}%`})
                        </div>
                      </div>
                      <div className="md:hidden text-[9px] sm:text-[10px]">
                        {criterion.name.length > 6 ? criterion.name.substring(0, 6) + '..' : criterion.name}
                        <div className="text-[9px] text-black">
                          ({criterion.weight})
                        </div>
                      </div>
                    </th>
                  ))}
                  <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-center text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-14 sm:w-18 md:w-24">Total</th>
                  <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-16 sm:w-20 md:w-24">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredContestants.map((contestant) => {
                  // Check if contestant has any scores for this table's criteria
                  const hasScores = tableCriteria.some((criterion, index) => {
                    const key = getCriteriaKey(criterion.name, usingFinalRoundCriteria);
                    
                    // Check if this is a first round average criterion
                    const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, index);
                    
                    if (isFirstRoundAverage) {
                      const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                      const finalKey = `final_${originalKey}`;
                      // Check both keys
                      return (contestant[finalKey] !== undefined && contestant[finalKey] > 0) ||
                             (contestant[originalKey] !== undefined && contestant[originalKey] > 0);
                    } else {
                      return contestant[key] !== undefined && contestant[key] > 0;
                    }
                  });
                  
                  // Also check if contestant is in scored sets (for current session tracking)
                  const isInScoredSet = contestant.id && (
                    usingFinalRoundCriteria ? 
                    scoredContestantsFinal.has(contestant.id) : 
                    scoredContestants.has(contestant.id)
                  );
                  
                  // Consider contestant scored if they have scores OR are in scored sets
                  const isScored = hasScores || isInScoredSet;
                  
                  // Calculate total for this table's criteria only
                  const tableTotal = (() => {
                    let total = 0;
                    const isPointsGrading = currentEvent?.gradingType === 'points';
                    
                    tableCriteria.forEach((criterion, index) => {
                      const key = getCriteriaKey(criterion.name, usingFinalRoundCriteria);
                      
                      // Check if this is a first round average criterion
                      const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, index);
                      
                      let score;
                      if (isFirstRoundAverage) {
                        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                        const finalKey = `final_${originalKey}`;
                        score = (usingFinalRoundCriteria && contestant[finalKey] !== undefined) 
                          ? contestant[finalKey] 
                          : (contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant));
                      } else {
                        score = contestant[key] || 0;
                      }
                      
                      if (isPointsGrading) {
                        total += score;
                      } else {
                        total += score * (criterion.weight / 100);
                      }
                    });
                    
                    return parseFloat(total.toFixed(1));
                  })();
                  
                  return (
                    <tr key={`${contestant.id}-${tableName}`} className={`hover:bg-gray-50 transition-colors ${isScored ? 'bg-green-50' : ''} ${contestant.rank === 1 ? 'ring-2 ring-yellow-400 ring-opacity-50' : ''}`}>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3">
                        {contestant.rank ? (
                          <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                            {contestant.rank === 1 && (
                              <span className="text-black text-sm sm:text-lg" title="Current Leader">👑</span>
                            )}
                            <span className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-full text-[10px] sm:text-xs md:text-sm font-bold ${getRankColor(contestant.rank)}`}>
                              {contestant.rank}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-full text-[10px] sm:text-xs md:text-sm font-medium bg-gray-200 text-black">
                            -
                          </span>
                        )}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-[10px] sm:text-xs md:text-sm font-medium text-black">{contestant.contestantNo}</td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-[10px] sm:text-xs md:text-sm text-black">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <div className="truncate font-medium max-w-[60px] sm:max-w-[100px] md:max-w-none">{contestant.contestantName}</div>
                          <span className="inline-flex items-center text-[9px] sm:text-xs" title={contestant.contestantType === 'group' ? 'Group' : 'Solo'}>
                            {contestant.contestantType === 'group' ? '👥' : '👤'}
                          </span>
                          {getContestantRoundStatus(contestant)?.isFinal && (
                            <span className="hidden sm:inline text-[9px] sm:text-xs" title="Finalist">🏆</span>
                          )}
                        </div>
                      </td>
                      {tableCriteria.map((criterion, index) => {
                        const key = getCriteriaKey(criterion.name, usingFinalRoundCriteria);
                        
                        // Check if this is a first round average criterion
                        const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, index);
                        
                        // Get the score for this criterion
                        let score;
                        if (isFirstRoundAverage) {
                          const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                          const finalKey = `final_${originalKey}`;
                          score = (usingFinalRoundCriteria && contestant[finalKey] !== undefined) 
                            ? contestant[finalKey] 
                            : (contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant));
                        } else {
                          score = contestant[key] || 0;
                        }
                        
                        const colors = ['bg-blue-100 text-black', 'bg-cyan-100 text-cyan-800', 'bg-sky-100 text-sky-800', 'bg-green-100 text-black', 'bg-yellow-100 text-black'];
                        const colorClass = colors[index % colors.length];
                        const hasScore = score > 0;
                        
                        // Check if this is the highest score for this criterion
                        const highestScore = getHighestScore(criterion, index);
                        const isTopScore = hasScore && score === highestScore && highestScore > 0;
                        
                        return (
                          <td key={index} className={`px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-center ${isTopScore ? 'bg-yellow-200' : ''}`}>
                            <div className="relative inline-flex items-center justify-center">
                              <span className={`inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs md:text-sm font-medium ${hasScore ? colorClass : 'bg-gray-100 text-black'} rounded-full ${hasScore ? 'shadow-sm' : ''} ${isTopScore ? 'ring-2 ring-yellow-400 ring-opacity-60' : ''}`}>
                                {formatScoreDisplay(score, 100, false)}
                              </span>
                              {isTopScore && (
                                <span className="absolute -top-1 -right-1 text-[10px] sm:text-xs" title="Top score for this criterion">
                                  🏆
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-center">
                        <span className={`inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs md:text-sm font-bold ${tableTotal > 0 ? 'bg-green-100 text-black' : 'bg-gray-100 text-black'} rounded-full ${tableTotal > 0 ? 'shadow-sm' : ''}`}>
                          {formatScoreDisplay(tableTotal, 100, false)}
                        </span>
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3">
                        <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-xs font-medium rounded-full border ${getStatusColor(contestant.status)}`}>
                          <span className="hidden md:inline">{contestant.status || 'Not Rated'}</span>
                          <span className="md:hidden">{(contestant.status || 'NR').substring(0, 4)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Check if current contestant slide has been submitted
  const isCurrentSlideSubmitted = () => {
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant || !currentContestant.id) return false;
    
    const slideSubmissionKey = `${currentContestant.id}_slide_${usingFinalRoundCriteria ? 'final' : 'main'}`;
    return submittedSlides[slideSubmissionKey] || false;
  };

  // Check if any criterion in current slide has been submitted (blocks entire slide)
  const isAnyCriterionSubmitted = () => {
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant || !currentContestant.id) return false;
    
    const contestantId = currentContestant.id;
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    
    // Check if any criterion for this contestant has been submitted
    return getCurrentEventCriteria().some(criterion => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      return submittedCriteria[`${contestantId}_${key}`] || false;
    });
  };

  // Check if current contestant has been scored
  const isCurrentContestantScored = () => {
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant || !currentContestant.id) return false;
    
    // Check the appropriate scored set based on current scoring mode
    if (usingFinalRoundCriteria) {
      return scoredContestantsFinal.has(currentContestant.id);
    } else {
      return scoredContestants.has(currentContestant.id);
    }
  };

  // Check if any scores exceed their maximum allowed value
  const hasInvalidScores = () => {
    const criteriaToUse = getCurrentEventCriteria();
    const enabledCriteria = criteriaToUse.filter(c => c.enabled);
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    const isPointsGrading = currentEvent?.gradingType === 'points';
    
    if (enabledCriteria.length === 0) return false;
    
    return enabledCriteria.some(criterion => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      const currentContestant = contestants[currentContestantIndex];
      const score = currentContestant ? (contestantScores[currentContestant.id]?.[key] ?? 0) : 0;
      const maxScore = isPointsGrading ? criterion.weight : 100;
      return score > maxScore;
    });
  };

  // Check if event is finished (blocking save)
  const isEventFinished = () => {
    return currentEvent && currentEvent.status === 'finished';
  };

  // Check if current contestant form is locked for current round
  const isCurrentContestantLocked = () => {
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant || !currentContestant.id) return false;
    const lockKey = `${currentContestant.id}_${usingFinalRoundCriteria ? 'final' : 'main'}`;
    return lockedContestants.has(lockKey);
  };

  // Check if a contestant is locked for the current round
  const isContestantLocked = (contestantId) => {
    if (!contestantId) return false;
    const lockKey = `${contestantId}_${usingFinalRoundCriteria ? 'final' : 'main'}`;
    return lockedContestants.has(lockKey);
  };

  // Find the next unlocked contestant index
  const findNextUnlockedContestantIndex = (startIndex) => {
    for (let i = startIndex + 1; i < contestants.length; i++) {
      if (!isContestantLocked(contestants[i].id)) {
        return i;
      }
    }
    return -1; // No unlocked contestants found
  };

  // Find the previous unlocked contestant index
  const findPreviousUnlockedContestantIndex = (startIndex) => {
    for (let i = startIndex - 1; i >= 0; i--) {
      if (!isContestantLocked(contestants[i].id)) {
        return i;
      }
    }
    return -1; // No unlocked contestants found
  };

  // Check if navigation to previous contestant should be disabled
  const isPreviousNavigationDisabled = () => {
    const previousIndex = findPreviousUnlockedContestantIndex(currentContestantIndex);
    return previousIndex === -1;
  };

  // Check if all contestants are locked
  const areAllContestantsLocked = () => {
    return contestants.every(contestant => isContestantLocked(contestant.id));
  };

  // Toggle lock status for current contestant (persisted to Firestore)
  // Locking is now round-specific (main vs final)
  const toggleCurrentContestantLock = async () => {
    // Store current index to prevent any unintended navigation
    const currentIndexBeforeLock = currentContestantIndex;
    
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant || !currentContestant.id) return;
    if (!user) return;
    
    const roundType = usingFinalRoundCriteria ? 'final' : 'main';
    const lockKey = `${currentContestant.id}_${roundType}`;
    const isCurrentlyLocked = lockedContestants.has(lockKey);
    
    if (isCurrentlyLocked) {
      // Unlocking contestant - ask for confirmation
      const confirmUnlock = confirm(`⚠️ Are you sure you want to UNLOCK ${roundType.toUpperCase()} ROUND scores for ${currentContestant.contestantName}?\n\nThis will allow you to modify their ${roundType} round scores again.`);
      
      if (!confirmUnlock) return;
      
      // Unlocking contestant - remove from locked set
      const newSet = new Set(lockedContestants);
      newSet.delete(lockKey);
      
      // Remove saved locked scores
      const newLockedScores = { ...lockedScores };
      delete newLockedScores[lockKey];
      
      setLockedContestants(newSet);
      setLockedScores(newLockedScores);
      
      // Persist to Firestore
      try {
        const judgeRef = doc(db, 'judges', user.uid);
        await updateDoc(judgeRef, {
          lockedContestants: Array.from(newSet),
          lockedScores: newLockedScores
        });
        console.log('🔓 Unlocked contestant (persisted):', currentContestant.contestantName, 'round:', roundType);
      } catch (error) {
        console.error('Error persisting unlock status:', error);
        alert('Failed to save unlock status. Please try again.');
      }
    } else {
      // Locking contestant - add to locked set and save only current contestant's scores
      const newSet = new Set(lockedContestants);
      newSet.add(lockKey);
      
      // Save only scores for the current contestant
      const currentContestant = contestants[currentContestantIndex];
      const currentContestantScores = contestantScores[currentContestant?.id] || {};
      const contestantScoreKeys = Object.keys(currentContestantScores).filter(key => {
        if (usingFinalRoundCriteria) {
          return key.startsWith('final_');
        } else {
          return !key.startsWith('final_');
        }
      });
      const scoresToLock = {};
      contestantScoreKeys.forEach(key => {
        scoresToLock[key] = currentContestantScores[key];
      });
      const newLockedScores = {
        ...lockedScores,
        [lockKey]: scoresToLock
      };
      
      setLockedContestants(newSet);
      setLockedScores(newLockedScores);
      
      // Persist to Firestore
      try {
        const judgeRef = doc(db, 'judges', user.uid);
        await updateDoc(judgeRef, {
          lockedContestants: Array.from(newSet),
          lockedScores: newLockedScores
        });
        console.log('🔒 Locked contestant (persisted):', currentContestant.contestantName, 'round:', roundType);
      } catch (error) {
        console.error('Error persisting lock status:', error);
        alert('Failed to save lock status. Please try again.');
      }
    }
    
    // Ensure current contestant index is preserved (prevent unintended navigation)
    if (currentContestantIndex !== currentIndexBeforeLock) {
      console.log('🔧 Restoring contestant index after lock/unlock:', currentIndexBeforeLock);
      setCurrentContestantIndex(currentIndexBeforeLock);
    }
  };

  // Helper function to get contestant's round status
  const getContestantRoundStatus = (contestant) => {
    // First check if contestant has finalist status from admin
    const isFinalistByStatus = contestant.status === 'finalist' || contestant.status === 'winner';
    
    if (!currentEvent || !currentEvent.rounds || currentEvent.rounds.length === 0) {
      // If no rounds defined, use status field
      return isFinalistByStatus ? { roundName: 'Final', isFinal: true, roundIndex: 0 } : null;
    }
    
    // Check each round to see if contestant has scores
    for (let i = currentEvent.rounds.length - 1; i >= 0; i--) {
      const round = currentEvent.rounds[i];
      if (round.enabled && round.criteria) {
        const hasScores = round.criteria.some(criterion => {
          const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
          const finalKey = `final_${key}`;
          return (contestant[key] !== undefined && contestant[key] > 0) || 
                 (contestant[finalKey] !== undefined && contestant[finalKey] > 0);
        });
        if (hasScores) {
          const finalRound = getFinalRound();
          const isFinal = finalRound && currentEvent.rounds.indexOf(finalRound) === i;
          return { roundName: round.name, isFinal, roundIndex: i };
        }
      }
    }
    
    // If no scores found but contestant has finalist status, they're still a finalist
    if (isFinalistByStatus) {
      return { roundName: 'Final', isFinal: true, roundIndex: -1 };
    }
    
    return null;
  };
  
  // Helper function to check if contestant is a finalist (by status or by having final round scores)
  const isContestantFinalist = (contestant) => {
    // Check status field first (set by admin)
    if (contestant.status === 'finalist' || contestant.status === 'winner') {
      return true;
    }
    
    // Check if contestant has scores in final round
    const roundStatus = getContestantRoundStatus(contestant);
    return roundStatus?.isFinal === true;
  };

  // Helper function to get first round criteria scores for a contestant
  const getFirstRoundScores = (contestant) => {
    if (!currentEvent || !currentEvent.rounds || currentEvent.rounds.length === 0) {
      return {};
    }
    
    // Get the FIRST round (index 0) specifically
    const firstRound = currentEvent.rounds[0];
    if (!firstRound || !firstRound.criteria || !firstRound.enabled) {
      return {};
    }
    
    const scores = {};
    firstRound.criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      scores[key] = contestant[key] || 0;
    });
    
    return scores;
  };

  // Helper function to calculate total weighted score of main/first round scores for final round criteria
  // This is used to populate the "AVERAGE OF THE 1ST ROUND" criterion in final round
  const calculateFirstRoundAverage = (contestant) => {
    // First check if contestant already has a saved main criteria total score
    if (contestant.totalWeightedScore && contestant.totalWeightedScore > 0) {
      console.log('📊 Using contestant totalWeightedScore:', contestant.totalWeightedScore);
      return contestant.totalWeightedScore;
    }
    
    // Check for saved average key
    const averageKey = 'average_of_the_1st_round';
    if (contestant[averageKey] !== undefined && contestant[averageKey] > 0) {
      console.log('📊 Using saved average_of_the_1st_round:', contestant[averageKey]);
      return contestant[averageKey];
    }
    
    // Calculate from main criteria scores (stored without 'final_' prefix)
    // Get the original main criteria from the event
    let mainCriteria = [];
    
    // First try to use originalEventCriteria if we saved it when switching to final round
    if (originalEventCriteria && originalEventCriteria.length > 0) {
      mainCriteria = originalEventCriteria.filter(c => c.enabled !== false && c.name && c.name.trim() !== '');
      console.log('📊 Using originalEventCriteria for main criteria:', mainCriteria);
    } else if (currentEvent) {
      // Try to get from criteriaCategories (new structure)
      if (currentEvent.criteriaCategories && currentEvent.criteriaCategories.length > 0) {
        currentEvent.criteriaCategories.forEach(category => {
          if (!category.name || category.name.trim() === '') return;
          if (category.subCriteria && category.subCriteria.length > 0) {
            category.subCriteria.forEach(sub => {
              if (sub.enabled !== false && sub.name && sub.name.trim() !== '') {
                mainCriteria.push({
                  name: sub.name,
                  weight: sub.weight || 0,
                  enabled: true
                });
              }
            });
          } else if (category.enabled !== false && category.totalWeight > 0) {
            mainCriteria.push({
              name: category.name,
              weight: category.totalWeight || 0,
              enabled: true
            });
          }
        });
        console.log('📊 Extracted main criteria from criteriaCategories:', mainCriteria);
      } else if (currentEvent.rounds && currentEvent.rounds.length > 0) {
        // Get from first round criteria
        const firstRound = currentEvent.rounds[0];
        if (firstRound && firstRound.criteria) {
          mainCriteria = firstRound.criteria.filter(c => c.enabled !== false && c.name && c.name.trim() !== '');
          console.log('📊 Using first round criteria:', mainCriteria);
        }
      }
    }
    
    if (mainCriteria.length === 0) {
      console.log('📊 No main criteria found, returning 0');
      return 0;
    }
    
    // Calculate total weighted score from main criteria scores
    let totalWeightedScore = 0;
    mainCriteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_'); // Main criteria keys don't have 'final_' prefix
      const score = contestant[key] || 0;
      const weight = criterion.weight / 100;
      totalWeightedScore += score * weight;
      console.log(`📊 Main criteria: ${criterion.name}, key: ${key}, score: ${score}, weight: ${criterion.weight}%, weighted: ${score * weight}`);
    });
    
    console.log('📊 Total calculated main/first round average:', totalWeightedScore);
    return parseFloat(totalWeightedScore.toFixed(1));
  };


  const filteredContestants = contestants.filter(contestant => {
    // Apply search filter
    const matchesSearch = contestant.eventName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          contestant.contestantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          contestant.contestantNo?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply elimination filter - exclude eliminated contestants
    const isNotEliminated = !contestant.eliminated && contestant.status !== 'eliminated';
    
    // In final round mode, show ALL non-eliminated contestants so judge can score them
    // Only apply finalist filter when showFinalistsOnly toggle is explicitly enabled (not when just switching to final criteria)
    const passesFinalistFilter = !showFinalistsOnly || isContestantFinalist(contestant);
    
    return matchesSearch && isNotEliminated && passesFinalistFilter;
  });

  const calculateWeightedScore = (contestant, event = null) => {
    // Get criteria based on selected round
    const criteriaToUse = getCurrentEventCriteria();
    const enabledCriteria = criteriaToUse.filter(c => c.enabled);
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    const isPointsGrading = currentEvent?.gradingType === 'points';
    
    if (enabledCriteria.length === 0) return 0;
    
    // Use the same logic as calculateQuickTotal for consistency
    let totalScore = 0;
    
    enabledCriteria.forEach((criterion, index) => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      
      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion (by name or by position)
      const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                             criterion.name.toUpperCase().includes('1ST') && 
                             criterion.name.toUpperCase().includes('ROUND');
      const isPositionBased = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
      const isFirstRoundAverage = isNameBased || isPositionBased;
      
      let score;
      if (isFirstRoundAverage) {
        // For first round average criterion, use saved value if it exists, otherwise calculate
        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
      } else {
        // For other criteria, use stored score with appropriate prefix
        score = contestant[key] || 0;
      }
      
      if (isPointsGrading) {
        // For points grading, directly sum the points (no weight calculation needed)
        totalScore += score;
      } else {
        // For percentage grading, apply weight
        totalScore += score * (criterion.weight / 100);
      }
    });
    
    // Cap total at maximum
    const maxScore = isPointsGrading 
      ? enabledCriteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
      : 100;
    totalScore = Math.min(totalScore, maxScore);
    
    return totalScore.toFixed(1);
  };

  const handleEditContestant = () => {
    const currentContestant = contestants[currentContestantIndex];
    const currentContestantScores = contestantScores[currentContestant?.id] || {};
    const totalScore = calculateWeightedScore({ ...formData, ...currentContestantScores });
    const updatedContestants = contestants.map(contestant => 
      contestant.id === editingContestant.id 
        ? { ...contestant, ...formData, ...currentContestantScores, totalWeightedScore: parseFloat(totalScore) }
        : contestant
    );
    
    const rankedContestants = updateRankings(updatedContestants);
    setContestants(rankedContestants);
    setShowEditModal(false);
    setEditingContestant(null);
    resetForm();
  };

  const updateRankings = (contestantsList) => {
    // Separate contestants with scores from those without scores
    const contestantsWithScores = contestantsList.filter(c => (c.totalWeightedScore || 0) > 0);
    const contestantsWithoutScores = contestantsList.filter(c => (c.totalWeightedScore || 0) === 0);
    
    // Sort only contestants with scores by descending totalWeightedScore
    const sortedWithScores = contestantsWithScores
      .sort((a, b) => (b.totalWeightedScore || 0) - (a.totalWeightedScore || 0));
    
    // Assign ranks with proper tie handling
    const rankedWithScores = sortedWithScores.map((contestant, index) => {
      let rank = index + 1;
      let status = '';
      
      // Handle ties - find all contestants with the same score
      const currentScore = contestant.totalWeightedScore || 0;
      const tiedContestants = sortedWithScores.filter(c => 
        Math.abs((c.totalWeightedScore || 0) - currentScore) < 0.01
      );
      
      if (tiedContestants.length > 1) {
        // For tied contestants, use the lowest rank among them
        const firstTiedIndex = sortedWithScores.findIndex(c => 
          Math.abs((c.totalWeightedScore || 0) - currentScore) < 0.01
        );
        rank = firstTiedIndex + 1;
        
        // Special status for tied contestants
        if (rank === 1) {
          status = '🏆 Tied for 1st';
        } else if (rank === 2) {
          status = '🥈 Tied for 2nd';
        } else if (rank === 3) {
          status = '🥉 Tied for 3rd';
        } else {
          status = `🤝 Tied at ${rank}th`;
        }
      } else {
        // No tie - unique rank
        if (rank === 1) {
          status = '👑 1st Place - Leading';
        } else if (rank === 2) {
          status = '🥈 2nd Place';
        } else if (rank === 3) {
          status = '🥉 3rd Place';
        } else if (rank <= 5) {
          status = `🎯 Top ${rank}`;
        } else if (rank <= 10) {
          status = `📈 ${rank}th Place`;
        } else {
          status = `📍 ${rank}th Place`;
        }
      }
      
      return {
        ...contestant,
        rank: rank,
        status: status
      };
    });
    
    // Contestants without scores get no rank or status
    const withoutRanks = contestantsWithoutScores.map(contestant => ({
      ...contestant,
      rank: null,
      status: '📝 Not Scored'
    }));
    
    // Combine ranked contestants with unranked ones, maintaining original order for unranked
    const rankedContestants = [...rankedWithScores];
    
    // Add unranked contestants back in their original order
    contestantsWithoutScores.forEach(contestant => {
      const originalIndex = contestantsList.findIndex(c => c.id === contestant.id);
      if (originalIndex !== -1) {
        rankedContestants.splice(originalIndex, 0, {
          ...contestant,
          rank: null,
          status: '📝 Not Scored'
        });
      }
    });
    
    console.log('🏆 Rankings updated:', rankedContestants.map(c => ({
      name: c.contestantName,
      score: c.totalWeightedScore,
      rank: c.rank,
      status: c.status
    })));
    
    return rankedContestants;
  };

  const openEditModal = (contestant) => {
    setEditingContestant(contestant);
    const criteria = getCurrentEventCriteria();
    const editFormData = {};
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    
    // Add criteria scores to form data
    criteria.forEach(criterion => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
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
      case 1: return 'bg-yellow-500 text-black';
      case 2: return 'bg-gray-400 text-black';
      case 3: return 'bg-orange-500 text-black';
      default: return 'bg-gray-200 text-black';
    }
  };

  const getStatusColor = (status) => {
    if (!status) return 'bg-blue-100 text-black border-blue-300';
    
    // Special statuses
    if (status.includes('📝 Not Scored')) return 'bg-gray-100 text-black border-gray-300';
    if (status.includes('👑 1st Place - Leading')) return 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-500 text-black border-yellow-400 shadow-xl ring-2 ring-yellow-300 animate-pulse';
    if (status.includes('🏆 1st Place')) return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-black border-yellow-400 shadow-lg';
    if (status.includes('🥈 2nd Place')) return 'bg-gradient-to-r from-gray-300 to-gray-400 text-black border-gray-400 shadow-lg';
    if (status.includes('🥉 3rd Place')) return 'bg-gradient-to-r from-orange-300 to-orange-400 text-black border-orange-400 shadow-lg';
    
    // Tied statuses
    if (status.includes('Tied for 1st')) return 'bg-gradient-to-r from-yellow-200 to-yellow-300 text-black border-yellow-300';
    if (status.includes('Tied for 2nd')) return 'bg-gradient-to-r from-gray-200 to-gray-300 text-black border-gray-300';
    if (status.includes('Tied for 3rd')) return 'bg-gradient-to-r from-orange-200 to-orange-300 text-black border-orange-300';
    if (status.includes('Tied at')) return 'bg-gradient-to-r from-blue-200 to-blue-300 text-black border-blue-300';
    
    // Top performers
    if (status.includes('🎯 Top')) return 'bg-gradient-to-r from-green-100 to-green-200 text-black border-green-300';
    if (status.includes('📈') && status.includes('Place')) return 'bg-gradient-to-r from-blue-100 to-blue-200 text-black border-blue-300';
    if (status.includes('📍') && status.includes('Place')) return 'bg-gradient-to-r from-indigo-100 to-indigo-200 text-black border-indigo-300';
    
    // Legacy support for old status formats
    if (status.includes('🏆')) return 'bg-yellow-100 text-black border-yellow-300';
    if (status.includes('Top 2')) return 'bg-gray-100 text-black border-gray-300';
    if (status.includes('Top 3')) return 'bg-orange-100 text-black border-orange-300';
    
    return 'bg-blue-100 text-black border-blue-300';
  };

  // Navigation functions
  const goToPreviousContestant = () => {
    // Find the previous unlocked contestant
    const previousUnlockedIndex = findPreviousUnlockedContestantIndex(currentContestantIndex);
    
    if (previousUnlockedIndex === -1) {
      // No previous unlocked contestants available
      console.log('🚫 No previous unlocked contestants available');
      return;
    }
    
    // Store current contestant's score before navigating
    const currentContestantData = contestants[currentContestantIndex];
    if (currentContestantData) {
      setPreviousContestantInfo({
        name: currentContestantData.contestantName,
        number: currentContestantData.contestantNo,
        totalScore: currentContestantData.totalWeightedScore || getDisplayTotalScore()
      });
      setShowPreviousScore(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowPreviousScore(false), 3000);
    }
    
    const contestant = contestants[previousUnlockedIndex];
    setCurrentContestantIndex(previousUnlockedIndex);
    setCurrentContestant({
      number: contestant.contestantNo,
      name: contestant.contestantName,
      category: contestant.category || 'Vocal Performance',
      performanceOrder: contestant.performanceOrder || previousUnlockedIndex + 1,
      photo: null,
      contestantType: contestant.contestantType || 'solo'
    });
    // Update contestant scores to match the previous contestant's saved scores
    const newContestantScores = initializeQuickScores(currentEvent, contestant);
    setContestantScores(prev => ({
      ...prev,
      [contestant.id]: newContestantScores
    }));
  };

  const goToNextContestant = () => {
    if (currentContestantIndex < contestants.length - 1) {
      // Store current contestant's score before navigating
      const currentContestantData = contestants[currentContestantIndex];
      if (currentContestantData) {
        setPreviousContestantInfo({
          name: currentContestantData.contestantName,
          number: currentContestantData.contestantNo,
          totalScore: currentContestantData.totalWeightedScore || getDisplayTotalScore()
        });
        setShowPreviousScore(true);
        // Auto-hide after 3 seconds
        setTimeout(() => setShowPreviousScore(false), 3000);
      }
      
      const newIndex = currentContestantIndex + 1;
      const contestant = contestants[newIndex];
      setCurrentContestantIndex(newIndex);
      setCurrentContestant({
        number: contestant.contestantNo,
        name: contestant.contestantName,
        category: contestant.category || 'Vocal Performance',
        performanceOrder: contestant.performanceOrder || newIndex + 1,
        photo: null,
        contestantType: contestant.contestantType || 'solo'
      });
      // Update contestant scores to match the next contestant's saved scores
      const newContestantScores = initializeQuickScores(currentEvent, contestant);
      setContestantScores(prev => ({
        ...prev,
        [contestant.id]: newContestantScores
      }));
      // Force selector re-render
      setSelectorKey(prev => prev + 1);
    }
  };

  const selectContestantByIndex = (index) => {
    if (index >= 0 && index < contestants.length) {
      // Store current contestant's score before navigating
      const currentContestantData = contestants[currentContestantIndex];
      if (currentContestantData && index !== currentContestantIndex) {
        setPreviousContestantInfo({
          name: currentContestantData.contestantName,
          number: currentContestantData.contestantNo,
          totalScore: currentContestantData.totalWeightedScore || getDisplayTotalScore()
        });
        setShowPreviousScore(true);
        // Auto-hide after 3 seconds
        setTimeout(() => setShowPreviousScore(false), 3000);
      }
      
      // Determine slide direction
      if (index > currentContestantIndex) {
        setSlideDirection('left'); // Next contestant - slide left
      } else if (index < currentContestantIndex) {
        setSlideDirection('right'); // Previous contestant - slide right
      }
      
      // Start animation
      setIsAnimating(true);
      
      // After animation, update content
      setTimeout(() => {
        const contestant = contestants[index];
        setCurrentContestantIndex(index);
        setCurrentContestant({
          number: contestant.contestantNo,
          name: contestant.contestantName,
          category: contestant.category || 'Vocal Performance',
          performanceOrder: contestant.performanceOrder || index + 1,
          photo: null,
          contestantType: contestant.contestantType || 'solo'
        });
        // Update contestant scores to match current contestant scores based on event criteria
        const newContestantScores = initializeQuickScores(currentEvent, contestant);
        setContestantScores(prev => ({
          ...prev,
          [contestant.id]: newContestantScores
        }));
        // Load submitted criteria state
        loadSubmittedCriteria(contestant);
        // Force selector re-render
        setSelectorKey(prev => prev + 1);
        
        // Scroll to the selected contestant card for better UX
        setTimeout(() => {
          const contestantCards = document.querySelectorAll('[data-contestant-card]');
          const selectedCard = contestantCards[index];
          if (selectedCard) {
            selectedCard.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }
        }, 100);
        
        // End animation
        setIsAnimating(false);
      }, 300); // Match animation duration
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
  const handleQuickScoreChange = (contestantId, criteria, value) => {
    const numValue = parseFloat(value) || 0;
    
    // Find the criterion to get its weight for points-based grading
    const criterionName = criteria.replace('final_', ''); // Remove final prefix if present
    const criterion = getCurrentEventCriteria().find(c => 
      c.name.toLowerCase().replace(/\s+/g, '_') === criterionName
    );
    
    let finalValue = numValue;
    
    // Enforce limits based on grading type
    if (currentEvent?.gradingType === 'points' && criterion) {
      // For points-based grading, limit to criterion weight
      finalValue = Math.min(numValue, criterion.weight);
    } else if (currentEvent?.gradingType !== 'points') {
      // For percentage-based grading, limit to 100
      finalValue = Math.min(numValue, 100);
    }
    
    setContestantScores(prev => ({
      ...prev,
      [contestantId]: {
        ...prev[contestantId],
        [criteria]: finalValue
      }
    }));
  };

  const calculateQuickTotal = () => {
    const criteria = getCurrentEventCriteria();
    if (criteria.length === 0) return '0.0';
    
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    let totalScore = 0;
    const isPointsGrading = currentEvent?.gradingType === 'points';
    
    criteria.forEach((criterion, index) => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      
      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion (by name or by position)
      const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                             criterion.name.toUpperCase().includes('1ST') && 
                             criterion.name.toUpperCase().includes('ROUND');
      const isPositionBased = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
      const isFirstRoundAverage = isNameBased || isPositionBased;
      
      let score;
      if (isFirstRoundAverage && contestants[currentContestantIndex]) {
        // For first round average criterion, use the saved value if it exists, otherwise calculate
        const contestant = contestants[currentContestantIndex];
        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
      } else {
        // For other criteria, use contestant-specific scores
        score = contestantScores[contestants[currentContestantIndex]?.id]?.[key] ?? 0;
      }
      
      if (isPointsGrading) {
        // For points grading, directly sum the points (no weight calculation needed)
        totalScore += score;
      } else {
        // For percentage grading, apply weight
        totalScore += score * (criterion.weight / 100);
      }
    });
    
    // Cap total at maximum
    const maxScore = isPointsGrading 
      ? criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
      : 100;
    totalScore = Math.min(totalScore, maxScore);
    
    return totalScore.toFixed(1);
  };

  // Helper function to get the appropriate total score for display
  const getDisplayTotalScore = () => {
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant) return '0.0';
    
    // If contestant is scored (form is disabled), use saved totalWeightedScore
    if (isCurrentContestantScored() && currentContestant.totalWeightedScore) {
      return currentContestant.totalWeightedScore.toString();
    }
    
    // Otherwise, use the real-time calculation from contestant scores
    return calculateQuickTotal();
  };

  // Helper function to format scores for display
  const formatScoreDisplay = (score, maxScore, isPointsGrading) => {
    if (isPointsGrading) {
      // For points-based grading, show whole numbers without decimal when possible
      const formattedScore = Number.isInteger(score) ? score.toString() : score.toFixed(1);
      const formattedMaxScore = Number.isInteger(maxScore) ? maxScore.toString() : maxScore.toFixed(1);
      return `${formattedScore} / ${formattedMaxScore}`;
    } else {
      // For percentage-based grading, always show one decimal place
      return `${score.toFixed(1)}%`;
    }
  };

  const getFormattedTotalScore = (contestant, criteria, isPointsGrading, useFinalRoundPrefix = usingFinalRoundCriteria, scoresOverride = null) => {
    let totalScore = 0;
    
    criteria.forEach((criterion, index) => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      
      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion (by name or by position)
      const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                             criterion.name.toUpperCase().includes('1ST') && 
                             criterion.name.toUpperCase().includes('ROUND');
      const isPositionBased = useFinalRoundPrefix && index === 0 && criterion.weight <= 35;
      const isFirstRoundAverage = isNameBased || isPositionBased;
      
      let score;
      if (isFirstRoundAverage) {
        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
      } else {
        score = scoresOverride ? scoresOverride[key] || 0 : contestant[key] || 0;
      }
      
      if (isPointsGrading) {
        totalScore += score;
      } else {
        const weight = criterion.weight / 100;
        totalScore += score * weight;
      }
    });
    
    const maxScore = isPointsGrading 
      ? criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
      : 100;
    totalScore = Math.min(totalScore, maxScore);
    
    return formatScoreDisplay(totalScore, maxScore, isPointsGrading);
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
        const isPointsGrading = currentEvent?.gradingType === 'points';
        let totalScore = 0;
        criteria.forEach((criterion, index) => {
          const useFinalRoundPrefix = usingFinalRoundCriteria;
          const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
          
          // Check if this is "AVERAGE OF THE 1ST ROUND" criterion (by name or by position)
          const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                                 criterion.name.toUpperCase().includes('1ST') && 
                                 criterion.name.toUpperCase().includes('ROUND');
          const isPositionBased = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
          const isFirstRoundAverage = isNameBased || isPositionBased;
          
          let score;
          if (isFirstRoundAverage) {
            // For first round average criterion, use saved value if it exists, otherwise calculate
            const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
            score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
          } else {
            // For other criteria, use stored score with appropriate prefix
            score = contestant[key] || 0;
          }
          
          if (isPointsGrading) {
            // For points grading, directly sum the points (no weight calculation needed)
            totalScore += score;
          } else {
            // For percentage grading, apply weight
            const weight = criterion.weight / 100;
            totalScore += score * weight;
          }
        });
        
        return {
          ...contestant,
          photo: undefined, // Exclude photo to prevent exceeding Firebase size limit
          totalWeightedScore: parseFloat(totalScore.toFixed(1))
        };
      });
      
      // Save all judge's individual scores to the scores collection for aggregation
      const batch = writeBatch(db);
      contestantsWithScores.forEach(contestant => {
        if (contestant.id) {
          // Calculate weighted total for this specific contestant
          const criteria = getCurrentEventCriteria();
          const isPointsGrading = currentEvent?.gradingType === 'points';
          let totalScore = 0;
          criteria.forEach((criterion, index) => {
            const useFinalRoundPrefix = usingFinalRoundCriteria;
            const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
            
            // Check if this is "AVERAGE OF THE 1ST ROUND" criterion (by name or by position)
            const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                                   criterion.name.toUpperCase().includes('1ST') && 
                                   criterion.name.toUpperCase().includes('ROUND');
            const isPositionBased = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
            const isFirstRoundAverage = isNameBased || isPositionBased;
            
            let score;
            if (isFirstRoundAverage) {
              // For first round average criterion, use saved value if it exists, otherwise calculate
              const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
              score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
            } else {
              // For other criteria, use stored score with appropriate prefix
              score = contestant[key] || 0;
            }
            
            if (isPointsGrading) {
              // For points grading, directly sum the points (no weight calculation needed)
              totalScore += score;
            } else {
              // For percentage grading, apply weight
              const weight = criterion.weight / 100;
              totalScore += score * weight;
            }
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
            isFinalRound: usingFinalRoundCriteria, // Flag to identify which round this score belongs to
            timestamp: new Date().toISOString()
          };
          
          // Add individual criteria scores to the score data
          criteria.forEach((criterion, index) => {
            const useFinalRoundPrefix = usingFinalRoundCriteria;
            const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
            
            // Check if this is "AVERAGE OF THE 1ST ROUND" criterion (by name or by position)
            const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                                   criterion.name.toUpperCase().includes('1ST') && 
                                   criterion.name.toUpperCase().includes('ROUND');
            const isPositionBased = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
            const isFirstRoundAverage = isNameBased || isPositionBased;
            
            let score;
            if (isFirstRoundAverage) {
              // For first round average criterion, use saved value if it exists, otherwise calculate
              const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
              score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
            } else {
              // For other criteria, use stored score with appropriate prefix
              score = contestant[key] || 0;
            }
            
            scoreData.scores[key] = score;
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
    console.log('🔍 Save Scores Debug - Starting...');
    console.log('🔍 Current Contestant Index:', currentContestantIndex);
    console.log('🔍 Contestants Length:', contestants.length);
    console.log('🔍 User:', user ? 'Logged in' : 'Not logged in');
    console.log('🔍 Current Event:', currentEvent ? 'Loaded' : 'Not loaded');
    
    if (contestants[currentContestantIndex] && user && currentEvent) {
      // Add confirmation warning
      const contestant = contestants[currentContestantIndex];
      const confirmMessage = `Are you sure you want to save scores for ${contestant.contestantName}?\n\n⚠️ WARNING: Once saved, you will NOT be able to modify these scores again for this contestant.\n\nThis action cannot be undone.`;
      
      if (!confirm(confirmMessage)) {
        return;
      }
      
      try {
        // Check if scores are locked
        if (currentEvent && currentEvent.scoresLocked) {
          console.log('🔒 Scores are locked');
          alert('Scoring is locked for this event. Please contact the administrator.');
          return;
        }
        
        // Check if event is upcoming
        if (currentEvent && currentEvent.status === 'upcoming') {
          console.log('📅 Event is upcoming');
          alert('Scoring is not available for upcoming events. Please wait until the event is ongoing.');
          return;
        }
        
        const contestant = contestants[currentContestantIndex];
        const totalScore = parseFloat(calculateQuickTotal());
        
        console.log('📊 Contestant:', contestant.contestantName);
        console.log('📊 Total Score:', totalScore);
        console.log('📊 Contestant Scores:', contestantScores[contestant.id]);
        
        // Save score to Firestore scores collection
        // Create scores object - ONLY include relevant criteria for current round
        const currentCriteria = getCurrentEventCriteria();
        let scoresToSave = {};
        const currentContestantScores = contestantScores[contestant.id] || {};
        
        // When in final round mode, ONLY save final_ prefixed keys to protect main criteria scores
        if (usingFinalRoundCriteria) {
          // Filter contestantScores to only include final_ prefixed keys
          Object.entries(currentContestantScores).forEach(([key, value]) => {
            if (key.startsWith('final_')) {
              scoresToSave[key] = value;
            }
          });
          
          // Ensure all final round criteria are included with proper keys
          currentCriteria.forEach((criterion, index) => {
            const finalKey = getCriteriaKey(criterion.name, true);
            if (scoresToSave[finalKey] === undefined) {
              // Check if this is the first round average criterion
              const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                criterion.name.toUpperCase().includes('1ST') && 
                criterion.name.toUpperCase().includes('ROUND');
              const isPositionBased = index === 0 && criterion.weight <= 35;
              
              if (isNameBased || isPositionBased) {
                scoresToSave[finalKey] = calculateFirstRoundAverage(contestant);
              } else {
                scoresToSave[finalKey] = 0;
              }
            }
          });
          
          console.log('📊 Final round - only saving final_ prefixed scores:', scoresToSave);
        } else {
          // For main criteria, save all contestant scores (no prefix filtering needed)
          scoresToSave = { ...currentContestantScores };
        }
        
        // Check if we have "AVERAGE OF THE 1ST ROUND" criterion or first criterion in final round with <=35% weight
        const averageCriterion = currentCriteria.find((criterion, index) => {
          const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
            criterion.name.toUpperCase().includes('1ST') && 
            criterion.name.toUpperCase().includes('ROUND');
          const isFirstCriterionInFinalRound = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
          return isFirstRoundAverage || isFirstCriterionInFinalRound;
        });
        
        if (averageCriterion && usingFinalRoundCriteria) {
          // In final round, ensure the first criterion has the calculated main criteria average
          const averageKey = getCriteriaKey(averageCriterion.name, usingFinalRoundCriteria);
          const calculatedAverage = calculateFirstRoundAverage(contestant);
          // Use the calculated value or the current contestant scores value (whichever is valid)
          scoresToSave[averageKey] = scoresToSave[averageKey] || calculatedAverage;
          console.log(`📊 Saving first round average: ${averageKey} = ${scoresToSave[averageKey]}`);
        }
        
        const scoreData = {
          contestantId: contestant.id,
          contestantName: contestant.contestantName,
          contestantNo: contestant.contestantNo,
          eventId: contestant.eventId,
          eventName: contestant.eventName || currentEvent?.name || 'Unknown Event',
          judgeId: user.uid,
          judgeName: user.displayName || user.email,
          judgeEmail: user.email,
          scores: scoresToSave,
          criteria: getCurrentEventCriteria(),
          totalScore: totalScore,
          isFinalRound: usingFinalRoundCriteria, // Flag to identify which round this score belongs to
          timestamp: new Date().toISOString()
        };
        
        console.log('💾 Saving score data:', scoreData);
        
        // Generate unique document ID
        const documentId = `${user.uid}_${contestant.id}_${Date.now()}`;
        console.log('📝 Document ID:', documentId);
        
        // Save to scores collection
        await setDoc(doc(db, 'scores', documentId), scoreData);
        console.log('✅ Score saved successfully to Firestore!');
        
        // Don't update contestant document directly to maintain score privacy between judges
        // Only update local state for the current judge's view
        
        // Update local state - update current contestant with their new scores
        const updatedContestants = contestants.map((c, index) => {
          if (index === currentContestantIndex) {
            // Handle scoring for current contestant
            let updatedContestant;
            
            // Create updated scores object
            const updatedScores = { ...currentContestantScores };
            
            // Check if we have "AVERAGE OF THE 1ST ROUND" criterion or first criterion in final round
            const currentCriteria = getCurrentEventCriteria();
            const averageCriterion = currentCriteria.find((criterion, idx) => {
              const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                criterion.name.toUpperCase().includes('1ST') && 
                criterion.name.toUpperCase().includes('ROUND');
              const isFirstCriterionInFinalRound = usingFinalRoundCriteria && idx === 0 && criterion.weight <= 35;
              return isFirstRoundAverage || isFirstCriterionInFinalRound;
            });
            
            if (averageCriterion && usingFinalRoundCriteria) {
              const averageKey = getCriteriaKey(averageCriterion.name, usingFinalRoundCriteria);
              // Use the value from contestant scores or calculate it
              updatedScores[averageKey] = currentContestantScores[averageKey] || calculateFirstRoundAverage(contestant);
            }
            
            // When using final round criteria, only update final round criteria scores
            // Preserve main criteria scores by not overwriting them
            if (usingFinalRoundCriteria) {
              // IMPORTANT: Only update final_ prefixed keys to protect main criteria scores
              const finalRoundScoresOnly = {};
              Object.entries(updatedScores).forEach(([key, value]) => {
                if (key.startsWith('final_')) {
                  finalRoundScoresOnly[key] = value;
                }
              });
              
              // Also ensure all final round criteria have the final_ prefix
              currentCriteria.forEach((criterion, idx) => {
                const finalKey = getCriteriaKey(criterion.name, true);
                if (finalRoundScoresOnly[finalKey] === undefined) {
                  // Check for non-prefixed version and convert
                  const nonPrefixedKey = getCriteriaKey(criterion.name, false);
                  if (updatedScores[nonPrefixedKey] !== undefined) {
                    finalRoundScoresOnly[finalKey] = updatedScores[nonPrefixedKey];
                  }
                }
              });
              
              updatedContestant = { 
                ...c, 
                // Spread only final_ prefixed scores - main criteria scores remain untouched
                ...finalRoundScoresOnly,
                // Always update totalWeightedScore with the calculated total
                totalWeightedScore: parseFloat(totalScore.toFixed(1))
              };
              
              console.log('📊 Local state update - preserving main criteria, only updating final scores:', finalRoundScoresOnly);
            } else {
              // For main criteria, update all scores as before
              updatedContestant = { 
                ...c, 
                ...updatedScores,
                totalWeightedScore: parseFloat(totalScore.toFixed(1))
              };
            }
            
            // Update the current contestant state as well
            setCurrentContestant(prev => ({
              ...prev,
              scores: currentContestantScores,
              totalWeightedScore: parseFloat(totalScore.toFixed(1))
            }));
            
            return updatedContestant;
          } else {
            // For other contestants, always calculate total score regardless of criteria mode
            if (usingFinalRoundCriteria) {
              // When using final round criteria, calculate total based on final round scores
              const criteria = getCurrentEventCriteria();
              let totalScore = 0;
              criteria.forEach(criterion => {
                const finalKey = getCriteriaKey(criterion.name, true);
                const score = c[finalKey] || 0;
                const weight = criterion.weight / 100;
                totalScore += score * weight;
              });
              
              return { 
                ...c,
                totalWeightedScore: parseFloat(totalScore.toFixed(1))
              };
            } else {
              // Calculate weighted total for other contestants with their existing scores (main criteria only)
              const criteria = getCurrentEventCriteria();
              const useFinalRoundPrefix = usingFinalRoundCriteria;
              let totalScore = 0;
              criteria.forEach((criterion, index) => {
                const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                
                // Check if this is "AVERAGE OF THE 1ST ROUND" criterion (by name or by position)
                const isNameBased = criterion.name.toUpperCase().includes('AVERAGE') && 
                                       criterion.name.toUpperCase().includes('1ST') && 
                                       criterion.name.toUpperCase().includes('ROUND');
                const isPositionBased = usingFinalRoundCriteria && index === 0 && criterion.weight <= 35;
                const isFirstRoundAverage = isNameBased || isPositionBased;
                
                let score;
                if (isFirstRoundAverage) {
                  // For first round average criterion, use saved value if it exists, otherwise calculate
                  const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                  score = c[originalKey] !== undefined ? c[originalKey] : calculateFirstRoundAverage(c);
                } else {
                  // For other criteria, use existing score with appropriate prefix
                  score = c[key] || 0;
                }
                
                const weight = criterion.weight / 100;
                totalScore += score * weight;
              });
              
              return { 
                ...c,
                totalWeightedScore: parseFloat(totalScore.toFixed(1))
              };
            }
          }
        });
        
        const rankedContestants = updateRankings(updatedContestants);
        setContestants(rankedContestants);
        
        // Mark current contestant as scored in the appropriate set and persist to Firestore
        if (contestant.id) {
          if (usingFinalRoundCriteria) {
            const newScoredFinal = new Set([...scoredContestantsFinal, contestant.id]);
            setScoredContestantsFinal(newScoredFinal);
            
            // Update Firestore with final rounds scored contestants
            const judgeRef = doc(db, 'judges', user.uid);
            await updateDoc(judgeRef, {
              scoredContestantsFinal: Array.from(newScoredFinal)
            });
          } else {
            const newScored = new Set([...scoredContestants, contestant.id]);
            setScoredContestants(newScored);
            
            // Update Firestore with main criteria scored contestants
            const judgeRef = doc(db, 'judges', user.uid);
            await updateDoc(judgeRef, {
              scoredContestants: Array.from(newScored)
            });
          }
        }
        
        // Show success message - remove automatic navigation message
        const message = `Scores saved for ${currentContestant.name}!\n\nYou can continue scoring or navigate manually.`;
        alert(message);
        
        // Don't force contestants reload to prevent unintended navigation
        // The rankings will be updated through real-time listeners
        console.log('✅ Scores saved successfully - staying on current contestant');
      } catch (error) {
        console.error('❌ Error saving scores:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        
        // Provide specific error messages based on error type
        let errorMessage = 'Error saving scores. Please try again.';
        
        if (error.code === 'permission-denied') {
          errorMessage = 'Permission denied. You may not have access to save scores for this event.';
        } else if (error.code === 'unavailable') {
          errorMessage = 'Service unavailable. Please check your internet connection and try again.';
        } else if (error.code === 'deadline-exceeded') {
          errorMessage = 'Request timeout. Please try again.';
        } else if (error.message.includes('scoresLocked')) {
          errorMessage = 'Scores are locked for this event. Please contact the administrator.';
        }
        
        alert(errorMessage);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-black">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      {/* Real-time Update Notification */}
      {showUpdateNotification && (
        <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce border border-emerald-400/30 backdrop-blur-sm">
          <span className="text-xl">🔄</span>
          <div>
            <p className="font-bold">Events Updated!</p>
            <p className="text-sm opacity-90">Your assigned events have been updated in real-time.</p>
          </div>
          <button
            onClick={() => setShowUpdateNotification(false)}
            className="ml-4 text-white/80 hover:text-white transition-colors bg-white/20 rounded-full p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Enhanced Header - Mobile Optimized */}
      <header className="relative w-full shadow-2xl border-b border-emerald-500/30 sticky top-0 z-25 overflow-hidden">
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
        
        <div className="relative w-full px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="py-3 sm:py-4 md:py-5 lg:py-6">
            {/* Main Header Row */}
            <div className="flex flex-col gap-3 sm:gap-4">
              {/* Top Row - Logo, Title, and Logout */}
              <div className="flex items-center justify-between">
                {/* Left Section - Logo and Title */}
                <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-1 min-w-0">
                  {/* Logo Container with Glow Effect */}
                  <div className="relative group flex-shrink-0">
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40 group-hover:opacity-60 transition duration-300"></div>
                    <div className="relative h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 rounded-full bg-white/95 backdrop-blur-sm shadow-2xl p-1 sm:p-1.5 border-2 border-white/50 ring-2 ring-emerald-400/30">
                      <Image
                        src="/logo.jpg"
                        alt="Bongabong Logo"
                        width={48}
                        height={48}
                        className="rounded-full object-contain w-full h-full"
                      />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-500 flex items-center justify-center shadow-lg border-2 border-white ring-2 ring-cyan-400/30">
                      <Image
                        src="/minsu_logo.jpg"
                        alt="Trophy"
                        width={18}
                        height={18}
                        className="rounded-full object-contain w-full h-full p-0.5"
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-extrabold text-white drop-shadow-lg tracking-tight truncate">
                      Judge Dashboard
                    </h1>
                    <div className="hidden sm:flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 md:gap-3 mt-0.5 sm:mt-1">
                      <p className="text-xs sm:text-sm text-emerald-100 font-medium drop-shadow-md">
                        Welcome back,
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-white bg-white/20 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg backdrop-blur-sm border border-white/30 shadow-inner truncate max-w-[150px] sm:max-w-[200px]">
                          👨‍⚖️ {user?.displayName || user?.email?.split('@')[0] || 'Judge'}
                        </span>
                      </div>
                    </div>
                    {judgeData?.judgeId && (
                      <p className="hidden md:block text-xs text-emerald-200/90 mt-1 sm:mt-1.5 font-medium tracking-wide">
                        🎫 Judge ID: <span className="font-mono bg-white/10 px-2 py-0.5 rounded">{judgeData.judgeId}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Section - Logout Button */}
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  {/* Connection Status - Hidden on mobile */}
                  <div className="hidden lg:flex items-center gap-3 md:gap-4 px-3 md:px-5 py-2 md:py-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-2.5 md:w-3 h-2.5 md:h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50"></div>
                        <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></div>
                      </div>
                      <span className="font-semibold text-xs md:text-sm text-white">🟢 Live</span>
                    </div>
                    <div className="h-5 md:h-6 w-px bg-white/30"></div>
                    <div className="text-xs text-emerald-100">
                      <div className="font-semibold">Last Updated</div>
                      <div className="text-white font-medium">{lastUpdated ? lastUpdated.toLocaleTimeString() : 'Just now'}</div>
                    </div>
                  </div>

                  {/* Enhanced Logout Button */}
                  <button
                    onClick={handleLogout}
                    className="group px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg sm:rounded-xl hover:from-red-600 hover:to-rose-700 transition-all duration-300 flex items-center gap-1.5 sm:gap-2 shadow-lg hover:shadow-red-500/25 border border-red-400/30 hover:scale-105 text-sm sm:text-base"
                  >
                    <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="font-semibold hidden sm:inline">Logout</span>
                  </button>
                </div>
              </div>

              {/* Mobile Info Row - Visible on small screens */}
              <div className="flex sm:hidden items-center justify-between gap-2 bg-white/10 backdrop-blur-sm rounded-lg p-2 border border-white/20">
                <span className="text-xs font-bold text-white truncate max-w-[45%]">
                  👨‍⚖️ {user?.displayName || user?.email?.split('@')[0] || 'Judge'}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                    <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></div>
                  </div>
                  <span className="text-xs text-white font-medium">Live</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Enhanced Dashboard Cards - Mobile Optimized */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
          {/* Active Contestants Card */}
          <div className="group relative bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-blue-100 p-3 sm:p-4 md:p-5 lg:p-6 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden">
            <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-full -translate-y-10 sm:-translate-y-16 translate-x-10 sm:translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform duration-300">
                <span className="text-lg sm:text-xl md:text-2xl">📝</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mb-0.5 sm:mb-1">
                  Active
                </p>
                <p className="text-xl sm:text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  {filteredContestants.length}
                </p>
              </div>
            </div>
          </div>

          {/* Criteria Count Card */}
          <div className="group relative bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-indigo-100 p-3 sm:p-4 md:p-5 lg:p-6 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden">
            <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full -translate-y-10 sm:-translate-y-16 translate-x-10 sm:translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-110 transition-transform duration-300">
                <span className="text-lg sm:text-xl md:text-2xl">🎯</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mb-0.5 sm:mb-1">Criteria</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{getCurrentEventCriteria().length}</p>
              </div>
            </div>
          </div>

          {/* Completed Evaluations Card */}
          <div className="group relative bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-emerald-100 p-3 sm:p-4 md:p-5 lg:p-6 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden">
            <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-full -translate-y-10 sm:-translate-y-16 translate-x-10 sm:translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
                <span className="text-lg sm:text-xl md:text-2xl">✅</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mb-0.5 sm:mb-1">
                  Done
                </p>
                <p className="text-xl sm:text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  {filteredContestants.filter(c => {
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

          {/* Pending Card */}
          <div className="group relative bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-amber-100 p-3 sm:p-4 md:p-5 lg:p-6 hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden">
            <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full -translate-y-10 sm:-translate-y-16 translate-x-10 sm:translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                <span className="text-lg sm:text-xl md:text-2xl">⏳</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mb-0.5 sm:mb-1">
                  Pending
                </p>
                <p className="text-xl sm:text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  {filteredContestants.length - filteredContestants.filter(c => {
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
        </div>

        {/* Enhanced Event Information - Mobile Optimized */}
        {assignedEvents.length > 0 && (
          <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 lg:p-6 mb-4 sm:mb-6 shadow-xl">
            {/* Decorative Pattern */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/10"></div>
            
            {/* Event Selector */}
            {assignedEvents.length > 1 && (
              <div className="relative mb-3 sm:mb-4 md:mb-5">
                <label className="text-xs sm:text-sm font-semibold text-emerald-100 block mb-1.5 sm:mb-2">📋 Select Event:</label>
                <select
                  value={currentEvent?.id || ''}
                  onChange={(e) => {
                    const selectedEvent = assignedEvents.find(event => event.id === e.target.value);
                    if (selectedEvent) {
                      setCurrentEvent(selectedEvent);
                      // Also update the current round from the selected event
                      setEventCurrentRound(selectedEvent.currentRound || 'preliminary');
                      // Reset final round mode when switching events
                      if (usingFinalRoundCriteria) {
                        setUsingFinalRoundCriteria(false);
                        setOriginalEventCriteria(null);
                      }
                    }
                  }}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-white/50 font-medium cursor-pointer hover:bg-white/25 transition-colors"
                >
                  {assignedEvents.map(event => (
                    <option key={event.id} value={event.id} className="text-slate-800 bg-white">
                      {event.eventName} - {event.date} at {event.time}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Current Event Details */}
            {assignedEvents.map((event) => (
              currentEvent?.id === event.id && (
                <div key={event.id} className="relative">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 border border-white/20">
                      <label className="text-[10px] sm:text-xs font-semibold text-emerald-200 uppercase tracking-wider">🎪 Event</label>
                      <p className="font-bold text-white text-sm sm:text-base md:text-lg mt-0.5 sm:mt-1 truncate">{event.eventName}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 border border-white/20">
                      <label className="text-[10px] sm:text-xs font-semibold text-emerald-200 uppercase tracking-wider">📅 Date</label>
                      <p className="font-bold text-white text-sm sm:text-base md:text-lg mt-0.5 sm:mt-1 truncate">{event.date}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 border border-white/20">
                      <label className="text-[10px] sm:text-xs font-semibold text-emerald-200 uppercase tracking-wider">📍 Venue</label>
                      <p className="font-bold text-white text-sm sm:text-base md:text-lg mt-0.5 sm:mt-1 truncate">{event.venue}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 border border-white/20">
                      <label className="text-[10px] sm:text-xs font-semibold text-emerald-200 uppercase tracking-wider">📊 Status</label>
                      <span className={`inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold rounded-lg mt-0.5 sm:mt-1 ${
                        event.status === 'upcoming' ? 'bg-amber-400/90 text-amber-900' :
                        event.status === 'ongoing' ? 'bg-emerald-400/90 text-emerald-900' :
                        'bg-slate-400/90 text-slate-900'
                      }`}>
                        <span>{event.status === 'upcoming' ? '📅' : event.status === 'ongoing' ? '🎭' : '✅'}</span>
                        <span className="hidden sm:inline">{event.status.charAt(0).toUpperCase() + event.status.slice(1)}</span>
                      </span>
                    </div>
                    {event.enableIndividualSubmit && (
                      <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 border border-white/20">
                        <label className="text-[10px] sm:text-xs font-semibold text-emerald-200 uppercase tracking-wider">📤 Scoring Mode</label>
                        <div className="flex items-center gap-1 sm:gap-2 mt-0.5 sm:mt-1">
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse flex-shrink-0"></div>
                          <span className="text-xs sm:text-sm font-bold text-blue-100">Individual Submit</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {/* Mobile-Optimized Combined Contestant & Scoring Card */}
        <div 
          className="lg:hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Combined Card: Contestant Info + Quick Scoring */}
          <div className={`bg-white rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl overflow-hidden mb-3 sm:mb-4 border border-emerald-200/50 transition-all duration-300 ${
            isAnimating ? (slideDirection === 'left' ? 'slide-exit-left' : 'slide-exit-right') : (slideDirection === 'left' ? 'slide-enter-left' : 'slide-enter-right')
          }`}>
            {/* Card Header: Contestant Info - Mobile Enhanced */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/10"></div>
              
              <div className="relative text-white p-3 sm:p-4 md:p-5">
                <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Contestant Image - Left Side */}
                    <div className="flex-shrink-0">
                      {currentContestant.photo ? (
                        <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24">
                          <div className="absolute inset-0 bg-white/20 backdrop-blur-sm rounded-full border-3 border-white/30 shadow-xl"></div>
                          <Image
                            src={currentContestant.photo}
                            alt={`${currentContestant.name} photo`}
                            fill
                            className="rounded-full object-cover"
                            sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, 96px"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white/20 backdrop-blur-sm rounded-full border-3 border-white/30 flex items-center justify-center shadow-xl">
                          <span className="text-2xl sm:text-3xl md:text-4xl">
                            {currentContestant.contestantType === 'group' ? '👥' : '👤'}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Contestant Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold truncate transition-all duration-300 drop-shadow-lg max-w-[200px] sm:max-w-none">{currentContestant.name}</h2>
                        {currentContestant.contestantType === 'group' ? (
                          <span className="inline-flex items-center px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold bg-purple-100 text-purple-700 rounded-full flex-shrink-0 shadow-sm" title="Group Contestant">
                            👥
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold bg-blue-100 text-blue-700 rounded-full flex-shrink-0 shadow-sm" title="Solo Contestant">
                            👤
                          </span>
                        )}
                        {isCurrentContestantLocked() && (
                          <span className="inline-flex items-center px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold bg-red-100 text-red-700 rounded-full flex-shrink-0 shadow-sm" title="Contestant scores are locked">
                            🔒
                          </span>
                        )}
                        {isCurrentContestantScored() && (
                          <span className="inline-flex items-center px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0 shadow-sm">
                            ✅
                          </span>
                        )}
                      </div>
                      <p className="text-sm sm:text-base md:text-lg text-emerald-100 font-bold mt-0.5 sm:mt-1 truncate transition-all duration-300">Contestant #{currentContestant.number}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center bg-white/20 backdrop-blur-sm px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-white/30 flex-shrink-0">
                    <span className="text-lg sm:text-xl md:text-2xl font-extrabold">{currentContestantIndex + 1}</span>
                    <span className="text-[10px] sm:text-xs text-emerald-100">of {contestants.length}</span>
                  </div>
                </div>
                
                {/* Progress Indicator - Mobile Optimized */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-white/20">
                  <div className="flex items-center justify-between text-xs sm:text-sm text-emerald-100 mb-1.5 sm:mb-2">
                    <span className="font-semibold">📊 Progress</span>
                    <span className="font-bold text-white">{Math.round(((currentContestantIndex + 1) / contestants.length) * 100)}%</span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2 sm:h-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-white h-2 sm:h-3 rounded-full transition-all duration-500 shadow-lg"
                      style={{ width: `${((currentContestantIndex + 1) / contestants.length) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-[10px] sm:text-xs text-emerald-200 mt-1.5 sm:mt-2 flex items-center gap-1">
                    <span>👆</span> Swipe to navigate
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Buttons - Mobile Optimized */}
            <div className="px-2.5 sm:px-4 py-2 sm:py-3 border-b border-slate-100 bg-slate-50/50 flex gap-2 sm:gap-3">
              <button
                onClick={() => selectContestantByIndex(currentContestantIndex - 1)}
                disabled={isPreviousNavigationDisabled()}
                className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-2 hover:shadow-md active:scale-95"
              >
                ← Prev
              </button>
              <button
                onClick={() => selectContestantByIndex(currentContestantIndex + 1)}
                disabled={currentContestantIndex === contestants.length - 1}
                className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg sm:rounded-xl font-semibold transition-all duration-200 text-xs sm:text-sm flex items-center justify-center active:scale-95"
              >
                Next →
              </button>
            </div>

            {/* All Contestants Locked Notification */}
            {areAllContestantsLocked() && (
              <div className="px-2.5 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base">🔒</span>
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-amber-600">All Scores Locked</p>
                      <p className="text-xs sm:text-sm font-bold text-amber-800">All contestant scores have been locked</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Previous Contestant Score Notification */}
            {showPreviousScore && previousContestantInfo && (
              <div className="px-2.5 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base">📊</span>
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-blue-600">Previous Contestant</p>
                      <p className="text-xs sm:text-sm font-bold text-blue-800">#{previousContestantInfo.number} - {previousContestantInfo.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] sm:text-xs font-medium text-blue-600">Total Score</p>
                    <p className="text-sm sm:text-lg font-extrabold text-blue-800">{previousContestantInfo.totalScore}</p>
                  </div>
                  <button 
                    onClick={() => setShowPreviousScore(false)}
                    className="ml-2 text-blue-400 hover:text-blue-600 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Card Body: Quick Scoring - Mobile Optimized */}
            <div className="p-2.5 sm:p-4 md:p-6 max-h-[500px] sm:max-h-[600px] overflow-y-auto">
              {/* Warning Banner */}
              {currentEvent && (currentEvent.scoresLocked || currentEvent.status === 'upcoming') && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 sm:p-3 mb-3 sm:mb-4">
                  <div className="flex items-start gap-2">
                    <span className="text-lg sm:text-2xl flex-shrink-0">🚫</span>
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-black">
                        {currentEvent.scoresLocked ? 'Scoring Locked' : 'Event Not Started'}
                      </h4>
                      <p className="text-[10px] sm:text-xs text-black mt-0.5 sm:mt-1">
                        {currentEvent.scoresLocked 
                          ? 'The administrator has locked scoring for this event.'
                          : 'This event has not started yet. Scoring will be available when the event is ongoing.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Scoring Criteria - Grouped by Category - Mobile Optimized */}
              <div className="space-y-3 sm:space-y-4 mb-3 sm:mb-4">
                {getCurrentEventCriteria().length > 0 ? (
                  (() => {
                    let globalCriterionIndex = 0; // Track global index across all groups
                    return getGroupedCriteria().map((group, groupIndex) => (
                    <div key={groupIndex} className={group.isFlat ? '' : 'bg-gray-100 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200'}>
                      {/* Category Header - only show if has sub-criteria */}
                      {!group.isFlat && group.categoryName && (
                        <div className="mb-2 sm:mb-3 pb-1.5 sm:pb-2 border-b border-gray-300">
                                  <h5 className="font-bold text-emerald-700 text-base sm:text-lg flex items-center gap-1.5 sm:gap-2">
                            <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-emerald-500 rounded-full"></span>
                            {group.categoryName}
                            <span className="text-sm sm:text-base font-normal text-gray-500">
                              ({group.criteria.length})
                            </span>
                          </h5>
                        </div>
                      )}
                      
                      {/* Sub-criteria Items */}
                      <div className="space-y-2 sm:space-y-3">
                        {group.criteria.map((criterion, index) => {
                          const currentGlobalIndex = globalCriterionIndex++;
                          const useFinalRoundPrefix = usingFinalRoundCriteria;
                          const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                          
                          // Check if this criterion should be locked (auto-calculated from first round)
                          const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, currentGlobalIndex);
                          
                          // For first round average criterion, show saved value if it exists, otherwise calculate
                          let score;
                          if (isFirstRoundAverage && contestants[currentContestantIndex]) {
                            const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                            score = contestants[currentContestantIndex][originalKey] !== undefined 
                              ? contestants[currentContestantIndex][originalKey] 
                              : calculateFirstRoundAverage(contestants[currentContestantIndex]);
                          } else {
                            score = contestantScores[contestants[currentContestantIndex]?.id]?.[key] ?? 0;
                          }
                            
                          const colors = ['blue', 'green', 'purple', 'orange', 'pink'];
                          const color = colors[index % colors.length];
                          
                          // Determine grading type and max score
                          const isPointsGrading = currentEvent?.gradingType === 'points';
                          const criterionMaxScore = isPointsGrading ? criterion.weight : 100;
                          
                          return (
                            <div key={index} className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 border border-gray-200">
                              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                                <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                                  <label className="text-base sm:text-lg font-semibold text-black truncate max-w-[120px] sm:max-w-none">
                                    {criterion.name}
                                  </label>
                                  {isFirstRoundAverage && (
                                    <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 text-sm sm:text-base font-medium bg-amber-100 text-amber-800 rounded-full flex-shrink-0" title="Auto-calculated from first round total (30%)">
                                      🔒 Auto
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-1 sm:ml-2">
                                  <span className="text-sm sm:text-base font-medium text-black bg-gray-200 px-1.5 sm:px-2 py-0.5 rounded">
                                    {isPointsGrading ? `${criterion.weight}pt` : `${criterion.weight}%`}
                                  </span>
                                  <span className={`text-base sm:text-lg font-bold text-${color}-600`}>
                                    {formatScoreDisplay(score, criterion.weight, isPointsGrading)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <input
                                  type="range"
                                  min="0"
                                  max={criterionMaxScore}
                                  step="0.1"
                                  value={score}
                                  onChange={(e) => handleQuickScoreChange(contestants[currentContestantIndex]?.id, key, e.target.value)}
                                  disabled={isCurrentContestantLocked() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming' || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestants[currentContestantIndex]?.id}_${key}`]}
                                  className={`flex-1 h-1.5 sm:h-2 bg-${color}-200 rounded-lg appearance-none cursor-pointer ${
                                    isCurrentContestantLocked() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming' || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestants[currentContestantIndex]?.id}_${key}`] ? 'opacity-50 cursor-not-allowed' : ''
                                  }`}
                                />
                                <input
                                  type="number"
                                  min="0"
                                  max={criterionMaxScore}
                                  step="0.1"
                                  value={score}
                                  onChange={(e) => {
                                    let newValue = parseFloat(e.target.value) || 0;
                                    // Enforce maximum limit for points-based grading
                                    if (isPointsGrading && newValue > criterionMaxScore) {
                                      newValue = criterionMaxScore;
                                    } else if (!isPointsGrading && newValue > 100) {
                                      newValue = 100;
                                    }
                                    handleQuickScoreChange(contestants[currentContestantIndex]?.id, key, newValue);
                                  }}
                                  disabled={isCurrentContestantLocked() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming' || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestants[currentContestantIndex]?.id}_${key}`]}
                                  className={`w-12 sm:w-16 px-1 sm:px-2 py-1 border border-gray-300 rounded-md sm:rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-center text-sm sm:text-base font-medium text-black ${
                                    !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming' || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestants[currentContestantIndex]?.id}_${key}`] ? 'bg-gray-100 cursor-not-allowed' : ''
                                  }`}
                                />
                              </div>
                              <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-black text-right">
                                → {formatScoreDisplay(score, criterionMaxScore, isPointsGrading)}
                              </div>
                              
                              {/* Individual Criteria Submit Button - Mobile */}
                              {currentEvent?.enableIndividualSubmit && criterion.enableSubmitButton !== false && (
                                <div className="mt-2 flex justify-end">
                                  <button
                                    onClick={() => submitScore(criterion.name)}
                                    disabled={isCurrentContestantLocked() || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestants[currentContestantIndex]?.id}_${key}`] || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming'}
                                    className={`w-24 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                                      submittedCriteria[`${contestants[currentContestantIndex]?.id}_${key}`]
                                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                                    }`}
                                  >
                                    {submittedCriteria[`${contestants[currentContestantIndex]?.id}_${key}`] ? '✓ Submitted' : '📤 Submit'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                  })()
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 text-center">
                    <div className="text-amber-800">
                      <span className="text-xl sm:text-2xl mb-1.5 sm:mb-2 block">⚠️</span>
                      <h3 className="font-semibold text-xs sm:text-sm mb-1.5 sm:mb-2">No Scoring Criteria Available</h3>
                      <p className="text-[10px] sm:text-xs text-amber-700">
                        This event doesn't have any scoring criteria set up. Please contact the administrator.
                      </p>
                      {currentEvent && (
                        <div className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-amber-600">
                          <p>Event: {currentEvent.eventName}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Total Score - Mobile Optimized */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-2.5 sm:p-3 border border-green-200 mb-3 sm:mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] sm:text-xs font-semibold text-black">Total Score</span>
                    <div className="text-[10px] sm:text-xs text-black">
                      Max {currentEvent?.gradingType === 'points' 
                        ? getCurrentEventCriteria().reduce((sum, c) => sum + (c.weight || 0), 0)
                        : '100'
                      }
                    </div>
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-black">{getDisplayTotalScore()}</span>
                </div>
                {((currentEvent?.gradingType === 'points' 
                      ? parseFloat(getDisplayTotalScore()) >= getCurrentEventCriteria().reduce((sum, c) => sum + (c.weight || 0), 0)
                      : parseFloat(getDisplayTotalScore()) >= 100)) && getCurrentEventCriteria().length > 0 && (
                  <div className="text-[10px] sm:text-xs text-amber-700 bg-amber-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded mt-1.5 sm:mt-2 border border-amber-200">
                    ⚠️ Max reached
                  </div>
                )}
              </div>

              {/* Action Buttons - Mobile Optimized */}
              <div className="space-y-2 sm:space-y-2">
                <button
                  onClick={saveQuickScores}
                  disabled={isCurrentContestantScored() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming'}
                  className={`w-full px-4 py-3 rounded-xl transition-all duration-200 font-semibold shadow-lg text-sm active:scale-95 ${
                    isCurrentContestantScored() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming'
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  💾 {isCurrentContestantScored() ? 'Submitted' : 'Submit'}
                </button>
                
                <div className="flex gap-2 sm:hidden">
                  <button
                    onClick={toggleCurrentContestantLock}
                    className={`flex-1 px-3 py-2.5 rounded-xl transition-all duration-200 font-semibold shadow text-sm flex items-center justify-center gap-1.5 active:scale-95 ${
                      isCurrentContestantLocked() 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  >
                    {isCurrentContestantLocked() ? '🔒' : '🔓'}
                    <span>{isCurrentContestantLocked() ? 'Locked' : 'Lock'}</span>
                  </button>
                </div>
                <div className="hidden sm:grid grid-cols-2 gap-2">
                  <button
                    onClick={toggleCurrentContestantLock}
                    className={`px-4 py-2 rounded-lg transition-all duration-200 font-semibold shadow text-sm flex items-center justify-center gap-1 active:scale-95 ${
                      isCurrentContestantLocked() 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  >
                    {isCurrentContestantLocked() ? '🔒' : '🔓'}
                    <span className="hidden sm:inline">{isCurrentContestantLocked() ? 'Locked' : 'Lock'}</span>
                  </button>
                  <button
                    onClick={openSubmitModal}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-all duration-200 font-semibold shadow text-sm active:scale-95"
                  >
                    📤 Submit
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation and Tips - Mobile Optimized */}
          <div className="space-y-2 sm:space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-emerald-800 font-medium">
                ← Swipe to navigate →
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-amber-800">
                💡 Once you save scores, you can't modify them. Make sure your scores are final!
              </p>
            </div>
          </div>

          {/* Desktop Instructions - Hidden on Mobile */}
          <div className="hidden sm:block mt-4 space-y-3">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                <span className="text-lg">📖</span>
                Scoring Instructions
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-700">
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Enter scores for each criterion (0-100 or based on points system)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Click "Save Scores" to lock in your evaluation</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Use "Lock" button to prevent accidental changes</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Submit scores when all contestants are evaluated</span>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                Important Reminders
              </h4>
              <div className="space-y-2 text-sm text-amber-700">
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>Saved scores cannot be modified</strong> - ensure accuracy before saving</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span>Double-check all scores before clicking "Submit Scores"</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span>Submission marks your evaluation as completed</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <h4 className="font-bold text-emerald-800 mb-2 flex items-center gap-2">
                <span className="text-lg">💡</span>
                Pro Tips
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-emerald-700">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">•</span>
                  <span>Use keyboard Tab key to quickly move between score inputs</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">•</span>
                  <span>Press Enter in score field to save quickly</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">•</span>
                  <span>Watch for real-time score calculations as you type</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">•</span>
                  <span>Check contestant cards below for overview of all scores</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
              <h4 className="font-bold text-purple-800 mb-2 flex items-center gap-2">
                <span className="text-lg">🎯</span>
                Evaluation Guidelines
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-purple-700">
                <div className="flex items-start gap-2">
                  <span className="text-purple-500 mt-0.5">•</span>
                  <span>Evaluate each criterion independently and objectively</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-500 mt-0.5">•</span>
                  <span>Use the full range of scores (0-100) for better differentiation</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-500 mt-0.5">•</span>
                  <span>Consider both technical skill and performance quality</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-500 mt-0.5">•</span>
                  <span>Maintain consistency across all contestants</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Layout - Multiple Contestant Scoring Cards - Enhanced */}
        <div className="hidden lg:block">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 bg-gradient-to-r from-slate-50 to-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-2xl">📋</span>
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-800">Contestant Scoring Cards</h2>
                  <p className="text-sm text-slate-500 font-medium">Evaluate contestants and submit scores</p>
                </div>
              </div>
              
              {/* Contestant Cards Instructions */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4 mb-4">
                <h4 className="font-bold text-purple-800 mb-2 flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  Scoring Guide
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-purple-700">
                  <div className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span><strong>Locked icon</strong> = scores are saved and cannot be changed</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span><strong>Save button</strong> allows saving scores before final submission</span>
                  </div>
                </div>
              </div>
              {(() => {
                // Page-based pagination: show exactly 1 contestant per page
                const pageSize = 1;
                const currentPage = Math.floor(currentContestantIndex / pageSize);
                const pageStart = currentPage * pageSize;
                const pageEnd = Math.min(pageStart + pageSize, contestants.length);
                const totalPages = Math.ceil(contestants.length / pageSize);
                
                return (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => selectContestantByIndex(Math.max(0, pageStart - pageSize))}
                      disabled={currentPage === 0}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 hover:shadow-md"
                    >
                      ← Previous
                    </button>
                    <div className="text-center bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
                      <span className="text-sm text-emerald-700 font-bold block">
                        Contestant {pageStart + 1} of {contestants.length}
                      </span>
                      <span className="text-xs text-emerald-600">Page {currentPage + 1}/{totalPages}</span>
                    </div>
                    <button
                      onClick={() => selectContestantByIndex(Math.min(contestants.length - 1, pageStart + pageSize))}
                      disabled={currentPage >= totalPages - 1}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-emerald-500/25"
                    >
                      Next →
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Previous Contestant Score Notification - Desktop */}
            {showPreviousScore && previousContestantInfo && (
              <div className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-2xl border border-blue-200 shadow-sm animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <span className="text-xl">📊</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Previous Contestant</p>
                      <p className="text-lg font-bold text-blue-800">#{previousContestantInfo.number} - {previousContestantInfo.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right bg-white/80 px-4 py-2 rounded-xl border border-blue-200">
                      <p className="text-xs font-medium text-blue-600">Total Score</p>
                      <p className="text-2xl font-extrabold text-blue-800">{previousContestantInfo.totalScore}</p>
                    </div>
                    <button 
                      onClick={() => setShowPreviousScore(false)}
                      className="text-blue-400 hover:text-blue-600 text-lg p-2 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contestant Cards Grid - Full Width Landscape Layout */}
          <div className="grid grid-cols-1 gap-5 w-full">
            {(() => {
              // Page-based pagination: show exactly 1 contestant per page
              const pageSize = 1;
              const currentPage = Math.floor(currentContestantIndex / pageSize);
              const pageStart = currentPage * pageSize;
              const pageEnd = Math.min(pageStart + pageSize, contestants.length);
              
              return contestants.slice(pageStart, pageEnd).map((contestant, cardIndex) => {
                const actualIndex = pageStart + cardIndex;
                const isCurrentCard = actualIndex === currentContestantIndex;
                const useFinalRoundPrefix = usingFinalRoundCriteria;
              
              return (
                <div key={contestant.id} data-contestant-card className={`bg-white rounded-2xl shadow-lg overflow-hidden border transition-all duration-300 hover:shadow-xl ${
                  isCurrentCard ? 'border-emerald-400 ring-2 ring-emerald-200/50 shadow-emerald-500/10' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  {/* Card Content - Full Width Landscape Layout */}
                  <div className="flex flex-col lg:flex-row h-full">
                    {/* Left Side - Contestant Info Header - Compact Landscape */}
                    <div className={`relative overflow-hidden lg:w-80 xl:w-96 ${
                      isCurrentCard 
                        ? 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600' 
                        : 'bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700'
                    }`}>
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5"></div>
                      <div className="relative p-6 h-full min-h-[200px]">
                        {/* Contestant Image - Top */}
                        <div className="flex justify-center mb-4">
                          <div className="w-52 h-48 lg:w-60 lg:h-56 xl:w-85 xl:h-110">
                            {contestant.photo ? (
                              <div className="relative w-full h-full">
                                <div className="absolute inset-0 bg-white/20 backdrop-blur-sm rounded-lg border-3 border-white/30 shadow-xl"></div>
                                <Image
                                  src={contestant.photo}
                                  alt={`${contestant.contestantName} photo`}
                                  fill
                                  className="rounded-lg object-cover"
                                  sizes="272px"
                                />
                              </div>
                            ) : (
                              <div className="w-full h-full bg-white/20 backdrop-blur-sm rounded-lg border-3 border-white/30 flex items-center justify-center shadow-xl">
                                <span className="text-6xl lg:text-7xl xl:text-8xl">
                                  {contestant.contestantType === 'group' ? '👥' : '👤'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Contestant Details - Below Image */}
                        <div className="text-center px-2">
                          {/* Contestant Number */}
                          <div className="bg-white/20 backdrop-blur-sm rounded-lg px-10 py-2 border border-white/30 mb-3 inline-block">
                            <div className="text-xl lg:text-2xl xl:text-3xl font-extrabold text-white">#{contestant.contestantNo}</div>
                          </div>
                          
                          {/* Contestant Name */}
                          <h3 className="text-xl lg:text-2xl xl:text-3xl font-bold text-white drop-shadow-sm mb-3 px-4">{contestant.contestantName}</h3>
                          
                          {/* Contestant Type and Status Badges */}
                          <div className="flex items-center gap-1.5 flex-wrap justify-center mb-2">
                            {contestant.contestantType === 'group' ? (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-full shadow-sm" title="Group Contestant">
                                👥 Group
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full shadow-sm" title="Solo Contestant">
                                👤 Solo
                              </span>
                            )}
                            {isContestantLocked(contestant.id) && (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full shadow-sm" title="Contestant scores are locked">
                                🔒 Locked
                              </span>
                            )}
                            {isCurrentCard && (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full shadow-sm animate-pulse">
                                📍 Active
                              </span>
                            )}
                          </div>
                          
                          {/* Performance Order */}
                          <p className="text-xs text-white/80 font-medium mb-2">🎭 Performance #{contestant.performanceOrder}</p>
                          
                          {/* Contestant Position */}
                          <div className="bg-white/10 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-white/20 inline-block">
                            <div className="text-sm font-extrabold text-white">{actualIndex + 1} / {contestants.length}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Side - Scoring Form - Full Width */}
                    <div className="flex-1 p-6 min-h-[400px]">
                      {isCurrentCard ? (
                        // Current contestant - full scoring form
                        <div>
                          <h4 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <span className="h-8 w-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">📝</span>
                            Scoring Form
                          </h4>
                        
                        {/* Warning Banner */}
                        {currentEvent && (currentEvent.scoresLocked || currentEvent.status === 'upcoming') && (
                          <div className="bg-red-50 border-l-4 border-red-500 rounded p-3 mb-4">
                            <div className="flex items-start gap-2">
                              <span className="text-lg">🚫</span>
                              <div>
                                <h4 className="font-semibold text-black text-sm">
                                  {currentEvent.scoresLocked ? 'Scoring Locked' : 'Event Not Started'}
                                </h4>
                                <p className="text-xs text-black mt-1">
                                  {currentEvent.scoresLocked 
                                    ? 'The administrator has locked scoring for this event.'
                                    : 'This event has not started yet.'
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Compact Scoring Grid - Grouped by Category */}
                        <div className="space-y-4 mb-4">
                          {(() => {
                            let globalCriterionIndex = 0; // Track global index across all groups
                            return getGroupedCriteria().map((group, groupIndex) => (
                            <div key={groupIndex} className={group.isFlat ? '' : 'bg-gray-50 rounded-xl p-3 border border-gray-200'}>
                              {/* Category Header - only show if has sub-criteria */}
                              {!group.isFlat && group.categoryName && (
                                <div className="mb-3 pb-2 border-b border-gray-300">
                                  <h5 className="font-bold text-emerald-700 text-sm flex items-center gap-2">
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                    {group.categoryName}
                                    <span className="text-xs font-normal text-gray-500">
                                      ({group.criteria.length} sub-criteria)
                                    </span>
                                  </h5>
                                </div>
                              )}
                              
                              {/* Sub-criteria / Criteria Items */}
                              <div className="grid grid-cols-1 gap-2">
                                {group.criteria.map((criterion, index) => {
                                  const currentGlobalIndex = globalCriterionIndex++;
                                  const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                                  const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, currentGlobalIndex);
                                  let score;
                                  if (isFirstRoundAverage && contestant) {
                                    const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                                    score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
                                  } else {
                                    score = contestantScores[contestant.id]?.[key] ?? 0;
                                  }
                                  const colors = ['blue', 'green', 'purple', 'orange', 'pink'];
                                  const color = colors[index % colors.length];
                                  
                                  // Determine grading type and max score
                                  const isPointsGrading = currentEvent?.gradingType === 'points';
                                  const criterionMaxScore = isPointsGrading ? criterion.weight : 100;
                                  const scoreDisplayFormat = formatScoreDisplay(score, criterionMaxScore, isPointsGrading);
                                  const isOverMax = isPointsGrading ? score > criterionMaxScore : score > 100;
                                  
                                  return (
                                    <div key={index} className={`bg-white rounded-lg p-2 border-2 ${
                                      isOverMax ? 'border-red-300 bg-red-50' : 'border-gray-200'
                                    }`}>
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <label className="font-semibold text-black text-lg">
                                            {criterion.name}
                                          </label>
                                          {isFirstRoundAverage && (
                                            <span className="inline-flex items-center px-2 py-0.5 text-lg font-medium bg-amber-100 text-amber-800 rounded-full flex-shrink-0" title="Auto-calculated from first round total (30%)">
                                              🔒 Auto
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-lg font-medium text-black bg-gray-200 px-2 py-0.5 rounded">
                                            {isPointsGrading ? `${criterion.weight} pts` : `${criterion.weight}%`}
                                          </span>
                                          <span className={`text-lg font-bold px-2 py-1 rounded ${
                                            isOverMax 
                                              ? 'text-black bg-red-100 border border-red-300' 
                                              : 'text-black bg-emerald-50'
                                          }`}>
                                            {scoreDisplayFormat}
                                          </span>
                                        </div>
                                      </div>
                                      {isOverMax && (
                                        <div className="mb-2 p-1 bg-red-100 border border-red-300 rounded text-lg text-black font-medium">
                                          ⚠️ Score exceeds maximum of {criterionMaxScore}{isPointsGrading ? ' points' : '%'}!
                                        </div>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="range"
                                          min="0"
                                          max={criterionMaxScore}
                                          step="0.1"
                                          value={score}
                                          onChange={(e) => handleQuickScoreChange(contestant.id, key, e.target.value)}
                                          disabled={isCurrentContestantLocked() || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestant.id}_${key}`]}
                                          className={`flex-1 h-1 bg-${color}-200 rounded-lg appearance-none cursor-pointer ${
                                            isCurrentContestantLocked() || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestant.id}_${key}`] ? 'opacity-50 cursor-not-allowed' : ''
                                          }`}
                                        />
                                        <input
                                          type="number"
                                          min="0"
                                          max={criterionMaxScore}
                                          step="0.1"
                                          value={score}
                                          onChange={(e) => {
                                            let newValue = parseFloat(e.target.value) || 0;
                                            // Enforce maximum limit for points-based grading
                                            if (isPointsGrading && newValue > criterionMaxScore) {
                                              newValue = criterionMaxScore;
                                            } else if (!isPointsGrading && newValue > 100) {
                                              newValue = 100;
                                            }
                                            handleQuickScoreChange(contestant.id, key, newValue);
                                          }}
                                          disabled={isCurrentContestantLocked() || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestant.id}_${key}`]}
                                          className={`w-16 px-1 py-1 border rounded text-center font-semibold text-base ${
                                            isOverMax 
                                              ? 'border-red-300 bg-red-100 text-black' 
                                              : 'border-gray-300'
                                          } ${
                                            isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestant.id}_${key}`] ? 'bg-gray-100 cursor-not-allowed' : ''
                                          }`}
                                        />
                                      </div>
                                      {/* Individual Submit Button */}
                                      {currentEvent?.enableIndividualSubmit && criterion.enableSubmitButton !== false && (
                                        <div className="mt-2 flex justify-end">
                                          <button
                                            onClick={() => submitScore(criterion.name)}
                                            disabled={isCurrentContestantLocked() || isFirstRoundAverage || isCurrentContestantScored() || submittedCriteria[`${contestant.id}_${key}`] || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming'}
                                            className={`w-24 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                                              submittedCriteria[`${contestant.id}_${key}`]
                                                ? 'bg-gray-100 text-gray-500 cursor-not-allowed border border-gray-200'
                                                : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-md hover:shadow-lg'
                                            }`}
                                          >
                                            {submittedCriteria[`${contestant.id}_${key}`] ? (
                                              <span className="flex items-center justify-center gap-1">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                                Submitted
                                              </span>
                                            ) : (
                                              <span className="flex items-center justify-center gap-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                </svg>
                                                Submit
                                              </span>
                                            )}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ));
                          })()}
                        </div>

                        {/* Total Score Display */}
                        <div className="mt-4 pt-3 border-t border-gray-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-black">Total Score:</span>
                              <div className="text-xs text-black">
                                Maximum {currentEvent?.gradingType === 'points' 
                                  ? getCurrentEventCriteria().reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                                  : '100.0'
                                } {currentEvent?.gradingType === 'points' ? 'points' : '%'}
                              </div>
                            </div>
                            <span className="text-lg font-bold text-black">
                              {currentEvent?.gradingType === 'points' 
                                ? `${getDisplayTotalScore()} / ${getCurrentEventCriteria().reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)}`
                                : `${getDisplayTotalScore()}%`
                              }
                            </span>
                          </div>
                          {((currentEvent?.gradingType === 'points' 
                                ? parseFloat(getDisplayTotalScore()) >= getCurrentEventCriteria().reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                                : parseFloat(getDisplayTotalScore()) >= 100)) && (
                            <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded mt-2 border border-amber-200">
                              ⚠️ Score capped at maximum of {currentEvent?.gradingType === 'points' 
                                ? getCurrentEventCriteria().reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                                : '100'
                              } {currentEvent?.gradingType === 'points' ? 'points' : '%'}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={toggleCurrentContestantLock}
                            className={`px-3 py-2 rounded-lg font-bold text-sm transition-colors ${
                              isCurrentContestantLocked() 
                                ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-black'
                                : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-black'
                            }`}
                          >
                            <span>{isCurrentContestantLocked() ? '🔒' : '🔓'}</span> {isCurrentContestantLocked() ? 'Locked' : 'Lock'}
                          </button>
                          <button
                            onClick={saveQuickScores}
                            disabled={isCurrentContestantLocked() || isCurrentContestantScored() || hasInvalidScores() || isEventFinished() || !currentEvent || currentEvent.status === 'upcoming'}
                            className={`flex-1 px-3 py-2 rounded-lg font-bold text-sm transition-colors ${
                              isCurrentContestantLocked() || isCurrentContestantScored() || hasInvalidScores() || isEventFinished() || !currentEvent || currentEvent.status === 'upcoming'
                                ? 'bg-gray-300 text-black cursor-not-allowed'
                                : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-black'
                            }`}
                          >
                            {!currentEvent ? '🔄 Loading...' : currentEvent.status === 'upcoming' ? '📅 Event Upcoming' : isEventFinished() ? '🏁 Event Finished' : hasInvalidScores() ? '⚠️ Invalid Scores' : isCurrentContestantLocked() ? '🔒 Locked' : '📤 Submit'}
                          </button>
                        </div>
                        
                        {(hasInvalidScores() || isEventFinished() || !currentEvent || currentEvent.status === 'upcoming') && (
                          <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-xs text-black font-medium">
                            {!currentEvent 
                              ? '🔄 Loading event information...'
                              : currentEvent.status === 'upcoming'
                              ? '📅 Event is upcoming - scoring is not available yet.'
                              : isEventFinished() 
                              ? '🏁 Event is finished - scoring is no longer available.'
                              : '⚠️ Cannot save: Some criteria exceed their maximum allowed value. Please correct scores before saving.'
                            }
                          </div>
                        )}
                      </div>
                    ) : (
                      // Other contestants - view only mode
                      <div>
                        <h4 className="text-lg font-bold text-black mb-3">Current Scores</h4>
                        <div className="space-y-3">
                          {(() => {
                            let globalCriterionIndex = 0; // Track global index across all groups
                            return getGroupedCriteria().map((group, groupIndex) => (
                            <div key={groupIndex} className={group.isFlat ? '' : 'bg-gray-100 rounded-lg p-2'}>
                              {/* Category Header - only show if has sub-criteria */}
                              {!group.isFlat && group.categoryName && (
                                <div className="mb-2 pb-1 border-b border-gray-300">
                                  <h5 className="font-bold text-emerald-700 text-sm flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                    {group.categoryName}
                                  </h5>
                                </div>
                              )}
                              <div className="space-y-1">
                                {group.criteria.map((criterion, index) => {
                                  const currentGlobalIndex = globalCriterionIndex++;
                                  const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                                  const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, currentGlobalIndex);
                                  let score;
                                  if (isFirstRoundAverage && contestant) {
                                    const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                                    score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
                                  } else {
                                    score = contestant[key] || 0;
                                  }
                                  const colors = ['blue', 'green', 'purple', 'orange', 'pink'];
                                  const color = colors[index % colors.length];
                                  
                                  // Determine grading type and display format
                                  const isPointsGrading = currentEvent?.gradingType === 'points';
                                  const criterionMaxScore = isPointsGrading ? criterion.weight : 100;
                                  const scoreDisplayFormat = formatScoreDisplay(score, criterionMaxScore, isPointsGrading);
                                  
                                  return (
                                    <div key={index} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="text-sm font-medium text-black truncate">{criterion.name}</span>
                                        <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded flex-shrink-0">
                                          {isPointsGrading ? `${criterion.weight} pts` : `${criterion.weight}%`}
                                        </span>
                                      </div>
                                      <span className={`text-sm font-bold text-${color === 'blue' ? 'emerald' : color}-600 bg-${color === 'blue' ? 'emerald' : color}-50 px-2 py-1 rounded flex-shrink-0`}>
                                        {scoreDisplayFormat}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ));
                          })()}
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-black">Total Score:</span>
                              <div className="text-xs text-black">
                                Maximum {currentEvent?.gradingType === 'points' 
                                  ? getCurrentEventCriteria().reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                                  : '100.0'
                                } {currentEvent?.gradingType === 'points' ? 'points' : '%'}
                              </div>
                            </div>
                            <span className="text-lg font-bold text-black">
                              {formatScoreDisplay(
                                contestant.totalWeightedScore || 0, 
                                getCurrentEventCriteria().reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0), 
                                currentEvent?.gradingType === 'points'
                              )}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => selectContestantByIndex(actualIndex)}
                          className={`w-full mt-3 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 transform active:scale-95 ${
                            isCurrentCard 
                              ? 'bg-emerald-700 text-white cursor-default' 
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg'
                          }`}
                        >
                          {isCurrentCard ? '✓ Current Contestant' : 'Select This Contestant'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            });
            })()}
          </div>
        </div>

        {/* Spacing between cards and table */}
        <div className="mb-4 sm:mb-6 lg:mb-8 xl:mb-12"></div>

        {/* Scoring Table - Mobile & Desktop Optimized */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl overflow-hidden mb-4 sm:mb-6 lg:mb-8 border border-slate-100">
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-3 sm:p-4 md:p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/10"></div>
            <div className="relative flex flex-col gap-2 sm:gap-3">
              {/* Header Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center border border-white/30">
                    <span className="text-lg sm:text-xl md:text-2xl">📊</span>
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl font-extrabold text-white drop-shadow-sm">Scoring Table</h2>
                    <p className="text-white/80 text-[10px] sm:text-xs md:text-sm font-medium hidden sm:block">All contestants overview</p>
                  </div>
                </div>
              </div>
              
              {/* Search and Controls Row */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="w-full px-2.5 sm:px-3 md:px-4 py-2 sm:py-2.5 pl-7 sm:pl-8 md:pl-10 border-2 border-white/20 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-white/50 focus:border-white/40 bg-white/10 backdrop-blur-sm text-white placeholder-white/60 text-xs sm:text-sm font-medium transition-all duration-200"
                  />
                  <span className="absolute left-2 sm:left-2.5 md:left-3 top-2.5 sm:top-3 text-white/80 text-xs sm:text-sm">🔍</span>
                </div>
                
                {/* Final Rounds Button - Mobile Optimized */}
                {/* Show button only if event has final round criteria */}
                {getFinalRound() && !usingFinalRoundCriteria && (
                  eventCurrentRound === 'final' ? (
                    // Final round is enabled by admin - show active button
                    <button
                      onClick={() => {
                        const finalRound = getFinalRound();
                        if (finalRound && finalRound.criteria) {
                          setOriginalEventCriteria(currentEvent.criteria);
                          const updatedEvent = {
                            ...currentEvent,
                            criteria: finalRound.criteria
                          };
                          setCurrentEvent(updatedEvent);
                          setUsingFinalRoundCriteria(true);
                          setSelectorKey(prev => prev + 1);
                          
                          // Reset to first finalist in the filtered list
                          const finalists = contestants.filter(c => 
                            !c.eliminated && c.status !== 'eliminated' && 
                            (c.status === 'finalist' || c.status === 'winner')
                          );
                          
                          if (finalists.length > 0) {
                            // Find index of first finalist in original contestants array
                            const firstFinalistIndex = contestants.findIndex(c => c.id === finalists[0].id);
                            if (firstFinalistIndex >= 0) {
                              setCurrentContestantIndex(firstFinalistIndex);
                              // Initialize contestant scores for the first finalist
                              const newContestantScores = initializeQuickScores(updatedEvent, finalists[0], true);
                              setContestantScores(prev => ({
                                ...prev,
                                [finalists[0].id]: newContestantScores
                              }));
                            }
                          } else if (contestants[currentContestantIndex]) {
                            // No finalists yet, keep current contestant
                            const newContestantScores = initializeQuickScores(updatedEvent, contestants[currentContestantIndex], true);
                            setContestantScores(prev => ({
                              ...prev,
                              [contestants[currentContestantIndex].id]: newContestantScores
                            }));
                          }
                          
                          alert(`🏆 Final Rounds Mode Activated\n\nShowing only finalists. ${finalists.length} finalist(s) found.`);
                        }
                      }}
                      className="px-2.5 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 text-amber-900 rounded-lg sm:rounded-xl hover:from-amber-500 hover:to-orange-500 transition-all duration-300 text-[10px] sm:text-sm font-bold shadow-lg border border-amber-300/50 whitespace-nowrap active:scale-95"
                      title="Switch to Final Rounds scoring criteria"
                    >
                      🏆 <span className="hidden sm:inline">Final</span>
                    </button>
                  ) : (
                    // Final round NOT enabled by admin - show disabled/locked button
                    <button
                      onClick={() => {
                        alert('🔒 Final Rounds Not Yet Available\n\nThe administrator has not yet enabled the final round for this event.\n\nPlease wait for the admin to advance the event to the final round before scoring.');
                      }}
                      className="px-2.5 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300 text-gray-600 rounded-lg sm:rounded-xl cursor-not-allowed transition-all duration-300 text-[10px] sm:text-sm font-bold shadow-sm border border-gray-300/50 whitespace-nowrap opacity-70"
                      title="Final round not yet enabled by admin"
                    >
                      🔒 <span className="hidden sm:inline">Final</span>
                    </button>
                  )
                )}
                
                {/* Back to Main Criteria Button - Mobile Optimized */}
                {usingFinalRoundCriteria && (
                  <button
                    onClick={() => {
                      if (originalEventCriteria) {
                        const updatedEvent = {
                          ...currentEvent,
                          criteria: originalEventCriteria
                        };
                        setCurrentEvent(updatedEvent);
                        setUsingFinalRoundCriteria(false);
                        setSelectorKey(prev => prev + 1);
                        if (contestants[currentContestantIndex]) {
                          // Pass false for forceFinalRound since we're switching back to main
                          const newContestantScores = initializeQuickScores(updatedEvent, contestants[currentContestantIndex], false);
                          setContestantScores(prev => ({
                            ...prev,
                            [contestants[currentContestantIndex].id]: newContestantScores
                          }));
                        }
                      }
                    }}
                    className="px-2.5 sm:px-4 py-2 sm:py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-lg sm:rounded-xl hover:bg-white/30 transition-all duration-300 text-[10px] sm:text-sm font-bold border border-white/30 whitespace-nowrap active:scale-95"
                    title="Switch back to main scoring criteria"
                  >
                    📋 <span className="hidden sm:inline">Main</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {contestants.length > 0 ? (
            <div className="overflow-x-auto overflow-y-hidden max-w-full">
              {/* Table Controls - Mobile Optimized */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3 py-2.5 sm:py-3 md:py-4 px-2.5 sm:px-3 md:px-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-wrap">
                  {/* Scoring mode indicator - Mobile Optimized */}
                  <span className={`inline-flex items-center px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 text-[10px] sm:text-xs font-bold rounded-lg sm:rounded-xl transition-all duration-300 shadow-sm ${
                    usingFinalRoundCriteria 
                      ? 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 border border-amber-200' 
                      : 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {usingFinalRoundCriteria ? '🏆 Final' : '📋 Main'}
                  </span>
                  
                  {/* Finalists Only Filter - Mobile Optimized */}
                  {getFinalRound() && (
                    <button
                      onClick={() => setShowFinalistsOnly(!showFinalistsOnly)}
                      className={`px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 text-[10px] sm:text-xs font-bold rounded-lg sm:rounded-xl transition-all duration-300 shadow-sm active:scale-95 ${
                        showFinalistsOnly 
                          ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-400/50 shadow-purple-500/25' 
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                      title={showFinalistsOnly ? "Show all contestants" : "Show finalists only"}
                    >
                      {showFinalistsOnly ? '🏆 Finalists' : '👥 All'}
                    </button>
                  )}
                </div>
                
                {/* Horizontal scroll indicator - Mobile Optimized */}
                <div className="flex gap-1.5 sm:gap-2">
                  <button 
                    onClick={() => document.querySelector('.judge-scoring-table')?.scrollBy({ left: -150, behavior: 'smooth' })}
                    className="px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-100 hover:bg-emerald-100 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:text-emerald-600 transition-all duration-200 active:scale-95"
                  >
                    ←
                  </button>
                  <button 
                    onClick={() => document.querySelector('.judge-scoring-table')?.scrollBy({ left: 150, behavior: 'smooth' })}
                    className="px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-100 hover:bg-emerald-100 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:text-emerald-600 transition-all duration-200 active:scale-95"
                  >
                    →
                  </button>
                </div>
              </div>
              
              {/* Three-Table Layout or Single Table */}
              {(() => {
                const tableConfig = getThreeTableCriteria();
                
                if (tableConfig.showSingleTable) {
                  // Show original single table for events without sub-criteria or with more than 2 categories
                  return (
                    <div className="overflow-x-auto">
                      <table key={`contestants-table-${contestants.length}`} className="w-full min-w-[600px] sm:min-w-[700px] md:min-w-[800px] judge-scoring-table">
                        <thead className="bg-gradient-to-r from-slate-50 via-slate-100 to-slate-50 border-b-2 border-slate-200">
                          <tr>
                            <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-10 sm:w-12 md:w-16">Rank</th>
                            <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-10 sm:w-12 md:w-16">No.</th>
                            <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider min-w-[80px] sm:min-w-[100px] md:min-w-[120px]">Name</th>
                            {tableConfig.combined.map((criterion, index) => (
                              <th key={index} className="px-1.5 sm:px-2 md:px-4 py-2 sm:py-3 md:py-4 text-center text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">
                                <div className="hidden md:block">
                                  <div className="font-bold truncate max-w-[100px]">{criterion.name}</div>
                                  {criterion.category && (
                                    <div className="text-[10px] text-black mt-0.5">{criterion.category}</div>
                                  )}
                                  <div className="text-[10px] text-black mt-0.5">
                                    ({criterion.scoringType === 'points' || currentEvent?.gradingType === 'points' ? `${criterion.weight}pt` : `${criterion.weight}%`})
                                  </div>
                                </div>
                                <div className="md:hidden text-[9px] sm:text-[10px]">
                                  {criterion.name.length > 6 ? criterion.name.substring(0, 6) + '..' : criterion.name}
                                  <div className="text-[9px] text-black">
                                    ({criterion.weight})
                                  </div>
                                </div>
                              </th>
                            ))}
                            <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-center text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-14 sm:w-18 md:w-24">Total</th>
                            <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-16 sm:w-20 md:w-24">Status</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {filteredContestants.map((contestant) => {
                            const hasScores = tableConfig.combined.some((criterion, index) => {
                              const key = getCriteriaKey(criterion.name, usingFinalRoundCriteria);
                              const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, index);
                              
                              if (isFirstRoundAverage) {
                                const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                                const finalKey = `final_${originalKey}`;
                                return (contestant[finalKey] !== undefined && contestant[finalKey] > 0) ||
                                       (contestant[originalKey] !== undefined && contestant[originalKey] > 0);
                              } else {
                                return contestant[key] !== undefined && contestant[key] > 0;
                              }
                            });
                            
                            const isInScoredSet = contestant.id && (
                              usingFinalRoundCriteria ? 
                              scoredContestantsFinal.has(contestant.id) : 
                              scoredContestants.has(contestant.id)
                            );
                            
                            const isScored = hasScores || isInScoredSet;
                            
                            return (
                              <tr key={contestant.id} className={`hover:bg-gray-50 transition-colors ${isScored ? 'bg-green-50' : ''} ${contestant.rank === 1 ? 'ring-2 ring-yellow-400 ring-opacity-50' : ''}`}>
                                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3">
                                  {contestant.rank ? (
                                    <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                                      {contestant.rank === 1 && (
                                        <span className="text-black text-sm sm:text-lg" title="Current Leader">👑</span>
                                      )}
                                      <span className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-full text-[10px] sm:text-xs md:text-sm font-bold ${getRankColor(contestant.rank)}`}>
                                        {contestant.rank}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-full text-[10px] sm:text-xs md:text-sm font-medium bg-gray-200 text-black">
                                      -
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-[10px] sm:text-xs md:text-sm font-medium text-black">{contestant.contestantNo}</td>
                                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-[10px] sm:text-xs md:text-sm text-black">
                                  <div className="flex items-center gap-1 sm:gap-2">
                                    <div className="truncate font-medium max-w-[60px] sm:max-w-[100px] md:max-w-none">{contestant.contestantName}</div>
                                    <span className="inline-flex items-center text-[9px] sm:text-xs" title={contestant.contestantType === 'group' ? 'Group' : 'Solo'}>
                                      {contestant.contestantType === 'group' ? '👥' : '👤'}
                                    </span>
                                    {getContestantRoundStatus(contestant)?.isFinal && (
                                      <span className="hidden sm:inline text-[9px] sm:text-xs" title="Finalist">🏆</span>
                                    )}
                                  </div>
                                </td>
                                {tableConfig.combined.map((criterion, index) => {
                                  const key = getCriteriaKey(criterion.name, usingFinalRoundCriteria);
                                  const isFirstRoundAverage = isFirstRoundAverageCriterion(criterion, index);
                                  
                                  let score;
                                  if (isFirstRoundAverage) {
                                    const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                                    const finalKey = `final_${originalKey}`;
                                    score = (usingFinalRoundCriteria && contestant[finalKey] !== undefined) 
                                      ? contestant[finalKey] 
                                      : (contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant));
                                  } else {
                                    score = contestant[key] || 0;
                                  }
                                  
                                  const colors = ['bg-blue-100 text-black', 'bg-cyan-100 text-cyan-800', 'bg-sky-100 text-sky-800', 'bg-green-100 text-black', 'bg-yellow-100 text-black'];
                                  const colorClass = colors[index % colors.length];
                                  const hasScore = score > 0;
                                  
                                  // Check if this is the highest score for this criterion
                                  const highestScore = getHighestScore(criterion, index);
                                  const isTopScore = hasScore && score === highestScore && highestScore > 0;
                                  
                                  return (
                                    <td key={index} className={`px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-center ${isTopScore ? 'bg-yellow-200' : ''}`}>
                                      <div className="relative inline-flex items-center justify-center">
                                        <span className={`inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs md:text-sm font-medium ${hasScore ? colorClass : 'bg-gray-100 text-black'} rounded-full ${hasScore ? 'shadow-sm' : ''} ${isTopScore ? 'ring-2 ring-yellow-400 ring-opacity-60' : ''}`}>
                                          {formatScoreDisplay(score, 100, false)}
                                        </span>
                                        {isTopScore && (
                                          <span className="absolute -top-1 -right-1 text-[10px] sm:text-xs" title="Top score for this criterion">
                                            🏆
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-center">
                                  <span className={`inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs md:text-sm font-bold ${(contestant.totalWeightedScore || 0) > 0 ? 'bg-green-100 text-black' : 'bg-gray-100 text-black'} rounded-full ${(contestant.totalWeightedScore || 0) > 0 ? 'shadow-sm' : ''}`}>
                                    {(() => {
                                      const isCurrentContestant = contestants[currentContestantIndex] && contestant.id === contestants[currentContestantIndex].id;
                                      if (isCurrentContestant) {
                                        const criteria = tableConfig.combined;
                                        const isPointsGrading = currentEvent?.gradingType === 'points';
                                        return getFormattedTotalScore(contestant, criteria, isPointsGrading, usingFinalRoundCriteria, contestantScores[contestant.id] || {});
                                      }
                                      
                                      if (typeof contestant.totalWeightedScore === 'number' && contestant.totalWeightedScore > 0) {
                                        const criteria = tableConfig.combined;
                                        const isPointsGrading = currentEvent?.gradingType === 'points';
                                        const maxScore = isPointsGrading 
                                          ? criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                                          : 100;
                                        return formatScoreDisplay(contestant.totalWeightedScore, maxScore, isPointsGrading);
                                      }
                                      
                                      const criteria = tableConfig.combined;
                                      const isPointsGrading = currentEvent?.gradingType === 'points';
                                      return getFormattedTotalScore(contestant, criteria, isPointsGrading, usingFinalRoundCriteria);
                                    })()}
                                  </span>
                                </td>
                                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3">
                                  <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-xs font-medium rounded-full border ${getStatusColor(contestant.status)}`}>
                                    <span className="hidden md:inline">{contestant.status || 'Not Rated'}</span>
                                    <span className="md:hidden">{(contestant.status || 'NR').substring(0, 4)}</span>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                } else {
                  // Show three separate tables for events with exactly 2 categories
                  return (
                    <div className="space-y-6">
                      {renderScoringTable(tableConfig.category1, `Category 1: ${tableConfig.category1Name}`, false)}
                      {renderScoringTable(tableConfig.category2, `Category 2: ${tableConfig.category2Name}`, false)}
                      {renderScoringTable(tableConfig.combined, 'Combined Scores', true)}
                    </div>
                  );
                }
              })()}
            </div>
          ) : (
            <div className="text-center py-10 sm:py-16">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-4">
                <span className="text-4xl">👥</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
                No contestants found
              </h3>
              <p className="text-sm text-slate-600 mb-4 max-w-md mx-auto">
                {assignedEvents.length === 0 
                  ? "You are currently viewing all contestants. Contact the admin to assign you to specific events for better organization."
                  : "No contestants have been added to your assigned events yet."
                }
              </p>
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4 max-w-md mx-auto">
                <div className="flex items-start gap-3">
                  <span className="text-xl">💡</span>
                  <p className="text-sm text-amber-800">
                    <strong>Tip:</strong> {assignedEvents.length === 0 
                      ? "New judges are automatically assigned to all events. If you're a new judge and don't see contestants, please refresh the page."
                      : "Contestants will appear here once they are added to events you're assigned to judge."
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Edit Contestant Modal - Enhanced */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">✏️</span>
              Edit Contestant Scores
            </h3>
            <form onSubmit={(e) => { e.preventDefault(); handleEditContestant(); }} className="space-y-4">
              {/* Dynamic Criteria Fields */}
              {getCurrentEventCriteria().map((criterion, index) => {
                const useFinalRoundPrefix = usingFinalRoundCriteria;
                const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                const currentContestant = contestants[currentContestantIndex];
                const isSubmitted = currentContestant && submittedCriteria[`${currentContestant.id}_${key}`];
                
                return (
                  <div key={index}>
                    <label className="block text-sm font-bold text-slate-700 mb-1">
                      {criterion.name} Score ({currentEvent?.gradingType === 'points' ? criterion.weight + ' points' : criterion.weight + '%'})
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        name={key}
                        value={formData[key] || 0}
                        onChange={handleInputChange}
                        min="0"
                        max={currentEvent?.gradingType === 'points' ? criterion.weight : 100}
                        step="0.1"
                        className="flex-1 px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all duration-200 text-slate-800 font-medium"
                        required
                      />
                      {currentEvent?.enableIndividualSubmit && (
                        <button
                          type="button"
                          onClick={() => submitScore(criterion.name)}
                          disabled={isSubmitted}
                          className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                            isSubmitted
                              ? 'bg-gray-100 text-gray-500 cursor-not-allowed border border-gray-200'
                              : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-md hover:shadow-lg'
                          }`}
                        >
                          {isSubmitted ? (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Submitted
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                              Submit
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-4 rounded-xl border border-slate-200">
                <div className="text-sm text-slate-700 font-medium">
                  {getCurrentEventCriteria().map((criterion, index) => {
                    const useFinalRoundPrefix = usingFinalRoundCriteria;
                    const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                    const score = formData[key] || 0;
                    const weighted = (score * criterion.weight / 100).toFixed(1);
                    return (
                      <div key={index} className="flex justify-between items-center py-1">
                        <span>{criterion.name} ({currentEvent?.gradingType === 'points' ? criterion.weight + ' points' : criterion.weight + '%'}):</span>
                        <span className="font-bold text-emerald-600">{weighted}</span>
                      </div>
                    );
                  })}
                  <div className="font-bold text-slate-800 pt-2 mt-2 border-t border-slate-300 flex justify-between items-center">
                    <span>Total:</span>
                    <span className="text-lg text-emerald-600">{(() => {
                      const total = calculateWeightedScore(formData);
                      const criteria = getCurrentEventCriteria();
                      const isPointsGrading = currentEvent?.gradingType === 'points';
                      const maxScore = isPointsGrading 
                        ? criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                        : 100;
                      return isPointsGrading ? `${total} / ${maxScore}` : `${total}%`;
                    })()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-2.5 px-4 rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all duration-300 font-bold shadow-lg shadow-emerald-500/25"
                >
                  Update Scores
                </button>
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingContestant(null); resetForm(); }}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 px-4 rounded-xl hover:bg-slate-200 transition-all duration-200 font-bold border border-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Scores Modal - Enhanced */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-2xl">📤</span>
              </div>
              <h3 className="text-xl font-bold text-slate-800">Submit Scores to Admin</h3>
            </div>
            <div className="mb-6">
              <p className="text-slate-600 mb-4">
                Are you sure you want to submit your scores to the admin? This will mark your evaluation as completed and you won't be able to make further changes.
              </p>
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 rounded-xl">
                <div className="font-bold text-slate-800">👤 Judge: {user?.displayName || user?.email}</div>
                <div className="text-sm text-slate-600 mt-1">📅 Event: {currentEvent?.eventName || 'Assigned Events'}</div>
                <div className="text-sm text-emerald-700 mt-2 font-medium">✅ Contestants Scored: {contestants.filter(c => {
                  const criteria = getCurrentEventCriteria();
                  return criteria.every(criterion => {
                    const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                    return c[key] && c[key] > 0;
                  });
                }).length} of {contestants.length}</div>
              </div>
              <div className="flex items-start gap-2 mt-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">
                <span className="text-lg">📋</span>
                <p>This action will update your submission status to 'completed' in the admin dashboard.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSubmitScores}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-2.5 px-4 rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all duration-300 font-bold shadow-lg shadow-emerald-500/25"
              >
                Submit Scores
              </button>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 bg-slate-100 text-slate-700 py-2.5 px-4 rounded-xl hover:bg-slate-200 transition-all duration-200 font-bold border border-slate-200"
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
