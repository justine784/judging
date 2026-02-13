'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';

export default function LiveScoreboard() {
  const [contestants, setContestants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contestInfo, setContestInfo] = useState(null);

  useEffect(() => {
    // Fetch contest info
    const unsubscribeContest = onSnapshot(doc(db, 'contest', 'info'), (doc) => {
      if (doc.exists()) {
        setContestInfo(doc.data());
      }
    });

    // Fetch contestants with scores
    const contestantsQuery = query(
      collection(db, 'contestants'),
      orderBy('totalWeightedScore', 'desc')
    );

    const unsubscribeContestants = onSnapshot(contestantsQuery, (snapshot) => {
      const contestantsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Map field names to what the scoreboard expects
          name: data.contestantName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown Contestant',
          number: data.contestantNumber || data.contestantNo || '',
          // Map scoring fields - use the same field names as judge scoring
          vocalQuality: data.vocal_quality || data.talent || 0,
          stagePresence: data.stage_presence || data.beauty || 0,
          songInterpretation: data.song_interpretation || data.qa || 0,
          audienceImpact: data.audience_impact || data.audienceImpact || 0,
          totalScore: data.totalWeightedScore || 0
        };
      });
      setContestants(contestantsData);
      setLoading(false);
    });

    return () => {
      unsubscribeContest();
      unsubscribeContestants();
    };
  }, []);

  const getRankIcon = (rank) => {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading live scores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => window.location.href = '/'}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Home
              </button>
              <h1 className="text-2xl font-bold text-gray-900">🏆 Live Scoreboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contest Info */}
      {contestInfo && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{contestInfo.title}</h2>
                <p className="text-gray-600">{contestInfo.date} • {contestInfo.venue}</p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-gray-500">Contestants</p>
                  <p className="font-bold text-gray-900">{contestants.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Prize Pool</p>
                  <p className="font-bold text-gray-900">{contestInfo.prizePool}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scoreboard */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {contestants.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">�</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No contestants yet</h3>
              <p className="text-gray-600">Contestants will appear here once they are registered by the administrator.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contestant</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vocal Quality</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage Presence</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Song Interpretation</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Audience Impact</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {contestants.map((contestant, index) => (
                    <tr key={contestant.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{getRankIcon(index + 1)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <span className="text-purple-600 font-bold">
                              {contestant.name ? contestant.name.charAt(0).toUpperCase() : 'C'}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{contestant.name || 'Contestant ' + (index + 1)}</div>
                            <div className="text-sm text-gray-500">#{contestant.number || index + 1}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(contestant.vocalQuality || 0)}`}>
                          {contestant.vocalQuality === 0 ? 'Not Scored' : `${contestant.vocalQuality}%`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(contestant.stagePresence || 0)}`}>
                          {contestant.stagePresence === 0 ? 'Not Scored' : `${contestant.stagePresence}%`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(contestant.songInterpretation || 0)}`}>
                          {contestant.songInterpretation === 0 ? 'Not Scored' : `${contestant.songInterpretation}%`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(contestant.audienceImpact || 0)}`}>
                          {contestant.audienceImpact === 0 ? 'Not Scored' : `${contestant.audienceImpact}%`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-purple-600">
                            {contestant.totalScore === 0 ? '—' : contestant.totalScore.toFixed(1)}
                          </span>
                          {contestant.totalScore > 0 && <span className="text-sm text-gray-500">/100</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
