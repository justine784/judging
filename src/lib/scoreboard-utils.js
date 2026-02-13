import { db } from './firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

// Sample contestants data for testing
export const initializeSampleContestants = async () => {
  try {
    const contestants = [
      {
        name: "Sarah Johnson",
        number: 1,
        vocalQuality: 92,
        stagePresence: 88,
        songInterpretation: 85,
        audienceImpact: 90,
        totalScore: 89,
        createdAt: new Date().toISOString()
      },
      {
        name: "Michael Chen",
        number: 2,
        vocalQuality: 85,
        stagePresence: 92,
        songInterpretation: 88,
        audienceImpact: 86,
        totalScore: 87.8,
        createdAt: new Date().toISOString()
      },
      {
        name: "Emily Rodriguez",
        number: 3,
        vocalQuality: 90,
        stagePresence: 85,
        songInterpretation: 92,
        audienceImpact: 88,
        totalScore: 88.8,
        createdAt: new Date().toISOString()
      },
      {
        name: "David Kim",
        number: 4,
        vocalQuality: 78,
        stagePresence: 82,
        songInterpretation: 80,
        audienceImpact: 85,
        totalScore: 81.2,
        createdAt: new Date().toISOString()
      },
      {
        name: "Lisa Thompson",
        number: 5,
        vocalQuality: 95,
        stagePresence: 90,
        songInterpretation: 88,
        audienceImpact: 92,
        totalScore: 91.2,
        createdAt: new Date().toISOString()
      }
    ];

    // Add each contestant to Firestore
    for (const contestant of contestants) {
      await setDoc(doc(db, 'contestants', `contestant_${contestant.number}`), contestant);
    }

    console.log('Sample contestants initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing sample contestants:', error);
    return false;
  }
};

// Calculate total score based on criteria weights
export const calculateTotalScore = (scores, criteria) => {
  if (!criteria || !scores) return 0;
  
  let totalScore = 0;
  criteria.forEach(criterion => {
    const score = scores[criterion.name.toLowerCase().replace(' ', '')] || 0;
    totalScore += (score * criterion.percentage) / 100;
  });
  
  return Math.round(totalScore * 10) / 10; // Round to 1 decimal place
};

// Update contestant scores
export const updateContestantScores = async (contestantId, scores, criteria) => {
  try {
    const totalScore = calculateTotalScore(scores, criteria);
    
    await setDoc(doc(db, 'contestants', contestantId), {
      ...scores,
      totalScore,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    console.log('Contestant scores updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating contestant scores:', error);
    return false;
  }
};
