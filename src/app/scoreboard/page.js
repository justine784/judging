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
      const eventsData = snapshot.docs.map(doc => {
        const data = doc.data();
        // Normalize event data: ensure criteriaCategories field exists
        // This prevents fallback to legacy criteria for events that should have empty criteria
        return {
          id: doc.id,
          ...data,
          criteriaCategories: data.criteriaCategories || [] // Ensure field exists
        };
      });
      
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

    return () => {
      unsubscribeEvents();
    };
  }, []);

  // Separate useEffect for scores listener that depends on selectedEvent
  useEffect(() => {
    if (!selectedEvent) return;

    // Fetch scores for aggregation
    const scoresCollection = collection(db, 'scores');
    const unsubscribeScores = onSnapshot(scoresCollection, (snapshot) => {
      const scoresData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setScores(scoresData);
      console.log('Live Scoreboard - Scores updated:', scoresData.length, 'records');
      
      // Update contestant scores immediately when scores change
      updateContestantScores();
    });

    // Also add polling as a backup mechanism for real-time updates
    const pollingInterval = setInterval(() => {
      updateContestantScores();
      console.log('Live Scoreboard - Polling for updates');
    }, 3000); // Poll every 3 seconds

    return () => {
      unsubscribeScores();
      clearInterval(pollingInterval);
    };
  }, [selectedEvent]);

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

  // Function to filter final round contestants only
  const filterFinalRoundContestants = (contestantsList) => {
    // First, filter by status field (set by admin when advancing contestants)
    const finalistsByStatus = contestantsList.filter(contestant => 
      contestant.status === 'finalist' || contestant.status === 'winner'
    );
    
    // If we have finalists by status, return them
    if (finalistsByStatus.length > 0) {
      return finalistsByStatus;
    }
    
    // If no status-based finalists, fall back to score-based detection
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
          const finalKey = `final_${key}`;
          return (contestant[key] !== undefined && contestant[key] > 0) ||
                 (contestant[finalKey] !== undefined && contestant[finalKey] > 0);
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
    // First check status field (set by admin)
    if (contestant.status === 'finalist' || contestant.status === 'winner') {
      return true;
    }
    
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
        const finalKey = `final_${key}`;
        return (contestant[key] !== undefined && contestant[key] > 0) ||
               (contestant[finalKey] !== undefined && contestant[finalKey] > 0);
      });
    }
    
    return false;
  };

  // Helper function to get final round criteria (same as judge dashboard)
  const getFinalRoundCriteria = () => {
    if (!selectedEvent || !selectedEvent.rounds || selectedEvent.rounds.length === 0) {
      return null;
    }
    
    // Find the final round (last enabled round)
    const finalRound = selectedEvent.rounds
      .filter(round => round.enabled)
      .slice(-1)[0];
    
    if (!finalRound || !finalRound.criteria || finalRound.criteria.length === 0) {
      return null;
    }
    
    // Return enabled criteria from final round
    return finalRound.criteria.filter(c => c.enabled && c.name && c.name.trim() !== '');
  };

  // Get criteria separated for three-table layout (same as judge dashboard)
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

  // Helper function to get criteria from event (same as judge dashboard)
  const getCurrentEventCriteria = () => {
    if (!selectedEvent) {
      console.log('🔍 Live Scoreboard: No current event found');
      return [];
    }
    
    // If showing final rounds only, use final round criteria
    if (showFinalRoundsOnly) {
      const finalCriteria = getFinalRoundCriteria();
      if (finalCriteria && finalCriteria.length > 0) {
        console.log('🔍 Live Scoreboard: Using FINAL ROUND criteria:', finalCriteria);
        return finalCriteria;
      }
      console.log('🔍 Live Scoreboard: No final round criteria found, falling back to main criteria');
    }
    
    console.log('🔍 Live Scoreboard: Current event:', selectedEvent);
    console.log('🔍 Live Scoreboard: Event criteriaCategories:', selectedEvent.criteriaCategories);
    console.log('🔍 Live Scoreboard: Event legacy criteria:', selectedEvent.criteria);
    
    // Use criteriaCategories if it exists (new structure)
    // If criteriaCategories field exists (even if empty), do NOT fall back to legacy criteria
    // This ensures admin must configure criteria via Manage Criteria for new events
    let criteria = [];
    
    // Check if criteriaCategories field exists (not just if it has items)
    const hasCriteriaCategoriesField = selectedEvent.hasOwnProperty('criteriaCategories') || selectedEvent.criteriaCategories !== undefined;
    
    if (hasCriteriaCategoriesField) {
      // New structure: extract sub-criteria from categories, or use categories as criteria if no sub-criteria
      if (selectedEvent.criteriaCategories && selectedEvent.criteriaCategories.length > 0) {
        console.log('🔍 Live Scoreboard: Processing', selectedEvent.criteriaCategories.length, 'categories');
        
        selectedEvent.criteriaCategories.forEach((category, catIndex) => {
          // Skip categories without a valid name
          if (!category.name || category.name.trim() === '') {
            console.log(`🔍 Live Scoreboard: Skipping category ${catIndex + 1} - no valid name`);
            return;
          }
          
          console.log(`🔍 Live Scoreboard: Category ${catIndex + 1}:`, category.name);
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
                  scoringType: category.scoringType || 'percentage'
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
                scoringType: category.scoringType || 'percentage'
              });
              console.log(`      ✓ Added category as criterion: ${category.name} with weight ${category.totalWeight}`);
            }
          }
        });
        console.log('🔍 Live Scoreboard: Using criteriaCategories - extracted criteria:', criteria);
      } else {
        console.log('🔍 Live Scoreboard: criteriaCategories field exists but is empty - admin needs to configure criteria');
      }
    } else if (selectedEvent.criteria && selectedEvent.criteria.length > 0) {
      // Legacy structure: use main event criteria (only for old events without criteriaCategories)
      console.log('🔍 Live Scoreboard: Using legacy criteria structure (old event without criteriaCategories)');
      // Only include criteria that have a valid name and are enabled
      criteria = selectedEvent.criteria.filter(c => c.enabled && c.name && c.name.trim() !== '');
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
    // Filter scores based on whether we're showing final round or main round
    let contestantScores = scores.filter(score => 
      score.contestantId === contestantId && score.eventId === eventId
    );
    
    // When showing final rounds only, filter to only include final round scores
    if (showFinalRoundsOnly) {
      // Filter for scores marked as final round
      const finalRoundScores = contestantScores.filter(score => score.isFinalRound === true);
      // If we have final round scores, use those; otherwise check for final_ prefixed keys in scores
      if (finalRoundScores.length > 0) {
        contestantScores = finalRoundScores;
      } else {
        // Fallback: check if any scores have final_ prefixed keys (for backward compatibility)
        contestantScores = contestantScores.filter(score => {
          if (!score.scores) return false;
          return Object.keys(score.scores).some(key => key.startsWith('final_'));
        });
      }
    } else {
      // When not showing final rounds, exclude final round scores (only show main round)
      const mainRoundScores = contestantScores.filter(score => score.isFinalRound !== true);
      // If we have main round scores, use those
      if (mainRoundScores.length > 0) {
        contestantScores = mainRoundScores;
      }
    }
    
    if (contestantScores.length === 0) {
      return { totalScore: 0, judgeCount: 0, criteriaScores: {} };
    }
    
    // Get the event to check grading type
    const event = events.find(e => e.id === eventId);
    
    // Count unique judges (not total score entries)
    const uniqueJudges = [...new Set(contestantScores.map(score => score.judgeId))];
    const judgeCount = uniqueJudges.length;
    
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
    let totalScore = judgeScoresList.length > 0 ? totalScoreSum / judgeScoresList.length : 0;
    
    // Get criteria for breakdown display
    const criteria = getCurrentEventCriteria();
    
    console.log('Live Scoreboard - Aggregating scores:', {
      contestantId,
      judgeCount,
      criteriaCount: criteria.length,
      totalScore,
      showFinalRoundsOnly
    });
    
    // Calculate average for each criteria for breakdown display
    const criteriaScores = {};
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const finalKey = `final_${key}`;
      
      const criteriaValues = judgeScoresList
        .map(score => {
          // When showing final rounds, prioritize final_ prefixed key
          // When showing main rounds, prioritize regular key
          if (showFinalRoundsOnly) {
            const finalScore = score.scores?.[finalKey];
            const regularScore = score.scores?.[key];
            // For final round, check final_ key first
            return finalScore > 0 ? finalScore : (regularScore > 0 ? regularScore : 0);
          } else {
            const regularScore = score.scores?.[key];
            // For main round, use regular key
            return regularScore > 0 ? regularScore : 0;
          }
        })
        .filter(val => val > 0);
      
      if (criteriaValues.length > 0) {
        criteriaScores[key] = criteriaValues.reduce((sum, val) => sum + val, 0) / criteriaValues.length;
      } else {
        criteriaScores[key] = 0;
      }
    });
    
    // Cap total at 100 for display
    totalScore = Math.min(totalScore, 100);
    
    return {
      totalScore: parseFloat(totalScore.toFixed(1)),
      judgeCount,
      criteriaScores
    };
  };

  // Helper function to get the highest score for a specific criterion
  const getHighestScore = (criteria) => {
    if (!contestants || contestants.length === 0) return 0;
    
    const scores = contestants.map(contestant => {
      return getContestantCriteriaScore(contestant, criteria.name);
    });
    
    return Math.max(...scores);
  };

  // Helper function to render a single scoreboard table
  const renderScoreboardTable = (tableCriteria, tableName, showCategoryHeaders = true) => {
    if (!tableCriteria || tableCriteria.length === 0) return null;
    
    return (
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="text-xl">📊</span>
          {tableName}
        </h3>
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-100">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-emerald-300 scrollbar-track-slate-100">
            <table className="w-full min-w-[500px] sm:min-w-[600px] md:min-w-[700px] lg:min-w-[800px]">
              <thead className="bg-gradient-to-r from-slate-50 via-emerald-50/50 to-slate-50 border-b-2 border-emerald-200">
                <tr>
                  <th className="px-1.5 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-10 sm:w-14 lg:w-20">Rank</th>
                  <th className="px-1.5 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-16 sm:w-20 lg:w-32">Name</th>
                  {tableCriteria.map((criteria, index) => {
                    const isPointsGrading = selectedEvent?.gradingType === 'points';
                    return (
                      <th key={index} className="px-1 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 md:py-4 text-center text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider min-w-[50px] sm:min-w-[70px] md:min-w-[80px] lg:min-w-[100px]">
                        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                          <span className="text-[9px] sm:text-[10px] md:text-xs font-bold text-slate-800 line-clamp-2">
                            {criteria.name}
                          </span>
                          {showCategoryHeaders && criteria.category && (
                            <span className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                              {criteria.category}
                            </span>
                          )}
                          {criteria.weight !== undefined && (
                            <span className="text-[8px] sm:text-[9px] md:text-xs font-bold text-slate-500 bg-slate-100 px-1 sm:px-1.5 py-0.5 rounded-lg">
                              {isPointsGrading ? `${criteria.weight}pt` : `${criteria.weight}%`}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-1.5 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 md:py-4 text-center text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-14 sm:w-16 lg:w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(showFinalRoundsOnly ? filterFinalRoundContestants(contestants) : contestants).map((contestant, index) => {
                  const rank = index + 1;
                  const rankColorClass = getRankColor(rank);
                  const isRecentlyUpdated = updatedContestants.has(contestant.id);
                  
                  // Calculate total for this table's criteria only
                  const tableTotal = (() => {
                    let total = 0;
                    const isPointsGrading = selectedEvent?.gradingType === 'points';
                    
                    tableCriteria.forEach((criteria) => {
                      const score = getContestantCriteriaScore(contestant, criteria.name);
                      if (isPointsGrading) {
                        total += score;
                      } else {
                        total += score * (criteria.weight / 100);
                      }
                    });
                    
                    return parseFloat(total.toFixed(1));
                  })();
                  
                  return (
                    <tr key={`${contestant.id}-${tableName}`} className={`hover:bg-emerald-50/50 transition-all duration-300 border-l-4 ${
                      rank === 1 ? 'hover:shadow-lg bg-gradient-to-r from-amber-50/50 to-white' : ''} ${
                      isRecentlyUpdated ? 'bg-emerald-50 animate-pulse' : ''} ${
                      contestant.eliminated ? 'opacity-60 bg-red-50' : ''} ${rankColorClass}`}>
                      <td className="px-1.5 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 whitespace-nowrap border-r border-gray-100 w-10 sm:w-14 lg:w-20">
                        <div className="flex items-center justify-center">
                          <span className="text-lg sm:text-2xl md:text-3xl lg:text-4xl">{getRankIcon(rank, contestant.eliminated)}</span>
                        </div>
                      </td>
                      <td className="px-1.5 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 whitespace-nowrap border-r border-gray-100 w-16 sm:w-20 lg:w-32">
                        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                          <div className={`relative h-7 w-7 sm:h-9 sm:w-9 md:h-10 md:w-10 lg:h-14 lg:w-14 rounded-full flex items-center justify-center shadow-md flex-shrink-0 overflow-hidden ${
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
                              <span className={`font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg ${
                                rank <= 5 ? 'text-white' : 'text-gray-700'
                              }`}>
                                {contestant.name ? contestant.name.charAt(0).toUpperCase() : 'C'}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                              <button 
                                onClick={() => handleContestantClick(contestant)}
                                className={`font-bold text-[10px] sm:text-xs md:text-sm lg:text-base transition-colors text-left truncate block hover:underline max-w-[60px] sm:max-w-[80px] md:max-w-none ${
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
                              <div className="flex items-center gap-1">
                                {contestant.contestantType === 'group' ? (
                                  <span className="inline-flex items-center text-[10px] sm:text-xs" title="Group">👥</span>
                                ) : (
                                  <span className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[9px] sm:text-xs font-medium bg-blue-100 text-blue-800 rounded-full" title="Solo">Solo</span>
                                )}
                                {isContestantInFinalRound(contestant) && (
                                  <span className="inline-flex items-center text-[10px] sm:text-xs" title="Finalist">🏆</span>
                                )}
                                {isRecentlyUpdated && (
                                  <div className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 bg-green-500 text-white text-[9px] sm:text-xs font-bold rounded-full animate-pulse">
                                    <span>LIVE</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="hidden sm:flex items-center gap-1 sm:gap-2 mt-1 flex-wrap">
                              <span className="text-xs sm:text-sm font-bold text-gray-700 bg-gray-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">#{contestant.number || rank}</span>
                              {contestant.eliminated && (
                                <span className="hidden md:inline-flex items-center px-1 py-0.5 bg-red-100 text-red-700 rounded-full text-[9px] sm:text-xs font-semibold" title="Eliminated">
                                  ❌
                                </span>
                              )}
                              {contestant.judgeCount > 0 && (
                                <span className="inline-flex items-center px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] sm:text-xs font-semibold">
                                  👤 {contestant.judgeCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      {tableCriteria.map((criteria, criteriaIndex) => {
                        const score = getContestantCriteriaScore(contestant, criteria.name);
                        const colors = [
                          'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300',
                          'bg-gradient-to-r from-cyan-100 to-cyan-200 text-cyan-800 border-cyan-300', 
                          'bg-gradient-to-r from-sky-100 to-sky-200 text-sky-800 border-sky-300',
                          'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300', 
                          'bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800 border-amber-300'
                        ];
                        const colorClass = colors[criteriaIndex % colors.length];
                        const hasScore = score > 0;
                        
                        // Check if this is the highest score for this criterion
                        const highestScore = getHighestScore(criteria);
                        const isTopScore = hasScore && score === highestScore && highestScore > 0;
                        
                        return (
                          <td key={criteriaIndex} className={`px-1 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-3 whitespace-nowrap text-center border-r border-slate-100 min-w-[40px] sm:min-w-[60px] md:min-w-[80px] lg:min-w-[100px] ${isTopScore ? 'bg-yellow-200' : ''}`}>
                            <div className="relative inline-flex items-center justify-center">
                              <div className={`inline-flex items-center justify-center px-1 sm:px-1.5 md:px-2 lg:px-3 py-0.5 sm:py-1 md:py-1.5 lg:py-2 text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-bold border ${colorClass} rounded-lg sm:rounded-xl shadow-sm min-w-[30px] sm:min-w-[40px] md:min-w-[50px] lg:min-w-[60px] ${isTopScore ? 'ring-2 ring-yellow-400 ring-opacity-60' : ''}`}>
                                {score === 0 ? '—' : `${score.toFixed(1)}`}
                              </div>
                              {isTopScore && (
                                <span className="absolute -top-1 -right-1 text-[8px] sm:text-[9px] md:text-[10px]" title="Top score for this criterion">
                                  🏆
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-1 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-3 whitespace-nowrap min-w-[50px] sm:min-w-[70px] md:min-w-[90px] lg:min-w-[100px]">
                        <div className="flex flex-col items-center">
                          <span className={`text-sm sm:text-lg md:text-xl lg:text-3xl font-extrabold ${
                            rank === 1 ? 'bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent' :
                            rank === 2 ? 'bg-gradient-to-r from-slate-500 to-slate-600 bg-clip-text text-transparent' :
                            rank === 3 ? 'bg-gradient-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent' :
                            rank === 4 ? 'bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent' :
                            rank === 5 ? 'bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent' :
                            'text-slate-600'
                          }`}>
                            {tableTotal === 0 ? '—' : tableTotal.toFixed(1)}
                          </span>
                          {tableTotal > 0 && (
                            <span className="hidden sm:inline text-[9px] sm:text-xs md:text-sm text-slate-500 font-bold">
                              {selectedEvent?.gradingType === 'points' 
                                ? `/${tableCriteria.reduce((sum, c) => sum + (c.weight || 0), 0)}` 
                                : '/100'
                              }
                            </span>
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
      </div>
    );
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
    if (!selectedEvent || !selectedEvent.id) {
      console.log('No selected event or event has no ID');
      return;
    }

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
  }, [selectedEvent, scores, showFinalRoundsOnly]); // Add showFinalRoundsOnly to recalculate scores when switching to final round mode

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
      case 1: return 'border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50'; // 1st place - Gold
      case 2: return 'border-slate-400 bg-gradient-to-r from-slate-50 to-gray-50'; // 2nd place - Silver
      case 3: return 'border-orange-400 bg-gradient-to-r from-orange-50 to-amber-50'; // 3rd place - Bronze
      case 4: return 'border-emerald-400 bg-gradient-to-r from-emerald-50 to-teal-50'; // 4th place - Emerald
      case 5: return 'border-teal-400 bg-gradient-to-r from-teal-50 to-cyan-50'; // 5th place - Teal
      default: return 'border-slate-200 bg-white'; // Others - White
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-4 border-emerald-200 border-t-emerald-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading live scores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/50">
      {/* Enhanced Header */}
      <header className="relative w-full shadow-2xl border-b border-emerald-500/30 sticky top-0 z-40 overflow-hidden">
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
        
        <div className="relative w-full px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="py-3 sm:py-4 md:py-5 lg:py-6">
            {/* Main Header Row */}
            <div className="flex flex-col gap-3 sm:gap-4">
              {/* Top Row - Back Button and Title */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                  <button 
                    onClick={() => window.location.href = '/'}
                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 text-white/90 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl transition-all duration-300 group border border-white/20"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span className="font-semibold text-xs sm:text-sm md:text-base hidden sm:inline">Back</span>
                  </button>
                  <div className="h-6 sm:h-8 w-px bg-white/30 hidden sm:block"></div>
                  <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40 group-hover:opacity-60 transition duration-300 hidden sm:block"></div>
                      <div className="relative p-2 sm:p-2.5 md:p-3 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-xl border border-white/30">
                        <span className="text-xl sm:text-2xl md:text-3xl">🏆</span>
                      </div>
                    </div>
                    <div>
                      <h1 className="text-base sm:text-lg md:text-2xl lg:text-3xl font-extrabold text-white drop-shadow-lg">
                        Live Scoreboard
                      </h1>
                      <p className="text-emerald-100 text-[10px] sm:text-xs md:text-sm font-medium hidden sm:block">Real-time competition scores</p>
                    </div>
                  </div>
                </div>

                {/* Mobile Status Indicator */}
                <div className="lg:hidden flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 ${
                    connectionStatus === 'connected' && isLive 
                      ? 'text-emerald-200' 
                      : connectionStatus === 'connected' 
                      ? 'text-yellow-200' 
                      : 'text-red-200'
                  }`}>
                    <div className={`relative w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${
                      connectionStatus === 'connected' && isLive 
                        ? 'bg-emerald-400 animate-pulse' 
                        : connectionStatus === 'connected' 
                        ? 'bg-yellow-400' 
                        : 'bg-red-400'
                    }`}>
                      {connectionStatus === 'connected' && isLive && (
                        <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping"></div>
                      )}
                    </div>
                    <span className="font-bold text-[10px] sm:text-xs text-white">
                      {connectionStatus === 'connected' && isLive ? '🔴 Live' : '🟡'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Section - Status and Controls (Desktop Only) */}
              <div className="hidden lg:flex flex-row items-center gap-4">
                {/* Connection Status */}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
                  <div className={`flex items-center gap-2 ${
                    connectionStatus === 'connected' && isLive 
                      ? 'text-emerald-200' 
                      : connectionStatus === 'connected' 
                      ? 'text-yellow-200' 
                      : 'text-red-200'
                  }`}>
                    <div className={`relative w-3.5 h-3.5 rounded-full ${
                      connectionStatus === 'connected' && isLive 
                        ? 'bg-emerald-400 animate-pulse' 
                        : connectionStatus === 'connected' 
                        ? 'bg-yellow-400' 
                        : 'bg-red-400'
                    }`}>
                      {connectionStatus === 'connected' && isLive && (
                        <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping"></div>
                      )}
                    </div>
                    <span className="font-bold text-sm text-white">
                      {connectionStatus === 'connected' && isLive 
                        ? '🔴 Live' 
                        : connectionStatus === 'connected' 
                        ? '🟡 Connected' 
                        : '🔴 Disconnected'
                      }
                    </span>
                  </div>
                  <div className="h-4 w-px bg-white/30"></div>
                  <div className="text-xs text-white/80">
                    <div className="font-semibold">Updated</div>
                    <div className="font-medium">{lastUpdate.toLocaleTimeString()}</div>
                  </div>
                </div>

                {/* Reconnect Button */}
                {connectionStatus === 'disconnected' && (
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all duration-300 flex items-center gap-2 shadow-lg font-bold"
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

      {/* Event Selector - Enhanced */}
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-6">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-slate-100 overflow-hidden">
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/10"></div>
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                <div className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center border border-white/30 shadow-lg">
                  <span className="text-lg sm:text-xl md:text-2xl">🎭</span>
                </div>
                <div>
                  <h2 className="text-sm sm:text-base md:text-xl font-extrabold text-white drop-shadow-sm">Event Selection</h2>
                  <p className="text-emerald-100 text-[10px] sm:text-xs md:text-sm font-medium hidden sm:block">Choose an event to view scores</p>
                </div>
              </div>
              <div className="text-right bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 border border-white/20">
                <p className="text-emerald-100 text-[10px] sm:text-xs font-semibold">Events</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white">{events.length}</p>
              </div>
            </div>
          </div>
          <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-r from-slate-50 to-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="w-full">
                <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5 sm:mb-2">Select Event</label>
                <select
                  value={selectedEvent?.id || ''}
                  onChange={(e) => {
                    const event = events.find(ev => ev.id === e.target.value);
                    setSelectedEvent(event);
                  }}
                  className="block w-full px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-sm sm:text-base border-2 border-slate-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all duration-200 bg-white shadow-sm hover:border-emerald-300 font-medium text-slate-800"
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.status === 'ongoing' ? '🎭' : event.status === 'upcoming' ? '📅' : '✅'} {event.eventName} ({event.status})
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Final Rounds Only Filter */}
              {selectedEvent && selectedEvent.rounds && selectedEvent.rounds.length > 0 && getFinalRoundName() && (
                <div className="w-full lg:max-w-xs">
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5 sm:mb-2">
                    {showFinalRoundsOnly ? '🏆 Final Round Scores' : 'View Final Round'}
                  </label>
                  <div className="flex items-center gap-2 sm:gap-3 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 shadow-sm hover:border-amber-300 transition-all duration-200">
                    <button
                      onClick={() => setShowFinalRoundsOnly(!showFinalRoundsOnly)}
                      className={`relative inline-flex h-6 w-10 sm:h-7 sm:w-12 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                        showFinalRoundsOnly ? 'bg-gradient-to-r from-amber-400 to-orange-400 shadow-lg shadow-amber-400/25' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 sm:h-5 sm:w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                          showFinalRoundsOnly ? 'translate-x-5 sm:translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`text-xs sm:text-sm font-bold ${
                      showFinalRoundsOnly ? 'text-amber-600' : 'text-slate-600'
                    }`}>
                      {showFinalRoundsOnly ? `${filterFinalRoundContestants(contestants).length} Finalists` : 'All Contestants'}
                    </span>
                  </div>
                  {showFinalRoundsOnly && (
                    <p className="text-[10px] sm:text-xs text-amber-600 mt-1 font-medium">
                      Showing final round criteria & scores
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contest Info - Enhanced */}
      {selectedEvent && (
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-6">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-slate-100 overflow-hidden">
            {/* Event Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-8">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/10"></div>
              <div className="relative flex flex-col items-center text-center gap-3 sm:gap-4">
                <div className="w-full">
                  <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-extrabold text-white mb-2 sm:mb-3 break-words leading-tight drop-shadow-lg">{selectedEvent.eventName}</h2>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 md:gap-4 text-emerald-100 text-xs sm:text-sm md:text-base">
                    <div className="flex items-center gap-1.5 sm:gap-2 bg-white/10 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate font-medium text-xs sm:text-sm">{selectedEvent.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 bg-white/10 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate font-medium text-xs sm:text-sm max-w-[120px] sm:max-w-none">{selectedEvent.venue}</span>
                    </div>
                  </div>
                  {/* Current Filter Display */}
                  {showFinalRoundsOnly && (
                    <div className="flex justify-center mt-2 sm:mt-3">
                      <div className="bg-white/20 backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-white/30">
                        <span className="text-white font-bold text-xs sm:text-sm">
                          🏆 Finalists ({filterFinalRoundContestants(contestants).length})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 items-center justify-center gap-2 sm:gap-3 md:gap-4 w-full max-w-2xl">
                  <div className="bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-center border border-white/30 shadow-lg">
                    <p className="text-emerald-100 text-[10px] sm:text-xs md:text-sm font-semibold mb-0.5 sm:mb-1">Contestants</p>
                    <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-white">{contestants.length}</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-center border border-white/30 shadow-lg">
                    <p className="text-emerald-100 text-[10px] sm:text-xs md:text-sm font-semibold mb-1 sm:mb-2">Status</p>
                    <div className={`inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 text-[10px] sm:text-xs md:text-sm font-bold rounded-full shadow-lg ${
                      selectedEvent.status === 'ongoing' ? 'bg-emerald-400 text-emerald-900' :
                      selectedEvent.status === 'upcoming' ? 'bg-cyan-400 text-cyan-900' :
                      'bg-slate-400 text-slate-900'
                    }`}>
                      <span className="text-sm sm:text-base">{selectedEvent.status === 'ongoing' ? '🎭' : selectedEvent.status === 'upcoming' ? '📅' : '✅'}</span>
                      <span className="hidden sm:inline">{selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}</span>
                    </div>
                  </div>
                  {highestScorer && (
                    <div className="col-span-2 sm:col-span-1 bg-gradient-to-r from-amber-400 to-orange-400 rounded-lg sm:rounded-xl px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-center shadow-xl border border-amber-300/50">
                      <p className="text-amber-900 text-[10px] sm:text-xs md:text-sm font-bold mb-0.5 sm:mb-1">🏆 Leading</p>
                      <div className="flex items-center justify-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                        <p className="text-sm sm:text-base md:text-xl font-extrabold text-amber-900 truncate max-w-[80px] sm:max-w-[100px] md:max-w-[120px]">{highestScorer.name}</p>
                        {highestScorer.contestantType === 'group' ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-purple-200 text-purple-900 rounded-full" title="Group Contestant">
                            👥
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-blue-200 text-blue-900 rounded-full" title="Solo Contestant">
                            Solo
                          </span>
                        )}
                      </div>
                      <p className="text-amber-800 text-[10px] sm:text-xs md:text-sm font-extrabold">
                            {highestScorer.totalScore.toFixed(1)}
                            {selectedEvent?.gradingType === 'points' 
                              ? ` / ${getCurrentEventCriteria().reduce((sum, c) => sum + (c.weight || 0), 0)}`
                              : '%'
                            }
                          </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Judge Statistics - Enhanced */}
            <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-r from-slate-50 to-white border-t border-slate-100">
              <h3 className="text-sm sm:text-base md:text-lg font-extrabold text-slate-800 mb-3 sm:mb-4 md:mb-6 flex items-center justify-center gap-2 sm:gap-3 text-center">
                <span className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg sm:rounded-xl flex items-center justify-center shadow-sm">🧑‍⚖️</span>
                <span className="hidden sm:inline">Judge Statistics</span>
                <span className="sm:hidden">Judges</span>
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 max-w-6xl mx-auto">
                <div className="group relative bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-blue-100 p-2.5 sm:p-3 md:p-5 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-500 hover:-translate-y-1">
                  <div className="absolute top-0 right-0 w-16 sm:w-24 h-16 sm:h-24 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-full -translate-y-8 sm:-translate-y-12 translate-x-8 sm:translate-x-12 group-hover:scale-150 transition-transform duration-500"></div>
                  <div className="relative">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                      <span className="text-base sm:text-lg md:text-xl text-white">👥</span>
                    </div>
                    <p className="text-[10px] sm:text-xs md:text-sm text-blue-600 font-bold mb-0.5 sm:mb-1">Total</p>
                    <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">{judgeStats.totalJudges}</p>
                  </div>
                </div>
                <div className="group relative bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-emerald-100 p-2.5 sm:p-3 md:p-5 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-500 hover:-translate-y-1">
                  <div className="absolute top-0 right-0 w-16 sm:w-24 h-16 sm:h-24 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-full -translate-y-8 sm:-translate-y-12 translate-x-8 sm:translate-x-12 group-hover:scale-150 transition-transform duration-500"></div>
                  <div className="relative">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                      <span className="text-base sm:text-lg md:text-xl text-white">✅</span>
                    </div>
                    <p className="text-[10px] sm:text-xs md:text-sm text-emerald-600 font-bold mb-0.5 sm:mb-1">Active</p>
                    <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{judgeStats.activeJudges}</p>
                  </div>
                </div>
                <div className="group relative bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-purple-100 p-2.5 sm:p-3 md:p-5 hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-500 hover:-translate-y-1">
                  <div className="absolute top-0 right-0 w-16 sm:w-24 h-16 sm:h-24 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-full -translate-y-8 sm:-translate-y-12 translate-x-8 sm:translate-x-12 group-hover:scale-150 transition-transform duration-500"></div>
                  <div className="relative">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                      <span className="text-base sm:text-lg md:text-xl text-white">📊</span>
                    </div>
                    <p className="text-[10px] sm:text-xs md:text-sm text-purple-600 font-bold mb-0.5 sm:mb-1">Scores</p>
                    <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">{judgeStats.totalScores}</p>
                  </div>
                </div>
                <div className="group relative bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-amber-100 p-2.5 sm:p-3 md:p-5 hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-500 hover:-translate-y-1">
                  <div className="absolute top-0 right-0 w-16 sm:w-24 h-16 sm:h-24 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full -translate-y-8 sm:-translate-y-12 translate-x-8 sm:translate-x-12 group-hover:scale-150 transition-transform duration-500"></div>
                  <div className="relative">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                      <span className="text-base sm:text-lg md:text-xl text-white">🎯</span>
                    </div>
                    <p className="text-[10px] sm:text-xs md:text-sm text-amber-600 font-bold mb-0.5 sm:mb-1">Done</p>
                    <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">{judgeStats.completedEvaluations}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scoreboard - Enhanced */}
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 pb-6 sm:pb-8 md:pb-12">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-2xl overflow-hidden border border-slate-100">
          {contestants.length === 0 ? (
            <div className="p-6 sm:p-8 md:p-12 lg:p-16 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mx-auto bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6">
                <span className="text-3xl sm:text-4xl md:text-5xl">👥</span>
              </div>
              <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-800 mb-2 sm:mb-3">No contestants for this event</h3>
              <p className="text-sm sm:text-base md:text-lg text-slate-600 max-w-2xl mx-auto">Contestants will appear here once they are registered for "{selectedEvent?.eventName || 'this event'}" by the administrator.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Mobile Scroll Indicator - Enhanced */}
              <div className="lg:hidden absolute top-0 left-0 right-0 z-10 px-2 sm:px-3 md:px-4 py-2 sm:py-3 bg-gradient-to-r from-emerald-50 via-white to-teal-50 backdrop-blur-sm border-b border-emerald-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                    </svg>
                    <span className="text-[10px] sm:text-xs md:text-sm text-emerald-700 font-bold">
                      Swipe to see scores
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse delay-75"></div>
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse delay-150"></div>
                  </div>
                </div>
              </div>
              
              {/* Scrollable Table Container */}
              {/* Three-Table Layout or Single Table */}
              {(() => {
                const tableConfig = getThreeTableCriteria();
                
                if (tableConfig.showSingleTable) {
                  // Show original single table for events without sub-criteria or with more than 2 categories
                  return (
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-emerald-300 scrollbar-track-slate-100 pt-8 sm:pt-10 lg:pt-0">
                      <table className="w-full min-w-[500px] sm:min-w-[600px] md:min-w-[700px] lg:min-w-[800px]">
              <thead className="bg-gradient-to-r from-slate-50 via-emerald-50/50 to-slate-50 border-b-2 border-emerald-200">
                <tr>
                  <th className="px-1.5 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-10 sm:w-14 lg:w-20">Rank</th>
                  <th className="px-1.5 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 md:py-4 text-left text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-16 sm:w-20 lg:w-32">Name</th>
                  {tableConfig.combined.map((criteria, index) => {
                    const isPointsGrading = selectedEvent?.gradingType === 'points';
                    return (
                    <th key={index} className="px-1 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 md:py-4 text-center text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider min-w-[50px] sm:min-w-[70px] md:min-w-[80px] lg:min-w-[100px]">
                      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                        <span className="text-[9px] sm:text-[10px] md:text-xs font-bold text-slate-800 line-clamp-2">
                          {criteria.name}
                        </span>
                        {criteria.category && (
                          <span className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                            {criteria.category}
                          </span>
                        )}
                        {criteria.weight !== undefined && (
                          <span className="text-[8px] sm:text-[9px] md:text-xs font-bold text-slate-500 bg-slate-100 px-1 sm:px-1.5 py-0.5 rounded-lg">
                            {isPointsGrading ? `${criteria.weight}pt` : `${criteria.weight}%`}
                          </span>
                        )}
                      </div>
                    </th>
                    );
                  })}
                  <th className="px-1.5 sm:px-2 md:px-3 lg:px-4 py-2 sm:py-3 md:py-4 text-center text-[10px] sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider w-14 sm:w-16 lg:w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(showFinalRoundsOnly ? filterFinalRoundContestants(contestants) : contestants).map((contestant, index) => {
                  const rank = index + 1;
                  const rankColorClass = getRankColor(rank);
                  const isRecentlyUpdated = updatedContestants.has(contestant.id);
                  return (
                  <tr key={contestant.id} className={`hover:bg-emerald-50/50 transition-all duration-300 border-l-4 ${
                    rank === 1 ? 'hover:shadow-lg bg-gradient-to-r from-amber-50/50 to-white' : ''} ${
                    isRecentlyUpdated ? 'bg-emerald-50 animate-pulse' : ''} ${
                    contestant.eliminated ? 'opacity-60 bg-red-50' : ''} ${rankColorClass}`}>
                    <td className="px-1.5 sm:px-2 md:px-4 py-2 sm:py-3 whitespace-nowrap border-r border-gray-100 w-10 sm:w-14 lg:w-20">
                      <div className="flex items-center justify-center">
                        <span className="text-lg sm:text-2xl md:text-3xl lg:text-4xl">{getRankIcon(rank, contestant.eliminated)}</span>
                      </div>
                    </td>
                    <td className="px-1.5 sm:px-2 md:px-4 py-2 sm:py-3 whitespace-nowrap border-r border-gray-100 w-16 sm:w-20 lg:w-32">
                          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                            <div className={`relative h-7 w-7 sm:h-9 sm:w-9 md:h-10 md:w-10 lg:h-14 lg:w-14 rounded-full flex items-center justify-center shadow-md flex-shrink-0 overflow-hidden ${
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
                                <span className={`font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg ${
                                  rank <= 5 ? 'text-white' : 'text-gray-700'
                                }`}>
                                  {contestant.name ? contestant.name.charAt(0).toUpperCase() : 'C'}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                                <button 
                                  onClick={() => handleContestantClick(contestant)}
                                  className={`font-bold text-[10px] sm:text-xs md:text-sm lg:text-base transition-colors text-left truncate block hover:underline max-w-[60px] sm:max-w-[80px] md:max-w-none ${
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
                                <div className="flex items-center gap-1">
                                  {contestant.contestantType === 'group' ? (
                                    <span className="inline-flex items-center text-[10px] sm:text-xs" title="Group">👥</span>
                                  ) : (
                                    <span className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[9px] sm:text-xs font-medium bg-blue-100 text-blue-800 rounded-full" title="Solo">Solo</span>
                                  )}
                                  {isContestantInFinalRound(contestant) && (
                                    <span className="inline-flex items-center text-[10px] sm:text-xs" title="Finalist">🏆</span>
                                  )}
                                  {isRecentlyUpdated && (
                                    <div className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 bg-green-500 text-white text-[9px] sm:text-xs font-bold rounded-full animate-pulse">
                                      <span>LIVE</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="hidden sm:flex items-center gap-1 sm:gap-2 mt-1 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold text-gray-700 bg-gray-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">#{contestant.number || rank}</span>
                                {contestant.eliminated && (
                                  <span className="hidden md:inline-flex items-center px-1 py-0.5 bg-red-100 text-red-700 rounded-full text-[9px] sm:text-xs font-semibold" title="Eliminated">
                                    ❌
                                  </span>
                                )}
                                {contestant.judgeCount > 0 && (
                                  <span className="inline-flex items-center px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] sm:text-xs font-semibold">
                                    👤 {contestant.judgeCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                                    {tableConfig.combined.map((criteria, criteriaIndex) => {
                                      const score = getContestantCriteriaScore(contestant, criteria.name);
                                      const colors = [
                                        'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300',
                                        'bg-gradient-to-r from-cyan-100 to-cyan-200 text-cyan-800 border-cyan-300', 
                                        'bg-gradient-to-r from-sky-100 to-sky-200 text-sky-800 border-sky-300',
                                        'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300', 
                                        'bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800 border-amber-300'
                                      ];
                                      const colorClass = colors[criteriaIndex % colors.length];
                                      const hasScore = score > 0;
                                      
                                      // Check if this is the highest score for this criterion
                                      const highestScore = getHighestScore(criteria);
                                      const isTopScore = hasScore && score === highestScore && highestScore > 0;
                                      
                                      return (
                                        <td key={criteriaIndex} className={`px-1 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-3 whitespace-nowrap text-center border-r border-slate-100 min-w-[40px] sm:min-w-[60px] md:min-w-[80px] lg:min-w-[100px] ${isTopScore ? 'bg-yellow-200' : ''}`}>
                                          <div className="relative inline-flex items-center justify-center">
                                            <div className={`inline-flex items-center justify-center px-1 sm:px-1.5 md:px-2 lg:px-3 py-0.5 sm:py-1 md:py-1.5 lg:py-2 text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-bold border ${colorClass} rounded-lg sm:rounded-xl shadow-sm min-w-[30px] sm:min-w-[40px] md:min-w-[50px] lg:min-w-[60px] ${isTopScore ? 'ring-2 ring-yellow-400 ring-opacity-60' : ''}`}>
                                              {score === 0 ? '—' : `${score.toFixed(1)}`}
                                            </div>
                                            {isTopScore && (
                                              <span className="absolute -top-1 -right-1 text-[8px] sm:text-[9px] md:text-[10px]" title="Top score for this criterion">
                                                🏆
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                    <td className="px-1 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-3 whitespace-nowrap min-w-[50px] sm:min-w-[70px] md:min-w-[90px] lg:min-w-[100px]">
                                      <div className="flex flex-col items-center">
                                        <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2">
                                          <span className={`text-sm sm:text-lg md:text-xl lg:text-3xl font-extrabold ${
                                            rank === 1 ? 'bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent' :
                                            rank === 2 ? 'bg-gradient-to-r from-slate-500 to-slate-600 bg-clip-text text-transparent' :
                                            rank === 3 ? 'bg-gradient-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent' :
                                            rank === 4 ? 'bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent' :
                                            rank === 5 ? 'bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent' :
                                            'text-slate-600'
                                          }`}>
                                            {contestant.totalScore === 0 ? '—' : contestant.totalScore.toFixed(1)}
                                          </span>
                                          {contestant.totalScore > 0 && (
                                            <span className="hidden sm:inline text-[9px] sm:text-xs md:text-sm text-slate-500 font-bold">
                                              {selectedEvent?.gradingType === 'points' 
                                                ? `/${tableConfig.combined.reduce((sum, c) => sum + (c.weight || 0), 0)}`
                                                : '/100'
                                              }
                                            </span>
                                          )}
                                        </div>
                                        {rank === 1 && contestant.totalScore > 0 && (
                                          <div className="mt-0.5 sm:mt-1">
                                            <span className="hidden sm:inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full shadow-lg">
                                              🏆 <span className="hidden md:inline ml-1">Leading</span>
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
                      );
                    } else {
                      // Show three separate tables for events with exactly 2 categories
                      return (
                        <div className="space-y-6">
                          {renderScoreboardTable(tableConfig.category1, `Category 1: ${tableConfig.category1Name}`, false)}
                          {renderScoreboardTable(tableConfig.category2, `Category 2: ${tableConfig.category2Name}`, false)}
                          {renderScoreboardTable(tableConfig.combined, 'Combined Scores', true)}
                        </div>
                      );
                    }
                  })()}
            </div>
          )}
        </div>
      </div>

      {/* Contestant Detail Modal - Enhanced */}
      {showModal && selectedContestant && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-0 sm:p-4">
          <div className="bg-white shadow-2xl w-full h-full sm:h-auto sm:max-h-[95vh] sm:rounded-2xl transform transition-all duration-300 scale-100 animate-slide-up flex flex-col overflow-hidden">
            {/* Modal Header - Enhanced */}
            <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5 shadow-xl flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/10"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                  {/* Previous Button */}
                  <button
                    onClick={navigateToPreviousContestant}
                    disabled={contestants.findIndex(c => c.id === selectedContestant.id) === 0}
                    className="text-white hover:text-emerald-200 transition-all duration-300 p-1.5 sm:p-2 md:p-2.5 hover:bg-white/20 rounded-lg sm:rounded-xl transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 border border-white/20"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="animate-fade-in">
                    <h3 className="text-sm sm:text-base md:text-lg lg:text-xl font-extrabold text-white drop-shadow-sm">Details</h3>
                    <p className="text-emerald-100 text-[10px] sm:text-xs md:text-sm mt-0.5 sm:mt-1 font-medium hidden sm:block">View scores and information</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Next Button */}
                  <button
                    onClick={navigateToNextContestant}
                    disabled={contestants.findIndex(c => c.id === selectedContestant.id) === contestants.length - 1}
                    className="text-white hover:text-emerald-200 transition-all duration-300 p-1.5 sm:p-2 md:p-2.5 hover:bg-white/20 rounded-lg sm:rounded-xl transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 border border-white/20"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={closeModal}
                    className="text-white hover:text-red-200 transition-all duration-300 p-1.5 sm:p-2 hover:bg-red-500/30 rounded-lg sm:rounded-xl transform hover:scale-110 border border-white/20"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Body - Responsive Layout */}
            <div className="flex-1 p-3 sm:p-4 md:p-6 overflow-hidden flex flex-col bg-gradient-to-br from-slate-50 to-white">
              {/* Single Unified Card */}
              <div className="flex-1 overflow-y-auto">
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-slate-100 overflow-hidden">
                  <div className="flex flex-col lg:flex-row">
                    {/* Left Sidebar - Profile Image and Basic Info */}
                    <div className="lg:w-80 xl:w-96 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-4 sm:p-5 md:p-6 text-white relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/10"></div>
                      {/* Profile Image */}
                      <div className="relative flex-shrink-0 group mb-4 sm:mb-5 md:mb-6">
                        <div className="absolute inset-0 bg-white/20 rounded-xl sm:rounded-2xl blur-xl"></div>
                        {selectedContestant.photo ? (
                          <div className="relative">
                            <img 
                              src={selectedContestant.photo} 
                              alt={selectedContestant.name}
                              className={`relative w-40 h-52 sm:w-56 sm:h-72 md:w-64 md:h-80 lg:w-72 lg:h-96 mx-auto object-contain shadow-2xl bg-white animate-pulse-shadow ${
                                imageOrientations[selectedContestant.id] === 'landscape' ? 'rounded-none' : 'rounded-xl sm:rounded-2xl'
                              }`}
                            />
                          </div>
                        ) : (
                          <div className="relative w-40 h-52 sm:w-56 sm:h-72 md:w-64 md:h-80 lg:w-72 lg:h-96 mx-auto rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-2xl">
                            <span className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold text-white">
                              {selectedContestant.name ? selectedContestant.name.charAt(0).toUpperCase() : 'C'}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Basic Info */}
                      <div className="text-center">
                        <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2">
                          {selectedContestant.name}
                        </h3>
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                          {selectedContestant.contestantType === 'group' ? (
                            <span className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium bg-white/20 backdrop-blur-sm text-white rounded-full border border-white/30">
                              👥 Group
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium bg-white/20 backdrop-blur-sm text-white rounded-full border border-white/30">
                              Solo
                            </span>
                          )}
                          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm sm:text-lg font-bold text-white border border-white/30">
                            <span className="text-sm sm:text-lg">🎯</span>
                            #{selectedContestant.number || 'N/A'}
                          </div>
                        </div>
                        
                        {/* Total Score Display */}
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/20">
                          <div className="text-2xl sm:text-3xl md:text-4xl font-bold mb-0.5 sm:mb-1">
                            {selectedContestant.totalScore.toFixed(1)}
                            {selectedEvent?.gradingType === 'points' 
                              ? ` / ${getCurrentEventCriteria().reduce((sum, c) => sum + (c.weight || 0), 0)}`
                              : '%'
                            }
                          </div>
                          <div className="text-xs sm:text-sm opacity-90">Total Score</div>
                          <div className="mt-2 sm:mt-3 flex justify-around text-center">
                            <div>
                              <div className="text-base sm:text-lg md:text-xl font-bold">{selectedContestant.judgeCount || 0}</div>
                              <div className="text-[10px] sm:text-xs opacity-90">Judges</div>
                            </div>
                            <div>
                              <div className="text-base sm:text-lg md:text-xl font-bold">
                                #{contestants.findIndex(c => c.id === selectedContestant.id) + 1}
                              </div>
                              <div className="text-[10px] sm:text-xs opacity-90">Rank</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right Content - Criteria Scores */}
                    <div className="flex-1 p-3 sm:p-4 md:p-6">
                      {/* Performance Badge */}
                      <div className="mb-3 sm:mb-4 md:mb-6">
                        <div className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold ${
                          selectedContestant.totalScore >= 90 ? 'bg-green-100 text-green-800 border border-green-300' :
                          selectedContestant.totalScore >= 80 ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                          selectedContestant.totalScore >= 70 ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
                          'bg-gray-100 text-gray-800 border border-gray-300'
                        }`}>
                          <span className="text-sm sm:text-lg">
                            {selectedContestant.totalScore >= 90 ? '🌟' :
                             selectedContestant.totalScore >= 80 ? '👍' :
                             selectedContestant.totalScore >= 70 ? '👌' : '📈'}
                          </span>
                          <span className="hidden sm:inline">
                            {selectedContestant.totalScore >= 90 ? 'Excellent Performance' :
                             selectedContestant.totalScore >= 80 ? 'Good Performance' :
                             selectedContestant.totalScore >= 70 ? 'Average Performance' : 'Needs Improvement'}
                          </span>
                          <span className="sm:hidden">
                            {selectedContestant.totalScore >= 90 ? 'Excellent' :
                             selectedContestant.totalScore >= 80 ? 'Good' :
                             selectedContestant.totalScore >= 70 ? 'Average' : 'More Effort'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Leading Badge */}
                      {selectedContestant.totalScore === highestScorer?.totalScore && (
                        <div className="mb-3 sm:mb-4 md:mb-6">
                          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-full text-xs sm:text-sm font-bold text-yellow-800 border border-yellow-300 shadow-lg">
                            <span className="text-sm sm:text-lg">🏆</span>
                            <span className="hidden sm:inline">Currently Leading</span>
                            <span className="sm:hidden">Leading</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Criteria Scores */}
                      <div className="space-y-2 sm:space-y-3 md:space-y-4">
                        <h4 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
                          <span className="text-base sm:text-lg md:text-xl">📊</span>
                          <span className="hidden sm:inline">Detailed Criteria Scores</span>
                          <span className="sm:hidden">Scores</span>
                        </h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                          {getCurrentEventCriteria().map((criteria, index) => {
                            const score = getContestantCriteriaScore(selectedContestant, criteria.name);
                            const isPointsGrading = selectedEvent?.gradingType === 'points';
                            const colors = [
                              'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300',
                              'bg-gradient-to-r from-cyan-100 to-cyan-200 text-cyan-800 border-cyan-300', 
                              'bg-gradient-to-r from-sky-100 to-sky-200 text-sky-800 border-sky-300',
                              'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300', 
                              'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border-yellow-300'
                            ];
                            const colorClass = colors[index % colors.length];
                            return (
                              <div key={index} className="bg-white rounded-lg border border-gray-200 p-2.5 sm:p-3 md:p-4 hover:shadow-md transition-all duration-300">
                                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className={`w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center text-[10px] sm:text-xs md:text-sm font-bold border ${colorClass}`}>
                                      {score === 0 ? '—' : `${score.toFixed(1)}`}
                                    </div>
                                    <div>
                                      <div className="font-medium text-gray-900 text-xs sm:text-sm md:text-base line-clamp-1">{criteria.name}</div>
                                      <div className="flex items-center gap-1 sm:gap-2 mt-0.5 sm:mt-1">
                                        {criteria.category && (
                                          <span className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] sm:text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full">
                                            {criteria.category}
                                          </span>
                                        )}
                                        <span className="text-[9px] sm:text-[10px] md:text-xs font-medium text-gray-500 bg-gray-100 px-1 sm:px-1.5 py-0.5 rounded">
                                          {isPointsGrading ? `${criteria.weight}pt` : `${criteria.weight}%`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-gray-900">
                                      {isPointsGrading 
                                        ? `${score.toFixed(1)}/${criteria.weight}`
                                        : `${(score * criteria.weight / 100).toFixed(1)}pt`
                                      }
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Progress Bar */}
                                <div className="mt-1.5 sm:mt-2 md:mt-3">
                                  <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                                    <div 
                                      className={`h-1.5 sm:h-2 rounded-full ${
                                        score >= 90 ? 'bg-green-500' :
                                        score >= 80 ? 'bg-blue-500' :
                                        score >= 70 ? 'bg-yellow-500' : 'bg-gray-400'
                                      }`}
                                      style={{ width: `${isPointsGrading ? Math.min((score / criteria.weight) * 100, 100) : Math.min(score, 100)}%` }}
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
