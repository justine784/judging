# Firestore Collections Documentation

## 📊 Scores Collection

The `scores` collection stores individual judge scores for contestants. This collection allows multiple judges to score contestants independently while maintaining score privacy.

### Document Structure

Each document in the `scores` collection has the following structure:

```javascript
{
  contestantId: "contestant-unique-id",           // ID of the contestant
  contestantName: "Maria Santos",                  // Contestant's full name
  contestantNo: "001",                             // Contestant number
  eventId: "event-unique-id",                      // ID of the event
  eventName: "Grand Vocal Showdown 2026",           // Event name
  judgeId: "judge-unique-id",                      // Firebase Auth UID of the judge
  judgeName: "Judge Smith",                         // Judge's display name
  judgeEmail: "judge@example.com",                 // Judge's email
  scores: {                                        // Individual criteria scores
    "vocal_quality": 85.0,
    "stage_presence": 90.0,
    "song_interpretation": 80.0,
    "audience_impact": 75.0
  },
  criteria: [                                      // Event criteria configuration
    {
      name: "Vocal Quality",
      weight: 40,
      enabled: true
    },
    {
      name: "Stage Presence", 
      weight: 30,
      enabled: true
    }
  ],
  totalScore: 85.0,                               // Weighted total score
  timestamp: "2026-02-20T13:57:00.000Z",         // ISO timestamp
  createdAt: serverTimestamp()                     // Firestore server timestamp
}
```

### Document ID Convention

Document IDs use the format: `{judgeId}_{contestantId}_{timestamp}`

Example: `abc123xyz_contestant456_1708434220000`

### Key Features

1. **Judge Privacy**: Each judge's scores are stored separately
2. **Event Context**: Scores are linked to specific events
3. **Criteria Flexibility**: Supports dynamic event criteria
4. **Temporal Tracking**: Timestamps for scoring history
5. **Weighted Calculations**: Automatic total score calculation

### Common Queries

#### Get all scores for a specific judge:
```javascript
const scoresQuery = query(
  collection(db, 'scores'),
  where('judgeId', '==', judgeId),
  orderBy('timestamp', 'desc')
);
```

#### Get all scores for a specific contestant:
```javascript
const scoresQuery = query(
  collection(db, 'scores'),
  where('contestantId', '==', contestantId),
  orderBy('timestamp', 'desc')
);
```

#### Get all scores for an event:
```javascript
const scoresQuery = query(
  collection(db, 'scores'),
  where('eventId', '==', eventId),
  orderBy('timestamp', 'desc')
);
```

### Security Rules

The collection should have security rules that:
- Allow judges to read/write their own scores
- Allow admins to read all scores
- Prevent judges from accessing other judges' scores
- Prevent contestants from accessing scores

### Indexes

The following indexes are configured for optimal performance:

1. **Judge + Contestant + Event + Timestamp**: For comprehensive judge scoring history
2. **Judge + Timestamp**: For judge-specific score retrieval
3. **Event + Status**: For event-based queries
4. **Event + Contestant + Status**: For contestant-based queries

## 📋 Other Collections

### Events Collection
Stores event information, criteria, and configuration.

### Contestants Collection  
Stores contestant registration information and basic details.

### Judges Collection
Stores judge accounts, assignments, and administrative information.

## 🚀 Deployment Instructions

1. Deploy the updated indexes:
   ```bash
   firebase deploy --only firestore:indexes
   ```

2. Verify the scores collection is working:
   - Use the test script: `node test-scores-collection.js`
   - Check Firebase Console → Firestore → Data

3. Update security rules if needed in `firestore.rules`

## 🔍 Testing

The system includes automatic score saving when judges click "Save Scores". Test by:

1. Logging in as a judge
2. Selecting an event and contestant
3. Adjusting score sliders
4. Clicking "Save Scores"
5. Verifying the score appears in Firestore Console

## 📈 Score Aggregation

Scores are aggregated in the scoreboard by:
1. Fetching all scores for an event
2. Grouping by contestant
3. Calculating average scores across judges
4. Applying criteria weights
5. Ranking contestants by total weighted score
