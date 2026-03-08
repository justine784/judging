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

    // Real-time listener for scores
    const unsubscribeScores = onSnapshot(collection(db, 'scores'), (snapshot) => {
      const scoresList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
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
    });

    return () => {
      unsubscribeEvents();
      unsubscribeContestants();
      unsubscribeScores();
      unsubscribeJudges();
    };
  };

  // Get judges assigned to selected event
  const getEventJudges = () => {
    if (!selectedEvent) return [];
    return judges.filter(j => 
      j.assignedEvents?.includes(selectedEvent.id) && 
      j.role === 'judge' && 
      j.status === 'active' &&
      j.email !== 'managescore@gmail.com'
    );
  };

  // Helper function to get criteria from event (same as live scoreboard)
  const getCurrentEventCriteria = () => {
    if (!selectedEvent) return [];
    
    let criteria = [];
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
                  scoringType: category.scoringType || 'percentage'
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
                scoringType: category.scoringType || 'percentage'
              });
            }
          }
        });
      }
    } else if (selectedEvent.criteria && selectedEvent.criteria.length > 0) {
      criteria = selectedEvent.criteria.filter(c => c.enabled && c.name && c.name.trim() !== '');
    }
    
    return criteria;
  };

  // Calculate aggregated scores from all judges for a contestant (same as live scoreboard)
  const calculateAggregatedScore = (contestantId, eventId) => {
    const contestantScores = scores.filter(score => 
      score.contestantId === contestantId && score.eventId === eventId
    );
    
    if (contestantScores.length === 0) {
      return { totalScore: 0, judgeCount: 0, criteriaScores: {} };
    }
    
    const event = events.find(e => e.id === eventId);
    const isPointsGrading = event?.gradingType === 'points';
    
    const uniqueJudges = [...new Set(contestantScores.map(score => score.judgeId))];
    const judgeCount = uniqueJudges.length;
    
    const criteria = getCurrentEventCriteria();
    
    const criteriaScores = {};
    criteria.forEach(criterion => {
      const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
      const finalKey = `final_${key}`;
      
      const latestScoresByJudge = {};
      contestantScores.forEach(score => {
        const regularScore = score.scores?.[key];
        const finalScore = score.scores?.[finalKey];
        const scoreValue = regularScore !== undefined && regularScore > 0 ? regularScore : 
                          (finalScore !== undefined && finalScore > 0 ? finalScore : null);
        
        if (scoreValue !== null && scoreValue > 0) {
          if (!latestScoresByJudge[score.judgeId] || 
              new Date(score.timestamp) > new Date(latestScoresByJudge[score.judgeId].timestamp)) {
            latestScoresByJudge[score.judgeId] = { ...score, resolvedScore: scoreValue };
          }
        }
      });
      
      const criteriaValues = Object.values(latestScoresByJudge).map(s => s.resolvedScore);
      
      if (criteriaValues.length > 0) {
        criteriaScores[key] = criteriaValues.reduce((sum, val) => sum + val, 0) / criteriaValues.length;
      } else {
        criteriaScores[key] = 0;
      }
    });
    
    let totalScore = 0;
    
    if (isPointsGrading) {
      criteria.forEach(criterion => {
        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const score = criteriaScores[key] || 0;
        totalScore += score;
      });
      
      const maxPoints = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
      if (maxPoints > 0) {
        totalScore = (totalScore / maxPoints) * 100;
      }
    } else {
      criteria.forEach(criterion => {
        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const score = criteriaScores[key] || 0;
        const weight = criterion.weight / 100;
        totalScore += score * weight;
      });
    }
    
    totalScore = Math.min(totalScore, 100);
    
    return {
      totalScore: parseFloat(totalScore.toFixed(1)),
      judgeCount,
      criteriaScores
    };
  };

  // Calculate individual judge's total score using weighted criteria (same as live scoreboard)
  const calculateJudgeTotalScore = (judgeScores) => {
    if (!judgeScores || Object.keys(judgeScores).length === 0) return 0;
    
    const criteria = getCurrentEventCriteria();
    const event = selectedEvent;
    const isPointsGrading = event?.gradingType === 'points';
    
    let totalScore = 0;
    
    if (isPointsGrading) {
      criteria.forEach(criterion => {
        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const finalKey = `final_${key}`;
        const score = judgeScores[key] || judgeScores[finalKey] || 0;
        totalScore += score;
      });
      
      const maxPoints = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
      if (maxPoints > 0) {
        totalScore = (totalScore / maxPoints) * 100;
      }
    } else {
      criteria.forEach(criterion => {
        const key = criterion.name.toLowerCase().replace(/\s+/g, '_');
        const finalKey = `final_${key}`;
        const score = judgeScores[key] || judgeScores[finalKey] || 0;
        const weight = criterion.weight / 100;
        totalScore += score * weight;
      });
    }
    
    return Math.min(totalScore, 100);
  };

  // Get all contestants for selected event with their scores (matching live scoreboard)
  const getEventContestantsWithScores = () => {
    if (!selectedEvent) return [];
    
    const eventJudges = getEventJudges();
    const eventContestants = contestants.filter(c => c.eventId === selectedEvent.id);
    
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
      
      // Build judge scores array (ordered by judge) with proper weighted calculation
      const judgeScoresArray = eventJudges.map(judge => {
        const scoreData = judgeScoresMap[judge.id];
        if (scoreData && scoreData.scores) {
          // Calculate the judge's total score using weighted criteria (same as live scoreboard)
          const calculatedTotal = calculateJudgeTotalScore(scoreData.scores);
          return {
            judgeId: judge.id,
            judgeName: judge.judgeName || judge.displayName || 'Judge',
            totalScore: parseFloat(calculatedTotal.toFixed(1)),
            scores: scoreData.scores || {},
            timestamp: scoreData.timestamp
          };
        }
        return {
          judgeId: judge.id,
          judgeName: judge.judgeName || judge.displayName || 'Judge',
          totalScore: 0,
          scores: {},
          timestamp: null
        };
      });
      
      // Use the same aggregated calculation as live scoreboard for total and average
      const aggregatedScore = calculateAggregatedScore(contestant.id, selectedEvent.id);
      
      return {
        ...contestant,
        judgeScores: judgeScoresArray,
        totalScore: aggregatedScore.totalScore,
        averageScore: aggregatedScore.totalScore, // Same as live scoreboard
        criteriaScores: aggregatedScore.criteriaScores,
        scoredJudges: aggregatedScore.judgeCount
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
    
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Score Sheet - ${selectedEvent?.eventName || 'Event'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #059669; padding-bottom: 20px; }
          .logo { width: 80px; height: 80px; margin: 0 auto 15px; border-radius: 50%; }
          .title { font-size: 24px; font-weight: bold; color: #059669; margin-bottom: 5px; }
          .subtitle { font-size: 14px; color: #666; }
          .event-info { background: #f0fdf4; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .event-name { font-size: 18px; font-weight: bold; color: #166534; margin-bottom: 10px; }
          .event-details { display: flex; justify-content: space-between; font-size: 12px; color: #555; flex-wrap: wrap; gap: 10px; }
          .stats { display: flex; gap: 30px; margin-bottom: 20px; }
          .stat-item { text-align: center; padding: 10px 20px; background: #f8fafc; border-radius: 8px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #059669; }
          .stat-label { font-size: 11px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
          th { background: #059669; color: white; padding: 10px 5px; text-align: center; font-weight: 600; }
          th:first-child, td:first-child { text-align: center; }
          td { padding: 8px 5px; border-bottom: 1px solid #e5e7eb; text-align: center; }
          tr:nth-child(even) { background: #f9fafb; }
          tr:hover { background: #f0fdf4; }
          .rank-1 { background: linear-gradient(90deg, #fef3c7, #fef9c3) !important; }
          .rank-2 { background: linear-gradient(90deg, #e5e7eb, #f3f4f6) !important; }
          .rank-3 { background: linear-gradient(90deg, #fed7aa, #ffedd5) !important; }
          .contestant-name { text-align: left !important; font-weight: 500; }
          .score { font-weight: 600; }
          .total { color: #059669; font-weight: bold; }
          .average { color: #7c3aed; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 10px; color: #888; }
          .no-score { color: #9ca3af; }
          @media print {
            body { padding: 10px; }
            .header { margin-bottom: 15px; padding-bottom: 10px; }
            table { font-size: 10px; }
            th, td { padding: 5px 3px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="/logo.jpg" alt="Logo" class="logo" onerror="this.style.display='none'" />
          <div class="title">Judging & Tabulation System</div>
          <div class="subtitle">Official Score Sheet</div>
        </div>
        
        <div class="event-info">
          <div class="event-name">${selectedEvent?.eventName || 'Event'}</div>
          <div class="event-details">
            <span><strong>Date:</strong> ${selectedEvent?.date || 'N/A'}</span>
            <span><strong>Venue:</strong> ${selectedEvent?.venue || 'N/A'}</span>
            <span><strong>Status:</strong> ${selectedEvent?.status || 'N/A'}</span>
            <span><strong>Printed:</strong> ${new Date().toLocaleString()}</span>
          </div>
        </div>
        
        <div class="stats">
          <div class="stat-item">
            <div class="stat-value">${sortedContestants.length}</div>
            <div class="stat-label">Total Contestants</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${eventJudges.length}</div>
            <div class="stat-label">Total Judges</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${sortedContestants.filter(c => c.scoredJudges > 0).length}</div>
            <div class="stat-label">Scored Contestants</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 40px;">Rank</th>
              <th style="width: 40px;">No.</th>
              <th style="min-width: 120px;">Contestant Name</th>
              ${eventJudges.map((j, i) => `<th>Judge ${i + 1}</th>`).join('')}
              <th>Final Score</th>
              <th>Judges</th>
            </tr>
          </thead>
          <tbody>
            ${sortedContestants.map((c, index) => `
              <tr class="${c.rank <= 3 ? `rank-${c.rank}` : ''}">
                <td><strong>${c.rank <= 3 ? ['🥇', '🥈', '🥉'][c.rank - 1] : c.rank}</strong></td>
                <td>${c.contestantNumber || c.contestantNo || '-'}</td>
                <td class="contestant-name">${c.contestantName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'}</td>
                ${c.judgeScores.map(js => `<td class="${js.totalScore > 0 ? 'score' : 'no-score'}">${js.totalScore > 0 ? js.totalScore.toFixed(1) : '-'}</td>`).join('')}
                <td class="total">${c.totalScore.toFixed(1)}</td>
                <td class="average">${c.scoredJudges}/${eventJudges.length}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>This document is generated by the Judging & Tabulation System</p>
          <p>© ${new Date().getFullYear()} Bongabong National High School - All Rights Reserved</p>
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
  const eventContestants = contestants.filter(c => c.eventId === selectedEvent?.id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 shadow-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-4 gap-3">
            <div className="flex items-center gap-3">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40"></div>
                <div className="relative h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white/95 shadow-xl p-1 overflow-hidden border-2 border-white/50">
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
                <h1 className="text-lg sm:text-xl font-bold text-white drop-shadow-md">Manage Scores Dashboard</h1>
                <p className="text-xs sm:text-sm text-emerald-100">View-only Score Management</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              {/* Live indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-xl">
                <div className="relative w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse">
                  <div className="absolute inset-0 rounded-full bg-green-400 animate-ping"></div>
                </div>
                <span className="text-white text-xs sm:text-sm font-medium">Live</span>
              </div>
              
              {/* Last updated */}
              <div className="hidden sm:block bg-white/10 backdrop-blur-sm rounded-xl px-3 py-1.5">
                <div className="text-xs text-emerald-100">Updated</div>
                <div className="text-sm text-white font-medium">{lastUpdated?.toLocaleTimeString() || 'Never'}</div>
              </div>
              
              {/* User info */}
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-white">{user?.email}</p>
                <p className="text-xs text-emerald-100">Score Manager</p>
              </div>
              
              <button
                onClick={handleLogout}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
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
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-500">Contestants</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{eventContestants.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-xl">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-500">Judges</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{eventJudges.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-green-100 rounded-xl">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-500">Scored</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{sortedContestants.filter(c => c.scoredJudges > 0).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-100 rounded-xl">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-500">Events</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{events.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* View-only notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-amber-800">
              <strong>View-Only Mode:</strong> Scores cannot be edited from this dashboard. Only judges can input and modify scores.
            </p>
          </div>
        </div>

        {/* Judges Overview Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <span className="text-2xl">👨‍⚖️</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Judges Overview</h2>
                  <p className="text-sm text-purple-100">All judges assigned to this event with their scoring status</p>
                </div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2">
                <p className="text-purple-100 text-xs font-medium">Total Judges</p>
                <p className="text-2xl font-bold text-white text-center">{eventJudges.length}</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {eventJudges.map((judge, index) => {
                  // Get all score documents for this judge in this event
                  const judgeScoreDocuments = scores.filter(s => 
                    s.judgeId === judge.id && 
                    s.eventId === selectedEvent?.id
                  );
                  
                  // Get unique contestants scored by this judge (get latest score per contestant)
                  const latestScoresByContestant = {};
                  judgeScoreDocuments.forEach(score => {
                    if (!latestScoresByContestant[score.contestantId] || 
                        new Date(score.timestamp) > new Date(latestScoresByContestant[score.contestantId].timestamp)) {
                      latestScoresByContestant[score.contestantId] = score;
                    }
                  });
                  
                  const contestantsScored = Object.keys(latestScoresByContestant).length;
                  
                  // Calculate average score given by this judge using weighted criteria (same as live scoreboard)
                  const validScores = Object.values(latestScoresByContestant).filter(s => s.scores && Object.keys(s.scores).length > 0);
                  let avgScoreGiven = 0;
                  if (validScores.length > 0) {
                    const totalWeightedScore = validScores.reduce((sum, s) => {
                      return sum + calculateJudgeTotalScore(s.scores);
                    }, 0);
                    avgScoreGiven = (totalWeightedScore / validScores.length).toFixed(1);
                  }
                  
                  // Scoring progress percentage
                  const progressPercent = eventContestants.length > 0 
                    ? Math.round((contestantsScored / eventContestants.length) * 100) 
                    : 0;
                  
                  return (
                    <div 
                      key={judge.id} 
                      className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                            <span className="text-white text-lg font-bold">{index + 1}</span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm">
                              {judge.judgeName || judge.displayName || `Judge ${index + 1}`}
                            </h3>
                            <p className="text-xs text-gray-500 truncate max-w-[120px]">{judge.email}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          progressPercent === 100 ? 'bg-green-100 text-green-700' :
                          progressPercent > 0 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {progressPercent === 100 ? '✓ Complete' : progressPercent > 0 ? 'In Progress' : 'Not Started'}
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Scoring Progress</span>
                          <span>{contestantsScored}/{eventContestants.length} contestants</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-500 ${
                              progressPercent === 100 ? 'bg-green-500' :
                              progressPercent > 50 ? 'bg-blue-500' :
                              progressPercent > 0 ? 'bg-yellow-500' :
                              'bg-gray-300'
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      {/* Judge Stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-purple-600 font-medium">Avg Score Given</p>
                          <p className="text-lg font-bold text-purple-700">{avgScoreGiven || '-'}</p>
                        </div>
                        <div className="bg-indigo-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-indigo-600 font-medium">Scored</p>
                          <p className="text-lg font-bold text-indigo-700">{contestantsScored}</p>
                        </div>
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
            <h2 className="text-lg font-bold text-gray-900">Score Overview</h2>
            <p className="text-sm text-gray-500">Click on a contestant row to view detailed scores</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-emerald-600 to-teal-600 sticky top-0 z-10">
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
                      Contestant Name
                      <SortIcon column="contestantName" />
                    </div>
                  </th>
                  {eventJudges.map((judge, index) => (
                    <th 
                      key={judge.id} 
                      className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider min-w-[80px]"
                    >
                      Judge {index + 1}
                    </th>
                  ))}
                  <th 
                    className="px-3 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={() => handleSort('totalScore')}
                  >
                    <div className="flex items-center justify-center">
                      Final Score
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
                    <td colSpan={4 + eventJudges.length + 2} className="px-6 py-12 text-center">
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
                                {contestant.scoredJudges}/{eventJudges.length} judges scored
                              </div>
                            </div>
                          </div>
                        </td>
                        {contestant.judgeScores.map((js, index) => (
                          <td key={js.judgeId || index} className="px-3 sm:px-4 py-3 text-center whitespace-nowrap">
                            {js.totalScore > 0 ? (
                              <span className={`inline-flex items-center justify-center px-2 py-1 rounded-lg text-sm font-bold ${
                                js.totalScore >= 90 ? 'bg-green-100 text-green-700' :
                                js.totalScore >= 80 ? 'bg-blue-100 text-blue-700' :
                                js.totalScore >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {js.totalScore.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-sm">-</span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-sm font-bold bg-emerald-100 text-emerald-700">
                            {contestant.totalScore.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
                            {contestant.scoredJudges}/{eventJudges.length}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="text-lg">⚡</span> Quick Actions
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => router.push('/scoreboard')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View Live Scoreboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Data
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="text-lg">ℹ️</span> System Info
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-gray-500">User Role</span>
                <span className="font-semibold text-gray-900">Score Manager</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Access Level</span>
                <span className="font-semibold text-emerald-600">View Only</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">Status</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                  Active
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="text-lg">📊</span> Event Summary
            </h3>
            {selectedEvent ? (
              <div className="space-y-2 text-sm">
                <div className="py-1.5 border-b border-gray-100">
                  <span className="text-gray-500 block text-xs">Event Name</span>
                  <span className="font-semibold text-gray-900 truncate block">{selectedEvent.eventName}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500">Status</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    selectedEvent.status === 'ongoing' ? 'bg-green-100 text-green-800' :
                    selectedEvent.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedEvent.status}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-500">Criteria</span>
                  <span className="font-semibold text-gray-900">{selectedEvent.criteria?.length || 0}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Select an event to view summary</p>
            )}
          </div>
        </div>
      </main>

      {/* Score Detail Modal */}
      {showDetailModal && selectedContestant && (
        <div className="fixed inset-0 z-50 overflow-y-auto" onClick={closeDetailModal}>
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"></div>

            {/* Modal */}
            <div 
              className="relative inline-block w-full max-w-2xl bg-white rounded-2xl shadow-2xl transform transition-all my-8 text-left overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="text-white text-lg font-bold">
                        {selectedContestant.contestantNumber || selectedContestant.contestantNo || '?'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {getContestantName(selectedContestant)}
                      </h3>
                      <p className="text-sm text-emerald-100">
                        Rank #{selectedContestant.rank} • {selectedContestant.scoredJudges}/{eventJudges.length} judges scored
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeDetailModal}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {/* Score Summary */}
                <div className="grid grid-cols-1 gap-4 mb-6">
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 text-center border border-emerald-200">
                    <p className="text-sm text-emerald-600 font-medium mb-1">Final Score (Same as Live Scoreboard)</p>
                    <p className="text-4xl font-bold text-emerald-700">{selectedContestant.totalScore.toFixed(1)}</p>
                    <p className="text-xs text-emerald-500 mt-1">Aggregated from {selectedContestant.scoredJudges} judge(s)</p>
                  </div>
                </div>

                {/* Criteria Breakdown */}
                {selectedContestant.criteriaScores && Object.keys(selectedContestant.criteriaScores).length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span>📊</span> Criteria Breakdown (Averaged across all judges)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(selectedContestant.criteriaScores).map(([criteria, score]) => (
                        <div key={criteria} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                          <p className="text-xs text-gray-500 mb-1 capitalize">
                            {criteria.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xl font-bold text-gray-900">{typeof score === 'number' ? score.toFixed(1) : score}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Judge Scores Breakdown */}
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span>📋</span> Detailed Scores by Judge
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
                        {js.totalScore > 0 ? (
                          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            js.totalScore >= 90 ? 'bg-green-100 text-green-700' :
                            js.totalScore >= 80 ? 'bg-blue-100 text-blue-700' :
                            js.totalScore >= 70 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {js.totalScore.toFixed(2)}
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-400">
                            Not scored
                          </span>
                        )}
                      </div>
                      
                      {js.totalScore > 0 && Object.keys(js.scores).length > 0 && (
                        <div className="p-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {Object.entries(js.scores).map(([criteria, score]) => (
                              <div key={criteria} className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500 mb-1 capitalize">
                                  {criteria.replace(/_/g, ' ')}
                                </p>
                                <p className="text-lg font-bold text-gray-900">{score}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* View-only notice */}
                <div className="mt-6 bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                  <div className="p-2 bg-gray-200 rounded-lg">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">View-Only Mode</p>
                    <p className="text-xs text-gray-500">Scores cannot be modified from this dashboard</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end">
                <button
                  onClick={closeDetailModal}
                  className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-colors"
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
