'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, where, getDocs, updateDoc } from 'firebase/firestore';

// Custom scrollbar styles for mobile horizontal scrolling
const scrollbarStyles = `
  .scrollbar-thin::-webkit-scrollbar {
    height: 6px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
  
  .delay-75 {
    animation-delay: 75ms;
  }
  
  .delay-150 {
    animation-delay: 150ms;
  }
  
  @media (max-width: 1024px) {
    .scroll-indicator {
      background: linear-gradient(to right, rgba(255,255,255,0.9), rgba(255,255,255,0.7), rgba(255,255,255,0.9));
      backdrop-filter: blur(4px);
    }
  }

  /* Modal animations */
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-up {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .animate-fade-in {
    animation: fade-in 0.3s ease-out;
  }

  .animate-slide-up {
    animation: slide-up 0.4s ease-out;
  }

  @keyframes pulse-shadow {
    0%, 100% {
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    50% {
      box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.4);
    }
  }

  .animate-pulse-shadow {
    animation: pulse-shadow 3s ease-in-out infinite;
  }
`;

export default function LiveScoreboard() {
  const [contestants, setContestants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contestInfo, setContestInfo] = useState(null);
  const [selectedContestant, setSelectedContestant] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [highestScorer, setHighestScorer] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedRound, setSelectedRound] = useState('all'); // Round filter state
  const [showFinalRoundsOnly, setShowFinalRoundsOnly] = useState(false); // Final rounds filter state
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLive, setIsLive] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [scores, setScores] = useState([]); // Store individual judge scores
  const [judgeStats, setJudgeStats] = useState({
    totalJudges: 0,
    activeJudges: 0,
    totalScores: 0,
    completedEvaluations: 0
  });
  const [updatedContestants, setUpdatedContestants] = useState(new Set()); // Track recently updated contestants
  const [imageOrientations, setImageOrientations] = useState({}); // Track image orientations

  useEffect(() => {
    // Inject custom scrollbar styles
    const styleElement = document.createElement('style');
    styleElement.textContent = scrollbarStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);

  useEffect(() => {
    // Fetch events
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
      if (eventsData.length > 0 && !selectedEvent) {
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
          console.log(`Live score update: ${relevantChanges.length} score(s) updated for event ${selectedEvent.id}`);
          
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
          
          // Show more detailed update notification
          const updateIndicator = document.createElement('div');
          updateIndicator.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg text-sm z-50 animate-pulse shadow-lg flex items-center gap-2';
          updateIndicator.innerHTML = `
            <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>🔄 New Score Added</span>
          `;
          document.body.appendChild(updateIndicator);
          
          setTimeout(() => {
            if (document.body.contains(updateIndicator)) {
              document.body.removeChild(updateIndicator);
            }
          }, 3000);
          
          // Force recalculation of contestant scores
          updateContestantScores();
        }
      }
    });

    return () => {
      unsubscribeEvents();
      unsubscribeScores();
    };
  }, []);

  // Calculate judge statistics from scores data
  const calculateJudgeStats = (scoresData, eventId) => {
    // Filter scores for current event
    const eventScores = scoresData.filter(score => score.eventId === eventId);
    
    // Get unique judges
    const uniqueJudges = [...new Set(eventScores.map(score => score.judgeId))];
    const totalJudges = uniqueJudges.length;
    
    // Count judges who have submitted scores (have non-zero scores)
    const activeJudges = [...new Set(
      eventScores
        .filter(score => Object.values(score.scores || {}).some(val => val > 0))
        .map(score => score.judgeId)
    )].length;
    
    // Count total score entries
    const totalScores = eventScores.length;
    
    // Count completed evaluations (judges who have scored all criteria for at least one contestant)
    const completedEvaluations = [...new Set(
      eventScores
        .filter(score => {
          const event = events.find(e => e.id === eventId);
          const criteria = event?.criteria?.filter(c => c.enabled) || [];
          const scoredCriteria = Object.keys(score.scores || {}).filter(key => 
            score.scores[key] && score.scores[key] > 0
          );
          return scoredCriteria.length === criteria.length && scoredCriteria.length > 0;
        })
        .map(score => score.judgeId)
    )].length;
    
    return {
      totalJudges,
      activeJudges,
      totalScores,
      completedEvaluations
    };
  };

  // Function to filter contestants by selected round
  const filterContestantsByRound = (contestantsList, roundFilter) => {
    if (!selectedEvent) {
      return contestantsList;
    }
    
    // Apply final rounds filter if active
    if (showFinalRoundsOnly) {
      contestantsList = filterFinalRoundContestants(contestantsList);
    }
    
    // If no specific round filter selected, return the (possibly filtered) list
    if (roundFilter === 'all') {
      return contestantsList;
    }
    
    if (!selectedEvent.rounds || selectedEvent.rounds.length === 0) {
      return contestantsList;
    }
    
    // Find selected round
    const selectedRoundData = selectedEvent.rounds.find(round => round.name === roundFilter);
    if (!selectedRoundData) {
      return contestantsList;
    }
    
    // Show all contestants for this round, but mark eliminated ones
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
          score.eventId === selectedEvent.id
        );
        return generalScores.length > 0;
      }
      
      return roundScores.length > 0;
    });
  };

  // Function to filter final round contestants only
  const filterFinalRoundContestants = (contestantsList) => {
    if (!selectedEvent || !selectedEvent.rounds || selectedEvent.rounds.length === 0) {
      return contestantsList;
    }
    
    // Find the final round (last enabled round)
    const finalRound = selectedEvent.rounds
      .filter(round => round.enabled)
      .slice(-1)[0];
    
    if (!finalRound) {
      return contestantsList;
    }
    
    // Filter contestants who have scores for final round criteria
    return contestantsList.filter(contestant => {
      const finalRoundScores = scores.filter(score => 
        score.contestantId === contestant.id && 
        score.eventId === selectedEvent.id &&
        score.roundName === finalRound.name
      );
      
      // Also check if contestant has final round criteria scores in their data
      if (finalRoundScores.length === 0 && finalRound.criteria) {
        return finalRound.criteria.some(criterion => {
          const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
          return contestant[key] !== undefined && contestant[key] > 0;
        });
      }
      
      return finalRoundScores.length > 0;
    });
  };

  // Helper function to get final round name
  const getFinalRoundName = () => {
    if (!selectedEvent || !selectedEvent.rounds || selectedEvent.rounds.length === 0) {
      return null;
    }
    const finalRound = selectedEvent.rounds
      .filter(round => round.enabled)
      .slice(-1)[0];
    return finalRound ? finalRound.name : null;
  };

  // Helper function to check if contestant is in final round
  const isContestantInFinalRound = (contestant) => {
    if (!selectedEvent || !selectedEvent.rounds || selectedEvent.rounds.length === 0) {
      return false;
    }
    const finalRound = selectedEvent.rounds
      .filter(round => round.enabled)
      .slice(-1)[0];
    
    if (!finalRound) return false;
    
    // Check if contestant has scores for final round
    const finalRoundScores = scores.filter(score => 
      score.contestantId === contestant.id && 
      score.eventId === selectedEvent.id &&
      score.roundName === finalRound.name
    );
    
    if (finalRoundScores.length > 0) return true;
    
    // Also check contestant data for final round criteria
    if (finalRound.criteria) {
      return finalRound.criteria.some(criterion => {
        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
        return contestant[key] !== undefined && contestant[key] > 0;
      });
    }
    
    return false;
  };

  // Helper function to get criteria from event (same as judge dashboard)
  const getCurrentEventCriteria = () => {
    if (!selectedEvent) {
      console.log('🔍 Live Scoreboard: No current event found');
      return [];
    }
    
    console.log('🔍 Live Scoreboard: Current event:', selectedEvent);
    console.log('🔍 Live Scoreboard: Event criteriaCategories:', selectedEvent.criteriaCategories);
    console.log('🔍 Live Scoreboard: Event legacy criteria:', selectedEvent.criteria);
    
    // Use criteriaCategories if available (new structure), otherwise fall back to legacy criteria
    let criteria = [];
    
    if (selectedEvent.criteriaCategories && selectedEvent.criteriaCategories.length > 0) {
      // New structure: extract sub-criteria from categories, or use categories as criteria if no sub-criteria
      criteria = [];
      console.log('🔍 Live Scoreboard: Processing', selectedEvent.criteriaCategories.length, 'categories');
      
      selectedEvent.criteriaCategories.forEach((category, catIndex) => {
        console.log(`🔍 Live Scoreboard: Category ${catIndex + 1}:`, category.name);
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
      console.log('🔍 Live Scoreboard: Using criteriaCategories - extracted criteria:', criteria);
    } else if (selectedEvent.criteria && selectedEvent.criteria.length > 0) {
      // Legacy structure: use main event criteria
      console.log('🔍 Live Scoreboard: Using legacy criteria structure');
      criteria = selectedEvent.criteria.filter(c => c.enabled);
      console.log('🔍 Live Scoreboard: Using legacy criteria - filtered enabled criteria:', criteria);
    } else {
      console.log('🔍 Live Scoreboard: No criteria found in event');
    }
    
    console.log('🔍 Live Scoreboard: Final criteria to use:', criteria);
    console.log('🔍 Live Scoreboard: Total criteria count:', criteria.length);
    return criteria;
  };

  // Calculate aggregated scores from all judges for a contestant
  const calculateAggregatedScore = (contestantId, eventId) => {
    const contestantScores = scores.filter(score => 
      score.contestantId === contestantId && score.eventId === eventId
    );
    
    if (contestantScores.length === 0) {
      return { totalScore: 0, judgeCount: 0, criteriaScores: {} };
    }
    
    // Get the event to check grading type
    const event = events.find(e => e.id === eventId);
    const isPointsGrading = event?.gradingType === 'points';
    
    // Count unique judges (not total score entries)
    const uniqueJudges = [...new Set(contestantScores.map(score => score.judgeId))];
    const judgeCount = uniqueJudges.length;
    
    // Get criteria from the event - handle both legacy and new structure
    const criteria = getCurrentEventCriteria();
    
    console.log('Live Scoreboard - Aggregating scores:', {
      contestantId,
      judgeCount,
      isPointsGrading,
      criteriaCount: criteria.length
    });
    
    // Calculate average for each criteria using only the latest score from each judge
    const criteriaScores = {};
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      
      // Get the latest score from each judge for this criteria
      const latestScoresByJudge = {};
      contestantScores.forEach(score => {
        if (score.scores?.[key] !== undefined && score.scores?.[key] > 0) {
          if (!latestScoresByJudge[score.judgeId] || 
              new Date(score.timestamp) > new Date(latestScoresByJudge[score.judgeId].timestamp)) {
            latestScoresByJudge[score.judgeId] = score;
          }
        }
      });
      
      const criteriaValues = Object.values(latestScoresByJudge).map(score => score.scores[key]);
      
      if (criteriaValues.length > 0) {
        // Calculate the average across all judges
        criteriaScores[key] = criteriaValues.reduce((sum, val) => sum + val, 0) / criteriaValues.length;
      } else {
        criteriaScores[key] = 0;
      }
    });
    
    // Calculate total score based on grading type
    let totalScore = 0;
    
    if (isPointsGrading) {
      // For points-based grading, sum all the averaged criterion scores
      criteria.forEach(criterion => {
        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const score = criteriaScores[key] || 0;
        totalScore += score;
      });
      
      // If multiple judges, convert points to 100-point scale
      if (judgeCount > 1) {
        const maxPoints = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
        if (maxPoints > 0) {
          totalScore = (totalScore / maxPoints) * 100;
        }
      } else {
        // Single judge: convert points to 100-point scale based on max points
        const maxPoints = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
        if (maxPoints > 0) {
          totalScore = (totalScore / maxPoints) * 100;
        }
      }
    } else {
      // For percentage-based grading, apply weights
      criteria.forEach(criterion => {
        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const score = criteriaScores[key] || 0;
        const weight = criterion.weight / 100;
        totalScore += score * weight;
      });
    }
    
    // Cap total at 100 for display
    totalScore = Math.min(totalScore, 100);
    
    return {
      totalScore: parseFloat(totalScore.toFixed(1)),
      judgeCount,
      criteriaScores
    };
  };

  // Function to update contestant scores when scores change
  const updateContestantScores = async () => {
    if (!selectedEvent) return;
    
    try {
      const contestantsQuery = query(
        collection(db, 'contestants'),
        where('eventId', '==', selectedEvent.id)
      );
      
      const snapshot = await getDocs(contestantsQuery);
      const contestantsData = snapshot.docs.map(doc => {
        const data = doc.data();
        const contestantId = doc.id;
        
        // Debug: Log contestant data structure
        console.log('Live Scoreboard - Processing contestant:', {
          id: contestantId,
          contestantType: data.contestantType,
          displayName: data.displayName,
          groupName: data.groupName,
          firstName: data.firstName,
          lastName: data.lastName,
          contestantName: data.contestantName
        });
        
        // Calculate aggregated scores from all judges
        const aggregatedScore = calculateAggregatedScore(contestantId, selectedEvent.id);
        
        const finalName = data.displayName || 
          (data.contestantType === 'group' 
            ? data.groupName || 'Unknown Group'
            : `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.contestantName || 'Unknown Solo');
            
        console.log('Live Scoreboard - Final name constructed:', {
          contestantId: contestantId,
          finalName: finalName,
          contestantType: data.contestantType
        });
        
        return {
          id: contestantId,
          ...data,
          name: finalName,
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
      setLastUpdate(new Date());
      
      // Calculate and update judge statistics
      const stats = calculateJudgeStats(scores, selectedEvent.id);
      setJudgeStats(stats);
      
      // Set highest scorer
      if (contestantsData.length > 0 && contestantsData[0].totalScore > 0) {
        setHighestScorer(contestantsData[0]);
      } else {
        setHighestScorer(null);
      }
      
    } catch (error) {
      console.error('Error updating contestant scores:', error);
    }
  };

  useEffect(() => {
    // Fetch contestants filtered by selected event
    if (!selectedEvent) return;

    const contestantsQuery = query(
      collection(db, 'contestants'),
      where('eventId', '==', selectedEvent.id)
    );

    const unsubscribeContestants = onSnapshot(
      contestantsQuery, 
      (snapshot) => {
        setConnectionStatus('connected');
        setLastUpdate(new Date()); // Update last update time
        
        const contestantsData = snapshot.docs.map(doc => {
          const data = doc.data();
          const contestantId = doc.id;
          
          // Debug: Log contestant data structure in real-time listener
          console.log('Live Scoreboard (Real-time) - Processing contestant:', {
            id: contestantId,
            contestantType: data.contestantType,
            displayName: data.displayName,
            groupName: data.groupName,
            firstName: data.firstName,
            lastName: data.lastName,
            contestantName: data.contestantName
          });
          
          // Calculate aggregated scores from all judges
          const aggregatedScore = calculateAggregatedScore(contestantId, selectedEvent.id);
          
          const finalName = data.displayName || 
            (data.contestantType === 'group' 
              ? data.groupName || 'Unknown Group'
              : `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.contestantName || 'Unknown Solo');
              
          console.log('Live Scoreboard (Real-time) - Final name constructed:', {
            contestantId: contestantId,
            finalName: finalName,
            contestantType: data.contestantType
          });
          
          return {
            id: contestantId,
            ...data,
            name: finalName,
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
        
        // Calculate and update judge statistics
        const stats = calculateJudgeStats(scores, selectedEvent.id);
        setJudgeStats(stats);
        
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
          console.log(`Live update: ${changes.length} contestant(s) updated`);
          
          // Flash a subtle update indicator
          const updateIndicator = document.createElement('div');
          updateIndicator.className = 'fixed top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-lg text-sm z-50 animate-pulse';
          updateIndicator.textContent = '� Contestant Updated';
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
      }
    );

    return () => {
      unsubscribeContestants();
    };
  }, [selectedEvent, scores]); // Add scores as dependency to recalculate when scores change

  // Update selected contestant when contestants data changes (to keep modal data in sync)
  useEffect(() => {
    if (showModal && selectedContestant) {
      const updatedContestant = contestants.find(c => c.id === selectedContestant.id);
      if (updatedContestant) {
        setSelectedContestant(updatedContestant);
      }
    }
  }, [contestants, showModal, selectedContestant?.id]);

  const getRankIcon = (rank, isEliminated) => {
    if (isEliminated) {
      return '❌';
    }
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

  const getScoreAnimation = (score, previousScore) => {
    if (previousScore !== undefined && score > previousScore) {
      return 'animate-pulse bg-green-100 border-green-300';
    }
    return '';
  };

  const handleContestantClick = (contestant) => {
    // Find the latest contestant data from the contestants state array
    const latestContestantData = contestants.find(c => c.id === contestant.id);
    if (latestContestantData) {
      setSelectedContestant(latestContestantData);
      setShowModal(true);
    }
  };

  // Function to detect image orientation
  const detectImageOrientation = (imageUrl, contestantId) => {
    const img = new Image();
    img.onload = () => {
      const isLandscape = img.width > img.height;
      setImageOrientations(prev => ({
        ...prev,
        [contestantId]: isLandscape ? 'landscape' : 'portrait'
      }));
    };
    img.onerror = () => {
      // Default to portrait if image fails to load
      setImageOrientations(prev => ({
        ...prev,
        [contestantId]: 'portrait'
      }));
    };
    img.src = imageUrl;
  };

  // Check image orientation when contestant changes
  useEffect(() => {
    if (selectedContestant && selectedContestant.photo) {
      if (!imageOrientations[selectedContestant.id]) {
        detectImageOrientation(selectedContestant.photo, selectedContestant.id);
      }
    }
  }, [selectedContestant, selectedContestant?.photo, imageOrientations]);

  const closeModal = () => {
    setShowModal(false);
    setSelectedContestant(null);
  };

  const navigateToNextContestant = () => {
    const currentIndex = contestants.findIndex(c => c.id === selectedContestant.id);
    if (currentIndex < contestants.length - 1) {
      setSelectedContestant(contestants[currentIndex + 1]);
    }
  };

  const navigateToPreviousContestant = () => {
    const currentIndex = contestants.findIndex(c => c.id === selectedContestant.id);
    if (currentIndex > 0) {
      setSelectedContestant(contestants[currentIndex - 1]);
    }
  };

  const getCriteriaAverage = (contestant) => {
    const criteria = getCurrentEventCriteria();
    if (criteria.length === 0) return 0;
    
    const scores = criteria
      .map(criteria => {
        const score = getContestantCriteriaScore(contestant, criteria.name);
        return score > 0 ? score : null;
      })
      .filter(score => score !== null);
    
    if (scores.length === 0) return 0;
    return (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1);
  };

  const getRankColor = (rank) => {
    switch (rank) {
      case 1: return 'bg-red-100 text-red-800 border-red-200'; // 1st place - Red
      case 2: return 'bg-gray-100 text-gray-800 border-gray-200'; // 2nd place - Gray
      case 3: return 'bg-orange-100 text-orange-800 border-orange-200'; // 3rd place - Orange/bronze
      case 4: return 'bg-blue-50 text-blue-700 border-blue-200'; // 4th place - Light blue
      case 5: return 'bg-blue-100 text-blue-800 border-blue-200'; // 5th place - Blue
      default: return 'bg-white text-gray-700 border-gray-200'; // Others - White
    }
  };

  const getContestantCriteriaScore = (contestant, criteriaName) => {
    // Use the aggregated criteria scores calculated from all judges
    const key = criteriaName.toLowerCase().replace(/\s+/g, '_');
    return contestant.criteriaScores?.[key] || 0;
  };


  // Function to get individual judge scores for a contestant
  const getIndividualJudgeScores = (contestantId, eventId) => {
    const contestantScores = scores.filter(score => 
      score.contestantId === contestantId && score.eventId === eventId
    );
    
    // Group by judge and get latest scores
    const judgeScores = {};
    contestantScores.forEach(score => {
      if (!judgeScores[score.judgeId] || new Date(score.timestamp) > new Date(judgeScores[score.judgeId].timestamp)) {
        judgeScores[score.judgeId] = score;
      }
    });
    
    return Object.values(judgeScores);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading live scores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <header className="w-full bg-white shadow-lg border-b border-gray-200 sticky top-0 z-40">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="py-4 sm:py-6">
            {/* Main Header Row */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Left Section - Title and Navigation */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => window.location.href = '/'}
                  className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
                >
                  <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="font-medium">Back to Home</span>
                </button>
                <div className="h-8 w-px bg-gray-300"></div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-yellow-400 to-blue-500 rounded-xl shadow-lg">
                    <span className="text-2xl">🏆</span>
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-900 to-blue-700 bg-clip-text text-transparent">
                      Live Scoreboard
                    </h1>
                    
                  </div>
                </div>
              </div>

              {/* Right Section - Status and Controls */}
              <div className="hidden lg:flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Connection Status */}
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
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
        </div>
      </header>

      {/* Event Selector */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="bg-gradient-to-r from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <span className="text-2xl">🎭</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Event Selection</h2>
                  <p className="text-blue-100 text-sm">Choose an event to view scores</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-blue-100 text-sm font-medium">Total Events</p>
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
                    setSelectedRound('all'); // Reset round filter when event changes
                  }}
                  className="block w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 bg-white shadow-sm hover:border-gray-400"
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
                <div className="flex-1 max-w-full sm:max-w-md">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Filter by Round</label>
                  <select
                    value={selectedRound}
                    onChange={(e) => setSelectedRound(e.target.value)}
                    className="block w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white shadow-sm hover:border-gray-400"
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
              
              {/* Final Rounds Only Filter */}
              {selectedEvent && selectedEvent.rounds && selectedEvent.rounds.length > 0 && getFinalRoundName() && (
                <div className="flex-1 max-w-full sm:max-w-xs">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Finalists Only</label>
                  <div className="flex items-center gap-3 bg-white border-2 border-gray-300 rounded-xl px-4 py-3 shadow-sm hover:border-gray-400 transition-all duration-200">
                    <button
                      onClick={() => setShowFinalRoundsOnly(!showFinalRoundsOnly)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                        showFinalRoundsOnly ? 'bg-gradient-to-r from-yellow-400 to-orange-400' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          showFinalRoundsOnly ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`text-sm font-medium ${
                      showFinalRoundsOnly ? 'text-orange-600' : 'text-gray-600'
                    }`}>
                      {showFinalRoundsOnly ? `${filterFinalRoundContestants(contestants).length} 🏆` : 'All'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contest Info */}
      {selectedEvent && (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Event Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-4 sm:py-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-full">
                  <h2 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-white mb-2 break-words leading-tight">{selectedEvent.eventName}</h2>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-blue-100 text-sm sm:text-base">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{selectedEvent.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate">{selectedEvent.venue}</span>
                    </div>
                  </div>
                  {/* Current Filter Display */}
                  {(selectedRound !== 'all' || showFinalRoundsOnly) && (
                    <div className="flex justify-center">
                      <div className="bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                        <span className="text-white font-medium text-sm">
                          {showFinalRoundsOnly && selectedRound === 'all' 
                            ? `🏆 Finalists Only (${filterFinalRoundContestants(contestants).length})`
                            : selectedRound !== 'all' 
                            ? `🎯 Filtered: ${selectedRound}`
                            : `🏆 Finalists Only (${filterFinalRoundContestants(contestants).length})`
                          }
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
                  <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 sm:px-6 py-3 sm:py-4 text-center">
                    <p className="text-blue-100 text-sm font-medium mb-1">Contestants</p>
                    <p className="text-2xl sm:text-3xl font-bold text-white">{contestants.length}</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur-sm rounded-xl px-6 py-4 text-center">
                    <p className="text-blue-100 text-sm font-medium mb-2">Status</p>
                    <div className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-full ${
                      selectedEvent.status === 'ongoing' ? 'bg-green-500 text-white' :
                      selectedEvent.status === 'upcoming' ? 'bg-blue-500 text-white' :
                      'bg-gray-500 text-white'
                    }`}>
                      <span>{selectedEvent.status === 'ongoing' ? '🎭' : selectedEvent.status === 'upcoming' ? '📅' : '✅'}</span>
                      <span>{selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}</span>
                    </div>
                  </div>
                  {highestScorer && (
                    <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl px-6 py-4 text-center shadow-lg">
                      <p className="text-white text-sm font-medium mb-1">🏆 Leading</p>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <p className="text-xl font-bold text-white truncate max-w-[120px]">{highestScorer.name}</p>
                        {highestScorer.contestantType === 'group' ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-purple-200 text-purple-900 rounded-full" title="Group Contestant">
                            👥
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-200 text-blue-900 rounded-full" title="Solo Contestant">
                            Solo
                          </span>
                        )}
                      </div>
                      <p className="text-yellow-100 text-sm font-bold">{highestScorer.totalScore.toFixed(1)} pts</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Judge Statistics */}
            <div className="p-4 sm:p-6 bg-gray-50 border-t border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 sm:mb-6 flex items-center justify-center gap-2 text-center">
                <span className="text-2xl">🧑‍⚖️</span>
                Judge Statistics
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-6xl mx-auto">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 sm:p-4 text-center border border-blue-200 hover:shadow-md transition-shadow duration-200">
                  <div className="text-2xl sm:text-3xl mb-2">👥</div>
                  <p className="text-xs sm:text-sm text-blue-600 font-semibold mb-1">Total Judges</p>
                  <p className="text-xl sm:text-2xl font-bold text-blue-900">{judgeStats.totalJudges}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 sm:p-4 text-center border border-green-200 hover:shadow-md transition-shadow duration-200">
                  <div className="text-2xl sm:text-3xl mb-2">✅</div>
                  <p className="text-xs sm:text-sm text-green-600 font-semibold mb-1">Active Judges</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-900">{judgeStats.activeJudges}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-3 sm:p-4 text-center border border-purple-200 hover:shadow-md transition-shadow duration-200">
                  <div className="text-2xl sm:text-3xl mb-2">📊</div>
                  <p className="text-xs sm:text-sm text-purple-600 font-semibold mb-1">Total Scores</p>
                  <p className="text-xl sm:text-2xl font-bold text-purple-900">{judgeStats.totalScores}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-3 sm:p-4 text-center border border-orange-200 hover:shadow-md transition-shadow duration-200">
                  <div className="text-2xl sm:text-3xl mb-2">🎯</div>
                  <p className="text-xs sm:text-sm text-orange-600 font-semibold mb-1">Completed</p>
                  <p className="text-xl sm:text-2xl font-bold text-orange-900">{judgeStats.completedEvaluations}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scoreboard */}
      <div className="w-full px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
          {contestants.length === 0 ? (
            <div className="p-12 sm:p-16 text-center">
              <div className="text-6xl sm:text-8xl mb-6">👥</div>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">No contestants for this event</h3>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">Contestants will appear here once they are registered for "{selectedEvent?.eventName || 'this event'}" by the administrator.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Mobile Scroll Indicator */}
              <div className="lg:hidden absolute top-0 left-0 right-0 z-10 px-3 sm:px-4 py-2 sm:py-3 scroll-indicator border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                    </svg>
                    <span className="text-xs sm:text-sm text-gray-700 font-medium">
                      Swipe to see all scores
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full animate-pulse delay-75"></div>
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full animate-pulse delay-150"></div>
                  </div>
                </div>
              </div>
              
              {/* Scrollable Table Container */}
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                <table className="w-full min-w-[800px]">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <tr>
                  <th className="px-2 sm:px-3 lg:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-16 lg:w-20">Rank</th>
                  <th className="px-2 sm:px-3 lg:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-20 lg:w-32">Contestant</th>
                  {getCurrentEventCriteria().map((criteria, index) => (
                    <th key={index} className="px-2 sm:px-3 lg:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider min-w-[80px] sm:min-w-[100px]">
                      <div className="flex flex-col items-center lg:items-start">
                        <span className="text-xs font-medium truncate max-w-[60px] sm:max-w-[80px] lg:max-w-none">
                          {criteria.name.length > 8 ? criteria.name.substring(0, 6) + '...' : criteria.name}
                        </span>
                        {criteria.weight && (
                          <span className="text-xs text-gray-400">({criteria.weight}%)</span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 sm:px-3 lg:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-20 lg:w-24">Total Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filterContestantsByRound(contestants, selectedRound).map((contestant, index) => {
                  const rank = index + 1;
                  const rankColorClass = getRankColor(rank);
                  const isRecentlyUpdated = updatedContestants.has(contestant.id);
                  return (
                  <tr key={contestant.id} className={`hover:bg-gray-50 transition-all duration-200 border-l-4 ${rankColorClass} ${
                    rank === 1 ? 'hover:shadow-lg' : ''
                  } ${isRecentlyUpdated ? 'bg-green-50 animate-pulse' : ''} ${
                    contestant.eliminated ? 'opacity-60 bg-red-50' : ''
                  }`}>
                    <td className="px-2 sm:px-4 py-3 whitespace-nowrap border-r border-gray-100 w-16 lg:w-20">
                      <div className="flex items-center justify-center">
                        <span className="text-2xl sm:text-3xl lg:text-4xl">{getRankIcon(rank, contestant.eliminated)}</span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-3 whitespace-nowrap border-r border-gray-100 w-20 lg:w-32">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className={`relative h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 rounded-full flex items-center justify-center shadow-md flex-shrink-0 overflow-hidden ${
                              rank === 1 ? 'bg-gradient-to-br from-red-500 to-red-600' :
                              rank === 2 ? 'bg-gradient-to-br from-gray-500 to-gray-600' :
                              rank === 3 ? 'bg-gradient-to-br from-orange-500 to-orange-600' :
                              rank === 4 ? 'bg-gradient-to-br from-blue-400 to-blue-500' :
                              rank === 5 ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                              'bg-gradient-to-br from-gray-300 to-gray-400'
                            }`}>
                              {contestant.photo ? (
                                <img 
                                  src={contestant.photo} 
                                  alt={contestant.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className={`font-bold text-sm sm:text-base lg:text-lg ${
                                  rank <= 5 ? 'text-white' : 'text-gray-700'
                                }`}>
                                  {contestant.name ? contestant.name.charAt(0).toUpperCase() : 'C'}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => handleContestantClick(contestant)}
                                  className={`font-bold text-xs sm:text-sm lg:text-base transition-colors text-left truncate block hover:underline ${
                                    rank === 1 ? 'text-red-700 hover:text-red-800' :
                                    rank === 2 ? 'text-gray-700 hover:text-gray-800' :
                                    rank === 3 ? 'text-orange-700 hover:text-orange-800' :
                                    rank === 4 ? 'text-blue-700 hover:text-blue-800' :
                                    rank === 5 ? 'text-blue-800 hover:text-blue-900' :
                                    'text-gray-700 hover:text-gray-800'
                                  }`}
                                >
                                  {contestant.name || 'Contestant ' + rank}
                                </button>
                                {contestant.contestantType === 'group' ? (
                                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full" title="Group Contestant">
                                    👥
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full" title="Solo Contestant">
                                    Solo
                                  </span>
                                )}
                                {isContestantInFinalRound(contestant) && (
                                  <span className="inline-flex items-center px-2 py-1 text-xs font-bold bg-gradient-to-r from-yellow-400 to-orange-400 text-white rounded-full shadow-sm" title="Final Round Contestant">
                                    🏆
                                  </span>
                                )}
                                {isRecentlyUpdated && (
                                  <div className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-full animate-pulse">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    LIVE
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 sm:gap-2 mt-1">
                                <span className="text-lg font-bold text-gray-700 bg-gray-100 px-3 py-1.5 rounded">#{contestant.number || rank}</span>
                                {contestant.eliminated && (
                                  <span className="inline-flex items-center px-1 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold" title="Eliminated">
                                    ❌ Eliminated
                                  </span>
                                )}
                                {contestant.photo && (
                                  <span className="inline-flex items-center px-1 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold" title="Has Photo">
                                    📷
                                  </span>
                                )}
                                {contestant.judgeCount > 0 && (
                                  <span className="inline-flex items-center px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                                    👤 {contestant.judgeCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                    {getCurrentEventCriteria().map((criteria, criteriaIndex) => {
                      const score = getContestantCriteriaScore(contestant, criteria.name);
                      const colors = [
                        'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300',
                        'bg-gradient-to-r from-cyan-100 to-cyan-200 text-cyan-800 border-cyan-300', 
                        'bg-gradient-to-r from-sky-100 to-sky-200 text-sky-800 border-sky-300',
                        'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300', 
                        'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border-yellow-300'
                      ];
                      const colorClass = colors[criteriaIndex % colors.length];
                      return (
                        <td key={criteriaIndex} className="px-2 sm:px-4 py-3 whitespace-nowrap text-center border-r border-gray-100 min-w-[100px]">
                          <div className={`inline-flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm font-bold border ${colorClass} rounded-lg shadow-sm min-w-[60px]`}>
                            {score === 0 ? '—' : `${score.toFixed(1)}`}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 sm:px-4 py-3 whitespace-nowrap min-w-[100px]">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <span className={`text-lg sm:text-2xl lg:text-3xl font-bold ${
                            rank === 1 ? 'text-red-600' :
                            rank === 2 ? 'text-gray-600' :
                            rank === 3 ? 'text-orange-600' :
                            rank === 4 ? 'text-blue-600' :
                            rank === 5 ? 'text-blue-700' :
                            'text-gray-600'
                          }`}>
                            {contestant.totalScore === 0 ? '—' : contestant.totalScore.toFixed(1)}
                          </span>
                          {contestant.totalScore > 0 && (
                            <span className="text-xs sm:text-sm text-gray-500 font-medium">/100</span>
                          )}
                        </div>
                        {rank === 1 && contestant.totalScore > 0 && (
                          <div className="mt-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-full">
                              🏆 Leading
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contestant Detail Modal */}
      {showModal && selectedContestant && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white shadow-2xl w-full h-full max-h-[100vh] transform transition-all duration-300 scale-100 animate-slide-up flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 shadow-lg flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Previous Button */}
                  <button
                    onClick={navigateToPreviousContestant}
                    disabled={contestants.findIndex(c => c.id === selectedContestant.id) === 0}
                    className="text-white hover:text-blue-200 transition-all duration-200 p-2 hover:bg-white/20 rounded-lg transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="animate-fade-in">
                    <h3 className="text-lg sm:text-xl font-bold text-white">Contestant Details</h3>
                    <p className="text-blue-100 text-xs sm:text-sm mt-1">View detailed scores and information</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Next Button */}
                  <button
                    onClick={navigateToNextContestant}
                    disabled={contestants.findIndex(c => c.id === selectedContestant.id) === contestants.length - 1}
                    className="text-white hover:text-blue-200 transition-all duration-200 p-2 hover:bg-white/20 rounded-lg transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={closeModal}
                    className="text-white hover:text-blue-200 transition-all duration-200 p-1 hover:bg-white/20 rounded-lg transform hover:scale-110"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Body - Responsive Layout */}
            <div className="flex-1 p-4 sm:p-6 overflow-hidden flex flex-col">
              {/* Single Unified Card */}
              <div className="flex-1 overflow-y-auto">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                  <div className="flex flex-col lg:flex-row">
                    {/* Left Sidebar - Profile Image and Basic Info */}
                    <div className="lg:w-96 bg-gradient-to-br from-blue-600 to-cyan-600 p-6 text-white">
                      {/* Profile Image */}
                      <div className="flex-shrink-0 relative group mb-6">
                        <div className="absolute inset-0 bg-white/20 rounded-2xl blur-xl"></div>
                        {selectedContestant.photo ? (
                          <div className="relative">
                            <img 
                              src={selectedContestant.photo} 
                              alt={selectedContestant.name}
                              className={`relative w-72 h-96 mx-auto object-contain shadow-2xl bg-white animate-pulse-shadow ${
                                imageOrientations[selectedContestant.id] === 'landscape' ? 'rounded-none' : 'rounded-2xl'
                              }`}
                            />
                          </div>
                        ) : (
                          <div className="relative w-72 h-96 mx-auto rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-2xl">
                            <span className="text-6xl sm:text-7xl lg:text-8xl font-bold text-white">
                              {selectedContestant.name ? selectedContestant.name.charAt(0).toUpperCase() : 'C'}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Basic Info */}
                      <div className="text-center">
                        <h3 className="text-2xl sm:text-3xl font-bold mb-2">
                          {selectedContestant.name}
                        </h3>
                        <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
                          {selectedContestant.contestantType === 'group' ? (
                            <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium bg-white/20 backdrop-blur-sm text-white rounded-full border border-white/30">
                              👥 Group
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium bg-white/20 backdrop-blur-sm text-white rounded-full border border-white/30">
                              Solo
                            </span>
                          )}
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-lg font-bold text-white border border-white/30">
                            <span className="text-lg">🎯</span>
                            #{selectedContestant.number || 'N/A'}
                          </div>
                        </div>
                        
                        {/* Total Score Display */}
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                          <div className="text-4xl font-bold mb-1">{selectedContestant.totalScore.toFixed(1)}%</div>
                          <div className="text-sm opacity-90">Total Score</div>
                          <div className="mt-3 flex justify-around text-center">
                            <div>
                              <div className="text-xl font-bold">{selectedContestant.judgeCount || 0}</div>
                              <div className="text-xs opacity-90">Judges</div>
                            </div>
                            <div>
                              <div className="text-xl font-bold">
                                #{contestants.findIndex(c => c.id === selectedContestant.id) + 1}
                              </div>
                              <div className="text-xs opacity-90">Rank</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right Content - Criteria Scores */}
                    <div className="flex-1 p-6">
                      {/* Performance Badge */}
                      <div className="mb-6">
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                          selectedContestant.totalScore >= 90 ? 'bg-green-100 text-green-800 border border-green-300' :
                          selectedContestant.totalScore >= 80 ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                          selectedContestant.totalScore >= 70 ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
                          'bg-gray-100 text-gray-800 border border-gray-300'
                        }`}>
                          <span className="text-lg">
                            {selectedContestant.totalScore >= 90 ? '🌟' :
                             selectedContestant.totalScore >= 80 ? '👍' :
                             selectedContestant.totalScore >= 70 ? '👌' : '📈'}
                          </span>
                          {selectedContestant.totalScore >= 90 ? 'Excellent Performance' :
                           selectedContestant.totalScore >= 80 ? 'Good Performance' :
                           selectedContestant.totalScore >= 70 ? 'Average Performance' : 'Needs Improvement'}
                        </div>
                      </div>
                      
                      {/* Leading Badge */}
                      {selectedContestant.totalScore === highestScorer?.totalScore && (
                        <div className="mb-6">
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-full text-sm font-bold text-yellow-800 border border-yellow-300 shadow-lg">
                            <span className="text-lg">🏆</span>
                            Currently Leading
                          </div>
                        </div>
                      )}
                      
                      {/* Criteria Scores */}
                      <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                          <span className="text-xl">📊</span>
                          Detailed Criteria Scores
                        </h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {getCurrentEventCriteria().map((criteria, index) => {
                            const score = getContestantCriteriaScore(selectedContestant, criteria.name);
                            const colors = [
                              'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300',
                              'bg-gradient-to-r from-cyan-100 to-cyan-200 text-cyan-800 border-cyan-300', 
                              'bg-gradient-to-r from-sky-100 to-sky-200 text-sky-800 border-sky-300',
                              'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300', 
                              'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border-yellow-300'
                            ];
                            const colorClass = colors[index % colors.length];
                            return (
                              <div key={index} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all duration-300">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border ${colorClass}`}>
                                      {score === 0 ? '—' : `${score.toFixed(1)}`}
                                    </div>
                                    <div>
                                      <div className="font-medium text-gray-900">{criteria.name}</div>
                                      <div className="text-xs text-gray-500">Weight: {criteria.weight}%</div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-semibold text-gray-900">
                                      {(score * criteria.weight / 100).toFixed(1)} pts
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Progress Bar */}
                                <div className="mt-3">
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full ${
                                        score >= 90 ? 'bg-green-500' :
                                        score >= 80 ? 'bg-blue-500' :
                                        score >= 70 ? 'bg-yellow-500' : 'bg-gray-400'
                                      }`}
                                      style={{ width: `${Math.min(score, 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
