'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function EventScoring() {
  const [contestants, setContestants] = useState([]);
  const [event, setEvent] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContestant, setEditingContestant] = useState(null);
  const [scoresLocked, setScoresLocked] = useState(false);
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId;

  // Form state
  const [formData, setFormData] = useState({
    contestantId: '',
    contestantNumber: '',
    contestantName: '',
    scores: {}
  });

  // Load event and contestants data
  useEffect(() => {
    // Sample event data
    const sampleEvents = {
      '1': {
        id: '1',
        eventName: 'Grand Vocal Showdown 2026',
        eventDescription: 'Annual singing competition featuring the best vocal talents',
        date: '2026-03-15',
        time: '6:00 PM',
        venue: 'University Auditorium',
        status: 'upcoming',
        scoresLocked: false,
        criteria: [
          { name: 'Vocal Quality', weight: 40, enabled: true },
          { name: 'Stage Presence', weight: 30, enabled: true },
          { name: 'Song Interpretation', weight: 20, enabled: true },
          { name: 'Audience Impact', weight: 10, enabled: true }
        ]
      },
      '2': {
        id: '2',
        eventName: 'Battle of the Bands',
        eventDescription: 'Rock band competition for local musicians',
        date: '2026-02-28',
        time: '7:00 PM',
        venue: 'Municipal Gymnasium',
        status: 'ongoing',
        scoresLocked: false,
        criteria: [
          { name: 'Musical Performance', weight: 50, enabled: true },
          { name: 'Stage Presence', weight: 30, enabled: true },
          { name: 'Originality', weight: 20, enabled: true }
        ]
      },
      '3': {
        id: '3',
        eventName: 'Acoustic Night 2025',
        eventDescription: 'Intimate acoustic performance showcase',
        date: '2025-12-20',
        time: '5:00 PM',
        venue: 'Community Center',
        status: 'finished',
        scoresLocked: true,
        criteria: [
          { name: 'Vocal Quality', weight: 60, enabled: true },
          { name: 'Song Choice', weight: 40, enabled: true }
        ]
      }
    };

    const currentEvent = sampleEvents[eventId] || sampleEvents['1'];
    setEvent(currentEvent);
    setScoresLocked(currentEvent.scoresLocked);

    // Initialize form scores based on event criteria
    const initialScores = {};
    currentEvent.criteria.forEach(criterion => {
      initialScores[criterion.name] = 0;
    });
    setFormData(prev => ({ ...prev, scores: initialScores }));

    // Load contestants from Firestore
    loadContestants();
  }, [eventId]);

  const calculateWeightedScore = (scores) => {
    if (!event || !event.criteria) return 0;
    
    return event.criteria.reduce((total, criterion) => {
      if (!criterion.enabled) return total;
      const score = scores[criterion.name] || 0;
      return total + (score * criterion.weight / 100);
    }, 0);
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

  const loadContestants = async () => {
    try {
      console.log('Loading contestants from Firestore...');
      const contestantsCollection = collection(db, 'contestants');
      const contestantsSnapshot = await getDocs(contestantsCollection);
      
      const contestantsList = contestantsSnapshot.docs
        .map(doc => {
          const data = doc.data();
          console.log('Found contestant:', data);
          return {
            id: doc.id,
            ...data
          };
        })
        .filter(contestant => 
          contestant.eventId && (contestant.eventId.toString() === eventId.toString() || contestant.eventId === eventId)
        )
        .map(contestant => ({
          ...contestant,
          scores: contestant.scores || {},
          totalWeightedScore: calculateWeightedScore(contestant.scores || {})
        }));
      
      console.log('Filtered contestants:', contestantsList);
      const rankedContestants = updateRankings(contestantsList);
      setContestants(rankedContestants);
    } catch (error) {
      console.error('Error loading contestants:', error);
      setContestants([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name.startsWith('score_')) {
      const criterionName = name.replace('score_', '');
      setFormData(prev => ({
        ...prev,
        scores: {
          ...prev.scores,
          [criterionName]: parseFloat(value) || 0
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleAddScores = () => {
    const totalScore = calculateWeightedScore(formData.scores);
    const newContestant = contestants.find(c => c.id.toString() === formData.contestantId);
    
    if (newContestant) {
      const updatedContestants = contestants.map(contestant => 
        contestant.id.toString() === formData.contestantId
          ? { 
              ...contestant, 
              scores: formData.scores,
              totalWeightedScore: totalScore
            }
          : contestant
      );
      
      const rankedContestants = updateRankings(updatedContestants);
      setContestants(rankedContestants);
      setShowAddModal(false);
      resetForm();
      
      // Reload contestants from Firestore to ensure sync
      loadContestants();
    }
  };

  const handleEditScores = () => {
    const totalScore = calculateWeightedScore(formData.scores);
    const updatedContestants = contestants.map(contestant => 
      contestant.id === editingContestant.id
        ? { 
            ...contestant, 
            scores: formData.scores,
            totalWeightedScore: totalScore
          }
        : contestant
    );
    
    const rankedContestants = updateRankings(updatedContestants);
    setContestants(rankedContestants);
    setShowEditModal(false);
    setEditingContestant(null);
    resetForm();
    
    // Reload contestants from Firestore to ensure sync
    loadContestants();
  };

  const openEditModal = (contestant) => {
    setEditingContestant(contestant);
    setFormData({
      contestantId: contestant.id,
      contestantNumber: contestant.contestantNumber,
      contestantName: `${contestant.firstName} ${contestant.lastName}`,
      scores: contestant.scores || {}
    });
    setShowEditModal(true);
  };

  const handleDeleteContestant = async (contestantId) => {
    if (!confirm('Are you sure you want to delete this contestant and all their scores?')) return;

    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'contestants', contestantId));
      
      console.log('Contestant deleted successfully:', contestantId);
      
      // Update local state
      setContestants(contestants.filter(contestant => contestant.id !== contestantId));
      
    } catch (error) {
      console.error('Error deleting contestant:', error);
    }
  };

  const resetForm = () => {
    const initialScores = {};
    if (event && event.criteria) {
      event.criteria.forEach(criterion => {
        initialScores[criterion.name] = 0;
      });
    }
    
    setFormData({
      contestantId: '',
      contestantNumber: '',
      contestantName: '',
      scores: initialScores
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

  const getCriterionColor = (index) => {
    const colors = ['bg-purple-100 text-purple-800', 'bg-pink-100 text-pink-800', 'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800'];
    return colors[index % colors.length];
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.push(`/admin/events/${eventId}/contestants`)}
            className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
          >
            <span>←</span>
            Back to Contestants
          </button>
        </div>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">🏆 Event Scoring</h1>
            <p className="text-gray-600">
              Manage scores for <span className="font-semibold text-purple-600">{event?.eventName}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {scoresLocked && (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                <span>🔒</span>
                Scores Locked
              </span>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              disabled={scoresLocked}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors shadow-lg ${
                scoresLocked 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              <span className="text-xl">➕</span>
              Add Scores
            </button>
          </div>
        </div>
      </div>

      {/* Event Info Card */}
      {event && (
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl p-6 mb-8 text-white">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-purple-100 text-sm">Date</p>
              <p className="font-semibold">{event.date}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Time</p>
              <p className="font-semibold">{event.time}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Venue</p>
              <p className="font-semibold">{event.venue}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Total Contestants</p>
              <p className="font-semibold">{contestants.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Criteria Info */}
      {event && event.criteria && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">📌 Judging Criteria:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {event.criteria.filter(c => c.enabled).map((criterion, index) => (
              <div key={index} className="text-sm text-blue-800">
                <span className="font-medium">{criterion.name}:</span> {criterion.weight}%
              </div>
            ))}
          </div>
          <p className="text-sm text-blue-700 mt-2">
            Total Weight: {event.criteria.filter(c => c.enabled).reduce((sum, c) => sum + c.weight, 0)}%
          </p>
        </div>
      )}

      {/* Scoreboard Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
          <h2 className="text-xl font-bold">📊 Event Scoreboard</h2>
          <p className="text-purple-100 text-sm">Weighted scores based on event criteria</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                {event && event.criteria.filter(c => c.enabled).map((criterion, index) => (
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
              {contestants.map((contestant) => (
                <tr key={contestant.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getRankColor(contestant.rank)}`}>
                      {contestant.rank}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">#{contestant.contestantNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {contestant.firstName} {contestant.lastName}
                  </td>
                  {event && event.criteria.filter(c => c.enabled).map((criterion, index) => (
                    <td key={index} className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center px-3 py-1 text-sm font-medium rounded-full ${getCriterionColor(index)}`}>
                        {(contestant.scores[criterion.name] || 0).toFixed(1)}
                      </span>
                    </td>
                  ))}
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-bold bg-green-100 text-green-800 rounded-full">
                      {contestant.totalWeightedScore.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(contestant.status)}`}>
                      {contestant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(contestant)}
                        disabled={scoresLocked}
                        className={`p-2 rounded-lg transition-all duration-200 group ${
                          scoresLocked 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                        title="Edit Scores"
                      >
                        <span className="group-hover:scale-110 transition-transform">✏️</span>
                      </button>
                      <button
                        onClick={() => handleDeleteContestant(contestant.id)}
                        disabled={scoresLocked}
                        className={`p-2 rounded-lg transition-all duration-200 group ${
                          scoresLocked 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                        }`}
                        title="Delete Contestant"
                      >
                        <span className="group-hover:scale-110 transition-transform">🗑️</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {contestants.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🏆</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contestants yet</h3>
          <p className="text-gray-500 mb-4">Add contestants first before managing scores</p>
          <button
            onClick={() => router.push(`/admin/events/${eventId}/contestants`)}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Manage Contestants
          </button>
        </div>
      )}

      {/* Add Scores Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Add Contestant Scores</h3>
              <p className="text-purple-100 text-sm mt-1">Enter scores for {event?.eventName}</p>
            </div>
            <div className="p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleAddScores(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Contestant <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="contestantId"
                    value={formData.contestantId}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                    required
                  >
                    <option value="">Choose a contestant...</option>
                    {contestants.map(contestant => (
                      <option key={contestant.id} value={contestant.id}>
                        #{contestant.contestantNumber} - {contestant.firstName} {contestant.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                {event && event.criteria.filter(c => c.enabled).map((criterion, index) => (
                  <div key={index}>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {criterion.name} Score ({criterion.weight}%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      name={`score_${criterion.name}`}
                      value={formData.scores[criterion.name] || 0}
                      onChange={handleInputChange}
                      min="0"
                      max="50"
                      step="0.1"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      required
                    />
                  </div>
                ))}

                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="text-sm text-gray-600">
                    {event && event.criteria.filter(c => c.enabled).map((criterion, index) => (
                      <div key={index}>
                        {criterion.name} ({criterion.weight}%): {((formData.scores[criterion.name] || 0) * criterion.weight / 100).toFixed(1)}
                      </div>
                    ))}
                    <div className="font-semibold text-gray-900 pt-2 border-t">
                      Total Weighted Score: {calculateWeightedScore(formData.scores).toFixed(1)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>💾</span>
                      Save Scores
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-200 transition-all duration-200 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Scores Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Edit Contestant Scores</h3>
              <p className="text-purple-100 text-sm mt-1">Update scores for {formData.contestantName}</p>
            </div>
            <div className="p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleEditScores(); }} className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="text-sm text-gray-700">
                    <div className="font-semibold mb-2">Contestant: {formData.contestantName}</div>
                    <div>Number: #{formData.contestantNumber}</div>
                  </div>
                </div>

                {event && event.criteria.filter(c => c.enabled).map((criterion, index) => (
                  <div key={index}>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {criterion.name} Score ({criterion.weight}%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      name={`score_${criterion.name}`}
                      value={formData.scores[criterion.name] || 0}
                      onChange={handleInputChange}
                      min="0"
                      max="50"
                      step="0.1"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      required
                    />
                  </div>
                ))}

                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="text-sm text-gray-600">
                    {event && event.criteria.filter(c => c.enabled).map((criterion, index) => (
                      <div key={index}>
                        {criterion.name} ({criterion.weight}%): {((formData.scores[criterion.name] || 0) * criterion.weight / 100).toFixed(1)}
                      </div>
                    ))}
                    <div className="font-semibold text-gray-900 pt-2 border-t">
                      Total Weighted Score: {calculateWeightedScore(formData.scores).toFixed(1)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>💾</span>
                      Update Scores
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingContestant(null); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-200 transition-all duration-200 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
