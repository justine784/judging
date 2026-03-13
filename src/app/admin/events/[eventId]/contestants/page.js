'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, setDoc, getDocs, collection, deleteDoc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export default function EventContestants() {
  const [contestants, setContestants] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContestant, setEditingContestant] = useState(null);
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [currentRound, setCurrentRound] = useState('preliminary');
  const [event, setEvent] = useState(null);
  const [showActionsDropdown, setShowActionsDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [dropdownButtonRef, setDropdownButtonRef] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [scores, setScores] = useState([]); // Store scores for all contestants
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId;

  // Form state
  const [formData, setFormData] = useState({
    contestantNumber: '',
    firstName: '',
    lastName: '',
    age: '',
    address: '',
    contactNumber: '',
    contestantType: 'solo', // 'solo' or 'group'
    groupName: '',
    photo: '' // Store image URL
  });
  const [imagePreview, setImagePreview] = useState('');

  // Function to get next available contestant number
  const getNextContestantNumber = () => {
    if (contestants.length === 0) return '1';
    
    // Get all existing contestant numbers and convert to numbers
    const existingNumbers = contestants
      .map(c => parseInt(c.contestantNumber))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
    
    // Find the next available number
    let nextNumber = 1;
    for (const num of existingNumbers) {
      if (num === nextNumber) {
        nextNumber++;
      } else if (num > nextNumber) {
        break;
      }
    }
    
    return nextNumber.toString();
  };

  // Function to check if contestant number already exists
  const isContestantNumberTaken = (number, excludeId = null) => {
    return contestants.some(contestant => 
      contestant.contestantNumber === number && 
      contestant.eventId === eventId &&
      contestant.id !== excludeId
    );
  };

  // Function to determine if dropdown should appear above
  const isDropdownAbove = () => {
    if (!dropdownButtonRef) return false;
    const rect = dropdownButtonRef.getBoundingClientRect();
    const dropdownHeight = 200;
    return rect.bottom + dropdownHeight + 4 > window.innerHeight;
  };

  // Load event and contestants data with real-time listeners
  useEffect(() => {
    if (!eventId) return;
    
    // Check if user is authenticated and is admin
    if (!auth.currentUser || auth.currentUser.email !== 'admin@gmail.com') {
      console.error('User not authenticated or not admin for event contestants');
      return;
    }

    // Real-time listener for event
    const eventUnsubscribe = onSnapshot(doc(db, 'events', eventId), (eventDoc) => {
      if (eventDoc.exists()) {
        const eventData = {
          id: eventId,
          ...eventDoc.data()
        };
        setEvent(eventData);
        setCurrentRound(eventData.currentRound || 'preliminary');
        console.log('📅 Event loaded/updated:', eventData.eventName);
      }
    });

    // Real-time listener for contestants
    const contestantsCollection = collection(db, 'contestants');
    const contestantsUnsubscribe = onSnapshot(contestantsCollection, (snapshot) => {
      const contestantsList = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(contestant => 
          contestant.eventId && (contestant.eventId.toString() === eventId.toString() || contestant.eventId === eventId)
        );
      
      console.log(`👥 Loaded ${contestantsList.length} contestants (real-time)`);
      setContestants(contestantsList);
    });

    return () => {
      eventUnsubscribe();
      contestantsUnsubscribe();
    };
  }, [eventId]);

  // Listen for scores in real-time
  useEffect(() => {
    if (!eventId) return;
    
    // Check if user is authenticated and is admin
    if (!auth.currentUser || auth.currentUser.email !== 'admin@gmail.com') {
      console.error('User not authenticated or not admin for scores');
      return;
    }
    
    const scoresCollection = collection(db, 'scores');
    const unsubscribe = onSnapshot(scoresCollection, (snapshot) => {
      const scoresData = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(score => score.eventId === eventId);
      setScores(scoresData);
      
      // Show update notification when scores change
      if (snapshot.docChanges().length > 0 && scoresData.length > 0) {
        console.log(`📊 Scores updated: ${scoresData.length} score entries (real-time)`);
      }
      console.log(`📊 Loaded ${scoresData.length} scores for event ${eventId}`);
    });

    return () => unsubscribe();
  }, [eventId]);

  // Calculate aggregated score for a contestant
  const calculateAggregatedScore = (contestantId) => {
    const contestantScores = scores.filter(score => 
      score.contestantId === contestantId && score.eventId === eventId
    );
    
    if (contestantScores.length === 0) {
      return { totalScore: 0, judgeCount: 0 };
    }
    
    // Count unique judges
    const uniqueJudges = [...new Set(contestantScores.map(score => score.judgeId))];
    
    // Get the latest score from each judge and use their pre-calculated totalScore
    const latestScoresByJudge = {};
    contestantScores.forEach(score => {
      if (!latestScoresByJudge[score.judgeId] || 
          new Date(score.timestamp) > new Date(latestScoresByJudge[score.judgeId].timestamp)) {
        latestScoresByJudge[score.judgeId] = score;
      }
    });
    
    // Calculate average of all judges' totalScores
    const judgeScores = Object.values(latestScoresByJudge);
    const totalScoreSum = judgeScores.reduce((sum, score) => {
      // Use the pre-calculated totalScore from judge dashboard
      return sum + (score.totalScore || 0);
    }, 0);
    
    const averageTotalScore = judgeScores.length > 0 ? totalScoreSum / judgeScores.length : 0;
    
    return {
      totalScore: parseFloat(averageTotalScore.toFixed(2)),
      judgeCount: uniqueJudges.length
    };
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showActionsDropdown && !event.target.closest('.dropdown-menu')) {
        setShowActionsDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showActionsDropdown]);

  // Update dropdown position on scroll
  useEffect(() => {
    if (showActionsDropdown && dropdownButtonRef) {
      const updatePosition = () => {
        const rect = dropdownButtonRef.getBoundingClientRect();
        const dropdownHeight = 200; // Estimated dropdown height in pixels
        const dropdownWidth = 192; // w-48 = 12rem = 192px
        
        // Calculate horizontal position
        const leftPosition = rect.right - dropdownWidth;
        const finalLeft = Math.max(8, Math.min(leftPosition, window.innerWidth - dropdownWidth - 8));
        
        // Calculate vertical position
        let topPosition = rect.bottom + 4;
        
        // Check if dropdown would go below viewport
        if (topPosition + dropdownHeight > window.innerHeight) {
          // Position dropdown above the button instead
          topPosition = rect.top - dropdownHeight - 4;
          
          // Ensure it doesn't go above viewport
          if (topPosition < 8) {
            // If still too high, position at top of viewport
            topPosition = 8;
          }
        }
        
        setDropdownPosition({
          top: topPosition,
          left: finalLeft
        });
      };

      updatePosition();
      window.addEventListener('scroll', updatePosition, { passive: true });
      window.addEventListener('resize', updatePosition, { passive: true });
      
      return () => {
        window.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showActionsDropdown, dropdownButtonRef]);

  const loadEvent = async () => {
    try {
      // Load actual event from Firestore
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      if (eventDoc.exists()) {
        const eventData = {
          id: eventId,
          ...eventDoc.data()
        };
        setEvent(eventData);
        // Set current round from event data or default to preliminary
        setCurrentRound(eventData.currentRound || 'preliminary');
      } else {
        // Fallback to sample data if event not found
        const sampleEvent = {
          id: eventId,
          eventName: eventId === '1' ? 'Grand Vocal Showdown 2026' : eventId === '2' ? 'Battle of the Bands' : 'Acoustic Night 2025',
          eventDescription: 'Annual singing competition featuring the best vocal talents',
          date: '2026-03-15',
          time: '6:00 PM',
          venue: 'University Auditorium',
          status: 'upcoming'
        };
        setEvent(sampleEvent);
      }
    } catch (error) {
      console.error('Error loading event:', error);
      // Fallback to sample data
      const sampleEvent = {
        id: eventId,
        eventName: eventId === '1' ? 'Grand Vocal Showdown 2026' : eventId === '2' ? 'Battle of the Bands' : 'Acoustic Night 2025',
        eventDescription: 'Annual singing competition featuring the best vocal talents',
        date: '2026-03-15',
        time: '6:00 PM',
        venue: 'University Auditorium',
        status: 'upcoming'
      };
      setEvent(sampleEvent);
    }
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
        );
      
      console.log('Filtered contestants:', contestantsList);
      setContestants(contestantsList);
    } catch (error) {
      console.error('Error loading contestants:', error);
      // Load sample data as fallback
      const sampleContestants = [
        {
          id: 'sample-1',
          contestantNumber: '001',
          firstName: 'Maria',
          lastName: 'Santos',
          age: '22',
          address: 'Bongabong, Oriental Mindoro',
          contactNumber: '0912-345-6789',
          eventId: eventId,
          status: 'registered'
        },
        {
          id: 'sample-2',
          contestantNumber: '002',
          firstName: 'Juan',
          lastName: 'Dela Cruz',
          age: '24',
          address: 'Bongabong, Oriental Mindoro',
          contactNumber: '0913-456-7890',
          eventId: eventId,
          status: 'registered'
        }
      ];
      setContestants(sampleContestants);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Special validation for contact number
    if (name === 'contactNumber') {
      // Only allow digits and limit to 11 characters
      const digitsOnly = value.replace(/\D/g, '').slice(0, 11);
      setFormData(prev => ({
        ...prev,
        [name]: digitsOnly
      }));
      return;
    }
    
    // Special validation for contestant number
    if (name === 'contestantNumber') {
      // Clear previous error
      setFormErrors(prev => ({ ...prev, contestantNumber: '' }));
      
      // Check if number is already taken (only if not empty and not in edit mode for the same contestant)
      if (value.trim() && isContestantNumberTaken(value.trim(), editingContestant?.id)) {
        setFormErrors(prev => ({ 
          ...prev, 
          contestantNumber: 'This contestant number is already taken. Please choose a different number.' 
        }));
      }
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (limit to 20MB)
      if (file.size > 20 * 1024 * 1024) {
        alert('Image size should be less than 20MB');
        return;
      }
      
      // Check file type
      if (!file.type.match('image.*')) {
        alert('Please select an image file');
        return;
      }
      
      // Compress image if needed
      compressImage(file, (compressedDataUrl) => {
        // No strict size limit after compression - just compress to reasonable quality
        setImagePreview(compressedDataUrl);
        setFormData(prev => ({
          ...prev,
          photo: compressedDataUrl
        }));
      });
    }
  };

  // Function to compress images
  const compressImage = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate new dimensions (max 600px width/height for smaller file size)
        let { width, height } = img;
        const maxSize = 600;
        
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Try different quality levels to maintain quality while compressing
        let quality = 0.85;
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (quality <= 0.3) {
              // Use this result if quality is too low
              const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
              callback(compressedDataUrl);
            } else {
              // Check if size is reasonable, otherwise reduce quality
              if (blob.size > 8 * 1024 * 1024) { // If over 8MB, reduce quality
                quality -= 0.1;
                tryCompress();
              } else {
                // Size is acceptable, use this result
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                callback(compressedDataUrl);
              }
            }
          }, 'image/jpeg', quality);
        };
        
        tryCompress();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview('');
    setFormData(prev => ({
      ...prev,
      photo: ''
    }));
  };

  const handleAddContestant = async () => {
    // Clear any existing errors
    setFormErrors({});
    
    // Validate contestant number is not empty
    if (!formData.contestantNumber || formData.contestantNumber.trim() === '') {
      setFormErrors({ contestantNumber: 'Contestant number is required' });
      alert('⚠️ Please enter a contestant number');
      return;
    }
    
    // Check for duplicate contestant number
    const existingContestant = contestants.find(
      c => c.contestantNumber === formData.contestantNumber.trim()
    );
    
    if (existingContestant) {
      setFormErrors({ contestantNumber: 'This contestant number already exists' });
      const existingName = existingContestant.displayName || 
        (existingContestant.contestantType === 'group' 
          ? existingContestant.groupName 
          : `${existingContestant.firstName} ${existingContestant.lastName}`);
      alert(`⚠️ Contestant Number Already Exists!\n\nContestant #${formData.contestantNumber} is already assigned to "${existingName}".\n\nPlease use a different contestant number.`);
      return;
    }
    
    // Get event details to include eventName
    const eventDetails = await getDoc(doc(db, 'events', eventId));
    const eventName = eventDetails.exists() ? eventDetails.data().eventName : 'Unknown Event';
    
    // Prepare contestant data based on type
    const contestantData = {
      eventId: eventId,
      eventName: eventName,
      contestantNumber: formData.contestantNumber,
      address: formData.address,
      contestantType: formData.contestantType,
      status: 'registered'
    };

    // Add age only for solo contestants
    if (formData.contestantType === 'solo') {
      contestantData.age = formData.age;
      contestantData.contactNumber = formData.contactNumber;
    }

    // Add type-specific data
    if (formData.contestantType === 'solo') {
      contestantData.firstName = formData.firstName;
      contestantData.lastName = formData.lastName;
      contestantData.displayName = `${formData.firstName} ${formData.lastName}`;
    } else {
      contestantData.groupName = formData.groupName;
      contestantData.displayName = formData.groupName;
    }

    // Add photo if uploaded
    if (formData.photo) {
      // Final validation of photo size before saving to Firestore
      const base64Data = formData.photo.split(',')[1] || formData.photo;
      const photoSize = Math.round((base64Data.length * 3) / 4); // More accurate base64 size calculation
      if (photoSize > 800 * 1024) { // 800KB limit to be safe
        alert('Photo is too large to save. Please choose a smaller image (under 300KB).');
        return;
      }
      contestantData.photo = formData.photo;
    }

    try {
      // Save to Firestore
      const contestantRef = doc(collection(db, 'contestants'));
      await setDoc(contestantRef, contestantData);
      
      console.log('Contestant added successfully:', contestantData);
      
      // Update local state with document ID
      setContestants([...contestants, { ...contestantData, id: contestantRef.id }]);
      setShowAddModal(false);
      resetForm();
      
      // Show success message
      const contestantName = formData.contestantType === 'solo' 
        ? `${formData.firstName} ${formData.lastName}`
        : formData.groupName;
      alert(`Contestant "${contestantName}" has been added successfully!`);
      
    } catch (error) {
      console.error('Error adding contestant:', error);
    }
  };

  const handleEditContestant = async () => {
    if (!editingContestant) return;

    // Clear any existing errors
    setFormErrors({});
    
    // Validate contestant number is not empty
    if (!formData.contestantNumber || formData.contestantNumber.trim() === '') {
      setFormErrors({ contestantNumber: 'Contestant number is required' });
      alert('⚠️ Please enter a contestant number');
      return;
    }
    
    // Check for duplicate contestant number (exclude the current contestant being edited)
    const existingContestant = contestants.find(
      c => c.contestantNumber === formData.contestantNumber.trim() && c.id !== editingContestant.id
    );
    
    if (existingContestant) {
      setFormErrors({ contestantNumber: 'This contestant number already exists' });
      const existingName = existingContestant.displayName || 
        (existingContestant.contestantType === 'group' 
          ? existingContestant.groupName 
          : `${existingContestant.firstName} ${existingContestant.lastName}`);
      alert(`⚠️ Contestant Number Already Exists!\n\nContestant #${formData.contestantNumber} is already assigned to "${existingName}".\n\nPlease use a different contestant number.`);
      return;
    }

    try {
      // Prepare update data based on contestant type
      const updateData = {
        contestantNumber: formData.contestantNumber,
        address: formData.address
      };

      // Add solo-specific fields
      if (formData.contestantType === 'solo') {
        updateData.firstName = formData.firstName;
        updateData.lastName = formData.lastName;
        updateData.age = formData.age;
        updateData.contactNumber = formData.contactNumber;
      } else {
        updateData.groupName = formData.groupName;
      }

      // Add photo if uploaded
      if (formData.photo) {
        // Final validation of photo size before saving to Firestore
        const base64Data = formData.photo.split(',')[1] || formData.photo;
        const photoSize = Math.round((base64Data.length * 3) / 4); // More accurate base64 size calculation
        if (photoSize > 800 * 1024) { // 800KB limit to be safe
          alert('Photo is too large to save. Please choose a smaller image (under 300KB).');
          return;
        }
        updateData.photo = formData.photo;
      }

      // Update in Firestore
      const contestantRef = doc(db, 'contestants', editingContestant.id);
      await updateDoc(contestantRef, updateData);
      
      console.log('Contestant updated successfully:', editingContestant);
      
      // Update local state
      setContestants(contestants.map(contestant => 
        contestant.id === editingContestant.id 
          ? { ...contestant, ...formData }
          : contestant
      ));
      setShowEditModal(false);
      setEditingContestant(null);
      resetForm();
      
    } catch (error) {
      console.error('Error updating contestant:', error);
    }
  };

  const handleDeleteContestant = async (contestantId) => {
    if (!confirm('Are you sure you want to remove this contestant?')) return;

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

  const openEditModal = (contestant) => {
    setEditingContestant(contestant);
    setFormData({
      contestantNumber: contestant.contestantNumber,
      firstName: contestant.firstName || '',
      lastName: contestant.lastName || '',
      age: contestant.age || '',
      address: contestant.address,
      contactNumber: contestant.contactNumber || '',
      contestantType: contestant.contestantType || 'solo',
      groupName: contestant.groupName || '',
      photo: contestant.photo || ''
    });
    setImagePreview(contestant.photo || '');
    setFormErrors({});
    setShowEditModal(true);
  };

  const resetForm = () => {
    const nextNumber = getNextContestantNumber();
    setFormData({
      contestantNumber: nextNumber,
      firstName: '',
      lastName: '',
      age: '',
      address: '',
      contactNumber: '',
      contestantType: 'solo',
      groupName: '',
      photo: ''
    });
    setImagePreview('');
    setFormErrors({});
  };

  // Sort contestants by score (highest first) and assign ranks
  // Eliminated contestants go to the bottom
  const sortedContestants = [...contestants]
    .map(contestant => {
      const scoreData = calculateAggregatedScore(contestant.id);
      return {
        ...contestant,
        calculatedScore: scoreData.totalScore,
        judgeCount: scoreData.judgeCount
      };
    })
    .sort((a, b) => {
      // Eliminated contestants go to the bottom
      const aEliminated = a.status === 'eliminated' || a.eliminated;
      const bEliminated = b.status === 'eliminated' || b.eliminated;
      
      if (aEliminated && !bEliminated) return 1;
      if (!aEliminated && bEliminated) return -1;
      
      // Sort by score (highest first)
      if (b.calculatedScore !== a.calculatedScore) {
        return b.calculatedScore - a.calculatedScore;
      }
      
      // If same score, sort by contestant number
      const numA = a.contestantNumber.toString();
      const numB = b.contestantNumber.toString();
      return numA.localeCompare(numB);
    })
    .map((contestant, index, arr) => {
      // Assign rank only to non-eliminated contestants with scores
      const isEliminated = contestant.status === 'eliminated' || contestant.eliminated;
      let rank = null;
      
      if (!isEliminated && contestant.calculatedScore > 0) {
        // Count how many non-eliminated contestants before this one have higher or equal scores
        const nonEliminatedWithScores = arr.filter(c => 
          !(c.status === 'eliminated' || c.eliminated) && c.calculatedScore > 0
        );
        rank = nonEliminatedWithScores.findIndex(c => c.id === contestant.id) + 1;
      }
      
      return { ...contestant, rank };
    });

  const getStatusColor = (status) => {
    return status === 'registered' ? 'bg-green-100 text-green-800' : 
           status === 'eliminated' ? 'bg-red-100 text-red-800' :
           status === 'finalist' ? 'bg-blue-100 text-blue-800' :
           'bg-gray-100 text-gray-800';
  };

  const getRoundColor = (round) => {
    return round === 'preliminary' ? 'bg-blue-100 text-blue-800' :
           round === 'semi-final' ? 'bg-orange-100 text-orange-800' :
           round === 'final' ? 'bg-green-100 text-green-800' :
           'bg-gray-100 text-gray-800';
  };

  // Round management functions
  const handleAdvanceRound = async () => {
    try {
      let nextRound;
      if (currentRound === 'preliminary') {
        nextRound = 'semi-final';
        // Eliminate bottom contestants (keep top 10 for example)
        const sortedContestants = [...contestants].sort((a, b) => 
          (b.totalWeightedScore || 0) - (a.totalWeightedScore || 0)
        );
        const contestantsToKeep = sortedContestants.slice(0, 10);
        const contestantsToEliminate = sortedContestants.slice(10);
        
        // Update eliminated contestants
        for (const contestant of contestantsToEliminate) {
          await updateDoc(doc(db, 'contestants', contestant.id), {
            status: 'eliminated',
            eliminated: true,
            eliminatedRound: 'preliminary'
          });
        }
        
        // Update remaining contestants to semi-finalists
        for (const contestant of contestantsToKeep) {
          await updateDoc(doc(db, 'contestants', contestant.id), {
            status: 'finalist',
            eliminated: false
          });
        }
      } else if (currentRound === 'semi-final') {
        nextRound = 'final';
        // Eliminate bottom contestants (keep top 5 for final)
        const sortedContestants = [...contestants]
          .filter(c => c.status !== 'eliminated')
          .sort((a, b) => (b.totalWeightedScore || 0) - (a.totalWeightedScore || 0));
        const contestantsToKeep = sortedContestants.slice(0, 5);
        const contestantsToEliminate = sortedContestants.slice(5);
        
        // Update eliminated contestants
        for (const contestant of contestantsToEliminate) {
          await updateDoc(doc(db, 'contestants', contestant.id), {
            status: 'eliminated',
            eliminated: true,
            eliminatedRound: 'semi-final'
          });
        }
        
        // Update remaining contestants to finalists
        for (const contestant of contestantsToKeep) {
          await updateDoc(doc(db, 'contestants', contestant.id), {
            status: 'finalist',
            eliminated: false
          });
        }
      } else {
        // Final round - declare winner
        const sortedContestants = [...contestants]
          .filter(c => c.status !== 'eliminated')
          .sort((a, b) => (b.totalWeightedScore || 0) - (a.totalWeightedScore || 0));
        
        if (sortedContestants.length > 0) {
          const winner = sortedContestants[0];
          await updateDoc(doc(db, 'contestants', winner.id), {
            status: 'winner',
            finalRank: 1
          });
          
          // Update runners-up
          for (let i = 1; i < Math.min(sortedContestants.length, 3); i++) {
            await updateDoc(doc(db, 'contestants', sortedContestants[i].id), {
              status: 'runner-up',
              finalRank: i + 1
            });
          }
        }
        nextRound = 'completed';
      }
      
      // Update event round
      await updateDoc(doc(db, 'events', eventId), {
        currentRound: nextRound
      });
      
      setCurrentRound(nextRound);
      loadContestants(); // Reload contestants to show updated status
      setShowRoundModal(false);
      
      alert(`Successfully advanced to ${nextRound} round!`);
    } catch (error) {
      console.error('Error advancing round:', error);
      alert('Failed to advance round. Please try again.');
    }
  };

  const handleEliminateContestant = async (contestantId) => {
    if (!confirm('Are you sure you want to eliminate this contestant? This action cannot be undone.')) {
      return;
    }
    
    try {
      await updateDoc(doc(db, 'contestants', contestantId), {
        status: 'eliminated',
        eliminated: true,
        eliminatedRound: currentRound
      });
      
      loadContestants();
      alert('Contestant eliminated successfully!');
    } catch (error) {
      console.error('Error eliminating contestant:', error);
      alert('Failed to eliminate contestant. Please try again.');
    }
  };

  const openRoundModal = () => {
    setShowRoundModal(true);
  };

  const handleGoToFinalRounds = async () => {
    try {
      // Update all non-eliminated contestants to finalists
      const contestantsToUpdate = contestants.filter(c => c.status !== 'eliminated' && !c.eliminated);
      
      for (const contestant of contestantsToUpdate) {
        await updateDoc(doc(db, 'contestants', contestant.id), {
          status: 'finalist',
          eliminated: false
        });
      }
      
      // Update event to final round
      await updateDoc(doc(db, 'events', eventId), {
        currentRound: 'final'
      });
      
      setCurrentRound('final');
      loadContestants();
      alert('Successfully advanced to Final Rounds!');
    } catch (error) {
      console.error('Error going to final rounds:', error);
      alert('Failed to advance to final rounds. Please try again.');
    }
  };

  const toggleDropdown = (contestantId, event) => {
    if (showActionsDropdown === contestantId) {
      setShowActionsDropdown(null);
      setDropdownButtonRef(null);
    } else {
      setDropdownButtonRef(event.target);
      setShowActionsDropdown(contestantId);
    }
  };

  const closeDropdown = () => {
    setShowActionsDropdown(null);
    setDropdownButtonRef(null);
  };

  return (
    <div className="p-3 sm:p-4 md:p-6">
      {/* Page Header */}
      <div className="mb-4 sm:mb-6 md:mb-8">
        {/* Back Button */}
        <div className="mb-3 sm:mb-4">
          <button
            onClick={() => router.push('/admin/events')}
            className="inline-flex items-center gap-1.5 sm:gap-2 text-emerald-600 hover:text-emerald-700 font-medium transition-colors text-sm sm:text-base"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Events
          </button>
        </div>
        
        {/* Gradient Header Card */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl flex-shrink-0">
                <span className="text-2xl sm:text-4xl">👥</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-white truncate">Contestants Management</h1>
                <p className="text-emerald-100 text-xs sm:text-sm md:text-base mt-0.5 sm:mt-1 line-clamp-1">
                  Manage contestants for <span className="font-semibold text-white">{event?.eventName}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-row items-stretch gap-2 sm:gap-3">
              <button
                onClick={() => { setFormErrors({}); setShowAddModal(true); }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-white text-emerald-600 px-3 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl hover:bg-emerald-50 transition-all duration-200 shadow-lg font-semibold text-xs sm:text-sm md:text-base"
              >
                <span className="text-base sm:text-xl">➕</span>
                <span className="hidden xs:inline">Add Contestant</span><span className="xs:hidden">Add</span>
              </button>
              <button
                onClick={openRoundModal}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-orange-500 text-white px-3 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl hover:bg-orange-600 transition-all duration-200 shadow-lg font-semibold text-xs sm:text-sm md:text-base"
              >
                <span className="text-base sm:text-xl">🏆</span>
                <span className="hidden xs:inline">Manage Rounds</span><span className="xs:hidden">Rounds</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Event Info Card */}
      {event && (
        <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-green-600 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 md:mb-8 shadow-xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4">
              <p className="text-teal-100 text-[10px] sm:text-xs md:text-sm flex items-center gap-1 sm:gap-2">
                <span>📅</span> <span className="hidden sm:inline">Date</span>
              </p>
              <p className="text-xs sm:text-sm md:text-lg font-bold text-white mt-0.5 sm:mt-1">{event.date}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4">
              <p className="text-teal-100 text-[10px] sm:text-xs md:text-sm flex items-center gap-1 sm:gap-2">
                <span>🕐</span> <span className="hidden sm:inline">Time</span>
              </p>
              <p className="text-xs sm:text-sm md:text-lg font-bold text-white mt-0.5 sm:mt-1">{event.time}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4">
              <p className="text-teal-100 text-[10px] sm:text-xs md:text-sm flex items-center gap-1 sm:gap-2">
                <span>📍</span> <span className="hidden sm:inline">Venue</span>
              </p>
              <p className="text-xs sm:text-sm md:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">{event.venue}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4">
              <p className="text-teal-100 text-[10px] sm:text-xs md:text-sm flex items-center gap-1 sm:gap-2">
                <span>📊</span> <span className="hidden sm:inline">Status</span>
              </p>
              <p className="text-xs sm:text-sm md:text-lg font-bold text-white mt-0.5 sm:mt-1 capitalize">{event.status}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 col-span-2 sm:col-span-1">
              <p className="text-teal-100 text-[10px] sm:text-xs md:text-sm flex items-center gap-1 sm:gap-2">
                <span>🏆</span> <span className="hidden sm:inline">Round</span>
              </p>
              <span className={`inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs md:text-sm font-bold rounded-full mt-0.5 sm:mt-1 ${getRoundColor(currentRound)}`}>
                {currentRound.charAt(0).toUpperCase() + currentRound.slice(1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Contestants Table */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-white/20 backdrop-blur-sm rounded-lg flex-shrink-0">
                <span className="text-lg sm:text-2xl">📋</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-white">Registered Contestants</h3>
                <p className="text-emerald-100 text-[10px] sm:text-xs md:text-sm">
                  {sortedContestants.length} contestant{sortedContestants.length !== 1 ? 's' : ''} registered
                </p>
              </div>
            </div>
            {/* Real-time Score Indicator */}
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
              <span className="relative flex h-2 w-2 sm:h-3 sm:w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-green-500"></span>
              </span>
              <span className="text-white text-[10px] sm:text-xs font-medium">
                <span className="hidden sm:inline">Live Scores</span>
                <span className="sm:hidden">Live</span>
              </span>
            </div>
          </div>
        </div>
        
        {/* Mobile Card View */}
        <div className="lg:hidden divide-y divide-gray-100">
          {sortedContestants.map((contestant) => {
            const isEliminated = contestant.status === 'eliminated' || contestant.eliminated;
            return (
            <div key={contestant.id} className={`p-3 sm:p-4 space-y-2 sm:space-y-3 transition-all duration-300 ${isEliminated ? 'bg-red-50/50 opacity-75' : 'hover:bg-gradient-to-r hover:from-emerald-50/50 hover:to-teal-50/50'}`}>
              {/* Contestant Header with Rank */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Rank Badge */}
                  <div className={`flex-shrink-0 w-8 sm:w-10 h-8 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-lg font-bold ${
                    !contestant.rank ? 'bg-gray-100 text-gray-400' :
                    contestant.rank === 1 ? 'bg-yellow-100 text-yellow-600' : 
                    contestant.rank === 2 ? 'bg-gray-200 text-gray-500' : 
                    contestant.rank === 3 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {contestant.rank ? (contestant.rank <= 3 ? ['🥇', '🥈', '🥉'][contestant.rank - 1] : contestant.rank) : '-'}
                  </div>
                  <div className={`rounded-lg p-1.5 sm:p-2 text-sm sm:text-lg font-bold flex-shrink-0 shadow-md text-white ${isEliminated ? 'bg-gray-400' : 'bg-gradient-to-br from-emerald-500 to-teal-500'}`}>
                    #{contestant.contestantNumber}
                  </div>
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm sm:text-base truncate ${isEliminated ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {contestant.displayName || `${contestant.firstName} ${contestant.lastName}`}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-500">
                      {contestant.contestantType === 'group' ? 'Group' : `Age: ${contestant.age}`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => toggleDropdown(contestant.id, e)}
                  className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 touch-manipulation active:scale-95 flex-shrink-0"
                  title="More actions"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
              
              {/* Score Display */}
              <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-2 sm:p-3">
                <span className="text-blue-500 text-sm sm:text-lg">📊</span>
                {contestant.calculatedScore > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-base sm:text-lg ${
                      isEliminated ? 'text-gray-400' :
                      contestant.calculatedScore >= 90 ? 'text-green-600' : 
                      contestant.calculatedScore >= 80 ? 'text-blue-600' : 
                      contestant.calculatedScore >= 70 ? 'text-yellow-600' : 'text-gray-600'
                    }`}>
                      {contestant.calculatedScore.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500">({contestant.judgeCount} judge{contestant.judgeCount !== 1 ? 's' : ''})</span>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">No score yet</span>
                )}
              </div>
              
              {/* Contestant Details */}
              <div className="grid grid-cols-1 gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <div className="flex items-center gap-1.5 sm:gap-2 bg-gray-50 rounded-lg p-2">
                  <span className="text-gray-400 flex-shrink-0">📍</span>
                  <span className="text-gray-700 truncate">{contestant.address}</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 bg-gray-50 rounded-lg p-2">
                  <span className="text-gray-400 flex-shrink-0">📞</span>
                  <span className="text-gray-700">{contestant.contactNumber || 'N/A'}</span>
                </div>
              </div>
              
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs font-bold rounded-full ${getStatusColor(contestant.status)} shadow-sm`}>
                  {contestant.status.charAt(0).toUpperCase() + contestant.status.slice(1)}
                </span>
              </div>
              
              {/* Mobile Dropdown Menu */}
              {showActionsDropdown === contestant.id && (
                <div className="pt-2 sm:pt-3 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <button
                      onClick={() => { openEditModal(contestant); closeDropdown(); }}
                      className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] sm:text-xs text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation active:scale-95"
                    >
                      <span className="text-blue-600">✏️</span>
                      Edit
                    </button>
                    {contestant.status !== 'eliminated' && currentRound !== 'completed' && (
                      <button
                        onClick={() => { handleEliminateContestant(contestant.id); closeDropdown(); }}
                        className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] sm:text-xs text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors touch-manipulation active:scale-95"
                      >
                        <span>❌</span>
                        Eliminate
                      </button>
                    )}
                    {currentRound !== 'final' && currentRound !== 'completed' && contestant.status !== 'eliminated' && (
                      <button
                        onClick={() => { handleGoToFinalRounds(); closeDropdown(); }}
                        className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] sm:text-xs text-green-600 bg-white border border-green-200 rounded-lg hover:bg-green-50 transition-colors touch-manipulation active:scale-95"
                      >
                        <span>🏆</span>
                        Finals
                      </button>
                    )}
                    <button
                      onClick={() => { handleDeleteContestant(contestant.id); closeDropdown(); }}
                      className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] sm:text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation active:scale-95"
                    >
                      <span>🗑️</span>
                      Remove
                    </button>
                    <button
                      onClick={() => { router.push(`/admin/scoreboard?eventId=${eventId}`); closeDropdown(); }}
                      className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] sm:text-xs text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors touch-manipulation active:scale-95 col-span-2"
                    >
                      <span>📊</span>
                      Scoreboard
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
        
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Rank</th>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">No.</th>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Name</th>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Score</th>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Age</th>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Address</th>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Contact</th>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-3 xl:px-4 py-3 xl:py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedContestants.map((contestant) => {
                const isEliminated = contestant.status === 'eliminated' || contestant.eliminated;
                return (
                <tr key={contestant.id} className={`transition-all duration-200 ${isEliminated ? 'bg-red-50/50 opacity-75' : 'hover:bg-gradient-to-r hover:from-emerald-50/50 hover:to-teal-50/50'}`}>
                  <td className="px-3 xl:px-4 py-3 xl:py-4 text-center">
                    {contestant.rank ? (
                      <div className={`inline-flex items-center justify-center text-sm xl:text-base font-bold ${
                        contestant.rank === 1 ? 'text-yellow-500' : 
                        contestant.rank === 2 ? 'text-gray-400' : 
                        contestant.rank === 3 ? 'text-amber-600' : 'text-gray-600'
                      }`}>
                        {contestant.rank === 1 ? '🥇' : contestant.rank === 2 ? '🥈' : contestant.rank === 3 ? '🥉' : `#${contestant.rank}`}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-3 xl:px-4 py-3 xl:py-4">
                    <div className={`inline-flex items-center justify-center text-white text-xs xl:text-sm font-bold rounded-lg px-2 py-1 shadow-md ${isEliminated ? 'bg-gray-400' : 'bg-gradient-to-br from-emerald-500 to-teal-500'}`}>#{contestant.contestantNumber}</div>
                  </td>
                  <td className="px-3 xl:px-4 py-3 xl:py-4">
                    <div className={`text-xs xl:text-sm font-medium ${isEliminated ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {contestant.contestantType === 'group' ? (
                        <div>
                          <div className={`font-bold ${isEliminated ? 'text-gray-500' : 'text-emerald-600'}`}>{contestant.groupName}</div>
                          <div className="text-[10px] xl:text-xs text-gray-500">Leader: {contestant.groupLeader}</div>
                        </div>
                      ) : (
                        `${contestant.firstName} ${contestant.lastName}`
                      )}
                    </div>
                  </td>
                  <td className="px-3 xl:px-4 py-3 xl:py-4 text-center">
                    {contestant.calculatedScore > 0 ? (
                      <div className="flex flex-col items-center">
                        <span className={`font-bold text-sm xl:text-base ${
                          isEliminated ? 'text-gray-400' :
                          contestant.calculatedScore >= 90 ? 'text-green-600' : 
                          contestant.calculatedScore >= 80 ? 'text-blue-600' : 
                          contestant.calculatedScore >= 70 ? 'text-yellow-600' : 'text-gray-600'
                        }`}>
                          {contestant.calculatedScore.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-gray-400">{contestant.judgeCount} judge{contestant.judgeCount !== 1 ? 's' : ''}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">No score</span>
                    )}
                  </td>
                  <td className="px-3 xl:px-4 py-3 xl:py-4 text-xs xl:text-sm text-gray-900">
                    {contestant.contestantType === 'group' ? 'Group' : contestant.age}
                  </td>
                  <td className="px-3 xl:px-4 py-3 xl:py-4 text-xs xl:text-sm text-gray-900 max-w-[150px] truncate">{contestant.address}</td>
                  <td className="px-3 xl:px-4 py-3 xl:py-4 text-xs xl:text-sm text-gray-900">{contestant.contactNumber}</td>
                  <td className="px-3 xl:px-4 py-3 xl:py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] xl:text-xs font-medium rounded-full ${getStatusColor(contestant.status)}`}>
                      {contestant.status.charAt(0).toUpperCase() + contestant.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 xl:py-4">
                    <div className="relative dropdown-menu">
                      <button
                        onClick={(e) => toggleDropdown(contestant.id, e)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 touch-manipulation active:scale-95"
                        title="More actions"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {/* Dropdown Menu */}
                      {showActionsDropdown === contestant.id && (
                        <>
                          {isDropdownAbove() && (
                            <div 
                              className="fixed w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-gray-200 z-[9999]"
                              style={{
                                top: `${dropdownPosition.top - 8}px`,
                                left: `${dropdownPosition.left + dropdownButtonRef?.getBoundingClientRect().width - 40}px`
                              }}
                            />
                          )}
                          <div 
                            className={`fixed w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999] transition-all duration-200 ${
                              isDropdownAbove() ? 'mb-2' : 'mt-2'
                            }`}
                            style={{
                              top: `${dropdownPosition.top}px`,
                              left: `${dropdownPosition.left}px`
                            }}
                          >
                          <button
                            onClick={() => { openEditModal(contestant); closeDropdown(); }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <span className="text-blue-600">✏️</span>
                            Edit Contestant
                          </button>
                          {contestant.status !== 'eliminated' && currentRound !== 'completed' && (
                            <button
                              onClick={() => { handleEliminateContestant(contestant.id); closeDropdown(); }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <span>❌</span>
                              Eliminate Contestant
                            </button>
                          )}
                          {currentRound !== 'final' && currentRound !== 'completed' && contestant.status !== 'eliminated' && (
                            <button
                              onClick={() => { handleGoToFinalRounds(); closeDropdown(); }}
                              className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 flex items-center gap-2"
                            >
                              <span>🏆</span>
                              Go to Final Rounds
                            </button>
                          )}
                          <button
                            onClick={() => { handleDeleteContestant(contestant.id); closeDropdown(); }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <span>🗑️</span>
                            Remove Contestant
                          </button>
                          <hr className="my-1 border-gray-200" />
                          <button
                            onClick={() => { router.push(`/admin/scoreboard?eventId=${eventId}`); closeDropdown(); }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <span className="text-blue-600">📊</span>
                            View Scoreboard
                          </button>
                        </div>
                        </>
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

      {/* Empty State */}
      {contestants.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contestants yet</h3>
          <p className="text-gray-500 mb-4">Add contestants to get started</p>
          <button
            onClick={() => { setFormErrors({}); setShowAddModal(true); }}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Contestant
          </button>
        </div>
      )}

      {/* Add Contestant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Gradient Header */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5 rounded-t-xl sm:rounded-t-2xl">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                <div className="p-1.5 sm:p-2 bg-white/20 backdrop-blur-sm rounded-lg flex-shrink-0">
                  <span className="text-xl sm:text-2xl md:text-3xl">➕</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Add New Contestant</h3>
                  <p className="text-emerald-100 text-[10px] sm:text-xs md:text-sm mt-0.5 sm:mt-1 line-clamp-1">Register for {event?.eventName}</p>
                </div>
              </div>
              
              {/* Contestant Type Toggle */}
              <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4 mt-3 sm:mt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  <div>
                    <label className="text-white font-semibold text-xs sm:text-sm">Contestant Type</label>
                    <p className="text-emerald-100 text-[10px] sm:text-xs mt-0.5 sm:mt-1 hidden sm:block">Choose between solo performer or group</p>
                  </div>
                  <div className="flex items-center bg-white/20 rounded-lg sm:rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, contestantType: 'solo' }))}
                      className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                        formData.contestantType === 'solo'
                          ? 'bg-white text-emerald-600 shadow-lg'
                          : 'text-white hover:text-emerald-200'
                      }`}
                    >
                      👤 Solo
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, contestantType: 'group' }))}
                      className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                        formData.contestantType === 'group'
                          ? 'bg-white text-emerald-600 shadow-lg'
                          : 'text-white hover:text-emerald-200'
                      }`}
                    >
                      👥 Group
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-3 sm:p-4 md:p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleAddContestant(); }} className="space-y-3 sm:space-y-4">
                {/* Contestant Number - Common for both types */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Contestant Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="contestantNumber"
                      value={formData.contestantNumber}
                      onChange={handleInputChange}
                      className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-600 transition-all duration-200 bg-white ${
                        formErrors.contestantNumber 
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                          : 'border-gray-200 focus:border-blue-600'
                      }`}
                      placeholder="Enter number"
                    />
                    {formErrors.contestantNumber ? (
                      <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-red-500 font-medium">
                        ⚠️ {formErrors.contestantNumber}
                      </p>
                    ) : (
                      <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500">Unique number (e.g., 1, 2, 101)</p>
                    )}
                  </div>
                  {/* Age field - only for solo contestants */}
                  {formData.contestantType === 'solo' && (
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                        Age <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="age"
                        value={formData.age}
                        onChange={handleInputChange}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                        placeholder="Age"
                        min="1"
                        max="100"
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Solo Fields */}
                {formData.contestantType === 'solo' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                        placeholder="First name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                        placeholder="Last name"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Group Fields */}
                {formData.contestantType === 'group' && (
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Group Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="groupName"
                      value={formData.groupName}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                      placeholder="Enter group name"
                      required
                    />
                  </div>
                )}

                {/* Common Fields */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                    placeholder="Complete address"
                    required
                  />
                </div>

                {/* Contact Number - only for solo contestants */}
                {formData.contestantType === 'solo' && (
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Contact Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                      placeholder="09XX-XXX-XXXX"
                      maxLength="11"
                      pattern="[0-9]{11}"
                      title="Contact number must be exactly 11 digits"
                      required
                    />
                  </div>
                )}

                {/* Photo Upload Field */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                    Contestant Photo
                  </label>
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="flex-1">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-green-400 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          id="photo-upload"
                        />
                        <label
                          htmlFor="photo-upload"
                          className="cursor-pointer flex flex-col items-center justify-center text-center"
                        >
                          {imagePreview ? (
                            <div className="relative">
                              <img
                                src={imagePreview}
                                alt="Preview"
                                className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg shadow-md"
                              />
                              <button
                                type="button"
                                onClick={clearImage}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                              >
                                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <div className="py-4 sm:py-8">
                              <svg className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              <p className="text-xs sm:text-sm text-gray-600">Tap to upload photo</p>
                              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">PNG, JPG up to 5MB</p>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:bg-gray-200 transition-all duration-200 text-sm sm:text-base font-semibold border border-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 transition-all duration-200 text-sm sm:text-base font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                  >
                    <span className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <span>➕</span>
                      Add Contestant
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contestant Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Gradient Header */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5 rounded-t-xl sm:rounded-t-2xl">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                <div className="p-1.5 sm:p-2 bg-white/20 backdrop-blur-sm rounded-lg flex-shrink-0">
                  <span className="text-xl sm:text-2xl md:text-3xl">✏️</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Edit Contestant</h3>
                  <p className="text-blue-100 text-[10px] sm:text-xs md:text-sm mt-0.5 sm:mt-1">Update contestant information</p>
                </div>
              </div>
            </div>
            <div className="p-3 sm:p-4 md:p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleEditContestant(); }} className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Contestant Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="contestantNumber"
                      value={formData.contestantNumber}
                      onChange={handleInputChange}
                      className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-600 transition-all duration-200 bg-white ${
                        formErrors.contestantNumber 
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                          : 'border-gray-200 focus:border-blue-600'
                      }`}
                    />
                    {formErrors.contestantNumber ? (
                      <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-red-500 font-medium">
                        ⚠️ {formErrors.contestantNumber}
                      </p>
                    ) : (
                      <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500">Unique number</p>
                    )}
                  </div>
                  {/* Age field - only for solo contestants */}
                  {formData.contestantType === 'solo' && (
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                        Age <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="age"
                        value={formData.age}
                        onChange={handleInputChange}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                        min="1"
                        max="100"
                        required
                      />
                    </div>
                  )}
                </div>
                
                {/* Solo Fields - First Name and Last Name */}
                {formData.contestantType === 'solo' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Group Fields */}
                {formData.contestantType === 'group' && (
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                        Group Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="groupName"
                        value={formData.groupName}
                        onChange={handleInputChange}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                    required
                  />
                </div>

                {/* Contact Number - only for solo contestants */}
                {formData.contestantType === 'solo' && (
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Contact Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all duration-200 bg-white"
                      placeholder="09XX-XXX-XXXX"
                      maxLength="11"
                      pattern="[0-9]{11}"
                      title="Contact number must be exactly 11 digits"
                      required
                    />
                  </div>
                )}

                {/* Photo Upload Field */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                    Contestant Photo
                  </label>
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="flex-1">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-green-400 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          id="photo-upload-edit"
                        />
                        <label
                          htmlFor="photo-upload-edit"
                          className="cursor-pointer flex flex-col items-center justify-center text-center"
                        >
                          {imagePreview ? (
                            <div className="relative">
                              <img
                                src={imagePreview}
                                alt="Preview"
                                className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg shadow-md"
                              />
                              <button
                                type="button"
                                onClick={clearImage}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                              >
                                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <div className="py-4 sm:py-8">
                              <svg className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              <p className="text-xs sm:text-sm text-gray-600">Tap to upload photo</p>
                              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">PNG, JPG up to 5MB</p>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingContestant(null); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:bg-gray-200 transition-all duration-200 text-sm sm:text-base font-semibold border border-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-200 text-sm sm:text-base font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                  >
                    <span className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <span>💾</span>
                      Update Contestant
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Round Management Modal */}
      {showRoundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-600 to-red-600 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5 rounded-t-xl sm:rounded-t-2xl">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-white flex items-center gap-1.5 sm:gap-2">
                    <span className="text-lg sm:text-xl">🏆</span> Round Management
                  </h3>
                  <p className="text-orange-100 text-[10px] sm:text-xs md:text-sm mt-0.5 sm:mt-1">Manage rounds and elimination</p>
                </div>
                <button
                  onClick={() => setShowRoundModal(false)}
                  className="text-white hover:text-orange-200 transition-colors p-1.5 sm:p-2 hover:bg-white/20 rounded-lg flex-shrink-0"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-3 sm:p-4 md:p-6">
              {/* Current Round Display */}
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Current Round</label>
                <div className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-lg font-bold rounded-lg sm:rounded-xl ${getRoundColor(currentRound)}`}>
                  <span className="text-lg sm:text-2xl">🏆</span>
                  {currentRound.charAt(0).toUpperCase() + currentRound.slice(1)}
                </div>
              </div>

              {/* Round Progress Info */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6">
                <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 md:p-4">
                  <div className="text-[10px] sm:text-xs md:text-sm text-gray-600 mb-0.5 sm:mb-1">Total</div>
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">{contestants.length}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-2.5 sm:p-3 md:p-4">
                  <div className="text-[10px] sm:text-xs md:text-sm text-gray-600 mb-0.5 sm:mb-1">Active</div>
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">
                    {contestants.filter(c => c.status !== 'eliminated').length}
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-2.5 sm:p-3 md:p-4">
                  <div className="text-[10px] sm:text-xs md:text-sm text-gray-600 mb-0.5 sm:mb-1">Out</div>
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-red-600">
                    {contestants.filter(c => c.status === 'eliminated').length}
                  </div>
                </div>
              </div>

              {/* Round Actions */}
              <div className="space-y-3 sm:space-y-4">
                {currentRound === 'preliminary' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                    <h4 className="font-semibold text-blue-900 text-sm sm:text-base mb-1.5 sm:mb-2 flex items-center gap-1.5">
                      <span>🎯</span> Advance to Semi-Final
                    </h4>
                    <p className="text-[10px] sm:text-xs md:text-sm text-blue-700 mb-3 sm:mb-4">
                      Top 10 will advance. Others eliminated.
                    </p>
                    <button
                      onClick={handleAdvanceRound}
                      className="w-full bg-blue-600 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm md:text-base font-semibold"
                    >
                      Advance to Semi-Final
                    </button>
                  </div>
                )}

                {currentRound === 'semi-final' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 sm:p-4">
                    <h4 className="font-semibold text-orange-900 text-sm sm:text-base mb-1.5 sm:mb-2 flex items-center gap-1.5">
                      <span>🏅</span> Advance to Final
                    </h4>
                    <p className="text-[10px] sm:text-xs md:text-sm text-orange-700 mb-3 sm:mb-4">
                      Top 5 will advance. Others eliminated.
                    </p>
                    <button
                      onClick={handleAdvanceRound}
                      className="w-full bg-orange-600 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg hover:bg-orange-700 transition-colors text-xs sm:text-sm md:text-base font-semibold"
                    >
                      Advance to Final Round
                    </button>
                  </div>
                )}

                {currentRound === 'final' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
                    <h4 className="font-semibold text-green-900 text-sm sm:text-base mb-1.5 sm:mb-2 flex items-center gap-1.5">
                      <span>🏆</span> Complete Competition
                    </h4>
                    <p className="text-[10px] sm:text-xs md:text-sm text-green-700 mb-3 sm:mb-4">
                      Declare winner and runners-up.
                    </p>
                    <button
                      onClick={handleAdvanceRound}
                      className="w-full bg-green-600 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm md:text-base font-semibold"
                    >
                      Complete & Declare Winner
                    </button>
                  </div>
                )}

                {currentRound === 'completed' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                    <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-1.5 sm:mb-2 flex items-center gap-1.5">
                      <span>✅</span> Competition Completed
                    </h4>
                    <p className="text-[10px] sm:text-xs md:text-sm text-gray-700 mb-3 sm:mb-4">
                      Winners have been declared.
                    </p>
                    <div className="bg-green-100 text-green-800 p-2.5 sm:p-3 rounded-lg">
                      <div className="font-semibold text-xs sm:text-sm">🏆 Rankings finalized!</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Elimination Section */}
              {currentRound !== 'completed' && (
                <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-2 sm:mb-4 flex items-center gap-1.5">
                    <span>⚠️</span> Manual Elimination
                  </h4>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 mb-2 sm:mb-4">
                    Manually eliminate contestants for disqualifications.
                  </p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 sm:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-yellow-800 text-xs sm:text-sm">
                      <span className="text-base sm:text-xl">⚠️</span>
                      <span className="font-medium">Cannot be undone!</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowRoundModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:bg-gray-200 transition-all duration-200 text-sm sm:text-base font-semibold"
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
