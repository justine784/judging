// Script to check Firestore data counts
// Run this with: node check-firestore-data.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9-7W1EtFevUqrBcVruR3oHgXEc4K4KcQ",
  authDomain: "judging-2a4da.firebaseapp.com",
  projectId: "judging-2a4da",
  storageBucket: "judging-2a4da.firebasestorage.app",
  messagingSenderId: "954134091247",
  appId: "1:954134091247:web:df9aea8c36ea8c64d2d21a",
  measurementId: "G-PKDBVPZQQV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkFirestoreData() {
  try {
    console.log('🔍 Checking Firestore data...\n');

    // Check Events
    const eventsSnapshot = await getDocs(collection(db, 'events'));
    console.log(`📅 Events: ${eventsSnapshot.size} total`);
    
    let ongoingEvents = 0;
    let upcomingEvents = 0;
    let finishedEvents = 0;
    
    eventsSnapshot.forEach(doc => {
      const eventData = doc.data();
      switch(eventData.status) {
        case 'ongoing': ongoingEvents++; break;
        case 'upcoming': upcomingEvents++; break;
        case 'finished': finishedEvents++; break;
      }
    });
    
    console.log(`   - Ongoing: ${ongoingEvents}`);
    console.log(`   - Upcoming: ${upcomingEvents}`);
    console.log(`   - Finished: ${finishedEvents}\n`);

    // Check Contestants
    const contestantsSnapshot = await getDocs(collection(db, 'contestants'));
    console.log(`👥 Contestants: ${contestantsSnapshot.size} total`);
    
    // Group contestants by event
    const contestantsByEvent = {};
    contestantsSnapshot.forEach(doc => {
      const contestant = doc.data();
      const eventId = contestant.eventId || 'unknown';
      if (!contestantsByEvent[eventId]) {
        contestantsByEvent[eventId] = [];
      }
      contestantsByEvent[eventId].push(contestant);
    });
    
    Object.keys(contestantsByEvent).forEach(eventId => {
      console.log(`   - Event ${eventId}: ${contestantsByEvent[eventId].length} contestants`);
    });
    console.log('');

    // Check Judges
    const judgesSnapshot = await getDocs(collection(db, 'judges'));
    console.log(`🧑‍⚖️ Judges: ${judgesSnapshot.size} total`);
    
    judgesSnapshot.forEach(doc => {
      const judge = doc.data();
      console.log(`   - ${judge.name || judge.email} (${judge.status || 'Unknown status'})`);
    });
    console.log('');

    // Check Scores/Scoring Progress
    let scoredContestants = 0;
    let totalPossibleScores = 0;
    let actualScores = 0;
    
    contestantsSnapshot.forEach(doc => {
      const contestant = doc.data();
      let hasScore = false;
      
      // Check for any score fields
      Object.keys(contestant).forEach(key => {
        if (key.includes('score') || key === 'totalWeightedScore') {
          if (contestant[key] > 0) {
            hasScore = true;
            actualScores++;
          }
          totalPossibleScores++;
        }
      });
      
      if (hasScore) scoredContestants++;
    });
    
    console.log(`📊 Scoring Progress:`);
    console.log(`   - Contestants with scores: ${scoredContestants}/${contestantsSnapshot.size}`);
    console.log(`   - Total score entries: ${actualScores}/${totalPossibleScores}`);
    
    const progressPercentage = contestantsSnapshot.size > 0 
      ? Math.round((scoredContestants / contestantsSnapshot.size) * 100)
      : 0;
    console.log(`   - Overall progress: ${progressPercentage}%\n`);

    // Show sample data if no real data
    if (eventsSnapshot.size === 0 && contestantsSnapshot.size === 0) {
      console.log('📝 No data found in Firestore. The system is using sample data.');
      console.log('Sample data includes:');
      console.log('   - 3 sample events');
      console.log('   - 2 sample contestants per event');
      console.log('   - 0 judges (need to be created)');
      console.log('   - 0 scores (need to be entered by judges)');
    }

  } catch (error) {
    console.error('❌ Error checking Firestore:', error);
  }
}

// Run the check
checkFirestoreData();
