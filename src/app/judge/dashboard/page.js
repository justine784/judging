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
  const [quickScores, setQuickScores] = useState({});
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [slideDirection, setSlideDirection] = useState('right'); // 'left' or 'right' for slide animation
  const [isAnimating, setIsAnimating] = useState(false);
  const [lockedContestants, setLockedContestants] = useState(new Set()); // Track which contestants have locked scoring forms
  const [lockedScores, setLockedScores] = useState({}); // Track locked scores per contestant
  const [scoredContestants, setScoredContestants] = useState(new Set()); // Track which contestants have been scored in main criteria
  const [scoredContestantsFinal, setScoredContestantsFinal] = useState(new Set()); // Track which contestants have been scored in final rounds
  const [showFinalistsOnly, setShowFinalistsOnly] = useState(false); // Track if showing finalists only
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

  // Initialize quick scores when currentEvent changes
  useEffect(() => {
    if (currentEvent && contestants.length > 0) {
      const currentContestant = contestants[currentContestantIndex];
      if (currentContestant) {
        // Only initialize if we don't have any scores yet
        if (Object.keys(quickScores).length === 0) {
          const initialScores = initializeQuickScores(currentEvent, currentContestant);
          setQuickScores(initialScores);
          console.log('Initialized quickScores for event change:', currentContestant.contestantName, initialScores);
        } else {
          console.log('Preserving existing quickScores during event change:', quickScores);
        }
      }
    }
  }, [currentEvent, contestants, currentContestantIndex]);

  // Update quick scores when contestant changes - preserve locked scores
  useEffect(() => {
    if (currentEvent && contestants.length > 0 && currentContestantIndex >= 0) {
      const currentContestant = contestants[currentContestantIndex];
      if (currentContestant) {
        // Check if contestant is locked
        const isContestantLocked = currentContestant.id && lockedContestants.has(currentContestant.id);
        
        if (isContestantLocked && lockedScores[currentContestant.id]) {
          // If contestant is locked and we have saved locked scores, restore them
          const savedLockedScores = lockedScores[currentContestant.id];
          setQuickScores(savedLockedScores);
          console.log('Restored locked scores for contestant:', currentContestant.contestantName, savedLockedScores);
        } else if (Object.keys(quickScores).length > 0) {
          // If we already have quickScores (from unlock or previous navigation), preserve them
          console.log('Preserving existing quickScores for contestant:', currentContestant.contestantName, quickScores);
        } else {
          // Initialize with saved scores from contestant data (for page refresh scenario)
          const savedScores = initializeQuickScores(currentEvent, currentContestant);
          setQuickScores(savedScores);
          console.log('Initialized scores from contestant data:', currentContestant.contestantName, savedScores);
        }
      }
    }
  }, [currentContestantIndex, currentEvent?.id, contestants.length, lockedContestants, lockedScores]);

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
        
        // Load scored contestants from judge data
        if (updatedJudgeData.scoredContestants) {
          setScoredContestants(new Set(updatedJudgeData.scoredContestants));
        }
        if (updatedJudgeData.scoredContestantsFinal) {
          setScoredContestantsFinal(new Set(updatedJudgeData.scoredContestantsFinal));
        }
        
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
            
            criteria.forEach(criterion => {
              const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
              
              // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
              const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                                     criterion.name.toUpperCase().includes('1ST') && 
                                     criterion.name.toUpperCase().includes('ROUND');
              
              let score;
              if (isFirstRoundAverage) {
                // For "AVERAGE OF THE 1ST ROUND", use saved value if it exists, otherwise calculate
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
      setContestants(rankedContestants);
      
      // Set initial current contestant and initialize quick scores
      if (assignedContestants.length > 0) {
        const firstContestant = assignedContestants[0];
        setCurrentContestant({
          number: firstContestant.contestantNo || '1',
          name: firstContestant.contestantName || 'Unknown',
          category: firstContestant.category || 'Vocal Performance',
          performanceOrder: firstContestant.performanceOrder || 1,
          photo: null,
          contestantType: firstContestant.contestantType || 'solo'
        });
        
        // Initialize quick scores for the first contestant after a small delay to ensure currentEvent is set
        setTimeout(() => {
          if (currentEvent) {
            const initialScores = initializeQuickScores(currentEvent, firstContestant);
            setQuickScores(initialScores);
          }
        }, 100);
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

  // Helper function to get criteria key with proper prefix for final rounds
  const getCriteriaKey = (criterionName, useFinalRoundPrefix = false) => {
    const baseKey = criterionName.toLowerCase().replace(/\s+/g, '_');
    return useFinalRoundPrefix ? `final_${baseKey}` : baseKey;
  };

  // Initialize quick scores based on event criteria
  const initializeQuickScores = (event, contestant = null) => {
    if (!event) return {};
    
    const scores = {};
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    
    // Get criteria using the updated getCurrentEventCriteria function
    const criteria = getCurrentEventCriteria();
    
    // Check if this contestant is locked
    const isContestantLocked = contestant && contestant.id && lockedContestants.has(contestant.id);
    
    // Initialize scores for current criteria only
    criteria.forEach(criterion => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      
      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
      const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && criterion.name.toUpperCase().includes('1ST') && criterion.name.toUpperCase().includes('ROUND');
      
      if (isFirstRoundAverage && contestant) {
        // For "AVERAGE OF THE 1ST ROUND", use the saved value if it exists, otherwise calculate
        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        scores[key] = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
      } else if (usingFinalRoundCriteria) {
        // When using final round criteria, check for existing final round scores first
        const finalRoundKey = getCriteriaKey(criterion.name, true);
        scores[key] = contestant ? (contestant[finalRoundKey] || 0) : 0;
      } else {
        // For main criteria, prioritize locked scores, then saved scores, then default to 0
        if (isContestantLocked && quickScores[key] !== undefined) {
          // If contestant is locked, preserve the current quickScores
          scores[key] = quickScores[key];
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
  const getCurrentEventCriteria = () => {
    if (!currentEvent) {
      console.log('🔍 No current event found');
      return [];
    }
    
    console.log('🔍 Current event:', currentEvent);
    console.log('🔍 Event criteriaCategories:', currentEvent.criteriaCategories);
    console.log('🔍 Event legacy criteria:', currentEvent.criteria);
    
    // Use criteriaCategories if available (new structure), otherwise fall back to legacy criteria
    let criteria = [];
    
    if (currentEvent.criteriaCategories && currentEvent.criteriaCategories.length > 0) {
      // New structure: extract sub-criteria from categories, or use categories as criteria if no sub-criteria
      criteria = [];
      console.log('🔍 Processing', currentEvent.criteriaCategories.length, 'categories');
      
      currentEvent.criteriaCategories.forEach((category, catIndex) => {
        console.log(`🔍 Category ${catIndex + 1}:`, category.name);
        console.log('  - Has sub-criteria:', !!(category.subCriteria && category.subCriteria.length > 0));
        console.log('  - Sub-criteria count:', category.subCriteria ? category.subCriteria.length : 0);
        console.log('  - Total weight:', category.totalWeight);
        console.log('  - Enabled:', category.enabled);
        
        if (category.subCriteria && category.subCriteria.length > 0) {
          // Use sub-criteria if they exist
          console.log('  - Using sub-criteria');
          category.subCriteria.forEach((subCriterion, subIndex) => {
            console.log(`    - Sub-criteria ${subIndex + 1}:`, subCriterion.name, 'enabled:', subCriterion.enabled);
            if (subCriterion.enabled !== false) {
              criteria.push({
                name: subCriterion.name,
                weight: subCriterion.weight,
                enabled: subCriterion.enabled !== false,
                category: category.name,
                scoringType: category.scoringType || 'percentage'
              });
              console.log(`      ✓ Added sub-criteria: ${subCriterion.name} from category ${category.name}`);
            }
          });
        } else {
          // Use the category itself as a criterion if no sub-criteria exist
          console.log('  - Using category as direct criterion');
          if (category.enabled !== false) {
            criteria.push({
              name: category.name,
              weight: category.totalWeight || 0,
              enabled: category.enabled !== false,
              category: null, // No parent category for the category itself
              scoringType: category.scoringType || 'percentage'
            });
            console.log(`      ✓ Added category as criterion: ${category.name} with weight ${category.totalWeight}`);
          }
        }
      });
      console.log('🔍 Using criteriaCategories - extracted criteria:', criteria);
    } else if (currentEvent.criteria && currentEvent.criteria.length > 0) {
      // Legacy structure: use main event criteria
      console.log('🔍 Using legacy criteria structure');
      criteria = currentEvent.criteria.filter(c => c.enabled);
      console.log('🔍 Using legacy criteria - filtered enabled criteria:', criteria);
    } else {
      console.log('🔍 No criteria found in event');
    }
    
    console.log('🔍 Final criteria to use:', criteria);
    console.log('🔍 Total criteria count:', criteria.length);
    return criteria;
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
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
      const score = quickScores[key] || 0;
      const maxScore = isPointsGrading ? criterion.weight : 100;
      return score > maxScore;
    });
  };

  // Check if event is finished (blocking save)
  const isEventFinished = () => {
    return currentEvent && currentEvent.status === 'finished';
  };

  // Check if current contestant form is locked
  const isCurrentContestantLocked = () => {
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant || !currentContestant.id) return false;
    return lockedContestants.has(currentContestant.id);
  };

  // Toggle lock status for current contestant
  const toggleCurrentContestantLock = () => {
    const currentContestant = contestants[currentContestantIndex];
    if (!currentContestant || !currentContestant.id) return;
    
    setLockedContestants(prev => {
      const newSet = new Set(prev);
      if (newSet.has(currentContestant.id)) {
        // Unlocking contestant - remove from locked set
        newSet.delete(currentContestant.id);
        
        // Before removing locked scores, ensure quickScores has the current values
        const currentLockedScores = lockedScores[currentContestant.id];
        if (currentLockedScores) {
          // Make sure quickScores has the current values before we delete lockedScores
          setQuickScores(prev => ({ ...prev, ...currentLockedScores }));
        }
        
        // Remove saved locked scores
        setLockedScores(prev => {
          const newLockedScores = { ...prev };
          delete newLockedScores[currentContestant.id];
          return newLockedScores;
        });
        
        console.log('Unlocked contestant:', currentContestant.contestantName, 'scores preserved in quickScores');
      } else {
        // Locking contestant - add to locked set and save current scores
        newSet.add(currentContestant.id);
        // Save current quickScores for this contestant
        setLockedScores(prev => ({
          ...prev,
          [currentContestant.id]: { ...quickScores }
        }));
        console.log('Locked scores saved for contestant:', currentContestant.contestantName, quickScores);
      }
      return newSet;
    });
  };


  // Helper function to get final round
  const getFinalRound = () => {
    if (!currentEvent || !currentEvent.rounds || currentEvent.rounds.length === 0) {
      return null;
    }
    const enabledRounds = currentEvent.rounds.filter(round => round.enabled);
    return enabledRounds.length > 0 ? enabledRounds[enabledRounds.length - 1] : null;
  };


  // Helper function to check if a contestant is in final round
  const isContestantInFinalRound = (contestant) => {
    if (!currentEvent || !currentEvent.rounds || currentEvent.rounds.length === 0) {
      return false;
    }
    const finalRound = getFinalRound();
    if (!finalRound) return false;
    
    // Check if contestant has any scores for final round criteria
    return finalRound.criteria && finalRound.criteria.some(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      return contestant[key] !== undefined && contestant[key] > 0;
    });
  };

  // Helper function to get contestant's round status
  const getContestantRoundStatus = (contestant) => {
    if (!currentEvent || !currentEvent.rounds || currentEvent.rounds.length === 0) {
      return null;
    }
    
    // Check each round to see if contestant has scores
    for (let i = currentEvent.rounds.length - 1; i >= 0; i--) {
      const round = currentEvent.rounds[i];
      if (round.enabled && round.criteria) {
        const hasScores = round.criteria.some(criterion => {
          const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
          return contestant[key] !== undefined && contestant[key] > 0;
        });
        if (hasScores) {
          const finalRound = getFinalRound();
          const isFinal = finalRound && currentEvent.rounds.indexOf(finalRound) === i;
          return { roundName: round.name, isFinal, roundIndex: i };
        }
      }
    }
    
    return null;
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

  // Helper function to calculate total weighted score of first round scores for final round criteria
  const calculateFirstRoundAverage = (contestant) => {
    // When using final round criteria, return the main criteria total score
    if (usingFinalRoundCriteria && contestant.totalWeightedScore) {
      return contestant.totalWeightedScore;
    }
    
    // For main criteria mode, check if we have a saved average value first
    const averageKey = 'average_of_the_1st_round';
    if (contestant[averageKey] !== undefined) {
      return contestant[averageKey];
    }
    
    // If no saved value and we have final round scores, calculate from final round
    if (!usingFinalRoundCriteria && currentEvent && currentEvent.rounds && currentEvent.rounds.length > 0) {
      // Get the FIRST round (index 0) for calculating average, not the final round
      const firstRound = currentEvent.rounds[0];
      if (firstRound && firstRound.criteria) {
        let totalWeightedScore = 0;
        firstRound.criteria.forEach(criterion => {
          const key = getCriteriaKey(criterion.name, false); // Use main criteria keys for first round
          const score = contestant[key] || 0;
          const weight = criterion.weight / 100;
          totalWeightedScore += score * weight;
        });
        return totalWeightedScore;
      }
    }
    
    // Fallback: try to calculate from first round if available
    if (!currentEvent || !currentEvent.rounds || currentEvent.rounds.length === 0) {
      return 0;
    }
    
    // Get the FIRST round (index 0) specifically, not just any enabled round
    const firstRound = currentEvent.rounds[0];
    if (!firstRound || !firstRound.criteria || !firstRound.enabled) {
      return 0;
    }
    
    let totalWeightedScore = 0;
    
    firstRound.criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const score = contestant[key] || 0;
      const weight = criterion.weight / 100;
      totalWeightedScore += score * weight;
    });
    
    return totalWeightedScore;
  };


  const filteredContestants = contestants.filter(contestant => {
    // Apply search filter
    const matchesSearch = contestant.eventName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          contestant.contestantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          contestant.contestantNo?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply elimination filter - exclude eliminated contestants
    const isNotEliminated = !contestant.eliminated;
    
    // Apply finalists only filter
    const passesFinalistFilter = !showFinalistsOnly || getContestantRoundStatus(contestant)?.isFinal;
    
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
    
    enabledCriteria.forEach(criterion => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      
      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
      const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                             criterion.name.toUpperCase().includes('1ST') && 
                             criterion.name.toUpperCase().includes('ROUND');
      
      let score;
      if (isFirstRoundAverage) {
        // For "AVERAGE OF THE 1ST ROUND", use saved value if it exists, otherwise calculate
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
    if (currentContestantIndex > 0) {
      const newIndex = currentContestantIndex - 1;
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
        photo: null,
        contestantType: contestant.contestantType || 'solo'
      });
      // Update quick scores to match the next contestant's saved scores
      const newQuickScores = initializeQuickScores(currentEvent, contestant);
      setQuickScores(newQuickScores);
      // Force selector re-render
      setSelectorKey(prev => prev + 1);
    }
  };

  const selectContestantByIndex = (index) => {
    if (index >= 0 && index < contestants.length) {
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
        // Update quick scores to match current contestant scores based on event criteria
        const newQuickScores = initializeQuickScores(currentEvent, contestant);
        setQuickScores(newQuickScores);
        // Force selector re-render
        setSelectorKey(prev => prev + 1);
        
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
  const handleQuickScoreChange = (criteria, value) => {
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
    
    setQuickScores(prev => ({
      ...prev,
      [criteria]: finalValue
    }));
  };

  const calculateQuickTotal = () => {
    const criteria = getCurrentEventCriteria();
    if (criteria.length === 0) return '0.0';
    
    const useFinalRoundPrefix = usingFinalRoundCriteria;
    let totalScore = 0;
    const isPointsGrading = currentEvent?.gradingType === 'points';
    
    criteria.forEach(criterion => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      
      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
      const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                             criterion.name.toUpperCase().includes('1ST') && 
                             criterion.name.toUpperCase().includes('ROUND');
      
      let score;
      if (isFirstRoundAverage && contestants[currentContestantIndex]) {
        // For "AVERAGE OF THE 1ST ROUND", use the saved value if it exists, otherwise calculate
        const contestant = contestants[currentContestantIndex];
        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
      } else {
        // For other criteria, use quickScores value
        score = quickScores[key] || 0;
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
    
    // Otherwise, use the real-time calculation from quickScores
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
    
    criteria.forEach(criterion => {
      const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
      
      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
      const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                             criterion.name.toUpperCase().includes('1ST') && 
                             criterion.name.toUpperCase().includes('ROUND');
      
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
        criteria.forEach(criterion => {
          const useFinalRoundPrefix = usingFinalRoundCriteria;
          const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
          
          // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
          const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                                 criterion.name.toUpperCase().includes('1ST') && 
                                 criterion.name.toUpperCase().includes('ROUND');
          
          let score;
          if (isFirstRoundAverage) {
            // For "AVERAGE OF THE 1ST ROUND", use saved value if it exists, otherwise calculate
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
          criteria.forEach(criterion => {
            const useFinalRoundPrefix = usingFinalRoundCriteria;
            const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
            
            // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
            const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                                   criterion.name.toUpperCase().includes('1ST') && 
                                   criterion.name.toUpperCase().includes('ROUND');
            
            let score;
            if (isFirstRoundAverage) {
              // For "AVERAGE OF THE 1ST ROUND", use saved value if it exists, otherwise calculate
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
            timestamp: new Date().toISOString()
          };
          
          // Add individual criteria scores to the score data
          criteria.forEach(criterion => {
            const useFinalRoundPrefix = usingFinalRoundCriteria;
            const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
            
            // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
            const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                                   criterion.name.toUpperCase().includes('1ST') && 
                                   criterion.name.toUpperCase().includes('ROUND');
            
            let score;
            if (isFirstRoundAverage) {
              // For "AVERAGE OF THE 1ST ROUND", use saved value if it exists, otherwise calculate
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
        console.log('📊 Quick Scores:', quickScores);
        
        // Save score to Firestore scores collection
        // Create scores object with correct first round total
        const scoresToSave = { ...quickScores };
        
        // Check if we have "AVERAGE OF THE 1ST ROUND" criterion
        const currentCriteria = getCurrentEventCriteria();
        const averageCriterion = currentCriteria.find(criterion => 
          criterion.name.toUpperCase().includes('AVERAGE') && 
          criterion.name.toUpperCase().includes('1ST') && 
          criterion.name.toUpperCase().includes('ROUND')
        );
        
        if (averageCriterion) {
          const averageKey = averageCriterion.name.toLowerCase().replace(/\s+/g, '_');
          // Preserve the original average of the 1st round value - never change it
          scoresToSave[averageKey] = contestant[averageKey] || 0;
        }
        
        const scoreData = {
          contestantId: contestant.id,
          contestantName: contestant.contestantName,
          contestantNo: contestant.contestantNo,
          eventId: contestant.eventId,
          eventName: contestant.eventName,
          judgeId: user.uid,
          judgeName: user.displayName || user.email,
          judgeEmail: user.email,
          scores: scoresToSave,
          criteria: getCurrentEventCriteria(),
          totalScore: totalScore,
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
            const updatedScores = { ...quickScores };
            
            // Check if we have "AVERAGE OF THE 1ST ROUND" criterion
            const currentCriteria = getCurrentEventCriteria();
            const averageCriterion = currentCriteria.find(criterion => 
              criterion.name.toUpperCase().includes('AVERAGE') && 
              criterion.name.toUpperCase().includes('1ST') && 
              criterion.name.toUpperCase().includes('ROUND')
            );
            
            if (averageCriterion) {
              const averageKey = averageCriterion.name.toLowerCase().replace(/\s+/g, '_');
              // Preserve the original average of the 1st round value - never change it
              updatedScores[averageKey] = contestant[averageKey] || 0;
            }
            
            // When using final round criteria, only update final round criteria scores
            // Preserve main criteria scores by not overwriting them
            if (usingFinalRoundCriteria) {
              // Only update final round criteria fields, keep main criteria intact
              updatedContestant = { 
                ...c, 
                // Only update final round criteria scores with prefixed keys
                ...Object.fromEntries(
                  Object.entries(updatedScores).map(([key, value]) => {
                    // For final round mode, ensure we use prefixed keys for storage
                    if (usingFinalRoundCriteria && !key.startsWith('final_')) {
                      const criterion = currentCriteria.find(c => 
                        getCriteriaKey(c.name, false) === key
                      );
                      if (criterion) {
                        const finalKey = getCriteriaKey(criterion.name, true);
                        return [finalKey, value];
                      }
                    }
                    return [key, value];
                  })
                ),
                // Always update totalWeightedScore with the calculated total
                totalWeightedScore: parseFloat(totalScore.toFixed(1))
              };
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
              scores: quickScores,
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
              criteria.forEach(criterion => {
                const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                
                // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
                const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                                       criterion.name.toUpperCase().includes('1ST') && 
                                       criterion.name.toUpperCase().includes('ROUND');
                
                let score;
                if (isFirstRoundAverage) {
                  // For "AVERAGE OF THE 1ST ROUND", use saved value if it exists, otherwise calculate
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
        
        // Force a re-render by updating the current contestant index
        setCurrentContestantIndex(prev => prev);
        
        // Also update quickScores to ensure consistency
        setQuickScores(prev => ({ ...prev }));
        
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
        
        // Show success message
        const hasNextContestant = currentContestantIndex < contestants.length - 1;
        const message = hasNextContestant 
          ? `Scores saved for ${currentContestant.name}!\n\nMoving to next contestant...`
          : `Scores saved for ${currentContestant.name}!\n\nAll contestants scored!`;
        alert(message);
        
        // Force immediate contestants reload to ensure showcase updates instantly
        if (user && judgeData && judgeData.uid === user.uid) {
          console.log('🔄 Force reloading contestants for immediate showcase update...');
          await loadContestants(judgeData);
        }
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Real-time Update Notification */}
      {showUpdateNotification && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-black px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-pulse">
          <span className="text-lg">🔄</span>
          <div>
            <p className="font-semibold">Events Updated!</p>
            <p className="text-sm">Your assigned events have been updated in real-time.</p>
          </div>
          <button
            onClick={() => setShowUpdateNotification(false)}
            className="ml-4 text-black hover:text-black"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header className="relative w-full shadow-xl border-b border-emerald-500/20 sticky top-0 z-40 overflow-hidden">
        {/* Background Image with Gradient Overlay */}
        <div className="absolute inset-0">
          <Image
            src="/header1.jpg"
            alt="Header Background"
            fill
            className="object-cover"
            priority
          />
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/90 via-emerald-700/85 to-emerald-800/90"></div>
          {/* Additional transparent overlay for better text readability */}
          <div className="absolute inset-0 bg-black/20"></div>
        </div>

        <div className="relative w-full px-4 sm:px-6 lg:px-8">
          <div className="py-4 sm:py-6">
            {/* Main Header Row */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Left Section - Title and Info */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm shadow-2xl p-1 border border-white/30">
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
                    <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                      Judge Dashboard
                    </h1>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <p className="text-sm text-white font-medium drop-shadow-md">
                        Welcome back,
                      </p>
                      <p className="text-sm font-semibold text-white bg-white/25 px-2 py-1 rounded-md backdrop-blur-sm border border-white/40 drop-shadow-md">
                        {user?.displayName || user?.email?.split('@')[0] || 'Judge'}
                      </p>
                    </div>
                    {judgeData?.judgeId && (
                      <p className="text-xs text-white/90 mt-1 drop-shadow-md">
                        Judge ID: {judgeData.judgeId}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Section - Status and Controls */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-end">
                {/* Connection Status - Hidden on mobile */}
                <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-white/15 backdrop-blur-sm rounded-lg border border-white/30 drop-shadow-lg">
                  <div className="flex items-center gap-2 text-cyan-300">
                    <div className="relative w-3 h-3 rounded-full bg-cyan-400">
                      <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping"></div>
                    </div>
                    <span className="font-medium text-sm drop-shadow-md">🟢 Live</span>
                  </div>
                  <div className="h-4 w-px bg-white/30"></div>
                  <div className="text-xs text-white drop-shadow-md">
                    <div className="font-medium">Updated</div>
                    <div>{lastUpdated ? lastUpdated.toLocaleTimeString() : 'Just now'}</div>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="self-end sm:self-auto px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 flex items-center gap-2 shadow-lg border border-red-400/30 drop-shadow-lg"
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
                <p className="text-xs sm:text-sm text-black/70 font-medium">
                  Active Contestants
                </p>
                <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-700 to-blue-900 bg-clip-text text-transparent">
                  {filteredContestants.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-blue-50/30 rounded-xl sm:rounded-2xl shadow-lg border border-blue-100/50 p-4 sm:p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-xl sm:text-2xl">🎯</span>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-black/70 font-medium">Criteria Count</p>
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
                <p className="text-xs sm:text-sm text-black/70 font-medium">
                  Completed Evaluations
                </p>
                <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-green-700 to-green-900 bg-clip-text text-transparent">
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
        </div>

        {/* Event Information */}
        {assignedEvents.length > 0 && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 text-black">
            {/* Event Selector */}
            {assignedEvents.length > 1 && (
              <div className="mb-4">
                <label className="text-xs sm:text-sm font-medium text-black block mb-2">Select Event to Judge:</label>
                <select
                  value={currentEvent?.id || ''}
                  onChange={(e) => {
                    const selectedEvent = assignedEvents.find(event => event.id === e.target.value);
                    if (selectedEvent) {
                      setCurrentEvent(selectedEvent);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-white/20 border border-white/30 text-black focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  {assignedEvents.map(event => (
                    <option key={event.id} value={event.id} className="text-black">
                      {event.eventName} - {event.date} at {event.time}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Current Event Details */}
            {assignedEvents.map((event) => (
              currentEvent?.id === event.id && (
                <div key={event.id}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs sm:text-sm font-medium text-black">Event Name</label>
                      <p className="font-semibold text-black text-sm sm:text-base truncate">{event.eventName}</p>
                    </div>
                    <div>
                      <label className="text-xs sm:text-sm font-medium text-black">Date & Time</label>
                      <p className="font-semibold text-black text-sm sm:text-base">{event.date} at {event.time}</p>
                    </div>
                    <div>
                      <label className="text-xs sm:text-sm font-medium text-black">Venue</label>
                      <p className="font-semibold text-black text-sm sm:text-base truncate">{event.venue}</p>
                    </div>
                    <div>
                      <label className="text-xs sm:text-sm font-medium text-black">Status</label>
                      <span className={`inline-flex items-center gap-1 px-2 sm:px-3 py-1 text-xs font-bold rounded-full ${
                        event.status === 'upcoming' ? 'bg-yellow-100 text-black' :
                        event.status === 'ongoing' ? 'bg-green-100 text-black' :
                        'bg-gray-100 text-black'
                      }`}>
                        <span>{event.status === 'upcoming' ? '📅' : event.status === 'ongoing' ? '🎭' : '✅'}</span>
                        <span className="hidden sm:inline">{event.status.charAt(0).toUpperCase() + event.status.slice(1)}</span>
                        <span className="sm:hidden">{event.status === 'upcoming' ? 'Up' : event.status === 'ongoing' ? 'On' : 'Fi'}</span>
                      </span>
                    </div>
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
          <div className={`bg-white rounded-2xl shadow-lg overflow-hidden mb-4 border-2 border-emerald-200 transition-all duration-300 ${
            isAnimating ? (slideDirection === 'left' ? 'slide-exit-left' : 'slide-exit-right') : (slideDirection === 'left' ? 'slide-enter-left' : 'slide-enter-right')
          }`}>
            {/* Card Header: Contestant Info */}
            <div className="bg-emerald-600 text-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold truncate transition-all duration-300">{currentContestant.name}</h2>
                    {currentContestant.contestantType === 'group' ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-purple-100 text-black rounded-full flex-shrink-0" title="Group Contestant">
                        👥 Group
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-100 text-black rounded-full flex-shrink-0" title="Solo Contestant">
                        Solo
                      </span>
                    )}
                    {isCurrentContestantScored() && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-100 text-black rounded-full flex-shrink-0">
                        ✅ Scored
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white truncate transition-all duration-300">#{currentContestant.number}</p>
                </div>
                <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full whitespace-nowrap ml-2">
                  {currentContestantIndex + 1}/{contestants.length}
                </span>
              </div>
              
              {/* Progress Indicator */}
              <div>
                <div className="flex items-center justify-between text-xs text-white mb-2">
                  <span>Progress</span>
                  <span>{Math.round(((currentContestantIndex + 1) / contestants.length) * 100)}%</span>
                </div>
                <div className="w-full bg-emerald-400 rounded-full h-2">
                  <div 
                    className="bg-white h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentContestantIndex + 1) / contestants.length) * 100}%` }}
                  ></div>
                </div>
                <p className="text-xs text-white mt-2">👆 Swipe left/right to navigate</p>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="px-4 py-3 border-b border-gray-200 flex gap-2">
              <button
                onClick={() => selectContestantByIndex(currentContestantIndex - 1)}
                disabled={currentContestantIndex === 0}
                className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-lg font-medium transition-colors text-sm"
              >
                ← Previous
              </button>
              <button
                onClick={() => selectContestantByIndex(currentContestantIndex + 1)}
                disabled={currentContestantIndex === contestants.length - 1}
                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm"
              >
                Next →
              </button>
            </div>

            {/* Card Body: Quick Scoring */}
            <div className="p-4 sm:p-6 max-h-[600px] overflow-y-auto">
              {/* Warning Banner */}
              {currentEvent && (currentEvent.scoresLocked || currentEvent.status === 'upcoming') && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <span className="text-2xl flex-shrink-0">🚫</span>
                    <div>
                      <h4 className="text-sm font-semibold text-black">
                        {currentEvent.scoresLocked ? 'Scoring Locked' : 'Event Not Started'}
                      </h4>
                      <p className="text-xs text-black mt-1">
                        {currentEvent.scoresLocked 
                          ? 'The administrator has locked scoring for this event.'
                          : 'This event has not started yet. Scoring will be available when the event is ongoing.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Scoring Criteria */}
              <div className="space-y-3 mb-4">
                {getCurrentEventCriteria().length > 0 ? (
                  getCurrentEventCriteria().map((criterion, index) => {
                  const useFinalRoundPrefix = usingFinalRoundCriteria;
                  const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                  
                  // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
                  const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && criterion.name.toUpperCase().includes('1ST') && criterion.name.toUpperCase().includes('ROUND');
                  
                  // For "AVERAGE OF THE 1ST ROUND", show saved value if it exists, otherwise use quickScores
                  let score;
                  if (isFirstRoundAverage && contestants[currentContestantIndex]) {
                    const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                    score = contestants[currentContestantIndex][originalKey] !== undefined 
                      ? contestants[currentContestantIndex][originalKey] 
                      : calculateFirstRoundAverage(contestants[currentContestantIndex]);
                  } else {
                    score = quickScores[key] || 0;
                  }
                    
                  const colors = ['blue', 'green', 'purple', 'orange', 'pink'];
                  const color = colors[index % colors.length];
                  
                  // Determine grading type and max score
                  const isPointsGrading = currentEvent?.gradingType === 'points';
                  const criterionMaxScore = isPointsGrading ? criterion.weight : 100;
                  
                  return (
                    <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <label className="text-sm font-semibold text-black truncate">
                            {criterion.name}
                          </label>
                          {criterion.category && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full flex-shrink-0">
                              {criterion.category}
                            </span>
                          )}
                          {isFirstRoundAverage && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-red-100 text-black rounded-full flex-shrink-0" title="This score is locked and cannot be changed">
                              🔒
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded">
                            {isPointsGrading ? `${criterion.weight} pts` : `${criterion.weight}%`}
                          </span>
                          <span className={`text-sm font-bold text-${color}-600`}>
                            {formatScoreDisplay(score, criterion.weight, isPointsGrading)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max={criterionMaxScore}
                          step="0.1"
                          value={score}
                          onChange={(e) => handleQuickScoreChange(key, e.target.value)}
                          disabled={isCurrentContestantLocked() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming' || isFirstRoundAverage || isCurrentContestantScored()}
                          className={`flex-1 h-2 bg-${color}-200 rounded-lg appearance-none cursor-pointer ${
                            isCurrentContestantLocked() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming' || isFirstRoundAverage || isCurrentContestantScored() ? 'opacity-50 cursor-not-allowed' : ''
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
                            handleQuickScoreChange(key, newValue);
                          }}
                          disabled={isCurrentContestantLocked() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming' || isFirstRoundAverage || isCurrentContestantScored()}
                          className={`w-16 px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-center text-xs font-medium ${
                            !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming' || isFirstRoundAverage || isCurrentContestantScored ? 'bg-gray-100 cursor-not-allowed' : ''
                          }`}
                        />
                      </div>
                      <div className="mt-1 text-xs text-black text-right">
                        → {formatScoreDisplay(score, criterionMaxScore, isPointsGrading)}
                      </div>
                    </div>
                  );
                })
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                    <div className="text-amber-800">
                      <span className="text-2xl mb-2 block">⚠️</span>
                      <h3 className="font-semibold text-sm mb-2">No Scoring Criteria Available</h3>
                      <p className="text-xs text-amber-700">
                        This event doesn't have any scoring criteria set up. Please contact the administrator to configure the criteria for this event.
                      </p>
                      {currentEvent && (
                        <div className="mt-3 text-xs text-amber-600">
                          <p>Event: {currentEvent.eventName}</p>
                          <p>Event ID: {currentEvent.id}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Total Score */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-3 border border-green-200 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-black">Total Weighted Score</span>
                    <div className="text-xs text-black">
                      Maximum {currentEvent?.gradingType === 'points' 
                        ? currentEvent.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                        : '100.0'
                      }
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-black">{getDisplayTotalScore()}</span>
                </div>
                {((currentEvent?.gradingType === 'points' 
                      ? parseFloat(getDisplayTotalScore()) >= currentEvent.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                      : parseFloat(getDisplayTotalScore()) >= 100)) && (
                  <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded mt-2 border border-amber-200">
                    ⚠️ Score capped at maximum of {currentEvent?.gradingType === 'points' 
                      ? currentEvent.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                      : '100'
                    }
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={saveQuickScores}
                  disabled={isCurrentContestantScored() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming'}
                  className={`w-full px-4 py-2 rounded-lg transition-colors font-medium shadow-lg text-sm ${
                    isCurrentContestantScored() || !currentEvent || currentEvent.scoresLocked || currentEvent.status === 'upcoming'
                      ? 'bg-gray-400 text-black cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-black'
                  }`}
                >
                  💾 {isCurrentContestantScored() ? 'Score Saved' : 'Save Scores'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={toggleCurrentContestantLock}
                    className={`px-4 py-2 rounded-lg transition-colors font-medium shadow text-sm flex items-center justify-center gap-1 ${
                      isCurrentContestantLocked() 
                        ? 'bg-red-600 hover:bg-red-700 text-black' 
                        : 'bg-amber-600 hover:bg-amber-700 text-black'
                    }`}
                  >
                    {isCurrentContestantLocked() ? '🔒 Locked' : '🔓 Unlock'}
                  </button>
                  <button
                    onClick={openSubmitModal}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow text-sm"
                  >
                    📤 Submit
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Hints */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center mb-3">
            <p className="text-xs text-emerald-800 font-medium">
              ← Swipe to move between contestants →
            </p>
          </div>

          {/* Scoring Tip */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <p className="text-xs text-amber-800 font-medium">
              💡 <strong>Tip:</strong> Once you save scores for a contestant, you won't be able to modify them again. Make sure your scores are final before saving!
            </p>
          </div>
        </div>

        {/* Desktop Layout - Multiple Contestant Scoring Cards */}
        <div className="hidden lg:block">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-black">Contestant Scoring Cards</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => selectContestantByIndex(Math.max(0, currentContestantIndex - 3))}
                  disabled={currentContestantIndex === 0}
                  className="px-3 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-lg font-medium transition-colors"
                >
                  ← Previous 6
                </button>
                <span className="text-sm text-black font-medium">
                  Showing {Math.max(0, currentContestantIndex - 2) + 1}-{Math.min(contestants.length, currentContestantIndex + 3)} of {contestants.length}
                </span>
                <button
                  onClick={() => selectContestantByIndex(Math.min(contestants.length - 1, currentContestantIndex + 3))}
                  disabled={currentContestantIndex >= contestants.length - 1}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  Next 6 →
                </button>
              </div>
            </div>
          </div>

          {/* Contestant Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {contestants.slice(Math.max(0, currentContestantIndex - 2), Math.min(contestants.length, currentContestantIndex + 4)).map((contestant, cardIndex) => {
              const actualIndex = Math.max(0, currentContestantIndex - 2) + cardIndex;
              const isCurrentCard = actualIndex === currentContestantIndex;
              const useFinalRoundPrefix = usingFinalRoundCriteria;
              
              return (
                <div key={contestant.id} className={`bg-white rounded-2xl shadow-lg overflow-hidden border-2 transition-all duration-300 ${
                  isCurrentCard ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-200'
                }`}>
                  {/* Card Header */}
                  <div className={`text-black p-4 ${
                    isCurrentCard 
                      ? 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800' 
                      : 'bg-gradient-to-r from-gray-500 to-gray-600'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            <div className="text-3xl lg:text-4xl font-bold text-black/95">#{contestant.contestantNo}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold truncate text-black/90">{contestant.contestantName}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              {contestant.contestantType === 'group' ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-black rounded-full" title="Group Contestant">
                                  👥 Group
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full" title="Solo Contestant">
                                  Solo
                                </span>
                              )}
                              {isCurrentCard && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-green-100 text-black rounded-full">
                                  📍 Current
                                </span>
                              )}
                            </div>
                            <p className="text-xs opacity-75 mt-1">Performance #{contestant.performanceOrder}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{actualIndex + 1}</div>
                        <div className="text-xs opacity-75">of {contestants.length}</div>
                      </div>
                    </div>
                  </div>

                  {/* Card Body - Compact Scoring Form */}
                  <div className="p-4">
                    {isCurrentCard ? (
                      // Current contestant - full scoring form
                      <div>
                        <h4 className="text-lg font-bold text-black mb-3">Scoring Form</h4>
                        
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

                        {/* Compact Scoring Grid */}
                        <div className="grid grid-cols-1 gap-2 mb-4">
                          {getCurrentEventCriteria().map((criterion, index) => {
                            const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                            const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && criterion.name.toUpperCase().includes('1ST') && criterion.name.toUpperCase().includes('ROUND');
                            let score;
                            if (isFirstRoundAverage && contestant) {
                              const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                              score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
                            } else {
                              score = quickScores[key] || 0;
                            }
                            const colors = ['blue', 'green', 'purple', 'orange', 'pink'];
                            const color = colors[index % colors.length];
                            
                            // Determine grading type and max score
                            const isPointsGrading = currentEvent?.gradingType === 'points';
                            const criterionMaxScore = isPointsGrading ? criterion.weight : 100;
                            const scoreDisplayFormat = formatScoreDisplay(score, criterionMaxScore, isPointsGrading);
                            const isOverMax = isPointsGrading ? score > criterionMaxScore : score > 100;
                            
                            return (
                              <div key={index} className={`bg-gray-50 rounded-lg p-2 border-2 ${
                                isOverMax ? 'border-red-300 bg-red-50' : 'border-gray-200'
                              }`}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <label className="font-semibold text-black text-xs">
                                      {criterion.name}
                                    </label>
                                    {criterion.category && (
                                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full flex-shrink-0">
                                        {criterion.category}
                                      </span>
                                    )}
                                    {isFirstRoundAverage && (
                                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-red-100 text-black rounded-full flex-shrink-0" title="This score is locked and cannot be changed">
                                        🔒
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded">
                                      {isPointsGrading ? `${criterion.weight} pts` : `${criterion.weight}%`}
                                    </span>
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                                      isOverMax 
                                        ? 'text-black bg-red-100 border border-red-300' 
                                        : 'text-black bg-emerald-50'
                                    }`}>
                                      {scoreDisplayFormat}
                                    </span>
                                  </div>
                                </div>
                                {isOverMax && (
                                  <div className="mb-2 p-1 bg-red-100 border border-red-300 rounded text-xs text-black font-medium">
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
                                    onChange={(e) => handleQuickScoreChange(key, e.target.value)}
                                    disabled={isCurrentContestantLocked() || isFirstRoundAverage || isCurrentContestantScored()}
                                    className={`flex-1 h-1 bg-${color}-200 rounded-lg appearance-none cursor-pointer ${
                                      isCurrentContestantLocked() || isFirstRoundAverage || isCurrentContestantScored() ? 'opacity-50 cursor-not-allowed' : ''
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
                                      handleQuickScoreChange(key, newValue);
                                    }}
                                    disabled={isCurrentContestantLocked() || isFirstRoundAverage || isCurrentContestantScored()}
                                    className={`w-16 px-1 py-1 border rounded text-center font-semibold text-xs ${
                                      isOverMax 
                                        ? 'border-red-300 bg-red-100 text-black' 
                                        : 'border-gray-300'
                                    } ${
                                      isFirstRoundAverage || isCurrentContestantScored ? 'bg-gray-100 cursor-not-allowed' : ''
                                    }`}
                                  />
                                </div>
                              </div>
                            );
                          })}
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
                            {!currentEvent ? '🔄 Loading...' : currentEvent.status === 'upcoming' ? '📅 Event Upcoming' : isEventFinished() ? '🏁 Event Finished' : hasInvalidScores() ? '⚠️ Invalid Scores' : isCurrentContestantLocked() ? '🔒 Locked' : '💾 Save'}
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
                        <div className="space-y-2">
                          {getCurrentEventCriteria().map((criterion, index) => {
                            const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                            const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && criterion.name.toUpperCase().includes('1ST') && criterion.name.toUpperCase().includes('ROUND');
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
                              <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
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
                          className="w-full mt-3 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm transition-colors"
                        >
                          Select This Contestant
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spacing between cards and table */}
        <div className="mb-8 sm:mb-12"></div>

        {/* Scoring Table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6 sm:mb-8">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">📊 Contestant Scoring</h2>
                <p className="text-white text-xs sm:text-sm">Evaluate and score contestants</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 sm:flex-initial">
                  <input
                    type="text"
                    placeholder="Search contestants..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="w-full sm:w-64 px-3 sm:px-4 py-2 pl-8 sm:pl-10 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-emerald-50 text-black placeholder-gray-500 text-sm"
                  />
                  <span className="absolute left-2.5 sm:left-3 top-2.5 text-black text-sm">🔍</span>
                </div>
                
                {/* Final Rounds Button */}
                {getFinalRound() && !usingFinalRoundCriteria && (
                  <button
                    onClick={() => {
                      const finalRound = getFinalRound();
                      if (finalRound && finalRound.criteria) {
                        // Store original criteria
                        setOriginalEventCriteria(currentEvent.criteria);
                        
                        // Update current event criteria to use final round criteria
                        const updatedEvent = {
                          ...currentEvent,
                          criteria: finalRound.criteria
                        };
                        setCurrentEvent(updatedEvent);
                        setUsingFinalRoundCriteria(true);
                        setSelectorKey(prev => prev + 1); // Force re-render
                        
                        // Reinitialize quick scores for the new criteria
                        if (contestants[currentContestantIndex]) {
                          const newQuickScores = initializeQuickScores(updatedEvent, contestants[currentContestantIndex]);
                          setQuickScores(newQuickScores);
                        }
                        
                        alert(`🏆 Final Rounds Mode Activated\n\nSwitched to final round criteria.\nYou can now score contestants independently using the final round criteria.`);
                      }
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-yellow-400 to-orange-400 text-black rounded-lg hover:from-yellow-500 hover:to-orange-500 transition-all duration-200 text-sm font-medium shadow-lg border border-yellow-300 whitespace-nowrap"
                    title="Switch to Final Rounds scoring criteria"
                  >
                    🏆 Final Rounds
                  </button>
                )}
                
                {/* Back to Main Criteria Button */}
                {usingFinalRoundCriteria && (
                  <button
                    onClick={() => {
                      if (originalEventCriteria) {
                        // Restore original criteria
                        const updatedEvent = {
                          ...currentEvent,
                          criteria: originalEventCriteria
                        };
                        setCurrentEvent(updatedEvent);
                        setUsingFinalRoundCriteria(false);
                        setSelectorKey(prev => prev + 1); // Force re-render
                        
                        // Reinitialize quick scores for the restored criteria
                        if (contestants[currentContestantIndex]) {
                          const newQuickScores = initializeQuickScores(updatedEvent, contestants[currentContestantIndex]);
                          setQuickScores(newQuickScores);
                        }
                      }
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 text-sm font-medium shadow-lg border border-emerald-300 whitespace-nowrap"
                    title="Switch back to main scoring criteria"
                  >
                    📋 Main Criteria
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {contestants.length > 0 ? (
            <div className="overflow-x-auto overflow-y-hidden max-w-full">
              {/* Table Controls */}
              <div className="flex justify-between items-center mb-4 px-2">
                <div className="flex items-center gap-2">
                  {/* Scoring mode indicator */}
                  <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full ${
                    usingFinalRoundCriteria 
                      ? 'bg-gradient-to-r from-yellow-100 to-orange-100 text-black border border-yellow-300' 
                      : 'bg-gradient-to-r from-blue-100 to-cyan-100 text-black border border-blue-300'
                  }`}>
                    {usingFinalRoundCriteria ? '🏆 Final Rounds Mode' : '📋 Main Criteria Mode'}
                  </span>
                  
                  {/* Finalists Only Filter */}
                  {getFinalRound() && (
                    <button
                      onClick={() => setShowFinalistsOnly(!showFinalistsOnly)}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                        showFinalistsOnly 
                          ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-black border-purple-300 shadow-lg' 
                          : 'bg-gray-200 text-black border-gray-300 hover:bg-gray-300'
                      }`}
                      title={showFinalistsOnly ? "Show all contestants" : "Show finalists only"}
                    >
                      {showFinalistsOnly ? '🏆 Finalists Only' : '👥 All Contestants'}
                    </button>
                  )}
                </div>
                
                {/* Horizontal scroll indicator - Mobile only */}
                <div className="flex gap-2 lg:hidden">
                  <button 
                    onClick={() => document.querySelector('.judge-scoring-table')?.scrollBy({ left: -200, behavior: 'smooth' })}
                    className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 rounded-lg text-xs font-medium text-black transition-colors"
                  >
                    ←
                  </button>
                  <button 
                    onClick={() => document.querySelector('.judge-scoring-table')?.scrollBy({ left: 200, behavior: 'smooth' })}
                    className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 rounded-lg text-xs font-medium text-black transition-colors"
                  >
                    →
                  </button>
                </div>
              </div>
              <table key={`contestants-table-${contestants.length}`} className="w-full min-w-[800px] judge-scoring-table">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase tracking-wider w-16">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase tracking-wider w-16">No.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase tracking-wider min-w-[120px]">Contestant</th>
                    {(() => {
                    // When showing finalists only, show final round criteria in header
                    const shouldShowFinalRoundCriteria = showFinalistsOnly && getFinalRound();
                    const criteriaToShow = shouldShowFinalRoundCriteria ? getFinalRound().criteria : getCurrentEventCriteria();
                    
                    return criteriaToShow.map((criterion, index) => (
                      <th key={index} className="px-4 py-3 text-center text-xs font-semibold text-black uppercase tracking-wider min-w-[100px]">
                        <div className="hidden sm:block">
                          <div className="font-medium">{criterion.name}</div>
                          {criterion.category && (
                            <div className="text-xs text-black mt-1">{criterion.category}</div>
                          )}
                          <div className="text-xs text-black mt-1">
                            ({criterion.scoringType === 'points' || currentEvent?.gradingType === 'points' ? `${criterion.weight} pts` : `${criterion.weight}%`})
                          </div>
                        </div>
                        <div className="sm:hidden text-xs">
                          {criterion.name.length > 8 ? criterion.name.substring(0, 8) + '...' : criterion.name}
                          <div className="text-xs text-black">
                            ({criterion.scoringType === 'points' || currentEvent?.gradingType === 'points' ? `${criterion.weight} pts` : `${criterion.weight}%`})
                          </div>
                        </div>
                      </th>
                    ));
                  })()}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-black uppercase tracking-wider w-24">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase tracking-wider w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredContestants.map((contestant) => {
                    // Check if contestant has any scores (more reliable than just checking scored sets)
                    const hasScores = getCurrentEventCriteria().some(criterion => {
                      const key = getCriteriaKey(criterion.name, usingFinalRoundCriteria);
                      
                      // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
                      const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && 
                                             criterion.name.toUpperCase().includes('1ST') && 
                                             criterion.name.toUpperCase().includes('ROUND');
                      
                      if (isFirstRoundAverage) {
                        const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                        return contestant[originalKey] !== undefined && contestant[originalKey] > 0;
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
                    
                    return (
                      <tr key={contestant.id} className={`hover:bg-gray-50 transition-colors ${isScored ? 'bg-green-50' : ''} ${contestant.rank === 1 ? 'ring-2 ring-yellow-400 ring-opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          {contestant.rank ? (
                            <div className="flex items-center justify-center gap-1">
                              {contestant.rank === 1 && (
                                <span className="text-black text-lg" title="Current Leader">👑</span>
                              )}
                              <span className={`inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-bold ${getRankColor(contestant.rank)}`}>
                                {contestant.rank}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-medium bg-gray-200 text-black">
                              -
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs sm:text-sm font-medium text-black">{contestant.contestantNo}</td>
                        <td className="px-4 py-3 text-xs sm:text-sm text-black">
                          <div className="flex items-center gap-2">
                            <div className="truncate font-medium">{contestant.contestantName}</div>
                            {contestant.contestantType === 'group' ? (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-purple-100 text-black rounded-full" title="Group Contestant">
                                👥
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-black rounded-full" title="Solo Contestant">
                                Solo
                              </span>
                            )}
                            {getContestantRoundStatus(contestant)?.isFinal && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-bold bg-gradient-to-r from-yellow-400 to-orange-400 text-black rounded-full shadow-sm" title="Final Round Contestant">
                                🏆
                              </span>
                            )}
                            {hasScores && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-black rounded-full" title="Has Scores">
                                📋
                              </span>
                            )}
                            {hasScores && usingFinalRoundCriteria && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-black rounded-full" title="Final Rounds Scored">
                                🏆
                              </span>
                            )}
                          </div>
                        </td>
                        {getCurrentEventCriteria().map((criterion, index) => {
                          // When showing finalists only and contestant is a finalist, force final round criteria
                          const shouldForceFinalRound = showFinalistsOnly && getContestantRoundStatus(contestant)?.isFinal;
                          const useFinalRoundPrefix = usingFinalRoundCriteria || shouldForceFinalRound;
                          const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                          
                          // Check if this is "AVERAGE OF THE 1ST ROUND" criterion
                          const isFirstRoundAverage = criterion.name.toUpperCase().includes('AVERAGE') && criterion.name.toUpperCase().includes('1ST') && criterion.name.toUpperCase().includes('ROUND');
                          
                          // For "AVERAGE OF THE 1ST ROUND", use saved value if it exists, otherwise calculate
                          let score;
                          if (isFirstRoundAverage) {
                            const originalKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
                            score = contestant[originalKey] !== undefined ? contestant[originalKey] : calculateFirstRoundAverage(contestant);
                          } else {
                            score = contestant[key] || 0;
                          }
                          
                          const colors = ['bg-blue-100 text-black', 'bg-cyan-100 text-cyan-800', 'bg-sky-100 text-sky-800', 'bg-green-100 text-black', 'bg-yellow-100 text-black'];
                          const colorClass = colors[index % colors.length];
                          const hasScore = score > 0;
                          return (
                            <td key={index} className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center justify-center px-2 py-1 text-xs sm:text-sm font-medium ${hasScore ? colorClass : 'bg-gray-100 text-black'} rounded-full ${hasScore ? 'shadow-sm' : ''}`}>
                                {formatScoreDisplay(score, 100, false)}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center px-2 py-1 text-xs sm:text-sm font-bold ${(contestant.totalWeightedScore || 0) > 0 ? 'bg-green-100 text-black' : 'bg-gray-100 text-black'} rounded-full ${(contestant.totalWeightedScore || 0) > 0 ? 'shadow-sm' : ''}`}>
                            {(() => {
                              // For the current contestant being scored, show the live formatted total from quickScores
                              const isCurrentContestant = contestants[currentContestantIndex] && contestant.id === contestants[currentContestantIndex].id;
                              if (isCurrentContestant) {
                                const criteria = getCurrentEventCriteria();
                                const isPointsGrading = currentEvent?.gradingType === 'points';
                                return getFormattedTotalScore(contestant, criteria, isPointsGrading, usingFinalRoundCriteria, quickScores);
                              }
                              
                              // Use existing totalWeightedScore if available, otherwise calculate it
                              if (typeof contestant.totalWeightedScore === 'number' && contestant.totalWeightedScore > 0) {
                                const criteria = getCurrentEventCriteria();
                                const isPointsGrading = currentEvent?.gradingType === 'points';
                                const maxScore = isPointsGrading 
                                  ? criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                                  : 100;
                                return formatScoreDisplay(contestant.totalWeightedScore, maxScore, isPointsGrading);
                              }
                              
                              // Fallback calculation - use same logic as getFormattedTotalScore
                              const criteria = getCurrentEventCriteria();
                              const isPointsGrading = currentEvent?.gradingType === 'points';
                              return getFormattedTotalScore(contestant, criteria, isPointsGrading, usingFinalRoundCriteria);
                            })()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(contestant.status)}`}>
                            <span className="hidden sm:inline">{contestant.status || 'Not Rated'}</span>
                            <span className="sm:hidden">{(contestant.status || 'Not Rated').substring(0, 8)}...</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 sm:py-12">
              <div className="text-4xl sm:text-6xl mb-4">
                👥
              </div>
              <h3 className="text-base sm:text-lg font-medium text-black mb-2">
                No contestants found
              </h3>
              <p className="text-xs sm:text-sm text-black mb-4">
                {assignedEvents.length === 0 
                  ? "You are currently viewing all contestants. Contact the admin to assign you to specific events for better organization."
                  : "No contestants have been added to your assigned events yet."
                }
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 max-w-md mx-auto mt-4">
                <p className="text-xs sm:text-sm text-black">
                  <strong>Tip:</strong> {assignedEvents.length === 0 
                    ? "New judges are automatically assigned to all events. If you're a new judge and don't see contestants, please refresh the page."
                    : "Contestants will appear here once they are added to events you're assigned to judge."
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Edit Contestant Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-black mb-4">Edit Contestant Scores</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleEditContestant(); }} className="space-y-4">
              {/* Dynamic Criteria Fields */}
              {getCurrentEventCriteria().map((criterion, index) => {
                const useFinalRoundPrefix = usingFinalRoundCriteria;
                const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                return (
                  <div key={index}>
                    <label className="block text-sm font-medium text-black mb-1">
                      {criterion.name} Score ({currentEvent?.gradingType === 'points' ? criterion.weight + ' points' : criterion.weight + '%'})
                    </label>
                    <input
                      type="number"
                      name={key}
                      value={formData[key] || 0}
                      onChange={handleInputChange}
                      min="0"
                      max={currentEvent?.gradingType === 'points' ? criterion.weight : 100}
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      required
                    />
                  </div>
                );
              })}
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-black">
                  {getCurrentEventCriteria().map((criterion, index) => {
                    const useFinalRoundPrefix = usingFinalRoundCriteria;
                    const key = getCriteriaKey(criterion.name, useFinalRoundPrefix);
                    const score = formData[key] || 0;
                    const weighted = (score * criterion.weight / 100).toFixed(1);
                    return (
                      <div key={index}>
                        {criterion.name} ({currentEvent?.gradingType === 'points' ? criterion.weight + ' points' : criterion.weight + '%'}): {weighted}
                      </div>
                    );
                  })}
                  <div className="font-semibold text-black pt-1 border-t">
                    Total: {(() => {
                      const total = calculateWeightedScore(formData);
                      const criteria = getCurrentEventCriteria();
                      const isPointsGrading = currentEvent?.gradingType === 'points';
                      const maxScore = isPointsGrading 
                        ? criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0)
                        : 100;
                      return isPointsGrading ? `${total} / ${maxScore}` : `${total}%`;
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-black py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Update Scores
                </button>
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingContestant(null); resetForm(); }}
                  className="flex-1 bg-gray-200 text-black py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
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
              <h3 className="text-xl font-bold text-black">Submit Scores to Admin</h3>
            </div>
            <div className="mb-6">
              <p className="text-black mb-4">
                Are you sure you want to submit your scores to the admin? This will mark your evaluation as completed and you won't be able to make further changes.
              </p>
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="font-medium text-black">Judge: {user?.displayName || user?.email}</div>
                <div className="text-sm text-black">Event: {currentEvent?.eventName || 'Assigned Events'}</div>
                <div className="text-sm text-black mt-1">Contestants Score: {contestants.filter(c => {
                  const criteria = getCurrentEventCriteria();
                  return criteria.every(criterion => {
                    const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                    return c[key] && c[key] > 0;
                  });
                }).length} of {contestants.length}</div>
              </div>
              <p className="text-sm text-black mt-4">
                📋 This action will update your submission status to 'completed' in the admin dashboard.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSubmitScores}
                className="flex-1 bg-blue-600 text-black py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Submit Scores
              </button>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 bg-gray-200 text-black py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
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
