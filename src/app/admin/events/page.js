'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, getDocs, collection, deleteDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function EventManagement() {
  const [events, setEvents] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const [dropdownButtonRef, setDropdownButtonRef] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    eventName: '',
    eventDescription: '',
    date: '',
    time: '',
    venue: '',
    status: 'upcoming',
    scoresLocked: false
  });

  // Load events from Firestore on component mount
  useEffect(() => {
    loadEvents();
  }, []);

  // Update current time every second for live display
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date());
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Better date/time parsing function
  const parseEventDateTime = (date, time) => {
    try {
      // Handle different date formats
      let eventDate = date;
      if (typeof date === 'string') {
        // Ensure date is in YYYY-MM-DD format
        eventDate = date.split('T')[0]; // Remove time part if exists
      }
      
      // Handle different time formats
      let eventTime = time;
      if (typeof time === 'string') {
        // Convert 12-hour format to 24-hour if needed
        if (time.includes('AM') || time.includes('PM')) {
          const timeObj = new Date(`2000-01-01 ${time}`);
          eventTime = timeObj.toTimeString().slice(0, 5); // Get HH:MM format
        }
      }
      
      const dateTimeString = `${eventDate} ${eventTime}`;
      const eventDateTime = new Date(dateTimeString);
      
      // Check if date is valid
      if (isNaN(eventDateTime.getTime())) {
        console.error('Invalid date/time:', { date, time, dateTimeString });
        return null;
      }
      
      return eventDateTime;
    } catch (error) {
      console.error('Error parsing date/time:', error);
      return null;
    }
  };

  // Real-time status update effect
  useEffect(() => {
    const updateEventStatuses = () => {
      const now = new Date();
      
      setEvents(prevEvents => 
        prevEvents.map(event => {
          // Better date/time parsing
          const eventDateTime = parseEventDateTime(event.date, event.time);
          if (!eventDateTime) return event;
          
          // Calculate end time (assume 12 hours after start time)
          const eventEndTime = new Date(eventDateTime.getTime() + (12 * 60 * 60 * 1000));
          
          // Also check if the current date is past the event date (regardless of time)
          const eventDateOnly = new Date(eventDateTime.getFullYear(), eventDateTime.getMonth(), eventDateTime.getDate());
          const currentDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const isPastEventDate = currentDateOnly > eventDateOnly;
          
          let newStatus = event.status;
          
          // Don't change status if event is manually set to finished
          if (event.status !== 'finished') {
            if (now >= eventDateTime && now <= eventEndTime && !isPastEventDate) {
              newStatus = 'ongoing';
            } else if (now > eventEndTime || isPastEventDate) {
              newStatus = 'finished';
            } else {
              newStatus = 'upcoming';
            }
          }
          
          // Update in Firestore if status changed
          if (newStatus !== event.status) {
            const eventRef = doc(db, 'events', event.id);
            updateDoc(eventRef, {
              status: newStatus,
              updatedAt: serverTimestamp()
            }).catch(error => {
              console.error('Error updating event status:', error);
            });
          }
          
          return {
            ...event,
            status: newStatus,
            isLive: newStatus === 'ongoing' // Add live indicator
          };
        })
      );
    };

    // Update immediately
    updateEventStatuses();
    
    // Set up interval to check every 30 seconds for more responsive updates
    const interval = setInterval(updateEventStatuses, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Load events function
  const loadEvents = async () => {
    try {
      setLoading(true);
      const eventsCollection = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsCollection);
      const eventsList = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(eventsList);
    } catch (error) {
      console.error('Error loading events:', error);
      setError('Failed to load events from database. Please refresh the page.');
      // Load sample data as fallback (with empty criteria - admin should configure via Manage Criteria)
      const sampleEvents = [
        {
          id: 'sample-1',
          eventName: 'Sample Event 1',
          eventDescription: 'Sample event - configure criteria in Manage Criteria',
          date: '2026-03-15',
          time: '6:00 PM',
          venue: 'University Auditorium',
          status: 'upcoming',
          scoresLocked: false,
          gradingType: 'percentage',
          criteria: [],
          criteriaCategories: [],
          rounds: [],
          hasRounds: false
        },
        {
          id: 'sample-2',
          eventName: 'Sample Event 2',
          eventDescription: 'Sample event - configure criteria in Manage Criteria',
          date: '2026-02-28',
          time: '7:00 PM',
          venue: 'Municipal Gymnasium',
          status: 'ongoing',
          scoresLocked: false,
          gradingType: 'points',
          criteria: [],
          criteriaCategories: [],
          rounds: [],
          hasRounds: false
        },
        {
          id: 'sample-3',
          eventName: 'Sample Event 3',
          eventDescription: 'Sample event - configure criteria in Manage Criteria',
          date: '2025-12-20',
          time: '5:00 PM',
          venue: 'Community Center',
          status: 'finished',
          scoresLocked: true,
          gradingType: 'percentage',
          criteria: [],
          criteriaCategories: [],
          rounds: [],
          hasRounds: false
        }
      ];
      setEvents(sampleEvents);
    } finally {
      setLoading(false);
      
      // Automatically clean up orphaned judge assignments
      setTimeout(async () => {
        try {
          const cleanedCount = await cleanupOrphanedAssignments();
          if (cleanedCount > 0) {
            console.log(`Automatically cleaned up assignments for ${cleanedCount} judges`);
          }
        } catch (error) {
          console.error('Error in automatic cleanup:', error);
        }
      }, 1000); // Run cleanup 1 second after loading
    }
  };

  // Update dropdown position on scroll
  useEffect(() => {
    if (activeDropdown && dropdownButtonRef) {
      const updatePosition = () => {
        const rect = dropdownButtonRef.getBoundingClientRect();
        const dropdownHeight = 280; // Estimated dropdown height in pixels
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
  }, [activeDropdown, dropdownButtonRef]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeDropdown && !event.target.closest('.dropdown-menu')) {
        closeDropdown();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  
  const handleAddEvent = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Create event with empty criteria - admin will configure via Manage Criteria
      const eventData = {
        ...formData,
        criteria: [],
        criteriaCategories: [],
        rounds: [],
        hasRounds: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Save to Firestore
      const eventsCollection = collection(db, 'events');
      const docRef = await addDoc(eventsCollection, eventData);
      
      // Add the new event to local state with the Firestore ID
      const newEvent = {
        id: docRef.id,
        ...eventData
      };
      
      setEvents([...events, newEvent]);
      setShowAddModal(false);
      resetForm();
      
      alert(`Event "${formData.eventName}" has been created successfully!`);
    } catch (error) {
      console.error('Error adding event:', error);
      setError('Failed to create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditEvent = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Update event in Firestore
      const eventRef = doc(db, 'events', editingEvent.id);
      const updatedData = {
        ...formData,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(eventRef, updatedData);
      
      // Update local state
      setEvents(events.map(event => 
        event.id === editingEvent.id 
          ? { ...event, ...updatedData }
          : event
      ));
      
      setShowEditModal(false);
      setEditingEvent(null);
      resetForm();
      
      alert(`Event "${formData.eventName}" has been updated successfully!`);
    } catch (error) {
      console.error('Error updating event:', error);
      setError('Failed to update event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Utility function to clean up orphaned judge assignments
  const cleanupOrphanedAssignments = async () => {
    try {
      const judgesCollection = collection(db, 'judges');
      const judgesSnapshot = await getDocs(judgesCollection);
      const eventsCollection = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsCollection);
      
      // Get all existing event IDs
      const existingEventIds = eventsSnapshot.docs.map(doc => doc.id);
      
      const batchUpdates = [];
      judgesSnapshot.forEach((judgeDoc) => {
        const judgeData = judgeDoc.data();
        if (judgeData.assignedEvents && judgeData.assignedEvents.length > 0) {
          // Filter out event IDs that no longer exist
          const validAssignedEvents = judgeData.assignedEvents.filter(eventId => 
            existingEventIds.includes(eventId)
          );
          
          // Update if there were invalid assignments
          if (validAssignedEvents.length !== judgeData.assignedEvents.length) {
            batchUpdates.push(
              updateDoc(judgeDoc.ref, { assignedEvents: validAssignedEvents })
            );
          }
        }
      });
      
      // Execute all updates
      if (batchUpdates.length > 0) {
        await Promise.all(batchUpdates);
        console.log(`Cleaned up orphaned assignments for ${batchUpdates.length} judges`);
        return batchUpdates.length;
      }
      
      return 0;
    } catch (error) {
      console.error('Error cleaning up orphaned assignments:', error);
      return 0;
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Delete from Firestore
      const eventRef = doc(db, 'events', eventId);
      await deleteDoc(eventRef);
      
      // Clean up judge assignments - remove this event ID from all judges
      const judgesCollection = collection(db, 'judges');
      const judgesSnapshot = await getDocs(judgesCollection);
      
      const batchUpdates = [];
      judgesSnapshot.forEach((judgeDoc) => {
        const judgeData = judgeDoc.data();
        if (judgeData.assignedEvents && judgeData.assignedEvents.includes(eventId)) {
          // Remove the deleted event ID from the judge's assignments
          const updatedAssignedEvents = judgeData.assignedEvents.filter(id => id !== eventId);
          batchUpdates.push(
            updateDoc(judgeDoc.ref, { assignedEvents: updatedAssignedEvents })
          );
        }
      });
      
      // Execute all judge updates
      if (batchUpdates.length > 0) {
        await Promise.all(batchUpdates);
        console.log(`Cleaned up event assignments for ${batchUpdates.length} judges`);
      }
      
      // Update local state
      setEvents(events.filter(event => event.id !== eventId));
      
      alert('Event has been deleted successfully! Judge assignments have been cleaned up.');
    } catch (error) {
      console.error('Error deleting event:', error);
      setError('Failed to delete event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleScoresLock = async (eventId) => {
    setLoading(true);
    setError('');
    
    try {
      const event = events.find(e => e.id === eventId);
      
      // Prevent locking scores if event is upcoming
      if (event.status === 'upcoming' && !event.scoresLocked) {
        setError('Cannot lock scores for upcoming events. Please change event status to "ongoing" first.');
        alert('Cannot lock scores for upcoming events. Please change event status to "ongoing" first.');
        setLoading(false);
        return;
      }
      
      // Prevent unlocking scores if event is finished
      if (event.status === 'finished' && event.scoresLocked) {
        setError('Cannot unlock scores for finished events.');
        alert('Cannot unlock scores for finished events.');
        setLoading(false);
        return;
      }
      
      // Update in Firestore
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, {
        scoresLocked: !event.scoresLocked,
        updatedAt: serverTimestamp()
      });
      
      // Update local state
      setEvents(events.map(event => 
        event.id === eventId 
          ? { ...event, scoresLocked: !event.scoresLocked }
          : event
      ));
      
      const status = !event.scoresLocked ? 'locked' : 'unlocked';
      alert(`Event scores have been ${status} successfully!`);
    } catch (error) {
      console.error('Error toggling scores lock:', error);
      setError('Failed to update scores lock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (event) => {
    setEditingEvent(event);
    setFormData({
      eventName: event.eventName,
      eventDescription: event.eventDescription,
      date: event.date,
      time: event.time,
      venue: event.venue,
      status: event.status,
      scoresLocked: event.scoresLocked
    });
    setShowEditModal(true);
  };

  const openCriteriaModal = (event) => {
    const updatedEvent = { ...event };
    
    // Initialize categorized criteria if not present
    if (!updatedEvent.criteriaCategories) {
      updatedEvent.criteriaCategories = [];
    }
    
    // Ensure existing categories have scoringType field
    if (updatedEvent.criteriaCategories) {
      updatedEvent.criteriaCategories = updatedEvent.criteriaCategories.map(category => ({
        ...category,
        scoringType: category.scoringType || 'percentage' // Default to percentage if not set
      }));
    }
    
    // Ensure rounds have criteria structure
    if (updatedEvent.rounds && updatedEvent.rounds.length > 0) {
      updatedEvent.rounds = updatedEvent.rounds.map(round => ({
        ...round,
        criteria: round.criteria || updatedEvent.criteria.map(c => ({
          ...c,
          enabled: c.enabled
        }))
      }));
    }
    
    // Add grading type if not present (default to percentage)
    if (!updatedEvent.gradingType) {
      updatedEvent.gradingType = 'percentage';
    }
    
    // Initialize default category scoring type if not present
    if (!updatedEvent.defaultCategoryScoringType) {
      updatedEvent.defaultCategoryScoringType = 'percentage';
    }
    
    setSelectedEvent(updatedEvent);
    setShowCriteriaModal(true);
  };

  const handleCriteriaChange = (index, field, value) => {
    const updatedEvent = { ...selectedEvent };
    
    // Special validation for weight field
    if (field === 'weight') {
      const currentWeight = parseFloat(value) || 0;
      
      // Calculate total weight of all enabled criteria except the current one
      const otherCriteriaWeight = updatedEvent.criteria.reduce((sum, criterion, i) => {
        if (i !== index && criterion.enabled) {
          return sum + (criterion.weight || 0);
        }
        return sum;
      }, 0);
      
      // Check if adding this weight would exceed 100
      if (otherCriteriaWeight + currentWeight > 100) {
        // Calculate the maximum allowed weight for this criteria
        const maxAllowedWeight = Math.max(0, 100 - otherCriteriaWeight);
        
        // Show warning and cap the value
        alert(`Warning: Total weight cannot exceed 100%. Maximum allowed weight for this criteria is ${maxAllowedWeight}%.`);
        updatedEvent.criteria[index][field] = maxAllowedWeight;
      } else {
        updatedEvent.criteria[index][field] = currentWeight;
      }
    } else {
      updatedEvent.criteria[index][field] = value;
    }
    
    setSelectedEvent(updatedEvent);
  };

  const handleGradingTypeChange = (gradingType) => {
    const updatedEvent = { ...selectedEvent };
    updatedEvent.gradingType = gradingType;
    
    // Convert main criteria weights based on grading type
    if (gradingType === 'percentage') {
      // Convert points to percentages (assuming max 100 points)
      updatedEvent.criteria = updatedEvent.criteria.map(criterion => ({
        ...criterion,
        weight: Math.min(100, Math.max(0, criterion.weight))
      }));
    } else {
      // Convert percentages to points (keeping same numeric value)
      updatedEvent.criteria = updatedEvent.criteria.map(criterion => ({
        ...criterion,
        weight: Math.min(100, Math.max(0, criterion.weight))
      }));
    }
    
    // Update criteria categories and their sub-criteria to match the new grading type
    if (updatedEvent.criteriaCategories) {
      updatedEvent.criteriaCategories = updatedEvent.criteriaCategories.map(category => ({
        ...category,
        scoringType: gradingType, // Update category scoring type
        // Keep the same numeric weight values but they'll be interpreted differently
        totalWeight: category.totalWeight || 0,
        // Update sub-criteria
        subCriteria: category.subCriteria ? category.subCriteria.map(subCriterion => ({
          ...subCriterion,
          // Keep the same numeric weight values but they'll be interpreted differently
          weight: subCriterion.weight || 0
        })) : []
      }));
    }
    
    // Also update rounds criteria if they exist
    if (updatedEvent.rounds) {
      updatedEvent.rounds = updatedEvent.rounds.map(round => ({
        ...round,
        criteria: round.criteria ? round.criteria.map(criterion => ({
          ...criterion,
          weight: Math.min(100, Math.max(0, criterion.weight))
        })) : []
      }));
    }
    
    setSelectedEvent(updatedEvent);
  };

  
  const handleSaveCriteria = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Validate that total category weights equal 100% for percentage-based events
      if (selectedEvent.gradingType === 'percentage' && selectedEvent.criteriaCategories) {
        const totalWeight = selectedEvent.criteriaCategories.reduce((sum, cat) => sum + (cat.totalWeight || 0), 0);
        if (totalWeight !== 100) {
          setError(`Total category weights must equal 100% for percentage-based events. Current total: ${totalWeight}%`);
          return;
        }
        
        // Validate that each category's sub-criteria weights equal the category total (if sub-criteria exist)
        for (let i = 0; i < selectedEvent.criteriaCategories.length; i++) {
          const category = selectedEvent.criteriaCategories[i];
          
          // Skip validation if category has no sub-criteria
          if (!category.subCriteria || category.subCriteria.length === 0) {
            continue;
          }
          
          const subCriteriaTotal = category.subCriteria.reduce((sum, sub) => sum + (sub.enabled !== false ? sub.weight : 0), 0);
          
          if (subCriteriaTotal !== (category.totalWeight || 0)) {
            setError(`Category "${category.name || 'Category ' + (i + 1)}" sub-criteria weights must equal category total (${category.totalWeight || 0}%). Current total: ${subCriteriaTotal}%`);
            return;
          }
        }
      }
      
      // Update criteria and rounds in Firestore
      const eventRef = doc(db, 'events', selectedEvent.id);
      await updateDoc(eventRef, {
        criteriaCategories: selectedEvent.criteriaCategories || [],
        criteria: selectedEvent.criteria || [], // Keep legacy criteria for compatibility
        rounds: selectedEvent.rounds || [],
        hasRounds: selectedEvent.hasRounds || false,
        gradingType: selectedEvent.gradingType || 'percentage',
        defaultCategoryScoringType: selectedEvent.defaultCategoryScoringType || 'percentage',
        updatedAt: serverTimestamp()
      });
      
      // Update local state
      setEvents(events.map(event => 
        event.id === selectedEvent.id 
          ? { 
              ...event, 
              criteriaCategories: selectedEvent.criteriaCategories || [],
              criteria: selectedEvent.criteria || [], // Keep legacy criteria for compatibility
              rounds: selectedEvent.rounds || [],
              hasRounds: selectedEvent.hasRounds || false,
              gradingType: selectedEvent.gradingType || 'percentage',
              defaultCategoryScoringType: selectedEvent.defaultCategoryScoringType || 'percentage'
            }
          : event
      ));
      
      setShowCriteriaModal(false);
      setSelectedEvent(null);
      
      alert('Criteria, categories, and rounds have been saved successfully!');
    } catch (error) {
      console.error('Error saving criteria:', error);
      setError('Failed to save criteria. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addCriteria = () => {
    const updatedEvent = { ...selectedEvent };
    
    // Check if scoring type is set to percentage but trying to add criteria
    if (updatedEvent.gradingType === 'percentage') {
      const currentTotal = updatedEvent.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0);
      
      if (currentTotal >= 100) {
        alert('Cannot add new criteria: Total weight has already reached 100%. Please reduce existing criteria weights or disable some criteria first.');
        return;
      }
      
      // Calculate remaining weight
      const remainingWeight = 100 - currentTotal;
      
      // Create new criteria with appropriate default weight
      updatedEvent.criteria.push({
        name: '',
        weight: Math.min(10, remainingWeight), // Default to 10% or remaining weight, whichever is smaller
        enabled: true
      });
      
      // Show info about remaining weight
      if (remainingWeight < 10) {
        alert(`Note: Only ${remainingWeight}% weight remaining. New criteria will be set to ${Math.min(10, remainingWeight)}%.`);
      }
    } else {
      // For points mode, just add with default 0 weight
      updatedEvent.criteria.push({
        name: '',
        weight: 0,
        enabled: true
      });
    }
    
    setSelectedEvent(updatedEvent);
  };

  const removeCriteria = (index) => {
    const updatedEvent = { ...selectedEvent };
    updatedEvent.criteria.splice(index, 1);
    setSelectedEvent(updatedEvent);
  };

  // Categorized criteria management functions
  const addCategory = () => {
    const updatedEvent = { ...selectedEvent };
    if (!updatedEvent.criteriaCategories) {
      updatedEvent.criteriaCategories = [];
    }
    
    const scoringType = updatedEvent.defaultCategoryScoringType || 'percentage';
    
    // Check if scoring type is set to percentage but trying to add category
    if (scoringType === 'percentage') {
      // Calculate remaining weight
      const currentTotal = updatedEvent.criteriaCategories.reduce((sum, cat) => sum + (cat.totalWeight || 0), 0);
      const remainingWeight = 100 - currentTotal;
      
      if (remainingWeight <= 0) {
        alert('Cannot add new category: Total category weight has already reached 100%. Please reduce existing category weights first.');
        return;
      }
      
      updatedEvent.criteriaCategories.push({
        name: '',
        totalWeight: Math.min(10, remainingWeight), // Default to 10% or remaining weight
        scoringType: scoringType,
        subCriteria: []
      });
      
      // Show info about remaining weight
      if (remainingWeight < 10) {
        alert(`Note: Only ${remainingWeight}% weight remaining. New category will be set to ${Math.min(10, remainingWeight)}%.`);
      }
    } else {
      // For points mode, just add with default 0 weight
      updatedEvent.criteriaCategories.push({
        name: '',
        totalWeight: 0,
        scoringType: scoringType,
        subCriteria: []
      });
    }
    
    setSelectedEvent(updatedEvent);
  };

  const removeCategory = (categoryIndex) => {
    const updatedEvent = { ...selectedEvent };
    if (updatedEvent.criteriaCategories) {
      updatedEvent.criteriaCategories.splice(categoryIndex, 1);
    }
    setSelectedEvent(updatedEvent);
  };

  const handleCategoryChange = (categoryIndex, field, value) => {
    const updatedEvent = { ...selectedEvent };
    if (!updatedEvent.criteriaCategories) {
      updatedEvent.criteriaCategories = [];
    }
    
    const category = updatedEvent.criteriaCategories[categoryIndex];
    
    // Special validation for totalWeight field
    if (field === 'totalWeight') {
      const currentWeight = parseFloat(value) || 0;
      
      // Validate input based on scoring type
      if (category.scoringType === 'percentage') {
        // For percentage, only allow 0-100
        if (currentWeight < 0 || currentWeight > 100) {
          alert('Error: Percentage values must be between 0 and 100.');
          return;
        }
      } else {
        // For points, allow any non-negative value
        if (currentWeight < 0) {
          alert('Error: Points values must be 0 or greater.');
          return;
        }
      }
      
      const otherCategoriesWeight = updatedEvent.criteriaCategories.reduce((sum, cat, i) => {
        if (i !== categoryIndex) {
          return sum + (cat.totalWeight || 0);
        }
        return sum;
      }, 0);
      
      // Check if adding this weight would exceed 100 (for percentage mode)
      if (category.scoringType === 'percentage' && otherCategoriesWeight + currentWeight > 100) {
        const maxAllowedWeight = Math.max(0, 100 - otherCategoriesWeight);
        alert(`Warning: Total category weights cannot exceed 100%. Maximum allowed weight for this category is ${maxAllowedWeight}%.`);
        updatedEvent.criteriaCategories[categoryIndex][field] = maxAllowedWeight;
      } else {
        updatedEvent.criteriaCategories[categoryIndex][field] = currentWeight;
      }
    } else {
      updatedEvent.criteriaCategories[categoryIndex][field] = value;
    }
    
    setSelectedEvent(updatedEvent);
  };

  const addSubCriteria = (categoryIndex) => {
    const updatedEvent = { ...selectedEvent };
    if (!updatedEvent.criteriaCategories || !updatedEvent.criteriaCategories[categoryIndex]) {
      return;
    }
    
    const category = updatedEvent.criteriaCategories[categoryIndex];
    if (!category.subCriteria) {
      category.subCriteria = [];
    }
    
    // Check if scoring type is set to percentage but trying to add points-based criteria
    if (category.scoringType === 'percentage') {
      // For percentage mode, check if we're already at 100%
      const currentTotal = category.subCriteria.reduce((sum, sub) => sum + (sub.weight || 0), 0);
      if (currentTotal >= (category.totalWeight || 0)) {
        alert(`Cannot add new sub-criteria: Total weight (${category.totalWeight || 0}%) has already been reached. Please reduce existing sub-criteria weights or increase the category total weight first.`);
        return;
      }
      
      // Calculate remaining weight
      const remainingWeight = (category.totalWeight || 0) - currentTotal;
      
      // Create new sub-criteria with appropriate default weight
      category.subCriteria.push({
        name: '',
        weight: Math.min(1, remainingWeight), // Default to 1% or remaining weight
        description: '',
        enabled: true
      });
      
      // Show info about remaining weight
      if (remainingWeight < 1) {
        alert(`Note: Only ${remainingWeight}% weight remaining. New sub-criteria will be set to ${Math.min(1, remainingWeight)}%.`);
      }
    } else {
      // For points mode, just add with default 0 weight
      category.subCriteria.push({
        name: '',
        weight: 0,
        description: '',
        enabled: true
      });
    }
    
    setSelectedEvent(updatedEvent);
  };

  const removeSubCriteria = (categoryIndex, subIndex) => {
    const updatedEvent = { ...selectedEvent };
    if (updatedEvent.criteriaCategories && updatedEvent.criteriaCategories[categoryIndex]) {
      const category = updatedEvent.criteriaCategories[categoryIndex];
      if (category.subCriteria) {
        category.subCriteria.splice(subIndex, 1);
      }
    }
    setSelectedEvent(updatedEvent);
  };

  const handleSubCriteriaChange = (categoryIndex, subIndex, field, value) => {
    const updatedEvent = { ...selectedEvent };
    if (!updatedEvent.criteriaCategories || !updatedEvent.criteriaCategories[categoryIndex]) {
      return;
    }
    
    const category = updatedEvent.criteriaCategories[categoryIndex];
    if (!category.subCriteria) {
      category.subCriteria = [];
    }
    
    // Special validation for weight field
    if (field === 'weight') {
      const currentWeight = parseFloat(value) || 0;
      
      // Validate input based on scoring type
      if (category.scoringType === 'percentage') {
        // For percentage, only allow 0-100
        if (currentWeight < 0 || currentWeight > 100) {
          alert('Error: Percentage values must be between 0 and 100.');
          return;
        }
      } else {
        // For points, allow any non-negative value
        if (currentWeight < 0) {
          alert('Error: Points values must be 0 or greater.');
          return;
        }
      }
      
      const otherSubCriteriaWeight = category.subCriteria.reduce((sum, sub, i) => {
        if (i !== subIndex && sub.enabled !== false) {
          return sum + (sub.weight || 0);
        }
        return sum;
      }, 0);
      
      // Check if adding this weight would exceed category total
      if (category.scoringType === 'percentage' && otherSubCriteriaWeight + currentWeight > (category.totalWeight || 0)) {
        const maxAllowedWeight = Math.max(0, (category.totalWeight || 0) - otherSubCriteriaWeight);
        alert(`Warning: Sub-criteria weights cannot exceed category total (${category.totalWeight || 0}%). Maximum allowed weight for this sub-criteria is ${maxAllowedWeight}%.`);
        category.subCriteria[subIndex][field] = maxAllowedWeight;
      } else {
        category.subCriteria[subIndex][field] = currentWeight;
      }
    } else {
      category.subCriteria[subIndex][field] = value;
    }
    
    setSelectedEvent(updatedEvent);
  };

  // Rounds management functions
  const handleRoundChange = (index, field, value) => {
    const updatedEvent = { ...selectedEvent };
    if (!updatedEvent.rounds) {
      updatedEvent.rounds = [];
    }
    updatedEvent.rounds[index][field] = value;
    setSelectedEvent(updatedEvent);
  };

  const handleRoundCriteriaChange = (roundIndex, criteriaIndex, field, value) => {
    const updatedEvent = { ...selectedEvent };
    if (!updatedEvent.rounds || !updatedEvent.rounds[roundIndex].criteria) {
      return;
    }
    
    const round = updatedEvent.rounds[roundIndex];
    
    // Special validation for weight field
    if (field === 'weight') {
      const currentWeight = parseFloat(value) || 0;
      
      // Validate input based on scoring type
      if (updatedEvent.gradingType === 'percentage') {
        // For percentage, only allow 0-100
        if (currentWeight < 0 || currentWeight > 100) {
          alert('Error: Percentage values must be between 0 and 100.');
          return;
        }
      } else {
        // For points, allow any non-negative value
        if (currentWeight < 0) {
          alert('Error: Points values must be 0 or greater.');
          return;
        }
      }
      
      // Calculate total weight of all enabled criteria in this round except current one
      const otherCriteriaWeight = round.criteria.reduce((sum, criterion, i) => {
        if (i !== criteriaIndex && criterion.enabled) {
          return sum + (criterion.weight || 0);
        }
        return sum;
      }, 0);
      
      // Check if adding this weight would exceed 100 (for percentage mode)
      if (updatedEvent.gradingType === 'percentage' && otherCriteriaWeight + currentWeight > 100) {
        // Calculate the maximum allowed weight for this criteria
        const maxAllowedWeight = Math.max(0, 100 - otherCriteriaWeight);
        
        // Show warning and cap the value
        alert(`Warning: Total weight for this round cannot exceed 100%. Maximum allowed weight for this criteria is ${maxAllowedWeight}%.`);
        updatedEvent.rounds[roundIndex].criteria[criteriaIndex][field] = maxAllowedWeight;
      } else {
        updatedEvent.rounds[roundIndex].criteria[criteriaIndex][field] = currentWeight;
      }
    } else {
      updatedEvent.rounds[roundIndex].criteria[criteriaIndex][field] = value;
    }
    
    setSelectedEvent(updatedEvent);
  };

  const addRound = (roundType) => {
    const updatedEvent = { ...selectedEvent };
    if (!updatedEvent.rounds) {
      updatedEvent.rounds = [];
    }
    
    const roundConfig = {
      final: {
        name: 'Final Round',
        description: 'Championship round for top contestants'
      },
      semifinal: {
        name: 'Semifinal Round',
        description: 'Qualifying round before finals'
      }
    };
    
    const config = roundConfig[roundType] || { name: '', description: '' };
    
    updatedEvent.rounds.push({
      name: config.name,
      description: config.description,
      enabled: true,
      criteria: []
    });
    setSelectedEvent(updatedEvent);
  };

  const removeRound = (index) => {
    const updatedEvent = { ...selectedEvent };
    if (updatedEvent.rounds) {
      updatedEvent.rounds.splice(index, 1);
    }
    setSelectedEvent(updatedEvent);
  };

  const addRoundCriteria = (roundIndex) => {
    const updatedEvent = { ...selectedEvent };
    if (!updatedEvent.rounds || !updatedEvent.rounds[roundIndex]) {
      return;
    }
    
    const round = updatedEvent.rounds[roundIndex];
    if (!round.criteria) {
      round.criteria = [];
    }
    
    // Check if scoring type is set to percentage but trying to add criteria
    if (updatedEvent.gradingType === 'percentage') {
      const currentTotal = round.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0);
      
      if (currentTotal >= 100) {
        alert('Cannot add new criteria: Total weight has already reached 100%. Please reduce existing criteria weights or disable some criteria first.');
        return;
      }
      
      // Calculate remaining weight
      const remainingWeight = 100 - currentTotal;
      
      // Create new criteria with appropriate default weight
      round.criteria.push({
        name: '',
        weight: Math.min(10, remainingWeight), // Default to 10% or remaining weight, whichever is smaller
        enabled: true
      });
      
      // Show info about remaining weight
      if (remainingWeight < 10) {
        alert(`Note: Only ${remainingWeight}% weight remaining. New criteria will be set to ${Math.min(10, remainingWeight)}%.`);
      }
    } else {
      // For points mode, just add with default 0 weight
      round.criteria.push({
        name: '',
        weight: 0,
        enabled: true
      });
    }
    
    setSelectedEvent(updatedEvent);
  };

  
  
  const toggleDropdown = (eventId, event) => {
    if (activeDropdown === eventId) {
      setActiveDropdown(null);
      setDropdownButtonRef(null);
    } else {
      setDropdownButtonRef(event.target);
      const rect = event.target.getBoundingClientRect();
      
      // Calculate left position to align with right edge of button
      const dropdownWidth = 192; // w-48 = 12rem = 192px
      const leftPosition = rect.right - dropdownWidth;
      
      // Ensure dropdown stays within viewport
      const finalLeft = Math.max(8, Math.min(leftPosition, window.innerWidth - dropdownWidth - 8));
      
      setDropdownPosition({
        top: rect.bottom + 4,
        left: finalLeft
      });
      setActiveDropdown(eventId);
    }
  };

  // Function to determine if dropdown should appear above
  const isDropdownAbove = () => {
    if (!dropdownButtonRef) return false;
    const rect = dropdownButtonRef.getBoundingClientRect();
    const dropdownHeight = 280; // Estimated dropdown height in pixels
    return rect.bottom + dropdownHeight + 4 > window.innerHeight;
  };

  const closeDropdown = () => {
    setActiveDropdown(null);
  };

  const resetForm = () => {
    setFormData({
      eventName: '',
      eventDescription: '',
      date: '',
      time: '',
      venue: '',
      status: 'upcoming',
      scoresLocked: false
    });
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'upcoming': return 'bg-blue-100 text-blue-800';
      case 'ongoing': return 'bg-green-100 text-green-800';
      case 'finished': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'upcoming': return '📅';
      case 'ongoing': return '🎭';
      case 'finished': return '✅';
      default: return '📋';
    }
  };

  // Check if event is currently ongoing based on schedule
  const isEventCurrentlyOngoing = (event) => {
    const eventDateTime = new Date(`${event.date} ${event.time}`);
    const now = new Date();
    const eventEndTime = new Date(eventDateTime.getTime() + (4 * 60 * 60 * 1000));
    return now >= eventDateTime && now <= eventEndTime;
  };

  return (
    <div className="min-h-screen">
      {/* Mobile Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out lg:hidden ${
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Enhanced Sidebar Header */}
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
            <div className="relative px-4 py-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white drop-shadow-md">Event Management</h2>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="text-white/80 hover:text-white hover:bg-white/20 transition-colors p-2 rounded-lg backdrop-blur-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-emerald-100 text-sm">Create and manage competition events</p>
            </div>
          </div>
          
          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-slate-50 to-white">
            <button
              onClick={() => { setShowAddModal(true); setMobileSidebarOpen(false); }}
              disabled={loading}
              className="w-full flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-3.5 rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed mb-6 touch-manipulation active:scale-95 font-semibold"
            >
              <div className="h-8 w-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <span className="text-lg">➕</span>
              </div>
              <span>{loading ? 'Loading...' : 'Add New Event'}</span>
            </button>
            
            {/* Enhanced Quick Stats */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Quick Stats</p>
            <div className="space-y-3">
              <div className="group bg-white rounded-xl p-3.5 border border-emerald-100 shadow-sm hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                    <span className="text-white text-lg">📋</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Total Events</p>
                    <p className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{events.length}</p>
                  </div>
                </div>
              </div>
              
              <div className="group bg-white rounded-xl p-3.5 border border-blue-100 shadow-sm hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                    <span className="text-white text-lg">🎭</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Ongoing Events</p>
                    <p className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">{events.filter(e => e.status === 'ongoing').length}</p>
                  </div>
                </div>
              </div>
              
              <div className="group bg-white rounded-xl p-3.5 border border-amber-100 shadow-sm hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
                    <span className="text-white text-lg">🔒</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Locked Events</p>
                    <p className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">{events.filter(e => e.scoresLocked).length}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Sidebar Footer */}
          <div className="p-4 border-t border-gray-100 bg-gradient-to-t from-slate-50">
            <button
              onClick={() => { router.push('/admin/dashboard'); setMobileSidebarOpen(false); }}
              className="w-full flex items-center gap-3 text-gray-600 hover:text-emerald-700 px-3 py-2.5 rounded-xl hover:bg-emerald-50 transition-all touch-manipulation active:scale-95"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      
      {/* Main Content */}
      <div className="lg:pl-0">
        {/* Enhanced Desktop Header */}
        <div className="hidden lg:block relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
          <div className="relative p-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white drop-shadow-lg mb-2">📅 Event Management</h2>
                <p className="text-emerald-100">Create and manage competition events</p>
              </div>
              <div className="flex items-center gap-4">
                {/* Live Time Widget */}
                <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-xl border border-white/20 shadow-lg">
                  <div className="text-xs text-emerald-200 font-medium">🕐 Live Time</div>
                  <div className="text-xl font-bold text-white">
                    {currentTime.toLocaleTimeString()}
                  </div>
                  <div className="text-xs text-emerald-200">
                    {currentTime.toLocaleDateString()}
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <button
                    onClick={async () => {
                      if (confirm('This will clean up any judge assignments to deleted events. Continue?')) {
                        const cleanedCount = await cleanupOrphanedAssignments();
                        if (cleanedCount > 0) {
                          alert(`Successfully cleaned up assignments for ${cleanedCount} judges.`);
                        } else {
                          alert('No orphaned assignments found.');
                        }
                      }
                    }}
                    className="px-4 py-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white text-sm rounded-xl transition-all border border-white/30 font-medium"
                    title="Clean up judge assignments to deleted events"
                  >
                    🧹 Cleanup Assignments
                  </button>
                </div>
                
                <button
                  onClick={() => setShowAddModal(true)}
                  disabled={loading}
                  className="flex items-center gap-2 bg-white text-emerald-700 px-6 py-3.5 rounded-xl hover:bg-emerald-50 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold border border-white/50"
                >
                  <span className="text-xl">➕</span>
                  {loading ? 'Loading...' : 'Add Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Enhanced Mobile Header */}
        <div className="lg:hidden relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
          <div className="relative flex items-center justify-between p-4">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2.5 text-white/90 hover:text-white hover:bg-white/20 rounded-xl transition-colors touch-manipulation active:scale-95 backdrop-blur-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-white drop-shadow-md">📅 Events</h1>
            <button
              onClick={() => setShowAddModal(true)}
              disabled={loading}
              className="p-2.5 bg-white text-emerald-600 rounded-xl hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation active:scale-95 shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Enhanced Mobile Time Display */}
        <div className="lg:hidden bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-emerald-100 p-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white">🕐</span>
              </div>
              <div>
                <div className="text-xs text-emerald-600 font-semibold">Live Time</div>
                <div className="text-lg font-bold text-gray-800">
                  {currentTime.toLocaleTimeString()}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-gray-700">
                {currentTime.toLocaleDateString()}
              </div>
              <div className="text-xs text-emerald-600 flex items-center gap-1 justify-end">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                Updates: 30s
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span>{error}</span>
              <button
                onClick={() => setError('')}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
              <span className="text-gray-700">Processing...</span>
            </div>
          </div>
        )}

        {/* Enhanced Events Table */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 mx-4 lg:mx-6 mb-6">
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
            <div className="relative px-4 lg:px-6 py-4 lg:py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg lg:text-xl font-bold text-white drop-shadow-lg flex items-center gap-2">
                    <span>📋</span> Events List
                  </h3>
                  <p className="text-emerald-100 text-xs lg:text-sm mt-1">Manage and track all competition events</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/15 backdrop-blur-sm rounded-lg border border-white/20">
                  <span className="text-white text-sm font-medium">{events.length}</span>
                  <span className="text-emerald-100 text-xs">Total Events</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Enhanced Mobile Card View */}
          <div className="lg:hidden divide-y divide-gray-100">
            {events.map((event) => (
              <div key={event.id} className="p-4 hover:bg-gradient-to-r hover:from-emerald-50/50 hover:to-teal-50/50 transition-all duration-300 group">
                {/* Event Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-lg shadow-md transition-transform duration-300 group-hover:scale-105 ${getStatusColor(event.status)}`}>
                      {getStatusIcon(event.status)}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm group-hover:text-emerald-700 transition-colors">{event.eventName}</h4>
                      <p className="text-xs text-gray-500">ID: #{event.id.toString().padStart(4, '0')}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {event.isLive && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-600 text-white animate-pulse shadow-lg">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                        <span className="relative">🔴 LIVE</span>
                      </span>
                    )}
                    <button
                      onClick={(e) => toggleDropdown(event.id, e)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 touch-manipulation active:scale-95"
                      title="More actions"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* Event Description */}
                <div className="mb-3">
                  <p className="text-xs text-gray-600 line-clamp-2">{event.eventDescription}</p>
                </div>
                
                {/* Enhanced Event Details Grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-2.5 border border-blue-100/50">
                    <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-1 font-medium">
                      <span>📅</span>
                      <span>Date</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900">{event.date}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-2.5 border border-purple-100/50">
                    <div className="flex items-center gap-1.5 text-xs text-purple-600 mb-1 font-medium">
                      <span>🕐</span>
                      <span>Time</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900">{event.time}</p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-2.5 border border-orange-100/50">
                    <div className="flex items-center gap-1.5 text-xs text-orange-600 mb-1 font-medium">
                      <span>📍</span>
                      <span>Venue</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900 truncate">{event.venue}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-2.5 border border-emerald-100/50">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 mb-1 font-medium">
                      <span>📊</span>
                      <span>Status</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full ${getStatusColor(event.status)} shadow-sm`}>
                        <span>{getStatusIcon(event.status)}</span>
                        {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                      </span>
                      {event.isLive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-600 text-white animate-pulse shadow-lg">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                          <span className="relative">🔴 LIVE</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Enhanced Mobile Dropdown Menu */}
                {activeDropdown === event.id && (
                  <div className="pt-3 mt-3 border-t border-gray-200">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { openEditModal(event); closeDropdown(); }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-gray-700 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl hover:from-blue-100 hover:to-indigo-100 transition-all touch-manipulation active:scale-95 shadow-sm"
                      >
                        <span>✏️</span>
                        Edit
                      </button>
                      <button
                        onClick={() => { openCriteriaModal(event); closeDropdown(); }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-gray-700 bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-xl hover:from-purple-100 hover:to-violet-100 transition-all touch-manipulation active:scale-95 shadow-sm"
                      >
                        <span>📋</span>
                        Criteria
                      </button>
                      <button
                        onClick={() => { router.push(`/admin/events/${event.id}/contestants`); closeDropdown(); }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-gray-700 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl hover:from-emerald-100 hover:to-teal-100 transition-all touch-manipulation active:scale-95 shadow-sm"
                      >
                        <span>👥</span>
                        Contestants
                      </button>
                      <button
                        onClick={() => { handleToggleScoresLock(event.id); closeDropdown(); }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-gray-700 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl hover:from-amber-100 hover:to-orange-100 transition-all touch-manipulation active:scale-95 shadow-sm"
                      >
                        <span>{event.scoresLocked ? '🔓' : '🔒'}</span>
                        {event.scoresLocked ? 'Unlock' : 'Lock'}
                      </button>
                      <button
                        onClick={() => { handleDeleteEvent(event.id); closeDropdown(); }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-red-600 bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-xl hover:from-red-100 hover:to-rose-100 transition-all touch-manipulation active:scale-95 shadow-sm"
                      >
                        <span>🗑️</span>
                        Delete
                      </button>
                      <button
                        onClick={() => { router.push(`/admin/scoreboard?eventId=${event.id}`); closeDropdown(); }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 border border-emerald-400 rounded-xl hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 transition-all touch-manipulation active:scale-95 shadow-md col-span-2"
                      >
                        <span>📊</span>
                        View Scoreboard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Enhanced Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Event Details</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Schedule</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gradient-to-r hover:from-emerald-50/40 hover:via-teal-50/40 hover:to-cyan-50/40 transition-all duration-300 group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-xl shadow-md transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${getStatusColor(event.status)}`}>
                          {getStatusIcon(event.status)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{event.eventName}</div>
                          <div className="text-xs text-gray-500 mt-0.5">ID: #{event.id.toString().padStart(4, '0')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="max-w-xs">
                        <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">{event.eventDescription}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100/50 w-fit">
                          <span className="text-blue-500">📅</span>
                          <span className="text-sm font-medium text-gray-800">{event.date}</span>
                        </div>
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-purple-50 to-violet-50 rounded-lg border border-purple-100/50 w-fit">
                          <span className="text-purple-500">🕐</span>
                          <span className="text-sm font-medium text-gray-700">{event.time}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-100/50 w-fit">
                        <span className="text-orange-500">📍</span>
                        <span className="text-sm font-medium text-gray-800">{event.venue}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl ${getStatusColor(event.status)} shadow-sm border`}>
                          <span>{getStatusIcon(event.status)}</span>
                          {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                        </span>
                        {event.isLive && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white animate-pulse shadow-lg">
                            <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                            <span>🔴 LIVE</span>
                          </span>
                        )}
                        {event.scoresLocked && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border border-amber-200">
                            <span>🔒</span>
                            Locked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="relative dropdown-menu">
                        <button
                          onClick={(e) => toggleDropdown(event.id, e)}
                          className="p-2.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all duration-200 touch-manipulation active:scale-95"
                          title="More actions"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>

                        {/* Enhanced Dropdown Menu */}
                        {activeDropdown === event.id && (
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
                              className={`fixed w-52 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-[9999] transition-all duration-200 ${
                                isDropdownAbove() ? 'mb-2' : 'mt-2'
                              }`}
                              style={{
                                top: `${dropdownPosition.top}px`,
                                left: `${dropdownPosition.left}px`
                              }}
                            >
                              <button
                                onClick={() => { openEditModal(event); closeDropdown(); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 flex items-center gap-3 transition-colors"
                              >
                                <span className="text-blue-500">✏️</span>
                                <span className="font-medium">Edit Event</span>
                              </button>
                              <button
                                onClick={() => { openCriteriaModal(event); closeDropdown(); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-violet-50 flex items-center gap-3 transition-colors"
                              >
                                <span className="text-purple-500">📋</span>
                                <span className="font-medium">Manage Criteria</span>
                              </button>
                              <button
                                onClick={() => { router.push(`/admin/events/${event.id}/contestants`); closeDropdown(); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 flex items-center gap-3 transition-colors"
                              >
                                <span className="text-emerald-500">👥</span>
                                <span className="font-medium">Manage Contestants</span>
                              </button>
                              <button
                                onClick={() => { handleToggleScoresLock(event.id); closeDropdown(); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-amber-50 hover:to-orange-50 flex items-center gap-3 transition-colors"
                              >
                                <span className="text-amber-500">{event.scoresLocked ? '🔓' : '🔒'}</span>
                                <span className="font-medium">{event.scoresLocked ? 'Unlock Scores' : 'Lock Scores'}</span>
                              </button>
                              <button
                                onClick={() => { router.push(`/admin/scoreboard?eventId=${event.id}`); closeDropdown(); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 flex items-center gap-3 transition-colors"
                              >
                                <span className="text-cyan-500">📊</span>
                                <span className="font-medium">View Scoreboard</span>
                              </button>
                              <hr className="my-2 border-gray-100" />
                              <button
                                onClick={() => { handleDeleteEvent(event.id); closeDropdown(); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-gradient-to-r hover:from-red-50 hover:to-rose-50 flex items-center gap-3 transition-colors"
                              >
                                <span>🗑️</span>
                                <span className="font-medium">Delete Event</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Enhanced Empty State */}
        {events.length === 0 && (
          <div className="text-center py-12 lg:py-16 mx-4 lg:mx-6">
            <div className="max-w-md mx-auto">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 rounded-full blur-2xl opacity-40 animate-pulse"></div>
                <div className="relative text-6xl lg:text-7xl">📋</div>
              </div>
              <h3 className="text-xl lg:text-2xl font-bold text-gray-900 mb-2">No events yet</h3>
              <p className="text-sm lg:text-base text-gray-500 mb-6 px-4">Create your first event to start managing competitions and scoring</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white px-6 lg:px-8 py-3 lg:py-3.5 rounded-xl hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 transition-all shadow-lg hover:shadow-xl text-sm lg:text-base font-semibold"
              >
                <span>➕</span>
                Add Your First Event
              </button>
            </div>
          </div>
        )}

        {/* Enhanced Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="relative overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
              <div className="relative px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                      <span className="text-3xl">✨</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white drop-shadow-lg">Add New Event</h3>
                      <p className="text-emerald-100 text-sm mt-1">Create a new competition event</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="text-white/80 hover:text-white hover:bg-white/20 transition-all p-2 rounded-xl"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <form onSubmit={(e) => { e.preventDefault(); handleAddEvent(); }} className="space-y-5">
                {error && (
                  <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-700 px-4 py-3.5 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">⚠️</span>
                      </div>
                      <span className="font-medium">{error}</span>
                    </div>
                  </div>
                )}
                
                {/* Event Details Section */}
                <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/50 rounded-xl p-5 border border-emerald-100">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="h-6 w-6 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs">📝</span>
                    </div>
                    Event Details
                  </h4>
                  
                  {/* Event Name */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Event Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="eventName"
                      value={formData.eventName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white"
                      placeholder="Enter event name"
                      required
                    />
                  </div>

                  {/* Event Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Event Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="eventDescription"
                      value={formData.eventDescription}
                      onChange={handleInputChange}
                      rows="3"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white resize-none"
                      placeholder="Describe the event details"
                      required
                    />
                  </div>
                </div>

                {/* Schedule Section */}
                <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-xl p-5 border border-blue-100">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="h-6 w-6 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs">📅</span>
                    </div>
                    Schedule & Location
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Time <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="time"
                        name="time"
                        value={formData.time}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white"
                        required
                      />
                    </div>
                  </div>

                  {/* Venue */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Venue <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="venue"
                      value={formData.venue}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white"
                      placeholder="Enter venue location"
                      required
                    />
                  </div>
                </div>

                {/* Event Status */}
                <div className="bg-gradient-to-br from-purple-50/50 to-violet-50/50 rounded-xl p-5 border border-purple-100">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="h-6 w-6 bg-gradient-to-br from-purple-500 to-violet-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs">📊</span>
                    </div>
                    Event Status
                  </h4>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white"
                  >
                    <option value="upcoming">📅 Upcoming</option>
                    <option value="ongoing">🎭 Ongoing</option>
                    <option value="finished">✅ Finished</option>
                  </select>
                </div>
                
                {/* Form Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white py-3.5 px-6 rounded-xl hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 transition-all font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <span>➕</span>
                          <span>Add Event</span>
                        </>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3.5 px-6 rounded-xl hover:bg-gray-200 transition-all font-semibold border border-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Edit Event Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="relative overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
              <div className="relative px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                      <span className="text-3xl">✏️</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white drop-shadow-lg">Edit Event</h3>
                      <p className="text-blue-100 text-sm mt-1">Update event information</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowEditModal(false); setEditingEvent(null); resetForm(); }}
                    className="text-white/80 hover:text-white hover:bg-white/20 transition-all p-2 rounded-xl"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <form onSubmit={(e) => { e.preventDefault(); handleEditEvent(); }} className="space-y-5">
                {error && (
                  <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-700 px-4 py-3.5 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">⚠️</span>
                      </div>
                      <span className="font-medium">{error}</span>
                    </div>
                  </div>
                )}
                
                {/* Event Details Section */}
                <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-xl p-5 border border-blue-100">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="h-6 w-6 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs">📝</span>
                    </div>
                    Event Details
                  </h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event Name</label>
                      <input
                        type="text"
                        name="eventName"
                        value={formData.eventName}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Event Description</label>
                      <textarea
                        name="eventDescription"
                        value={formData.eventDescription}
                        onChange={handleInputChange}
                        rows="3"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white resize-none"
                        required
                      />
                    </div>
                  </div>
                </div>
                
                {/* Schedule Section */}
                <div className="bg-gradient-to-br from-purple-50/50 to-violet-50/50 rounded-xl p-5 border border-purple-100">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="h-6 w-6 bg-gradient-to-br from-purple-500 to-violet-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs">📅</span>
                    </div>
                    Schedule & Location
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                      <input
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                      <input
                        type="time"
                        name="time"
                        value={formData.time}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Venue</label>
                    <input
                      type="text"
                      name="venue"
                      value={formData.venue}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      required
                    />
                  </div>
                </div>
                
                {/* Status Section */}
                <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/50 rounded-xl p-5 border border-amber-100">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <div className="h-6 w-6 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs">📊</span>
                    </div>
                    Status
                  </h4>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                  >
                    <option value="upcoming">📅 Upcoming</option>
                    <option value="ongoing">🎭 Ongoing</option>
                    <option value="finished">✅ Finished</option>
                  </select>
                </div>
                
                {/* Form Actions */}
                <div className="flex gap-3 pt-5 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-3.5 px-6 rounded-xl hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all font-bold shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        <span>Updating...</span>
                      </div>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <span className="text-lg">💾</span>
                        Update Event
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingEvent(null); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3.5 px-6 rounded-xl hover:bg-gray-200 transition-all font-semibold border border-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Criteria Management Modal */}
      {showCriteriaModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="relative overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
              <div className="relative px-3 sm:px-6 py-3 sm:py-5">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-lg sm:text-2xl">📋</span>
                    </div>
                    <div>
                      <h3 className="text-base sm:text-xl font-bold text-white drop-shadow-lg">
                        Manage Criteria
                      </h3>
                      <p className="text-emerald-100 text-xs sm:text-sm mt-0.5 sm:mt-1 line-clamp-1">Configure criteria for {selectedEvent.eventName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowCriteriaModal(false); setSelectedEvent(null); }}
                    className="text-white/80 hover:text-white hover:bg-white/20 transition-all p-1.5 sm:p-2 rounded-lg sm:rounded-xl"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              
                {/* Instructions - Collapsible on mobile */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2.5 sm:p-4 border border-white/20">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm sm:text-base">💡</span>
                    </div>
                    <div className="text-white min-w-0">
                      <h4 className="font-semibold text-xs sm:text-sm mb-1 sm:mb-2">Scoring System Info</h4>
                      <ul className="text-emerald-100 text-[10px] sm:text-xs space-y-0.5 sm:space-y-1.5">
                        <li className="flex items-start gap-1.5 sm:gap-2"><span className="flex-shrink-0">•</span> <span>Scoring type is determined by the event's grading type</span></li>
                        <li className="flex items-start gap-1.5 sm:gap-2"><span className="flex-shrink-0">•</span> <span>All categories will automatically use the event's scoring type</span></li>
                        <li className="hidden sm:flex items-start gap-2"><span className="flex-shrink-0">•</span> <span>Configure category weights and sub-criteria for each judging category</span></li>
                        <li className="flex items-start gap-1.5 sm:gap-2"><span className="flex-shrink-0">•</span> <span>Percentage mode: Total weights must equal 100%</span></li>
                        <li className="hidden sm:flex items-start gap-2"><span className="flex-shrink-0">•</span> <span>Points mode: No upper limit on point values</span></li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="p-3 sm:p-6 overflow-y-auto flex-1">
              <div className="space-y-4 sm:space-y-6">
                {/* Global Scoring Type Display */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-green-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm sm:text-lg font-semibold text-gray-900">Scoring Type</h4>
                      <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Configure scoring type for this event</p>
                    </div>
                    <div className="flex items-center">
                      <div className="bg-white rounded-lg sm:rounded-xl p-1 sm:p-1.5 shadow-md border border-gray-200 flex w-full sm:w-auto">
                        <button
                          onClick={() => handleGradingTypeChange('percentage')}
                          className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                            selectedEvent.gradingType === 'percentage'
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          📊 <span className="hidden xs:inline">Percentage</span><span className="xs:hidden">%</span>
                        </button>
                        <button
                          onClick={() => handleGradingTypeChange('points')}
                          className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                            selectedEvent.gradingType === 'points'
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          🎯 <span className="hidden xs:inline">Points</span><span className="xs:hidden">Pts</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 sm:mt-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                    <span className="text-xs sm:text-sm text-gray-700">
                      Current: <strong>{selectedEvent.gradingType === 'points' ? 'Points' : 'Percentage'}</strong>
                      <span className="hidden sm:inline">
                        {selectedEvent.gradingType === 'points' 
                          ? ' - Unlimited point values allowed' 
                          : ' - All criteria must total 100%'}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Categories Section */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm sm:text-lg font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
                      <span className="text-sm sm:text-base">📂</span> <span>Categories</span>
                    </h4>
                    <button
                      onClick={addCategory}
                      className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-1 sm:gap-2"
                    >
                      <span className="text-sm sm:text-base">➕</span>
                      <span className="hidden xs:inline">Add Category</span><span className="xs:hidden">Add</span>
                    </button>
                  </div>

                  {selectedEvent.criteriaCategories && selectedEvent.criteriaCategories.length > 0 ? (
                    selectedEvent.criteriaCategories.map((category, categoryIndex) => (
                      <div key={categoryIndex} className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-green-200">
                        <div className="flex items-start sm:items-center justify-between mb-3 sm:mb-4 gap-2">
                          <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0">
                              {categoryIndex + 1}
                            </div>
                            <div className="min-w-0">
                              <h5 className="font-semibold text-gray-900 text-sm sm:text-lg truncate">{category.name || `Category ${categoryIndex + 1}`}</h5>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm text-gray-600">
                                <span className="whitespace-nowrap">
                                  {category.scoringType === 'percentage' ? 'Weight:' : 'Points:'} <span className="font-bold text-green-600">{category.totalWeight || 0}{category.scoringType === 'percentage' ? '%' : 'pts'}</span>
                                </span>
                                <span className="hidden sm:inline text-gray-400">•</span>
                                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  {category.scoringType === 'percentage' ? 'Percentage' : 'Points'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => removeCategory(categoryIndex)}
                            className="p-1.5 sm:p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all duration-200 flex-shrink-0"
                            title="Remove Category"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-4">
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Category Name</label>
                            <input
                              type="text"
                              value={category.name || ''}
                              onChange={(e) => handleCategoryChange(categoryIndex, 'name', e.target.value)}
                              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                              placeholder="e.g., Performance Criteria"
                            />
                          </div>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                              {category.scoringType === 'percentage' ? 'Total Weight (%)' : 'Total Points'}
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              value={category.totalWeight || 0}
                              onChange={(e) => handleCategoryChange(categoryIndex, 'totalWeight', parseFloat(e.target.value) || 0)}
                              className={`w-full px-2.5 sm:px-3 py-1.5 sm:py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all duration-200 ${
                                selectedEvent.gradingType === 'percentage' && selectedEvent.criteriaCategories.reduce((sum, cat) => sum + (cat.totalWeight || 0), 0) > 100
                                  ? 'border-red-300 bg-red-50'
                                  : selectedEvent.gradingType === 'percentage' && selectedEvent.criteriaCategories.reduce((sum, cat) => sum + (cat.totalWeight || 0), 0) === 100
                                  ? 'border-green-300 bg-green-50'
                                  : 'border-gray-300 bg-white'
                              }`}
                              placeholder={selectedEvent.gradingType === 'points' ? '25' : '10'}
                              min="0"
                              max={selectedEvent.gradingType === 'points' ? undefined : '100'}
                            />
                          </div>
                        </div>

                        {/* Sub-criteria for this category */}
                        <div className="space-y-2 sm:space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <h6 className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1 sm:gap-1.5">
                              <span className="text-xs sm:text-sm">📝</span> Sub-Criteria
                            </h6>
                            <button
                              onClick={() => addSubCriteria(categoryIndex)}
                              className="px-2 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-[10px] sm:text-xs font-semibold rounded-md sm:rounded-lg hover:from-teal-600 hover:to-cyan-600 transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-1 sm:gap-1.5"
                            >
                              <span className="text-xs sm:text-sm">➕</span>
                              <span className="hidden xs:inline">Add Sub-Criteria</span><span className="xs:hidden">Add</span>
                            </button>
                          </div>

                          {category.subCriteria && category.subCriteria.map((subCriterion, subIndex) => (
                            <div key={subIndex} className="bg-white rounded-lg p-2 sm:p-3 border border-gray-200">
                              <div className="flex items-center justify-between mb-2 gap-2">
                                <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">
                                  {subCriterion.name || `Sub-Criteria ${subIndex + 1}`}
                                </span>
                                <button
                                  onClick={() => removeSubCriteria(categoryIndex, subIndex)}
                                  className="p-1 sm:p-1.5 text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition-all duration-200 flex-shrink-0"
                                  title="Remove Sub-Criteria"
                                >
                                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                <div>
                                  <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">Sub-Criteria Name</label>
                                  <input
                                    type="text"
                                    value={subCriterion.name || ''}
                                    onChange={(e) => handleSubCriteriaChange(categoryIndex, subIndex, 'name', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-600 focus:border-transparent text-xs"
                                    placeholder="e.g., PERFORMANCE"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                                    {category.scoringType === 'percentage' ? 'Weight (%)' : 'Max Pts'}
                                  </label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={subCriterion.weight || 0}
                                    onChange={(e) => handleSubCriteriaChange(categoryIndex, subIndex, 'weight', parseFloat(e.target.value) || 0)}
                                    className={`w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-600 focus:border-transparent text-xs ${
                                      category.scoringType === 'percentage' && category.subCriteria.reduce((sum, sub) => sum + (sub.weight || 0), 0) > (category.totalWeight || 0)
                                        ? 'border-red-300 bg-red-50'
                                        : category.scoringType === 'percentage' && category.subCriteria.reduce((sum, sub) => sum + (sub.weight || 0), 0) === (category.totalWeight || 0)
                                        ? 'border-green-300 bg-green-50'
                                        : 'border-gray-300 bg-white'
                                    }`}
                                    placeholder={category.scoringType === 'points' ? '10' : '3'}
                                    min="0"
                                    max={category.scoringType === 'points' ? undefined : (category.totalWeight || 0)}
                                  />
                                </div>
                              </div>

                              <div className="mt-1.5 sm:mt-2">
                                <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">Description</label>
                                <textarea
                                  value={subCriterion.description || ''}
                                  onChange={(e) => handleSubCriteriaChange(categoryIndex, subIndex, 'description', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-600 focus:border-transparent text-xs resize-none"
                                  placeholder="e.g., Precision and Coordination, Fluency, Balance..."
                                  rows="2"
                                />
                              </div>

                              <div className="flex items-center mt-1.5 sm:mt-2">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={subCriterion.enabled !== false}
                                    onChange={(e) => handleSubCriteriaChange(categoryIndex, subIndex, 'enabled', e.target.checked)}
                                    className="w-3 h-3 text-green-600 rounded focus:ring-green-500"
                                  />
                                  <span className="ml-1 text-[10px] sm:text-xs text-gray-700">Enabled</span>
                                </label>
                              </div>
                            </div>
                          ))}

                          {(!category.subCriteria || category.subCriteria.length === 0) && (
                            <div className="text-center py-3 sm:py-4 px-2 sm:px-3 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                              <p className="text-xs sm:text-sm text-gray-500">No sub-criteria added yet</p>
                              <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">Tap "Add" to get started</p>
                            </div>
                          )}

                          <div className="bg-green-50 rounded-lg p-2 sm:p-3 border border-green-200">
                            <div className="flex justify-between items-center">
                              <span className="text-xs sm:text-sm font-medium text-green-900">Category Total:</span>
                              <span className={
                                "text-xs sm:text-sm font-bold " + (
                                  (!category.subCriteria || category.subCriteria.length === 0) || 
                                  category.subCriteria.reduce((sum, sub) => sum + (sub.enabled !== false ? sub.weight : 0), 0) === (category.totalWeight || 0)
                                    ? 'text-green-600'
                                    : 'text-orange-600'
                                )
                              }>
                                {(!category.subCriteria || category.subCriteria.length === 0) ? 
                                  (category.totalWeight || 0) + (category.scoringType === 'percentage' ? '%' : 'pts') :
                                  category.subCriteria.reduce((sum, sub) => sum + (sub.enabled !== false ? sub.weight : 0), 0) + (category.scoringType === 'percentage' ? '%' : 'pts')
                                }
                                <span className="text-[10px] sm:text-xs text-gray-600 ml-1">
                                  of {category.totalWeight || 0}{category.scoringType === 'percentage' ? '%' : 'pts'}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 sm:py-8 px-3 sm:px-4 border-2 border-dashed border-gray-300 rounded-lg sm:rounded-xl bg-gray-50">
                      <div className="text-3xl sm:text-4xl mb-2">📋</div>
                      <p className="text-sm sm:text-base text-gray-600 font-medium mb-1">No categories configured</p>
                      <p className="text-xs sm:text-sm text-gray-500">Add categories to structure your criteria</p>
                    </div>
                  )}
                </div>

                {/* Overall Total Weight Display */}
                <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm sm:text-base font-semibold text-green-900">
                      Overall Total {selectedEvent.criteriaCategories && selectedEvent.criteriaCategories[0]?.scoringType === 'points' ? 'Points:' : 'Weight:'}
                    </span>
                    <span className={`font-bold text-base sm:text-lg ${
                      selectedEvent.criteriaCategories ? 
                      selectedEvent.criteriaCategories.reduce((sum, cat) => sum + (cat.totalWeight || 0), 0) === 100
                        ? 'text-green-600'
                        : 'text-red-600'
                      : 'text-red-600'
                    }`}>
                      {selectedEvent.criteriaCategories ? 
                        selectedEvent.criteriaCategories.reduce((sum, cat) => sum + (cat.totalWeight || 0), 0) : 0}
                      {selectedEvent.criteriaCategories && selectedEvent.criteriaCategories[0]?.scoringType === 'points' ? 'pts' : '%'}
                    </span>
                  </div>
                  {selectedEvent.criteriaCategories && 
                   (selectedEvent.gradingType === 'percentage' && selectedEvent.criteriaCategories.reduce((sum, cat) => sum + (cat.totalWeight || 0), 0) !== 100) && (
                    <p className="text-xs sm:text-sm text-red-600 mt-1.5 sm:mt-2">
                      ⚠️ Total weights must equal 100%. Current: {selectedEvent.criteriaCategories.reduce((sum, cat) => sum + (cat.totalWeight || 0), 0)}%
                    </p>
                  )}
                </div>
              </div>

                {/* Rounds Management Section */}
                <div className="border-t border-gray-200 pt-4 sm:pt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-3 sm:mb-4">
                    <div>
                      <h4 className="text-sm sm:text-lg font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
                        <span className="text-sm sm:text-base">🏆</span> Competition Rounds
                      </h4>
                      <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Configure multiple rounds with different criteria</p>
                    </div>
                    <label className="flex items-center cursor-pointer self-start sm:self-auto">
                      <input
                        type="checkbox"
                        checked={selectedEvent.hasRounds || false}
                        onChange={(e) => {
                          const updatedEvent = { ...selectedEvent };
                          updatedEvent.hasRounds = e.target.checked;
                          if (e.target.checked && (!updatedEvent.rounds || updatedEvent.rounds.length === 0)) {
                            // Initialize with empty rounds array - user must add rounds manually
                            updatedEvent.rounds = [];
                          }
                          setSelectedEvent(updatedEvent);
                        }}
                        className="sr-only peer"
                      />
                      <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[&quot;&quot;] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {selectedEvent.hasRounds ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>

                  {selectedEvent.hasRounds && (
                    <div className="space-y-3 sm:space-y-4">
                      {selectedEvent.rounds && selectedEvent.rounds.length > 0 ? (
                        selectedEvent.rounds.map((round, roundIndex) => (
                          <div key={roundIndex} className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200">
                            <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                              <h5 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{round.name || `Round ${roundIndex + 1}`}</h5>
                              <button
                                onClick={() => removeRound(roundIndex)}
                                className="p-1.5 sm:p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all duration-200 flex-shrink-0"
                                title="Remove Round"
                              >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-4">
                              <div>
                                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Round Name</label>
                                <input
                                  type="text"
                                  value={round.name || ''}
                                  onChange={(e) => handleRoundChange(roundIndex, 'name', e.target.value)}
                                  className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-xs sm:text-sm"
                                  placeholder="e.g., Final Round"
                                />
                              </div>
                              <div>
                                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input
                                  type="text"
                                  value={round.description || ''}
                                  onChange={(e) => handleRoundChange(roundIndex, 'description', e.target.value)}
                                  className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-xs sm:text-sm"
                                  placeholder="Brief description"
                                />
                              </div>
                            </div>

                            <div className="space-y-2 sm:space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <h6 className="text-xs sm:text-sm font-medium text-gray-700">Criteria for this Round</h6>
                                <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={round.enabled || false}
                                    onChange={(e) => handleRoundChange(roundIndex, 'enabled', e.target.checked)}
                                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 rounded focus:ring-green-500"
                                  />
                                  <span className="text-xs sm:text-sm font-medium text-gray-700">Enable Round</span>
                                </label>
                              </div>
                              
                              {round.criteria && round.criteria.map((criteria, criteriaIndex) => (
                                <div key={criteriaIndex} className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 items-end bg-white p-2 sm:p-3 rounded-lg border border-gray-100">
                                  <div className="col-span-2">
                                    <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">Criteria Name</label>
                                    <input
                                      type="text"
                                      value={criteria.name || ''}
                                      onChange={(e) => handleRoundCriteriaChange(roundIndex, criteriaIndex, 'name', e.target.value)}
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-600 focus:border-transparent text-xs"
                                      placeholder="Criteria name"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                                      {selectedEvent.gradingType === 'percentage' ? 'Weight' : 'Points'}
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={criteria.weight || 0}
                                      onChange={(e) => handleRoundCriteriaChange(roundIndex, criteriaIndex, 'weight', parseFloat(e.target.value) || 0)}
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-600 focus:border-transparent text-xs"
                                      placeholder="0"
                                      min="0"
                                      max="100"
                                    />
                                  </div>
                                  <div className="flex items-center justify-end sm:justify-start">
                                    <label className="flex items-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={criteria.enabled || false}
                                        onChange={(e) => handleRoundCriteriaChange(roundIndex, criteriaIndex, 'enabled', e.target.checked)}
                                        className="w-3 h-3 text-green-600 rounded focus:ring-green-500"
                                      />
                                      <span className="ml-1 text-[10px] sm:text-xs text-gray-700">On</span>
                                    </label>
                                  </div>
                                </div>
                              ))}
                              
                              {/* Add Criteria Button for Final Round */}
                              <button
                                onClick={() => addRoundCriteria(roundIndex)}
                                className="w-full py-2 sm:py-2.5 px-3 sm:px-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-lg sm:rounded-xl text-emerald-600 hover:from-emerald-100 hover:to-teal-100 hover:border-emerald-400 transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold shadow-sm hover:shadow-md"
                              >
                                <span className="text-sm sm:text-lg">➕</span>
                                <span className="hidden xs:inline">Add Criteria for this Round</span><span className="xs:hidden">Add Criteria</span>
                              </button>
                              
                              <div className="bg-green-50 rounded-lg p-2 sm:p-3 border border-green-200">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs sm:text-sm font-medium text-green-900">
                                    {selectedEvent.gradingType === 'percentage' ? 'Total Weight:' : 'Total Points:'}
                                  </span>
                                  <span className="text-xs sm:text-sm font-bold text-green-600">
                                    {round.criteria ? round.criteria.reduce((sum, c) => sum + (c.enabled ? c.weight : 0), 0) : 0}
                                    {selectedEvent.gradingType === 'percentage' ? '%' : 'pts'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 sm:py-8 px-3 sm:px-4 border-2 border-dashed border-gray-300 rounded-lg sm:rounded-xl bg-gray-50">
                          <div className="text-3xl sm:text-4xl mb-2">🏆</div>
                          <p className="text-sm sm:text-base text-gray-600 font-medium mb-1">No rounds configured</p>
                          <p className="text-xs sm:text-sm text-gray-500">Add rounds to structure your competition</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <button
                          onClick={() => addRound('semifinal')}
                          className="py-2.5 sm:py-3.5 px-2 sm:px-4 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300 rounded-lg sm:rounded-xl text-orange-600 hover:from-orange-100 hover:to-amber-100 hover:border-orange-400 transition-all duration-200 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm font-semibold shadow-sm hover:shadow-md"
                        >
                          <span className="text-base sm:text-xl">🥈</span>
                          <span><span className="hidden sm:inline">Add </span>Semifinal</span>
                        </button>
                        <button
                          onClick={() => addRound('final')}
                          className="py-2.5 sm:py-3.5 px-2 sm:px-4 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-400 rounded-lg sm:rounded-xl text-yellow-700 hover:from-yellow-100 hover:to-amber-100 hover:border-yellow-500 transition-all duration-200 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm font-semibold shadow-sm hover:shadow-md"
                        >
                          <span className="text-base sm:text-xl">🏆</span>
                          <span><span className="hidden sm:inline">Add </span>Final</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                
              {/* Form Actions */}
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4 sm:pt-5 border-t border-gray-200 mt-4 sm:mt-6">
                <button
                  onClick={() => { setShowCriteriaModal(false); setSelectedEvent(null); }}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 sm:py-3.5 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:bg-gray-200 transition-all duration-200 text-sm sm:text-base font-semibold border border-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCriteria}
                  className="flex-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white py-2.5 sm:py-3.5 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 transition-all duration-200 text-sm sm:text-base font-bold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                >
                  <span className="flex items-center justify-center gap-1.5 sm:gap-2">
                    <span className="text-base sm:text-lg">💾</span>
                    Save Criteria
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}
