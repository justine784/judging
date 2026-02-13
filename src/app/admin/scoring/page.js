'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDocs, collection, doc, getDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ScoringPage() {
  const [contestants, setContestants] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContestant, setEditingContestant] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    contestantNo: '',
    contestantName: '',
    talent: 0,
    beauty: 0,
    qa: 0
  });

  // Load contestants and scores from Firestore on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load contestants from Firestore
        const contestantsCollection = collection(db, 'contestants');
        const contestantsSnapshot = await getDocs(contestantsCollection);
        const contestantsList = contestantsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Load scores from Firestore
        const scoresCollection = collection(db, 'scores');
        const scoresSnapshot = await getDocs(scoresCollection);
        const scoresList = scoresSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Group scores by contestant and calculate averages
        const contestantScores = {};
        scoresList.forEach(score => {
          if (!contestantScores[score.contestantId]) {
            contestantScores[score.contestantId] = {
              scores: [],
              totalScore: 0,
              judgeCount: 0
            };
          }
          contestantScores[score.contestantId].scores.push(score);
          contestantScores[score.contestantId].totalScore += score.totalScore;
          contestantScores[score.contestantId].judgeCount++;
        });

        // Calculate average scores and merge with contestant data
        const contestantsWithScores = contestantsList.map(contestant => {
          const scoreData = contestantScores[contestant.id] || { scores: [], totalScore: 0, judgeCount: 0 };
          const averageScore = scoreData.judgeCount > 0 ? scoreData.totalScore / scoreData.judgeCount : 0;
          
          return {
            ...contestant,
            averageScore: averageScore,
            judgeCount: scoreData.judgeCount,
            individualScores: scoreData.scores,
            totalWeightedScore: contestant.totalWeightedScore || averageScore
          };
        });

        // Sort by total weighted score
        const sortedContestants = contestantsWithScores.sort((a, b) => 
          (b.totalWeightedScore || 0) - (a.totalWeightedScore || 0)
        );

        // Assign ranks
        const rankedContestants = sortedContestants.map((contestant, index) => ({
          ...contestant,
          rank: index + 1,
          status: index === 0 ? '🏆 Top 1' : 
                 index === 1 ? 'Top 2' : 
                 index === 2 ? 'Top 3' : 
                 `Top ${index + 1}`
        }));

        setContestants(rankedContestants);
      } catch (error) {
        console.error('Error loading data:', error);
        // Fallback to sample data if Firestore fails
        loadSampleData();
      }
    };

    // Set up real-time listener for scores
    const scoresQuery = query(collection(db, 'scores'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(scoresQuery, (snapshot) => {
      // Reload data when scores change
      loadData();
    });

    loadData();

    return () => unsubscribe();
  }, []);

  const loadSampleData = () => {
    const sampleContestants = [
      {
        id: '1',
        contestantNo: '07',
        contestantName: 'Maria Cruz',
        talent: 38.5,
        beauty: 27.0,
        qa: 28.5,
        totalWeightedScore: 94.0,
        rank: 1,
        status: '🏆 Top 1',
        eventName: 'Grand Vocal Showdown 2026',
        eventId: '1'
      },
      {
        id: '2',
        contestantNo: '03',
        contestantName: 'Anna Lopez',
        talent: 37.0,
        beauty: 26.5,
        qa: 27.8,
        totalWeightedScore: 91.3,
        rank: 2,
        status: 'Top 2',
        eventName: 'Grand Vocal Showdown 2026',
        eventId: '1'
      },
      {
        id: '3',
        contestantNo: '11',
        contestantName: 'Carla Reyes',
        talent: 36.2,
        beauty: 25.9,
        qa: 27.0,
        totalWeightedScore: 89.1,
        rank: 3,
        status: 'Top 3',
        eventName: 'Battle of the Bands',
        eventId: '2'
      }
    ];
    setContestants(sampleContestants);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'contestantNo' || name === 'contestantName' ? value : parseFloat(value) || 0
    }));
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const filteredContestants = contestants.filter(contestant => 
    contestant.eventName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contestant.contestantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contestant.contestantNo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateWeightedScore = (talent, beauty, qa) => {
    const talentWeighted = (talent || 0) * 0.4;
    const beautyWeighted = (beauty || 0) * 0.3;
    const qaWeighted = (qa || 0) * 0.3;
    return (talentWeighted + beautyWeighted + qaWeighted).toFixed(1);
  };

  const determineStatus = (rank) => {
    switch(rank) {
      case 1: return '🏆 Top 1';
      case 2: return 'Top 2';
      case 3: return 'Top 3';
      default: return `Top ${rank}`;
    }
  };

  const updateRankings = (contestantsList) => {
    return contestantsList
      .sort((a, b) => b.totalWeightedScore - a.totalWeightedScore)
      .map((contestant, index) => ({
        ...contestant,
        rank: index + 1,
        status: determineStatus(index + 1)
      }));
  };

  const handleEditContestant = () => {
    const totalScore = calculateWeightedScore(formData.talent, formData.beauty, formData.qa);
    const updatedContestants = contestants.map(contestant => 
      contestant.id === editingContestant.id 
        ? { ...contestant, ...formData, totalWeightedScore: parseFloat(totalScore) }
        : contestant
    );
    
    const rankedContestants = updateRankings(updatedContestants);
    setContestants(rankedContestants);
    setShowEditModal(false);
    setEditingContestant(null);
    resetForm();
  };

  const openEditModal = (contestant) => {
    setEditingContestant(contestant);
    setFormData({
      contestantNo: contestant.contestantNo,
      contestantName: contestant.contestantName,
      talent: contestant.talent,
      beauty: contestant.beauty,
      qa: contestant.qa
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      contestantNo: '',
      contestantName: '',
      talent: 0,
      beauty: 0,
      qa: 0
    });
  };

  const getStatusColor = (status) => {
    if (status.includes('🏆')) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (status.includes('Top 2')) return 'bg-gray-100 text-gray-800 border-gray-300';
    if (status.includes('Top 3')) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };

  const getRankColor = (rank) => {
    switch(rank) {
      case 1: return 'bg-yellow-500 text-white';
      case 2: return 'bg-gray-400 text-white';
      case 3: return 'bg-orange-500 text-white';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🏆 Scoreboard</h1>
          <p className="text-gray-600">Manage contestant scores and rankings</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by event, contestant name, or number..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-80 px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
        </div>
      </div>

      {/* Score Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-900 mb-2">📌 Scoring Explanation:</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Each criterion is multiplied by its percentage weight</li>
          <li>• Total Weighted Score = (Talent × 40%) + (Beauty × 30%) + (Q&A × 30%)</li>
          <li>• Ranking is automatically sorted from Highest to Lowest</li>
        </ul>
      </div>

      {/* Scoreboard Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
          <h2 className="text-xl font-bold">📊 Overall Scoreboard Table (Weighted Scores)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contestant No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contestant Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Talent (40%)</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Beauty (30%)</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Q&A (30%)</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Weighted Score</th>
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
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      {contestant.eventName}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-medium bg-purple-100 text-purple-800 rounded-full">
                      {(contestant.talent || 0).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-medium bg-pink-100 text-pink-800 rounded-full">
                      {(contestant.beauty || 0).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full">
                      {(contestant.qa || 0).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-bold bg-green-100 text-green-800 rounded-full">
                      {(contestant.totalWeightedScore || 0).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(contestant.status)}`}>
                      {contestant.status}
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
      </div>

      {/* Individual Judge Scores */}
      <div className="mt-8">
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
            <h2 className="text-xl font-bold">👥 Individual Judge Scores</h2>
            <p className="text-purple-100 text-sm">Detailed scores from each judge</p>
          </div>
          <div className="p-6">
            {contestants.map((contestant) => (
              <div key={contestant.id} className="mb-6 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {contestant.contestantName} (#{contestant.contestantNo})
                  </h3>
                  <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                    {contestant.eventName}
                  </span>
                </div>
                
                {contestant.individualScores && contestant.individualScores.length > 0 ? (
                  <div className="space-y-2">
                    {contestant.individualScores.map((score, index) => (
                      <div key={score.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-gray-900">
                            👤 {score.judgeName || score.judgeEmail}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(score.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="text-sm">
                            <span className="font-medium">Talent:</span> {score.scores.talent?.toFixed(1) || '0'}
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">Stage Presence:</span> {score.scores.stagePresence?.toFixed(1) || '0'}
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">Song Interpretation:</span> {score.scores.songInterpretation?.toFixed(1) || '0'}
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">Total:</span> 
                            <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              {score.totalScore?.toFixed(1) || '0'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    No scores submitted yet for this contestant
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredContestants.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🏆</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? 'No matching contestants found' : 'No contestants yet'}
          </h3>
          <p className="text-gray-500">
            {searchTerm ? 'Try adjusting your search terms' : 'Contestants will appear here once they are added to events'}
          </p>
        </div>
      )}

      {/* Edit Contestant Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Talent Score (40%)</label>
                <input
                  type="number"
                  name="talent"
                  value={formData.talent}
                  onChange={handleInputChange}
                  min="0"
                  max="50"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beauty Score (30%)</label>
                <input
                  type="number"
                  name="beauty"
                  value={formData.beauty}
                  onChange={handleInputChange}
                  min="0"
                  max="50"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Q&A Score (30%)</label>
                <input
                  type="number"
                  name="qa"
                  value={formData.qa}
                  onChange={handleInputChange}
                  min="0"
                  max="50"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  required
                />
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600">
                  <div>Talent (40%): {((formData.talent || 0) * 0.4).toFixed(1)}</div>
                  <div>Beauty (30%): {((formData.beauty || 0) * 0.3).toFixed(1)}</div>
                  <div>Q&A (30%): {((formData.qa || 0) * 0.3).toFixed(1)}</div>
                  <div className="font-semibold text-gray-900 pt-1 border-t">
                    Total: {calculateWeightedScore(formData.talent, formData.beauty, formData.qa)}
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
    </div>
  );
}
