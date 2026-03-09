'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';

export default function ManageScoreDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contestants, setContestants] = useState([]);
  const [events, setEvents] = useState([]);
  const [judges, setJudges] = useState([]);
  const [judgeData, setJudgeData] = useState(null);
  const [scores, setScores] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContestant, setSelectedContestant] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });
  const [viewMode, setViewMode] = useState('main'); // 'main', 'final', or 'combined'
  const [cleanupListeners, setCleanupListeners] = useState(null);
  const printRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Check if this is the managescore@gmail.com account
        if (user.email !== 'managescore@gmail.com') {
          router.push('/judge/dashboard');
          return;
        }

        try {
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
          
          // Set up real-time listeners and store cleanup
          const cleanup = setupRealtimeListeners();
          setCleanupListeners(() => cleanup);
          
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

    return () => {
      unsubscribe();
      // Cleanup listeners will be handled by the other useEffect
    };
  }, [router]);

  // Cleanup real-time listeners when component unmounts or user changes
  useEffect(() => {
    return () => {
      if (cleanupListeners) {
        cleanupListeners();
      }
    };
  }, [cleanupListeners]);

  const setupRealtimeListeners = () => {
    // Real-time listener for events
    const unsubscribeEvents = onSnapshot(collection(db, 'events'), (snapshot) => {
      const eventsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort to get ongoing events first
      eventsList.sort((a, b) => {
        const statusPriority = { ongoing: 0, upcoming: 1, finished: 2 };
        return (statusPriority[a.status] || 3) - (statusPriority[b.status] || 3);
      });
      setEvents(eventsList);
      if (eventsList.length > 0 && !selectedEvent) {
        setSelectedEvent(eventsList[0]);
      }
      setLastUpdated(new Date());
    });

    // Real-time listener for contestants
    const unsubscribeContestants = onSnapshot(collection(db, 'contestants'), (snapshot) => {
      const contestantsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContestants(contestantsList);
      setLastUpdated(new Date());
    });

    // Real-time listener for scores - this updates the score view and judges detailed scores tables
    const unsubscribeScores = onSnapshot(collection(db, 'scores'), (snapshot) => {
      const scoresList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('📊 Scores updated in real-time:', scoresList.length, 'scores');
      setScores(scoresList);
      setLastUpdated(new Date());
    });

    // Real-time listener for judges
    const unsubscribeJudges = onSnapshot(collection(db, 'judges'), (snapshot) => {
      const judgesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJudges(judgesList);
      setLastUpdated(new Date());
    });

    // Return cleanup function
    return () => {
      console.log('🧹 Cleaning up real-time listeners');
      unsubscribeEvents();
      unsubscribeContestants();
      unsubscribeScores();
      unsubscribeJudges();
    };
  };

  // Get judges assigned to selected event
  const getEventJudges = () => {
    if (!selectedEvent) return [];
    
    // Filter judges assigned to this event - relax conditions to match admin page
    return judges.filter(j => {
      // Must be assigned to this event
      const isAssigned = j.assignedEvents?.includes(selectedEvent.id);
      // Exclude the managescore user
      const isNotManagescore = j.email !== 'managescore@gmail.com';
      // Check if active (support both 'status' and 'isActive' fields)
      const isActive = j.status === 'active' || j.isActive === true || j.status !== 'inactive';
      
      return isAssigned && isNotManagescore && isActive;
    });
  };

  // Helper function to get criteria from event (same as live scoreboard)
  const getCurrentEventCriteria = (roundType = null) => {
    if (!selectedEvent) return [];
    
    // Use the roundType parameter if provided, otherwise use viewMode state
    const effectiveRoundType = roundType || viewMode;
    
    let criteria = [];
    
    // Helper to get final round - same logic as judge dashboard getFinalRound()
    const getFinalRound = () => {
      if (!selectedEvent.rounds || selectedEvent.rounds.length === 0) return null;
      const enabledRounds = selectedEvent.rounds.filter(round => round.enabled);
      return enabledRounds.length > 0 ? enabledRounds[enabledRounds.length - 1] : null;
    };
    
    // For final round, check rounds array first - match judge dashboard logic
    if (effectiveRoundType === 'final') {
      const finalRound = getFinalRound();
      if (finalRound && finalRound.criteria && finalRound.criteria.length > 0) {
        criteria = finalRound.criteria.filter(c => c.enabled !== false && c.name && c.name.trim() !== '').map(c => ({
          name: c.name,
          weight: c.weight || 0,
          enabled: c.enabled !== false,
          category: c.category || null,
          scoringType: c.scoringType || 'percentage',
          isFinal: true
        }));
        return criteria;
      }
    }
    
    // For main criteria - use criteriaCategories or legacy criteria (same as judge dashboard)
    // Judge dashboard does NOT use rounds[0] for main criteria
    
    const hasCriteriaCategoriesField = selectedEvent.hasOwnProperty('criteriaCategories') || selectedEvent.criteriaCategories !== undefined;
    
    if (hasCriteriaCategoriesField) {
      if (selectedEvent.criteriaCategories && selectedEvent.criteriaCategories.length > 0) {
        selectedEvent.criteriaCategories.forEach((category) => {
          if (!category.name || category.name.trim() === '') return;
          
          if (category.subCriteria && category.subCriteria.length > 0) {
            category.subCriteria.forEach((subCriterion) => {
              if (!subCriterion.name || subCriterion.name.trim() === '') return;
              if (subCriterion.enabled !== false) {
                criteria.push({
                  name: subCriterion.name,
                  weight: subCriterion.weight,
                  enabled: subCriterion.enabled !== false,
                  category: category.name,
                  scoringType: category.scoringType || 'percentage',
                  isFinal: false
                });
              }
            });
          } else {
            if (category.enabled !== false && category.totalWeight > 0) {
              criteria.push({
                name: category.name,
                weight: category.totalWeight || 0,
                enabled: category.enabled !== false,
                category: null,
                scoringType: category.scoringType || 'percentage',
                isFinal: false
              });
            }
          }
        });
      }
    } else if (selectedEvent.criteria && selectedEvent.criteria.length > 0) {
      criteria = selectedEvent.criteria.filter(c => c.enabled && c.name && c.name.trim() !== '').map(c => ({
        ...c,
        isFinal: false
      }));
    }
    
    return criteria;
  };

  // Get main criteria (without final_ prefix)
  const getMainCriteria = () => {
    return getCurrentEventCriteria('main');
  };

  // Get final criteria (with final_ prefix)
  const getFinalCriteria = () => {
    return getCurrentEventCriteria('final');
  };

  // Check if event has final round criteria - match judge dashboard logic
  const hasEventFinalRound = () => {
    if (!selectedEvent || !selectedEvent.rounds || selectedEvent.rounds.length === 0) return false;
    const enabledRounds = selectedEvent.rounds.filter(round => round.enabled);
    if (enabledRounds.length === 0) return false;
    const finalRound = enabledRounds[enabledRounds.length - 1];
    return finalRound && finalRound.criteria && finalRound.criteria.length > 0;
  };

  // Calculate aggregated scores from all judges for a contestant (same as live scoreboard)
  // Now supports calculating separately for main and final rounds
  const calculateAggregatedScore = (contestantId, eventId, roundType = 'main') => {
    // First, filter scores for this contestant and event
    let contestantScores = scores.filter(score => 
      score.contestantId === contestantId && score.eventId === eventId
    );
    
    // Filter by round type based on isFinalRound flag (same as live scoreboard)
    if (roundType === 'final') {
      // For final round, get scores marked as final round
      const finalRoundScores = contestantScores.filter(score => score.isFinalRound === true);
      if (finalRoundScores.length > 0) {
        contestantScores = finalRoundScores;
      } else {
        // Fallback: check if any scores have final_ prefixed keys
        contestantScores = contestantScores.filter(score => {
          if (!score.scores) return false;
          return Object.keys(score.scores).some(key => key.startsWith('final_'));
        });
      }
    } else {
      // For main round, get scores NOT marked as final round
      const mainRoundScores = contestantScores.filter(score => score.isFinalRound !== true);
      if (mainRoundScores.length > 0) {
        contestantScores = mainRoundScores;
      }
    }
    
    if (contestantScores.length === 0) {
      return { totalScore: 0, judgeCount: 0, criteriaScores: {} };
    }
    
    const event = events.find(e => e.id === eventId);
    
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
    
    // Calculate using the appropriate criteria based on round type
    const criteria = getCurrentEventCriteria(roundType);
    const criteriaScores = {};
    const judgeScoresList = Object.values(latestScoresByJudge);
    
    // Debug: Log criteria and score keys  
    console.log(`📊 [${roundType}] Criteria:`, criteria.map(c => c.name));
    console.log(`📊 [${roundType}] Filtered scores count:`, contestantScores.length);
    console.log(`📊 [${roundType}] Judge scores:`, judgeScoresList.map(s => ({ judgeId: s.judgeId, scores: s.scores, isFinalRound: s.isFinalRound })));
    
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const finalKey = `final_${key}`;
      
      const criteriaValues = judgeScoresList
        .map(score => {
          if (roundType === 'final') {
            // For final round, check final_ prefixed key first
            const finalScore = score.scores?.[finalKey];
            const regularScore = score.scores?.[key];
            return finalScore > 0 ? finalScore : (regularScore > 0 ? regularScore : 0);
          } else {
            // For main round, use regular key (not final_ prefixed)
            const val = score.scores?.[key];
            return val > 0 ? val : 0;
          }
        })
        .filter(val => val > 0);
      
      if (criteriaValues.length > 0) {
        criteriaScores[key] = criteriaValues.reduce((sum, val) => sum + val, 0) / criteriaValues.length;
      } else {
        criteriaScores[key] = 0;
      }
    });
    
    // Calculate total score based on criteria weights
    let totalScore = 0;
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const score = criteriaScores[key] || 0;
      const weight = criterion.weight / 100;
      totalScore += score * weight;
    });
    
    totalScore = Math.min(totalScore, 100);
    
    return {
      totalScore: parseFloat(totalScore.toFixed(1)),
      judgeCount,
      criteriaScores
    };
  };

  // Calculate individual judge's total score using weighted criteria (same as live scoreboard)
  // Now supports calculating separately for main and final rounds
  const calculateJudgeTotalScore = (judgeScores, roundType = 'main') => {
    if (!judgeScores || Object.keys(judgeScores).length === 0) return 0;
    
    const criteria = getCurrentEventCriteria(roundType);
    const event = selectedEvent;
    const isPointsGrading = event?.gradingType === 'points';
    const useFinalPrefix = roundType === 'final';
    
    let totalScore = 0;
    
    if (isPointsGrading) {
      criteria.forEach(criterion => {
        const baseKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const finalKey = `final_${baseKey}`;
        // For final round, prioritize final_ prefixed scores
        // For main round, use regular scores only
        let score;
        if (useFinalPrefix) {
          score = judgeScores[finalKey] || 0;
        } else {
          score = judgeScores[baseKey] || 0;
        }
        totalScore += score;
      });
      
      const maxPoints = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
      if (maxPoints > 0) {
        totalScore = (totalScore / maxPoints) * 100;
      }
    } else {
      criteria.forEach(criterion => {
        const baseKey = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const finalKey = `final_${baseKey}`;
        // For final round, prioritize final_ prefixed scores
        // For main round, use regular scores only
        let score;
        if (useFinalPrefix) {
          score = judgeScores[finalKey] || 0;
        } else {
          score = judgeScores[baseKey] || 0;
        }
        const weight = criterion.weight / 100;
        totalScore += score * weight;
      });
    }
    
    return Math.min(totalScore, 100);
  };

  // Get all contestants for selected event with their scores (matching live scoreboard)
  // Now calculates both main and final round scores
  const getEventContestantsWithScores = () => {
    if (!selectedEvent) return [];
    
    const eventJudges = getEventJudges();
    // Filter by event and exclude eliminated contestants (check both eliminated field and status field)
    const eventContestants = contestants.filter(c => 
      c.eventId === selectedEvent.id && 
      !c.eliminated && 
      c.status !== 'eliminated'
    );
    
    return eventContestants.map(contestant => {
      const contestantScores = scores.filter(s => 
        s.contestantId === contestant.id && 
        s.eventId === selectedEvent.id
      );
      
      // Get latest score from each judge
      const judgeScoresMap = {};
      contestantScores.forEach(score => {
        if (!judgeScoresMap[score.judgeId] || 
            new Date(score.timestamp) > new Date(judgeScoresMap[score.judgeId].timestamp)) {
          judgeScoresMap[score.judgeId] = score;
        }
      });
      
      // Build judge scores array with both main and final scores
      const judgeScoresArray = eventJudges.map(judge => {
        const scoreData = judgeScoresMap[judge.id];
        if (scoreData && scoreData.scores) {
          // Calculate the judge's total score for main round
          const mainTotal = calculateJudgeTotalScore(scoreData.scores, 'main');
          // Calculate the judge's total score for final round
          const finalTotal = calculateJudgeTotalScore(scoreData.scores, 'final');
          return {
            judgeId: judge.id,
            judgeName: judge.judgeName || judge.displayName || 'Judge',
            totalScore: parseFloat(mainTotal.toFixed(1)),
            mainScore: parseFloat(mainTotal.toFixed(1)),
            finalScore: parseFloat(finalTotal.toFixed(1)),
            scores: scoreData.scores || {},
            timestamp: scoreData.timestamp
          };
        }
        return {
          judgeId: judge.id,
          judgeName: judge.judgeName || judge.displayName || 'Judge',
          totalScore: 0,
          mainScore: 0,
          finalScore: 0,
          scores: {},
          timestamp: null
        };
      });
      
      // Calculate aggregated scores for both main and final rounds
      const mainAggregated = calculateAggregatedScore(contestant.id, selectedEvent.id, 'main');
      const finalAggregated = calculateAggregatedScore(contestant.id, selectedEvent.id, 'final');
      
      // Use current viewMode to determine which score to use for ranking
      let currentRoundScore;
      let rankingScore;
      if (viewMode === 'final') {
        currentRoundScore = finalAggregated;
        rankingScore = finalAggregated.totalScore;
      } else if (viewMode === 'combined') {
        // For combined view, rank by the combined total (main + final) or the higher one
        currentRoundScore = mainAggregated;
        // Use combined score for ranking - sum of both rounds for overall performance
        rankingScore = mainAggregated.totalScore + finalAggregated.totalScore;
      } else {
        currentRoundScore = mainAggregated;
        rankingScore = mainAggregated.totalScore;
      }
      
      return {
        ...contestant,
        judgeScores: judgeScoresArray,
        // Main round scores
        mainScore: mainAggregated.totalScore,
        mainCriteriaScores: mainAggregated.criteriaScores,
        // Final round scores  
        finalScore: finalAggregated.totalScore,
        finalCriteriaScores: finalAggregated.criteriaScores,
        // Current view scores (for ranking)
        totalScore: rankingScore,
        averageScore: currentRoundScore.totalScore,
        criteriaScores: currentRoundScore.criteriaScores,
        scoredJudges: currentRoundScore.judgeCount
      };
    });
  };

  // Sort and rank contestants (same as live scoreboard)
  const getSortedContestants = () => {
    let data = getEventContestantsWithScores();
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(c => 
        (c.contestantName || `${c.firstName} ${c.lastName}`).toLowerCase().includes(term) ||
        (c.contestantNumber || c.contestantNo || '').toString().includes(term)
      );
    }
    
    // Sort by totalScore (descending) first for ranking - same as live scoreboard
    data.sort((a, b) => b.totalScore - a.totalScore);
    
    // Assign ranks
    data = data.map((c, index) => ({ ...c, rank: index + 1 }));
    
    // Apply user sort if different from default
    if (sortConfig.key !== 'rank' && sortConfig.key !== 'totalScore') {
      data.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return data;
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handlePrint = () => {
    const eventJudges = getEventJudges();
    const sortedContestants = getSortedContestants();
    const mainCriteria = getCurrentEventCriteria('main');
    const finalCriteria = getCurrentEventCriteria('final');
    const hasFinalRound = hasEventFinalRound() && finalCriteria.length > 0;
    
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Score Sheet - ${selectedEvent?.eventName || 'Event'}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
          
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Poppins', Arial, sans-serif; 
            padding: 20px 25px; 
            color: #1f2937; 
            font-size: 11px;
            background: #fff;
            line-height: 1.4;
          }
          
          /* Header Styles */
          .header { 
            text-align: center; 
            margin-bottom: 25px; 
            padding-bottom: 20px;
            border-bottom: 4px solid #059669;
            position: relative;
          }
          .header::after {
            content: '';
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 100px;
            height: 4px;
            background: linear-gradient(90deg, #10b981, #059669);
          }
          .logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            margin-bottom: 10px;
          }
          .logo { 
            width: 70px; 
            height: 70px; 
            border-radius: 50%; 
            border: 3px solid #059669;
            object-fit: cover;
          }
          .header-text {
            text-align: left;
          }
          .school-name {
            font-size: 14px;
            font-weight: 600;
            color: #059669;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          .title { 
            font-size: 22px; 
            font-weight: 700; 
            color: #064e3b; 
            margin: 3px 0;
            letter-spacing: 0.5px;
          }
          .subtitle { 
            font-size: 12px; 
            color: #6b7280; 
            font-weight: 500;
          }
          
          /* Event Info Box */
          .event-info { 
            background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); 
            padding: 15px 20px; 
            border-radius: 12px; 
            margin-bottom: 20px;
            border: 1px solid #a7f3d0;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
          }
          .event-name { 
            font-size: 18px; 
            font-weight: 700; 
            color: #065f46; 
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 2px dashed #a7f3d0;
          }
          .event-details { 
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            font-size: 10px; 
            color: #047857;
          }
          .event-details span {
            background: white;
            padding: 6px 10px;
            border-radius: 6px;
            text-align: center;
          }
          .event-details strong {
            display: block;
            font-size: 9px;
            color: #6b7280;
            margin-bottom: 2px;
          }
          
          /* Section Titles */
          .section-title { 
            background: linear-gradient(90deg, #f3f4f6, #e5e7eb); 
            padding: 10px 15px; 
            margin: 20px 0 12px; 
            border-radius: 8px; 
            font-weight: 700; 
            font-size: 13px;
            border-left: 4px solid #059669;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          /* Table Styles */
          table { 
            width: 100%; 
            border-collapse: separate; 
            border-spacing: 0;
            margin-bottom: 20px; 
            font-size: 10px;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          }
          th { 
            background: linear-gradient(180deg, #059669, #047857); 
            color: white; 
            padding: 10px 6px; 
            text-align: center; 
            font-weight: 600; 
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          th.main-header { 
            background: linear-gradient(180deg, #2563eb, #1d4ed8); 
          }
          th.final-header { 
            background: linear-gradient(180deg, #7c3aed, #6d28d9); 
          }
          th.main-criteria { 
            background: linear-gradient(180deg, #3b82f6, #2563eb); 
            font-size: 8px;
          }
          th.final-criteria { 
            background: linear-gradient(180deg, #8b5cf6, #7c3aed);
            font-size: 8px;
          }
          td { 
            padding: 8px 6px; 
            border-bottom: 1px solid #e5e7eb; 
            text-align: center;
            background: white;
          }
          tr:nth-child(even) td { 
            background: #f9fafb; 
          }
          tr:hover td {
            background: #ecfdf5;
          }
          
          /* Rank Highlighting */
          .rank-1 td { 
            background: linear-gradient(90deg, #fef3c7, #fde68a) !important; 
            font-weight: 600;
          }
          .rank-2 td { 
            background: linear-gradient(90deg, #e5e7eb, #d1d5db) !important; 
          }
          .rank-3 td { 
            background: linear-gradient(90deg, #fed7aa, #fdba74) !important; 
          }
          
          .contestant-name { 
            text-align: left !important; 
            font-weight: 500; 
            font-size: 10px;
            padding-left: 10px !important;
          }
          .score { 
            font-weight: 600;
            color: #1f2937;
          }
          .total { 
            color: #059669; 
            font-weight: 700; 
          }
          .main-total { 
            color: #1d4ed8; 
            font-weight: 700;
            background: #dbeafe !important;
          }
          .final-total { 
            color: #6d28d9; 
            font-weight: 700;
            background: #ede9fe !important;
          }
          .no-score { 
            color: #9ca3af; 
          }
          
          /* Judge Section */
          .judge-section { 
            margin-bottom: 30px; 
            page-break-inside: avoid;
          }
          .judge-title { 
            background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); 
            padding: 12px 18px; 
            border-radius: 10px; 
            margin-bottom: 12px;
            border: 1px solid #d8b4fe;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .judge-badge {
            width: 35px;
            height: 35px;
            background: linear-gradient(135deg, #7c3aed, #6d28d9);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 14px;
          }
          .judge-name { 
            font-weight: 700; 
            color: #5b21b6; 
            font-size: 13px;
          }
          
          /* Summary Table */
          .summary-table { 
            margin-top: 25px; 
          }
          .summary-table th { 
            background: linear-gradient(180deg, #064e3b, #047857); 
          }
          
          /* Signature Section */
          .signature-section {
            margin-top: 40px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 30px;
            page-break-inside: avoid;
          }
          .signature-box {
            text-align: center;
          }
          .signature-line {
            border-top: 2px solid #374151;
            margin-top: 50px;
            padding-top: 8px;
          }
          .signature-label {
            font-weight: 600;
            color: #374151;
            font-size: 11px;
          }
          .signature-title {
            font-size: 9px;
            color: #6b7280;
          }
          
          /* Footer */
          .footer { 
            text-align: center; 
            margin-top: 30px; 
            padding-top: 20px; 
            border-top: 3px double #d1d5db; 
            font-size: 9px; 
            color: #6b7280;
          }
          .footer p {
            margin: 3px 0;
          }
          .footer-brand {
            font-weight: 600;
            color: #059669;
          }
          
          /* Print Optimization */
          @media print {
            body { 
              padding: 15px; 
              font-size: 10px; 
            }
            .header { 
              margin-bottom: 15px; 
              padding-bottom: 12px; 
            }
            table { 
              font-size: 9px;
              box-shadow: none;
            }
            th, td { 
              padding: 6px 4px; 
            }
            .judge-section { 
              page-break-inside: avoid; 
            }
            .signature-section {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-container">
            <img src="/logo.jpg" alt="Logo" class="logo" onerror="this.style.display='none'" />
            <div class="header-text">
              <div class="school-name">Bongabong, Oriental Mindoro</div>
              <div class="title">Judging & Tabulation System</div>
              <div class="subtitle">Official Score Sheet Document</div>
            </div>
          </div>
        </div>
        
        <div class="event-info">
          <div class="event-name">📋 ${selectedEvent?.eventName || 'Event'}</div>
          <div class="event-details">
            <span><strong>Date</strong>${selectedEvent?.date || 'N/A'}</span>
            <span><strong>Venue</strong>${selectedEvent?.venue || 'N/A'}</span>
            <span><strong>Contestants</strong>${sortedContestants.length}</span>
            <span><strong>Judges</strong>${eventJudges.length}</span>
            <span><strong>Generated</strong>${new Date().toLocaleDateString()}</span>
          </div>
        </div>

        <!-- Individual Judge Scores Section -->
        ${eventJudges.map((judge, judgeIndex) => {
          const judgeScoreDocuments = scores.filter(s => 
            s.judgeId === judge.id && 
            s.eventId === selectedEvent?.id
          );
          
          const latestMainScores = {};
          const latestFinalScores = {};
          judgeScoreDocuments.forEach(score => {
            if (score.isFinalRound) {
              if (!latestFinalScores[score.contestantId] || 
                  new Date(score.timestamp) > new Date(latestFinalScores[score.contestantId].timestamp)) {
                latestFinalScores[score.contestantId] = score;
              }
            } else {
              if (!latestMainScores[score.contestantId] || 
                  new Date(score.timestamp) > new Date(latestMainScores[score.contestantId].timestamp)) {
                latestMainScores[score.contestantId] = score;
              }
            }
          });
          
          return `
            <div class="judge-section">
              <div class="judge-title">
                <div class="judge-badge">${judgeIndex + 1}</div>
                <span class="judge-name">Judge ${judgeIndex + 1} Score Sheet</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th rowspan="2" style="width: 35px; border-radius: 10px 0 0 0;">No.</th>
                    <th rowspan="2" style="min-width: 120px;">Contestant Name</th>
                    ${mainCriteria.length > 0 ? `<th colspan="${mainCriteria.length + 1}" class="main-header">📋 Main Criteria</th>` : ''}
                    ${hasFinalRound ? `<th colspan="${finalCriteria.length + 1}" class="final-header" style="border-radius: 0 10px 0 0;">🏆 Final Criteria</th>` : ''}
                  </tr>
                  <tr>
                    ${mainCriteria.map(c => `<th class="main-criteria" title="${c.name} (${c.weight}%)">${c.name.substring(0, 15)}${c.name.length > 15 ? '...' : ''}<br/><small>(${c.weight}%)</small></th>`).join('')}
                    ${mainCriteria.length > 0 ? `<th class="main-header" style="font-size: 10px;">Total</th>` : ''}
                    ${hasFinalRound ? finalCriteria.map(c => `<th class="final-criteria" title="${c.name} (${c.weight}%)">${c.name.substring(0, 15)}${c.name.length > 15 ? '...' : ''}<br/><small>(${c.weight}%)</small></th>`).join('') : ''}
                    ${hasFinalRound ? `<th class="final-header" style="font-size: 10px;">Total</th>` : ''}
                  </tr>
                </thead>
                <tbody>
                  ${sortedContestants.map(contestant => {
                    const mainScoreData = latestMainScores[contestant.id];
                    const finalScoreData = latestFinalScores[contestant.id];
                    const mainScoresObj = mainScoreData?.scores || {};
                    const finalScoresObj = finalScoreData?.scores || {};
                    
                    let mainTotal = 0;
                    mainCriteria.forEach(criterion => {
                      const key = criterion.name.toLowerCase().replace(/\\s+/g, '_');
                      const score = mainScoresObj[key] || 0;
                      mainTotal += score * (criterion.weight / 100);
                    });
                    
                    let finalTotal = 0;
                    finalCriteria.forEach(criterion => {
                      const key = criterion.name.toLowerCase().replace(/\\s+/g, '_');
                      const finalKey = 'final_' + key;
                      const score = finalScoresObj[finalKey] || finalScoresObj[key] || 0;
                      finalTotal += score * (criterion.weight / 100);
                    });
                    
                    // Build main criteria cells
                    let mainCells = mainCriteria.map(criterion => {
                      const key = criterion.name.toLowerCase().replace(/\\s+/g, '_');
                      const score = mainScoresObj[key] || 0;
                      return '<td class="' + (score > 0 ? 'score' : 'no-score') + '">' + (score > 0 ? score : '-') + '</td>';
                    }).join('');
                    
                    // Build final criteria cells
                    let finalCells = finalCriteria.map(criterion => {
                      const key = criterion.name.toLowerCase().replace(/\\s+/g, '_');
                      const finalKey = 'final_' + key;
                      const score = finalScoresObj[finalKey] || finalScoresObj[key] || 0;
                      return '<td class="' + (score > 0 ? 'score' : 'no-score') + '">' + (score > 0 ? score : '-') + '</td>';
                    }).join('');
                    
                    return '<tr>' +
                      '<td style="font-weight: 600;">' + (contestant.contestantNumber || contestant.contestantNo || '-') + '</td>' +
                      '<td class="contestant-name">' + (contestant.contestantName || ((contestant.firstName || '') + ' ' + (contestant.lastName || '')).trim() || 'Unknown') + '</td>' +
                      mainCells +
                      (mainCriteria.length > 0 ? '<td class="main-total">' + (mainTotal > 0 ? mainTotal.toFixed(1) : '-') + '</td>' : '') +
                      (hasFinalRound ? finalCells : '') +
                      (hasFinalRound ? '<td class="final-total">' + (finalTotal > 0 ? finalTotal.toFixed(1) : '-') + '</td>' : '') +
                      '</tr>';
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;
        }).join('')}

        <!-- Overall Summary / Rankings -->
        <div class="section-title">🏆 Final Rankings Summary (Average of All Judges)</div>
        <table class="summary-table">
          <thead>
            <tr>
              <th style="width: 50px; border-radius: 10px 0 0 0;">Rank</th>
              <th style="width: 45px;">No.</th>
              <th style="min-width: 150px;">Contestant Name</th>
              ${mainCriteria.length > 0 ? `<th class="main-header">📋 Main Total</th>` : ''}
              ${hasFinalRound ? `<th class="final-header">🏆 Final Total</th>` : ''}
              <th style="border-radius: 0 10px 0 0;">Judges</th>
            </tr>
          </thead>
          <tbody>
            ${sortedContestants.map(c => `
              <tr class="${c.rank <= 3 ? 'rank-' + c.rank : ''}">
                <td style="font-size: 14px;"><strong>${c.rank <= 3 ? ['🥇', '🥈', '🥉'][c.rank - 1] : c.rank}</strong></td>
                <td style="font-weight: 600;">${c.contestantNumber || c.contestantNo || '-'}</td>
                <td class="contestant-name">${c.contestantName || (c.firstName + ' ' + c.lastName).trim() || 'Unknown'}</td>
                ${mainCriteria.length > 0 ? `<td class="main-total">${c.mainScore ? c.mainScore.toFixed(2) : '-'}</td>` : ''}
                ${hasFinalRound ? `<td class="final-total">${c.finalScore ? c.finalScore.toFixed(2) : '-'}</td>` : ''}
                <td>${c.scoredJudges}/${eventJudges.length}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <!-- Signature Section -->
        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line">
              <div class="signature-label">Tabulator</div>
              <div class="signature-title">Score Manager</div>
            </div>
          </div>
          <div class="signature-box">
            <div class="signature-line">
              <div class="signature-label">Event Coordinator</div>
              <div class="signature-title">Event Management</div>
            </div>
          </div>
          <div class="signature-box">
            <div class="signature-line">
              <div class="signature-label">Approved By</div>
              <div class="signature-title">School Administration</div>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p class="footer-brand">Judging & Tabulation System</p>
          <p>This document is an official score sheet generated by the system</p>
          <p>© ${new Date().getFullYear()} Bongabong, Oriental Mindoro - All Rights Reserved</p>
          <p style="margin-top: 5px; font-size: 8px; color: #9ca3af;">Generated on ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const openDetailModal = (contestant) => {
    setSelectedContestant(contestant);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setSelectedContestant(null);
    setShowDetailModal(false);
  };

  const getContestantName = (contestant) => {
    return contestant.contestantName || 
           (contestant.contestantType === 'group' 
             ? contestant.groupName || 'Unknown Group'
             : `${contestant.firstName || ''} ${contestant.lastName || ''}`.trim() || 'Unknown');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return { icon: '🥇', bg: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
    if (rank === 2) return { icon: '🥈', bg: 'bg-gray-100 text-gray-700 border-gray-300' };
    if (rank === 3) return { icon: '🥉', bg: 'bg-orange-100 text-orange-800 border-orange-300' };
    return { icon: `#${rank}`, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) {
      return <span className="ml-1 text-gray-300">↕</span>;
    }
    return sortConfig.direction === 'asc' 
      ? <span className="ml-1 text-emerald-600">↑</span>
      : <span className="ml-1 text-emerald-600">↓</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-emerald-200 border-t-emerald-600 mx-auto mb-4"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
          </div>
          <p className="text-gray-600 font-medium">Loading Manage Score Dashboard...</p>
        </div>
      </div>
    );
  }

  const eventJudges = getEventJudges();
  const sortedContestants = getSortedContestants();
  // Filter by event and exclude eliminated contestants
  const eventContestants = contestants.filter(c => c.eventId === selectedEvent?.id && !c.eliminated);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Desktop Header */}
          <div className="hidden md:flex items-center justify-between py-4">
            {/* Left: Logo & Title */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40"></div>
                <div className="relative h-12 w-12 rounded-full bg-white/95 shadow-xl p-1 overflow-hidden border-2 border-white/50">
                  <Image
                    src="/logo.jpg"
                    alt="Logo"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover rounded-full"
                    priority
                  />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white drop-shadow-md">Manage Scores Dashboard</h1>
                <p className="text-sm text-emerald-100">View-only Score Management</p>
              </div>
            </div>
            
            {/* Center: Status Indicators */}
            <div className="flex items-center gap-4">
              {/* Live indicator */}
              <div className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-xl">
                <div className="relative w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse">
                  <div className="absolute inset-0 rounded-full bg-green-400 animate-ping"></div>
                </div>
                <span className="text-white text-sm font-medium">Live Updates</span>
              </div>
              
              {/* Last updated */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-center">
                <div className="text-xs text-emerald-100">Last Updated</div>
                <div className="text-sm text-white font-medium">{lastUpdated?.toLocaleTimeString() || 'Never'}</div>
              </div>
            </div>
            
            {/* Right: User & Logout */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-white">{user?.email}</p>
                <p className="text-xs text-emerald-100">Score Manager</p>
              </div>
              
              <button
                onClick={handleLogout}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
          
          {/* Mobile Header */}
          <div className="md:hidden py-3">
            {/* Top Row: Logo, Title, Logout */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40"></div>
                  <div className="relative h-9 w-9 rounded-full bg-white/95 shadow-lg p-0.5 overflow-hidden border-2 border-white/50">
                    <Image
                      src="/logo.jpg"
                      alt="Logo"
                      width={36}
                      height={36}
                      className="w-full h-full object-cover rounded-full"
                      priority
                    />
                  </div>
                </div>
                <div>
                  <h1 className="text-base font-bold text-white leading-tight">Manage Scores</h1>
                  <p className="text-[10px] text-emerald-100">View-only Dashboard</p>
                </div>
              </div>
              
              <button
                onClick={handleLogout}
                className="bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-sm text-white p-2 rounded-lg transition-all duration-200"
                title="Logout"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
            
            {/* Bottom Row: Status Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {/* Live indicator */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-lg flex-shrink-0">
                <div className="relative w-2 h-2 rounded-full bg-green-400 animate-pulse">
                  <div className="absolute inset-0 rounded-full bg-green-400 animate-ping"></div>
                </div>
                <span className="text-white text-xs font-medium">Live</span>
              </div>
              
              {/* Last updated */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm rounded-lg flex-shrink-0">
                <svg className="w-3 h-3 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-white text-xs">{lastUpdated?.toLocaleTimeString() || 'Never'}</span>
              </div>
              
              {/* User email truncated */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm rounded-lg flex-shrink-0 max-w-[150px]">
                <svg className="w-3 h-3 text-emerald-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-white text-xs truncate">{user?.email?.split('@')[0]}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Event Selector & Actions */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <span className="text-2xl">🎭</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Select Event</h2>
                  <p className="text-sm text-emerald-100">Choose an event to view scores</p>
                </div>
              </div>
              
              <button
                onClick={handlePrint}
                disabled={!selectedEvent || sortedContestants.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-emerald-600 rounded-xl font-semibold hover:bg-emerald-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Score Sheet
              </button>
            </div>
          </div>
          
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Event</label>
                <select
                  value={selectedEvent?.id || ''}
                  onChange={(e) => {
                    const event = events.find(ev => ev.id === e.target.value);
                    setSelectedEvent(event);
                    setSearchTerm('');
                  }}
                  className="block w-full px-4 py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200 bg-white"
                >
                  {events.length === 0 ? (
                    <option value="">No events available</option>
                  ) : (
                    events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.status === 'ongoing' ? '🟢' : event.status === 'upcoming' ? '🔵' : '⚪'} {event.eventName}
                      </option>
                    ))
                  )}
                </select>
              </div>
              
              {/* Search */}
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Search Contestants</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or number..."
                    className="block w-full pl-10 pr-4 py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
              </div>
            </div>
            
            {/* View Mode Toggle - Main vs Final Criteria */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Score View Mode</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setViewMode('main')}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    viewMode === 'main'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>📋</span>
                  Main Criteria
                </button>
                <button
                  onClick={() => setViewMode('final')}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    viewMode === 'final'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>🏆</span>
                  Final Criteria
                </button>
                <button
                  onClick={() => setViewMode('combined')}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    viewMode === 'combined'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>📊</span>
                  Combined View
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {viewMode === 'main' && '📋 Showing scores from MAIN/Preliminary round criteria'}
                {viewMode === 'final' && '🏆 Showing scores from FINAL round criteria (with final_ prefix)'}
                {viewMode === 'combined' && '📊 Showing both Main and Final scores side by side'}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-xl shadow-md p-3 sm:p-4 border border-gray-100">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 bg-blue-100 rounded-xl">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] sm:text-sm font-medium text-gray-500">Contestants</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{eventContestants.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-3 sm:p-4 border border-gray-100">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 bg-purple-100 rounded-xl">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] sm:text-sm font-medium text-gray-500">Judges</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{eventJudges.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-3 sm:p-4 border border-gray-100">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 bg-green-100 rounded-xl">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] sm:text-sm font-medium text-gray-500">Scored</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{sortedContestants.filter(c => c.scoredJudges > 0).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-3 sm:p-4 border border-gray-100">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 bg-orange-100 rounded-xl">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] sm:text-sm font-medium text-gray-500">Events</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{events.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* View-only notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 sm:mb-6">
          <div className="flex items-start sm:items-center gap-2">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs sm:text-sm text-amber-800">
              <strong>View-Only:</strong> <span className="hidden sm:inline">Scores cannot be edited from this dashboard. </span>Only judges can input scores.
            </p>
          </div>
        </div>

        {/* Judges Overview Section - Detailed Scores per Judge */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="p-1.5 sm:p-2 bg-white/20 rounded-xl flex-shrink-0">
                  <span className="text-lg sm:text-2xl">👨‍⚖️</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-white">Judges Detailed Scores</h2>
                  <p className="text-xs sm:text-sm text-purple-100 hidden sm:block">View all scores given by each judge per contestant and criteria</p>
                </div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 flex-shrink-0">
                <p className="text-purple-100 text-[10px] sm:text-xs font-medium">Judges</p>
                <p className="text-xl sm:text-2xl font-bold text-white text-center">{eventJudges.length}</p>
              </div>
            </div>
          </div>
          
          <div className="p-4 sm:p-6">
            {eventJudges.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-4xl mb-3 block">👤</span>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No judges assigned</h3>
                <p className="text-sm text-gray-500">No judges are assigned to this event yet</p>
              </div>
            ) : (
              <div className="space-y-6">
                {eventJudges.map((judge, judgeIndex) => {
                  // Get all score documents for this judge in this event
                  const judgeScoreDocuments = scores.filter(s => 
                    s.judgeId === judge.id && 
                    s.eventId === selectedEvent?.id
                  );
                  
                  // Get latest score per contestant per round type for this judge
                  // Keep main and final round scores separately since they're stored in different documents
                  const latestMainScoresByContestant = {};
                  const latestFinalScoresByContestant = {};
                  judgeScoreDocuments.forEach(score => {
                    if (score.isFinalRound) {
                      // Final round score document
                      if (!latestFinalScoresByContestant[score.contestantId] || 
                          new Date(score.timestamp) > new Date(latestFinalScoresByContestant[score.contestantId].timestamp)) {
                        latestFinalScoresByContestant[score.contestantId] = score;
                      }
                    } else {
                      // Main round score document
                      if (!latestMainScoresByContestant[score.contestantId] || 
                          new Date(score.timestamp) > new Date(latestMainScoresByContestant[score.contestantId].timestamp)) {
                        latestMainScoresByContestant[score.contestantId] = score;
                      }
                    }
                  });
                  
                  // Count contestants that have been scored (either main or final)
                  const allScoredContestants = new Set([
                    ...Object.keys(latestMainScoresByContestant),
                    ...Object.keys(latestFinalScoresByContestant)
                  ]);
                  const contestantsScored = allScoredContestants.size;
                  const progressPercent = eventContestants.length > 0 
                    ? Math.round((contestantsScored / eventContestants.length) * 100) 
                    : 0;
                  
                  // Get criteria for display
                  const mainCriteria = getCurrentEventCriteria('main');
                  const finalCriteria = getCurrentEventCriteria('final');
                  
                  return (
                    <div key={judge.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      {/* Judge Header */}
                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-md">
                              <span className="text-white text-sm font-bold">{judgeIndex + 1}</span>
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900">
                                Judge {judgeIndex + 1}
                              </h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Progress</p>
                              <p className="text-sm font-bold text-gray-700">{contestantsScored}/{eventContestants.length}</p>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              progressPercent === 100 ? 'bg-green-100 text-green-700' :
                              progressPercent > 0 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {progressPercent === 100 ? '✓ Complete' : progressPercent > 0 ? 'In Progress' : 'Not Started'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Scores Table for this Judge */}
                      <div className="overflow-x-auto">
                        {contestantsScored === 0 ? (
                          <div className="p-6 text-center text-gray-500">
                            <span className="text-2xl block mb-2">📝</span>
                            <p className="text-sm">No scores submitted yet</p>
                          </div>
                        ) : (
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-50">
                                  Contestant
                                </th>
                                {/* Main Criteria Headers */}
                                {mainCriteria.length > 0 && (
                                  <>
                                    {mainCriteria.map((criterion, idx) => (
                                      <th key={`main-${idx}`} className="px-2 py-2 text-center text-[10px] font-semibold text-blue-600 uppercase tracking-wider bg-blue-50/50">
                                        <div className="flex flex-col items-center">
                                          <span className="truncate max-w-[60px]" title={criterion.name}>{criterion.name}</span>
                                          <span className="text-[9px] text-blue-400 font-normal">({criterion.weight}%)</span>
                                        </div>
                                      </th>
                                    ))}
                                    <th className="px-2 py-2 text-center text-[10px] font-bold text-blue-700 uppercase tracking-wider bg-blue-100/50">
                                      Main Total
                                    </th>
                                  </>
                                )}
                                {/* Final Criteria Headers */}
                                {finalCriteria.length > 0 && hasEventFinalRound() && (
                                  <>
                                    {finalCriteria.map((criterion, idx) => (
                                      <th key={`final-${idx}`} className="px-2 py-2 text-center text-[10px] font-semibold text-purple-600 uppercase tracking-wider bg-purple-50/50">
                                        <div className="flex flex-col items-center">
                                          <span className="truncate max-w-[60px]" title={criterion.name}>{criterion.name}</span>
                                          <span className="text-[9px] text-purple-400 font-normal">({criterion.weight}%)</span>
                                        </div>
                                      </th>
                                    ))}
                                    <th className="px-2 py-2 text-center text-[10px] font-bold text-purple-700 uppercase tracking-wider bg-purple-100/50">
                                      Final Total
                                    </th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                              {eventContestants.map((contestant) => {
                                // Get separate score documents for main and final rounds
                                const mainScoreData = latestMainScoresByContestant[contestant.id];
                                const finalScoreData = latestFinalScoresByContestant[contestant.id];
                                const mainScoresObj = mainScoreData?.scores || {};
                                const finalScoresObj = finalScoreData?.scores || {};
                                
                                // Calculate main total directly from main round scores
                                let mainTotal = 0;
                                if (mainCriteria.length > 0) {
                                  mainCriteria.forEach(criterion => {
                                    const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                                    const score = mainScoresObj[key] || 0;
                                    const weight = criterion.weight / 100;
                                    mainTotal += score * weight;
                                  });
                                }
                                
                                // Calculate final total directly from final round scores
                                let finalTotal = 0;
                                if (finalCriteria.length > 0) {
                                  finalCriteria.forEach(criterion => {
                                    const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                                    const finalKey = `final_${key}`;
                                    // Look in final scores document for final_key or key
                                    const score = finalScoresObj[finalKey] || finalScoresObj[key] || 0;
                                    const weight = criterion.weight / 100;
                                    finalTotal += score * weight;
                                  });
                                }
                                
                                return (
                                  <tr key={contestant.id} className={`hover:bg-gray-50 ${!mainScoreData && !finalScoreData ? 'opacity-50' : ''}`}>
                                    <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white">
                                      <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-semibold text-emerald-700">
                                          {contestant.contestantNumber || contestant.contestantNo || '?'}
                                        </span>
                                        <span className="text-sm font-medium text-gray-900 truncate max-w-[100px]" title={getContestantName(contestant)}>
                                          {getContestantName(contestant)}
                                        </span>
                                      </div>
                                    </td>
                                    {/* Main Criteria Scores - from main round score document */}
                                    {mainCriteria.length > 0 && (
                                      <>
                                        {mainCriteria.map((criterion, idx) => {
                                          const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                                          const score = mainScoresObj[key] || 0;
                                          return (
                                            <td key={`main-${idx}`} className="px-2 py-2 text-center whitespace-nowrap bg-blue-50/30">
                                              {score > 0 ? (
                                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                                                  score >= 90 ? 'bg-green-100 text-green-700' :
                                                  score >= 80 ? 'bg-blue-100 text-blue-700' :
                                                  score >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                                  'bg-gray-100 text-gray-600'
                                                }`}>
                                                  {score}
                                                </span>
                                              ) : (
                                                <span className="text-gray-300">-</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td className="px-2 py-2 text-center whitespace-nowrap bg-blue-100/30">
                                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                            mainTotal > 0 ? 'bg-blue-200 text-blue-800' : 'text-gray-400'
                                          }`}>
                                            {mainTotal > 0 ? mainTotal.toFixed(1) : '-'}
                                          </span>
                                        </td>
                                      </>
                                    )}
                                    {/* Final Criteria Scores - from final round score document */}
                                    {finalCriteria.length > 0 && hasEventFinalRound() && (
                                      <>
                                        {finalCriteria.map((criterion, idx) => {
                                          const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                                          const finalKey = `final_${key}`;
                                          // Look in final scores document
                                          const score = finalScoresObj[finalKey] || finalScoresObj[key] || 0;
                                          return (
                                            <td key={`final-${idx}`} className="px-2 py-2 text-center whitespace-nowrap bg-purple-50/30">
                                              {score > 0 ? (
                                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                                                  score >= 90 ? 'bg-green-100 text-green-700' :
                                                  score >= 80 ? 'bg-purple-100 text-purple-700' :
                                                  score >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                                  'bg-gray-100 text-gray-600'
                                                }`}>
                                                  {score}
                                                </span>
                                              ) : (
                                                <span className="text-gray-300">-</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td className="px-2 py-2 text-center whitespace-nowrap bg-purple-100/30">
                                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                            finalTotal > 0 ? 'bg-purple-200 text-purple-800' : 'text-gray-400'
                                          }`}>
                                            {finalTotal > 0 ? finalTotal.toFixed(1) : '-'}
                                          </span>
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Scores Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden" ref={printRef}>
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {viewMode === 'main' && '📋 Main Round Scores'}
                  {viewMode === 'final' && '🏆 Final Round Scores'}
                  {viewMode === 'combined' && '📊 Combined Scores Overview'}
                </h2>
                <p className="text-sm text-gray-500">
                  {viewMode === 'main' && 'Shows average score per main criteria from all judges. Click on a contestant to view detailed breakdown.'}
                  {viewMode === 'final' && 'Shows average score per final round criteria from all judges. Click on a contestant to view detailed breakdown.'}
                  {viewMode === 'combined' && 'Shows both main and final round scores side by side. Click on a contestant for details.'}
                </p>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                viewMode === 'main' ? 'bg-blue-100 text-blue-700' :
                viewMode === 'final' ? 'bg-purple-100 text-purple-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>
                {viewMode === 'main' ? 'Main Round' : viewMode === 'final' ? 'Final Round' : 'Combined'}
              </div>
            </div>
          </div>
          
          {/* Mobile Card View - visible only on small screens */}
          <div className="block md:hidden p-4 space-y-3">
            {sortedContestants.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-4xl mb-3 block">📋</span>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No contestants found</h3>
                <p className="text-sm text-gray-500">
                  {searchTerm ? 'Try adjusting your search term' : 'No contestants are registered for this event yet'}
                </p>
              </div>
            ) : (
              sortedContestants.map((contestant) => {
                const rankBadge = getRankBadge(contestant.rank);
                const criteria = getCurrentEventCriteria();
                return (
                  <div
                    key={contestant.id}
                    className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 active:scale-[0.98] ${
                      contestant.rank === 1 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200 shadow-md' : 
                      contestant.rank === 2 ? 'bg-gradient-to-br from-gray-50 to-slate-50 border-gray-300 shadow-md' : 
                      contestant.rank === 3 ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200 shadow-md' : 
                      'bg-white border-gray-200 hover:border-emerald-300 hover:shadow-md'
                    }`}
                    onClick={() => openDetailModal(contestant)}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-base font-bold border-2 ${rankBadge.bg}`}>
                          {contestant.rank <= 3 ? rankBadge.icon : contestant.rank}
                        </span>
                        <div>
                          <div className="font-semibold text-gray-900">
                            {getContestantName(contestant)}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100">
                              <span className="text-xs font-semibold text-emerald-700">
                                {contestant.contestantNumber || contestant.contestantNo || '?'}
                              </span>
                            </span>
                            <span>{contestant.scoredJudges}/{eventJudges.length} judges</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {viewMode === 'combined' ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex gap-2">
                              <div className="text-center">
                                <div className="text-[10px] text-blue-500">Main</div>
                                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">
                                  {contestant.mainScore?.toFixed(1) || '0.0'}
                                </span>
                              </div>
                              <div className="text-center">
                                <div className="text-[10px] text-purple-500">Final</div>
                                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700">
                                  {contestant.finalScore?.toFixed(1) || '0.0'}
                                </span>
                              </div>
                            </div>
                            <div className="text-center">
                              <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-sm font-bold bg-emerald-100 text-emerald-700">
                                📊 {((contestant.mainScore || 0) + (contestant.finalScore || 0)).toFixed(1)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-xs text-gray-500 mb-1">{viewMode === 'main' ? 'Main Score' : 'Final Score'}</div>
                            <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-lg font-bold ${
                              viewMode === 'main' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {viewMode === 'main' 
                                ? (contestant.mainScore?.toFixed(1) || '0.0')
                                : (contestant.finalScore?.toFixed(1) || '0.0')
                              }
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Criteria Scores - Compact Grid */}
                    {criteria.length > 0 && (
                      <div className="pt-3 border-t border-gray-100">
                        <div className="text-xs text-gray-500 mb-2">
                          {viewMode === 'main' ? 'Main ' : viewMode === 'final' ? 'Final ' : ''}Criteria Scores (Avg.)
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {criteria.slice(0, 6).map((criterion, index) => {
                            const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                            const score = contestant.criteriaScores?.[key] || 0;
                            return (
                              <div key={index} className="bg-gray-50 rounded-lg p-2">
                                <div className="text-[10px] text-gray-500 mb-0.5 truncate" title={criterion.name}>
                                  {criterion.name} ({criterion.weight}%)
                                </div>
                                <span className={`text-sm font-bold ${
                                  score >= 90 ? 'text-green-600' :
                                  score >= 80 ? 'text-blue-600' :
                                  score >= 70 ? 'text-yellow-600' :
                                  score > 0 ? 'text-gray-700' : 'text-gray-300'
                                }`}>
                                  {score > 0 ? score.toFixed(1) : '-'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {criteria.length > 6 && (
                          <div className="text-[10px] text-gray-400 mt-2 text-center">
                            +{criteria.length - 6} more criteria • Tap to view all
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View - hidden on small screens */}
          <div className="hidden md:block overflow-x-auto">
            {(() => {
              const criteria = getCurrentEventCriteria();
              const mainCriteria = getMainCriteria();
              const finalCriteria = getFinalCriteria();
              
              // For combined view, show both main and final columns
              if (viewMode === 'combined') {
                return (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-emerald-600 to-teal-600 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider cursor-pointer hover:bg-white/10"
                            onClick={() => handleSort('rank')}>
                          <div className="flex items-center">Rank <SortIcon column="rank" /></div>
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">No.</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider min-w-[150px]"
                            onClick={() => handleSort('contestantName')}>
                          <div className="flex items-center">Contestant <SortIcon column="contestantName" /></div>
                        </th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider bg-blue-600/50">
                          📋 Main Score
                        </th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider bg-purple-600/50">
                          🏆 Final Score
                        </th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider bg-emerald-800/50 cursor-pointer hover:bg-white/10"
                            onClick={() => handleSort('totalScore')}>
                          <div className="flex items-center justify-center">📊 Combined <SortIcon column="totalScore" /></div>
                        </th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Judges</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {sortedContestants.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-4xl mb-3">📋</span>
                              <h3 className="text-lg font-semibold text-gray-900 mb-1">No contestants found</h3>
                              <p className="text-sm text-gray-500">
                                {searchTerm ? 'Try adjusting your search term' : 'No contestants are registered for this event yet'}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        sortedContestants.map((contestant) => {
                          const rankBadge = getRankBadge(contestant.rank);
                          const combinedTotal = (contestant.mainScore || 0) + (contestant.finalScore || 0);
                          return (
                            <tr key={contestant.id} 
                                className={`hover:bg-emerald-50 cursor-pointer transition-colors duration-150 ${
                                  contestant.rank === 1 ? 'bg-yellow-50' : 
                                  contestant.rank === 2 ? 'bg-gray-50' : 
                                  contestant.rank === 3 ? 'bg-orange-50' : ''
                                }`}
                                onClick={() => openDetailModal(contestant)}>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border ${rankBadge.bg}`}>
                                  {contestant.rank <= 3 ? rankBadge.icon : contestant.rank}
                                </span>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                  <span className="text-sm font-semibold text-emerald-700">
                                    {contestant.contestantNumber || contestant.contestantNo || '?'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="text-sm font-semibold text-gray-900">{getContestantName(contestant)}</div>
                                <div className="text-xs text-gray-500">{contestant.scoredJudges}/{eventJudges.length} judges</div>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap bg-blue-50/50">
                                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-sm font-bold bg-blue-100 text-blue-700">
                                  {contestant.mainScore?.toFixed(1) || '0.0'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap bg-purple-50/50">
                                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-sm font-bold bg-purple-100 text-purple-700">
                                  {contestant.finalScore?.toFixed(1) || '0.0'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap bg-emerald-50/50">
                                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-sm font-bold bg-emerald-100 text-emerald-700">
                                  {combinedTotal.toFixed(1)}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700">
                                  {contestant.scoredJudges}/{eventJudges.length}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                );
              }
              
              // For main or final view, show detailed criteria columns
              const headerBg = viewMode === 'main' 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600' 
                : 'bg-gradient-to-r from-purple-600 to-pink-600';
              const scoreBg = viewMode === 'main' ? 'bg-blue-50/50' : 'bg-purple-50/50';
              const scoreClass = viewMode === 'main' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
              
              return (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className={`${headerBg} sticky top-0 z-10`}>
                    <tr>
                      <th 
                        className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors"
                        onClick={() => handleSort('rank')}
                      >
                        <div className="flex items-center">
                          Rank
                          <SortIcon column="rank" />
                        </div>
                      </th>
                      <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                        No.
                      </th>
                      <th 
                        className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors min-w-[150px]"
                        onClick={() => handleSort('contestantName')}
                      >
                        <div className="flex items-center">
                          Contestant
                          <SortIcon column="contestantName" />
                        </div>
                      </th>
                      {criteria.map((criterion, index) => (
                        <th 
                          key={index} 
                          className="px-2 sm:px-3 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider min-w-[80px]"
                          title={`${criterion.name} (${criterion.weight}%)`}
                        >
                          <div className="flex flex-col items-center">
                            <span className="truncate max-w-[80px]">{criterion.name}</span>
                            <span className="text-[10px] text-white/70 font-normal">({criterion.weight}%)</span>
                          </div>
                        </th>
                      ))}
                      <th 
                        className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors bg-black/20"
                        onClick={() => handleSort('totalScore')}
                      >
                        <div className="flex items-center justify-center">
                          {viewMode === 'main' ? '📋 Main Score' : '🏆 Final Score'}
                          <SortIcon column="totalScore" />
                        </div>
                      </th>
                      <th 
                        className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider"
                      >
                        <div className="flex items-center justify-center">
                          Judges
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {sortedContestants.length === 0 ? (
                      <tr>
                        <td colSpan={4 + criteria.length + 2} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-4xl mb-3">📋</span>
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">No contestants found</h3>
                            <p className="text-sm text-gray-500">
                              {searchTerm ? 'Try adjusting your search term' : 'No contestants are registered for this event yet'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      sortedContestants.map((contestant) => {
                        const rankBadge = getRankBadge(contestant.rank);
                        return (
                          <tr 
                            key={contestant.id} 
                            className={`hover:bg-emerald-50 cursor-pointer transition-colors duration-150 ${
                              contestant.rank === 1 ? 'bg-yellow-50' : 
                              contestant.rank === 2 ? 'bg-gray-50' : 
                              contestant.rank === 3 ? 'bg-orange-50' : ''
                            }`}
                            onClick={() => openDetailModal(contestant)}
                          >
                            <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border ${rankBadge.bg}`}>
                                {contestant.rank <= 3 ? rankBadge.icon : contestant.rank}
                              </span>
                            </td>
                            <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                <span className="text-sm font-semibold text-emerald-700">
                                  {contestant.contestantNumber || contestant.contestantNo || '?'}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 sm:px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {getContestantName(contestant)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {contestant.scoredJudges}/{eventJudges.length} judges
                                  </div>
                                </div>
                              </div>
                            </td>
                            {criteria.map((criterion, index) => {
                              const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
                              const score = contestant.criteriaScores?.[key] || 0;
                              return (
                                <td key={index} className="px-2 sm:px-3 py-3 text-center whitespace-nowrap">
                                  {score > 0 ? (
                                    <span className={`inline-flex items-center justify-center px-2 py-1 rounded-lg text-sm font-bold ${
                                      score >= 90 ? 'bg-green-100 text-green-700' :
                                      score >= 80 ? 'bg-blue-100 text-blue-700' :
                                      score >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {score.toFixed(1)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300 text-sm">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className={`px-3 sm:px-4 py-3 text-center whitespace-nowrap ${scoreBg}`}>
                              <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-sm font-bold ${scoreClass}`}>
                                {viewMode === 'main' 
                                  ? (contestant.mainScore?.toFixed(1) || '0.0')
                                  : (contestant.finalScore?.toFixed(1) || '0.0')
                                }
                              </span>
                            </td>
                            <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap">
                              <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700">
                                {contestant.scoredJudges}/{eventJudges.length}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      </main>

      {/* Score Detail Modal */}
      {showDetailModal && selectedContestant && (
        <div className="fixed inset-0 z-50 overflow-y-auto" onClick={closeDetailModal}>
          <div className="flex items-end sm:items-center justify-center min-h-screen px-0 sm:px-4 pt-4 pb-0 sm:pb-20 text-center">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"></div>

            {/* Modal */}
            <div 
              className="relative inline-block w-full sm:max-w-2xl bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl transform transition-all sm:my-8 text-left overflow-hidden max-h-[90vh] sm:max-h-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 py-3 sm:py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-base sm:text-lg font-bold">
                        {selectedContestant.contestantNumber || selectedContestant.contestantNo || '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-bold text-white truncate">
                        {getContestantName(selectedContestant)}
                      </h3>
                      <p className="text-xs sm:text-sm text-emerald-100">
                        Rank #{selectedContestant.rank} • {selectedContestant.scoredJudges}/{eventJudges.length} judges
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeDetailModal}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 sm:p-6 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto">
                {/* Score Summary - Main and Final */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 sm:p-4 text-center border border-blue-200">
                    <p className="text-xs sm:text-sm text-blue-600 font-medium mb-1">📋 Main Round Score</p>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-700">{selectedContestant.mainScore?.toFixed(1) || '0.0'}</p>
                    <p className="text-xs text-blue-500 mt-1">Preliminary/Main criteria</p>
                  </div>
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-3 sm:p-4 text-center border border-purple-200">
                    <p className="text-xs sm:text-sm text-purple-600 font-medium mb-1">🏆 Final Round Score</p>
                    <p className="text-2xl sm:text-3xl font-bold text-purple-700">{selectedContestant.finalScore?.toFixed(1) || '0.0'}</p>
                    <p className="text-xs text-purple-500 mt-1">Final round criteria</p>
                  </div>
                </div>

                {/* Main Criteria Breakdown */}
                {selectedContestant.mainCriteriaScores && Object.keys(selectedContestant.mainCriteriaScores).length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span>📋</span> Main Criteria Breakdown
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(selectedContestant.mainCriteriaScores).map(([criteria, score]) => (
                        <div key={criteria} className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                          <p className="text-xs text-blue-600 mb-1 capitalize">
                            {criteria.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xl font-bold text-blue-800">{typeof score === 'number' ? score.toFixed(1) : score}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Final Criteria Breakdown */}
                {selectedContestant.finalCriteriaScores && Object.keys(selectedContestant.finalCriteriaScores).length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span>🏆</span> Final Criteria Breakdown
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(selectedContestant.finalCriteriaScores).map(([criteria, score]) => (
                        <div key={criteria} className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                          <p className="text-xs text-purple-600 mb-1 capitalize">
                            {criteria.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xl font-bold text-purple-800">{typeof score === 'number' ? score.toFixed(1) : score}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Judge Scores Breakdown */}
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span>👨‍⚖️</span> Detailed Scores by Judge
                </h4>
                
                <div className="space-y-4">
                  {selectedContestant.judgeScores.map((js, index) => (
                    <div key={js.judgeId || index} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
                            <span className="text-white text-sm font-bold">{index + 1}</span>
                          </div>
                          <span className="font-semibold text-gray-900">Judge {index + 1}</span>
                          <span className="text-sm text-gray-500">({js.judgeName})</span>
                        </div>
                        <div className="flex gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            js.mainScore > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            Main: {js.mainScore?.toFixed(1) || '-'}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            js.finalScore > 0 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            Final: {js.finalScore?.toFixed(1) || '-'}
                          </span>
                        </div>
                      </div>
                      
                      {(js.mainScore > 0 || js.finalScore > 0) && Object.keys(js.scores).length > 0 && (
                        <div className="p-4">
                          {/* Separate Main and Final scores */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Main Round Scores */}
                            <div>
                              <p className="text-xs font-semibold text-blue-600 mb-2">📋 Main Round</p>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(js.scores)
                                  .filter(([key]) => !key.startsWith('final_'))
                                  .map(([criteria, score]) => (
                                    <div key={criteria} className="bg-blue-50 rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-blue-500 mb-0.5 capitalize">
                                        {criteria.replace(/_/g, ' ')}
                                      </p>
                                      <p className="text-sm font-bold text-blue-800">{score}</p>
                                    </div>
                                  ))}
                              </div>
                            </div>
                            {/* Final Round Scores */}
                            <div>
                              <p className="text-xs font-semibold text-purple-600 mb-2">🏆 Final Round</p>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(js.scores)
                                  .filter(([key]) => key.startsWith('final_'))
                                  .map(([criteria, score]) => (
                                    <div key={criteria} className="bg-purple-50 rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-purple-500 mb-0.5 capitalize">
                                        {criteria.replace('final_', '').replace(/_/g, ' ')}
                                      </p>
                                      <p className="text-sm font-bold text-purple-800">{score}</p>
                                    </div>
                                  ))}
                                {Object.entries(js.scores).filter(([key]) => key.startsWith('final_')).length === 0 && (
                                  <div className="col-span-2 text-center text-xs text-gray-400 py-2">
                                    No final round scores yet
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* View-only notice */}
                <div className="mt-6 bg-gray-50 rounded-xl p-3 sm:p-4 flex items-center gap-3">
                  <div className="p-2 bg-gray-200 rounded-lg flex-shrink-0">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700">View-Only Mode</p>
                    <p className="text-[10px] sm:text-xs text-gray-500">Scores cannot be modified from this dashboard</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 flex justify-end sticky bottom-0">
                <button
                  onClick={closeDetailModal}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
