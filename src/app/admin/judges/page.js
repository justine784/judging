'use client';



import { useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

import { doc, setDoc, getDocs, collection, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';



export default function JudgeManagement() {

  const [judges, setJudges] = useState([]);

  const [showAddModal, setShowAddModal] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);

  const [showAssignModal, setShowAssignModal] = useState(false);

  const [showEventAssignModal, setShowEventAssignModal] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const [selectedJudge, setSelectedJudge] = useState(null);

  const [events, setEvents] = useState([]);

  const [eventAssignment, setEventAssignment] = useState({});

  const [criteriaAssignment, setCriteriaAssignment] = useState({});

  const [editingJudge, setEditingJudge] = useState(null);

  const [activeDropdown, setActiveDropdown] = useState(null);

  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const router = useRouter();



  // Form state

  const [formData, setFormData] = useState({

    judgeName: '',

    email: '',

    password: '',

    confirmPassword: '',

    assignedCategory: '',

    status: 'active'

  });



  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');



















  // Load judges from Firestore on component mount

  useEffect(() => {

    loadJudges();

    loadEvents();

  }, []);



  // Clear error when modals are closed

  useEffect(() => {

    if (!showAddModal && !showEditModal && !showEventAssignModal && !showPasswordModal && !showDeleteModal && !showSubmitModal) {

      setError('');

    }

  }, [showAddModal, showEditModal, showEventAssignModal, showPasswordModal, showDeleteModal, showSubmitModal]);



  const loadJudges = async () => {

    try {

      console.log('Loading judges from Firestore...');

      const judgesCollection = collection(db, 'judges');

      const judgesSnapshot = await getDocs(judgesCollection);

      const judgesList = judgesSnapshot.docs.map(doc => ({

        id: doc.id,

        uid: doc.id,

        ...doc.data()

      }));

      console.log('Judges loaded from Firestore:', judgesList);

      setJudges(judgesList);

    } catch (error) {

      console.error('Error loading judges:', error);

      setError('Failed to load judges from database. Please refresh the page.');

      // If there's an error, set empty array instead of sample data

      setJudges([]);

    }

  };



  const loadEvents = async () => {

    try {

      // Load events from Firestore

      const eventsCollection = collection(db, 'events');

      const eventsSnapshot = await getDocs(eventsCollection);

      const eventsList = eventsSnapshot.docs.map(doc => ({

        id: doc.id,

        ...doc.data()

      }));

      setEvents(eventsList);

    } catch (error) {

      console.error('Error loading events:', error);

      // Fallback to sample data if Firestore fails

      const sampleEvents = [

        {

          id: 'sample-1',

          eventName: 'Grand Vocal Showdown 2026',

          eventDescription: 'Annual singing competition featuring best vocal talents in Bongabong',

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

        {

          id: 'sample-2',

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

        {

          id: 'sample-3',

          eventName: 'Acoustic Night 2025',

          eventDescription: 'Intimate acoustic performance showcase',

          date: '2025-12-20',

          time: '5:00 PM',

          venue: 'Coffee House Lounge',

          status: 'completed',

          scoresLocked: true,

          criteria: [

            { name: 'Musicality', weight: 40, enabled: true },

            { name: 'Performance', weight: 35, enabled: true },

            { name: 'Song Choice', weight: 25, enabled: true }

          ]

        }

      ];

      setEvents(sampleEvents);

    }

  };



  const handleInputChange = (e) => {

    const { name, value } = e.target;

    setFormData(prev => ({

      ...prev,

      [name]: value

    }));

  };



  const handleCriteriaChange = (criteria) => {

    setCriteriaAssignment(prev => ({

      ...prev,

      [criteria]: !prev[criteria]

    }));

  };



  const handleAddJudge = async () => {

    console.log('Form data before adding judge:', formData);

    

    // Validate judge name

    if (!formData.judgeName || formData.judgeName.trim() === '') {

      setError('Judge name is required');

      return;

    }

    

    if (formData.password !== formData.confirmPassword) {

      setError('Passwords do not match');

      return;

    }



    if (formData.password.length < 6) {

      setError('Password must be at least 6 characters long');

      return;

    }



    setLoading(true);

    setError('');



    try {

      // First check if a judge with this email already exists in Firestore

      const judgesCollection = collection(db, 'judges');

      const judgesSnapshot = await getDocs(judgesCollection);

      const existingJudge = judgesSnapshot.docs.find(doc => 

        doc.data().email === formData.email

      );

      

      if (existingJudge) {

        setError('A judge with this email already exists. Please use a different email or update the existing judge.');

        return;

      }

      

      // Set a temporary flag to prevent layout redirect during judge creation

      if (typeof window !== 'undefined') {

        window.creatingJudge = true;

        // Auto-clear the flag after 10 seconds as a safety measure

        setTimeout(() => {

          window.creatingJudge = false;

        }, 10000);

      }

      

      // Try to create Firebase user

      let user;

      try {

        const userCredential = await createUserWithEmailAndPassword(

          auth,

          formData.email,

          formData.password

        );

        user = userCredential.user;

      } catch (authError) {

        if (authError.code === 'auth/email-already-in-use') {

          // Email exists in Firebase Auth but not in our judges collection

          // This means it's likely an admin user or orphaned account

          setError('This email is already registered in the system. It may be an admin account or a previously deleted judge account. Please use a different email.');

          return;

        } else {

          throw authError; // Re-throw other auth errors

        }

      }

      

      // Get all existing events to assign to the new judge

      const eventsCollection = collection(db, 'events');

      const eventsSnapshot = await getDocs(eventsCollection);

      const allEvents = eventsSnapshot.docs.map(doc => doc.id);

      

      // Store judge data in Firestore

      const judgeData = {

        uid: user.uid,

        judgeName: formData.judgeName.trim(), // Ensure no whitespace

        email: formData.email,

        status: formData.status,

        submissionStatus: 'not-started',

        criteria: [],

        assignedEvents: allEvents, // Automatically assign to all existing events

        createdAt: new Date().toISOString(),

        role: 'judge'

      };

      

      console.log('Judge data being saved to Firestore:', judgeData);

      

      await setDoc(doc(db, 'judges', user.uid), judgeData);

      

      console.log('Judge successfully saved to Firestore');

      

      // Clear the temporary flag immediately after successful creation

      if (typeof window !== 'undefined') {

        window.creatingJudge = false;

      }

      

      // Refresh judges list from Firestore

      await loadJudges();

      

      setShowAddModal(false);

      resetForm();

      

      alert(`Judge ${formData.judgeName} has been added successfully!\n\nLogin credentials:\nEmail: ${formData.email}\nPassword: ${formData.password}\n\nThe judge has been automatically assigned to all existing events and can now view contestants.`);

    } catch (error) {

      console.error('Error adding judge:', error);

      // Clear the temporary flag on error

      if (typeof window !== 'undefined') {

        window.creatingJudge = false;

      }

      if (error.code === 'auth/weak-password') {

        setError('Password is too weak. Please choose a stronger password.');

      } else if (error.code === 'auth/invalid-email') {

        setError('Invalid email address. Please check the email format.');

      } else if (error.code === 'auth/network-request-failed') {

        setError('Network error. Please check your internet connection and try again.');

      } else {

        setError('Failed to add judge. Please try again. Error: ' + error.message);

      }

    } finally {

      setLoading(false);

    }

  };



  const handleEditJudge = async () => {

    if (!editingJudge) return;

    

    setLoading(true);

    setError('');

    

    try {

      // Update judge data in Firestore

      const judgeRef = doc(db, 'judges', editingJudge.uid);

      await updateDoc(judgeRef, {

        judgeName: formData.judgeName,

        email: formData.email,

        assignedCategory: formData.assignedCategory,

        status: formData.status

      });

      

      // Refresh judges list from Firestore

      await loadJudges();

      

      setShowEditModal(false);

      setEditingJudge(null);

      resetForm();

      

      alert(`Judge ${formData.judgeName} has been updated successfully!`);

    } catch (error) {

      console.error('Error updating judge:', error);

      setError('Failed to update judge. Please try again.');

    } finally {

      setLoading(false);

    }

  };



  const handleToggleStatus = async (judgeId) => {

  const judge = judges.find(j => j.id === judgeId);

  if (!judge) return;

  

  const newStatus = judge.status === 'active' ? 'inactive' : 'active';

  

  try {

    // Update status in Firestore

    const judgeRef = doc(db, 'judges', judge.uid || judge.id);

    await updateDoc(judgeRef, { status: newStatus });

    

    // Refresh judges list from Firestore

    await loadJudges();

  } catch (error) {

    console.error('Error updating judge status:', error);

    setError('Failed to update judge status. Please try again.');

  }

};



  const handleAssignCriteria = async () => {

  if (!selectedJudge) return;

  const assignedCriteria = Object.keys(criteriaAssignment).filter(key => criteriaAssignment[key]);

  

  try {

    // Update criteria in Firestore

    const judgeRef = doc(db, 'judges', selectedJudge.uid);

    await updateDoc(judgeRef, { criteria: assignedCriteria });

    

    // Refresh judges list from Firestore

    await loadJudges();

    



    setSelectedJudge(null);



    



  } catch (error) {

    console.error('Error assigning criteria:', error);



  }

};



  const handleEventChange = (eventId) => {

    setEventAssignment(prev => ({

      ...prev,

      [eventId]: !prev[eventId]

    }));

  };



  const handleAssignEvents = async () => {

    if (!selectedJudge) return;

    const assignedEventIds = Object.keys(eventAssignment).filter(key => eventAssignment[key]);

    

    try {

      // Update assigned events in Firestore

      const judgeRef = doc(db, 'judges', selectedJudge.uid);

      await updateDoc(judgeRef, { assignedEvents: assignedEventIds });

      

      // Refresh judges list from Firestore

      await loadJudges();

      

      setShowEventAssignModal(false);

      setSelectedJudge(null);

      resetEventAssignment();

      

      alert(`Events assigned successfully to ${selectedJudge.judgeName}!`);

    } catch (error) {

      console.error('Error assigning events:', error);

      setError('Failed to assign events. Please try again.');

    }

  };



  const openEventAssignModal = (judge) => {

    setSelectedJudge(judge);

    // Set current event assignments

    const currentAssignments = {};

    if (judge.assignedEvents) {

      judge.assignedEvents.forEach(eventId => {

        currentAssignments[eventId] = true;

      });

    }

    setEventAssignment(currentAssignments);

    setShowEventAssignModal(true);

  };



  const resetEventAssignment = () => {

    setEventAssignment({});

  };



  const handleResetPassword = () => {

    if (!selectedJudge) return;

    // In a real app, this would send a password reset email

    alert(`Password reset email sent to ${selectedJudge.email}`);

    setShowPasswordModal(false);

    setSelectedJudge(null);

  };



  const handleDeleteJudge = async () => {

    if (!selectedJudge) return;

    

    if (!confirm(`Are you sure you want to delete ${selectedJudge.judgeName}? This will remove their account from the database.`)) {

      return;

    }

    

    try {

      // Call the API endpoint to delete the judge

      const response = await fetch('/api/admin/delete-judge', {

        method: 'DELETE',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          judgeId: selectedJudge.uid

        })

      });

      

      const result = await response.json();

      

      if (!response.ok) {

        throw new Error(result.error || 'Failed to delete judge');

      }

      

      // Refresh judges list from Firestore

      await loadJudges();

      setShowDeleteModal(false);

      setSelectedJudge(null);

      

      alert(result.message || 'Judge deleted successfully!');

    } catch (error) {

      console.error('Error deleting judge:', error);

      

      // If API call fails, try direct Firestore deletion as fallback

      if (error.message.includes('Failed to fetch')) {

        try {

          await deleteDoc(doc(db, 'judges', selectedJudge.uid));

          await loadJudges();

          setShowDeleteModal(false);

          setSelectedJudge(null);

          

          alert(`Judge ${selectedJudge.judgeName} has been deleted from the database.\n\nNote: You may need to manually delete their Firebase Authentication account from the Firebase Console.`);

          return;

        } catch (fallbackError) {

          alert(`Failed to delete judge: ${fallbackError.message}`);

          return;

        }

      }

      

      alert(`Failed to delete judge: ${error.message}`);

    }

  };



  const openEditModal = (judge) => {

    setEditingJudge(judge);

    setFormData({

      judgeName: judge.judgeName,

      email: judge.email,

      assignedCategory: judge.assignedCategory || '',

      status: judge.status

    });

    setShowEditModal(true);

  };



  const openAssignModal = (judge) => {

    setSelectedJudge(judge);

    // Set current criteria assignments

    const currentCriteria = {

      vocalQuality: judge.criteria.includes('vocalQuality'),

      stagePresence: judge.criteria.includes('stagePresence'),

      songInterpretation: judge.criteria.includes('songInterpretation'),

      audienceImpact: judge.criteria.includes('audienceImpact')

    };

    setCriteriaAssignment(currentCriteria);



  };



  const openPasswordModal = (judge) => {

    setSelectedJudge(judge);

    setShowPasswordModal(true);

  };



  const handleSubmitScores = async () => {

    if (!selectedJudge) return;

    

    if (!confirm(`Are you sure you want to submit scores for ${selectedJudge.judgeName}? This will update their submission status to 'completed'.`)) {

      return;

    }

    

    try {

      // Update submission status in Firestore

      const judgeRef = doc(db, 'judges', selectedJudge.uid);

      await updateDoc(judgeRef, { 

        submissionStatus: 'completed',

        submittedAt: new Date().toISOString()

      });

      

      // Refresh judges list from Firestore

      await loadJudges();

      setShowSubmitModal(false);

      setSelectedJudge(null);

      

      alert(`Scores submitted successfully for ${selectedJudge.judgeName}!`);

    } catch (error) {

      console.error('Error submitting scores:', error);

      setError('Failed to submit scores. Please try again.');

    }

  };



  const openSubmitModal = (judge) => {

    setSelectedJudge(judge);

    setShowSubmitModal(true);

  };



  const openDeleteModal = (judge) => {

    setSelectedJudge(judge);

    setShowDeleteModal(true);

  };



  const toggleDropdown = (judgeId, event) => {

    if (activeDropdown === judgeId) {

      setActiveDropdown(null);

    } else {

      const rect = event.target.getBoundingClientRect();

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      

      setDropdownPosition({

        top: rect.bottom + scrollTop + 4,

        right: window.innerWidth - rect.right - scrollLeft + 4

      });

      

      setActiveDropdown(judgeId);

    }

  };



  const closeDropdown = () => {

    setActiveDropdown(null);

  };



  const resetForm = () => {

    setFormData({

      judgeName: '',

      email: '',

      password: '',

      confirmPassword: '',

      assignedCategory: '',

      status: 'active'

    });

    

    setError('');

  };



  const resetCriteriaAssignment = () => {

    setCriteriaAssignment({

      criteria1: '',

      criteria2: '',

      criteria3: '',

      criteria4: '',

      criteria5: ''

    });

  };



  const getStatusColor = (status) => {

    return status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';

  };



  const getSubmissionStatusColor = (status) => {

    switch(status) {

      case 'completed': return 'bg-blue-100 text-blue-800';

      case 'in-progress': return 'bg-yellow-100 text-yellow-800';

      case 'pending': return 'bg-orange-100 text-orange-800';

      case 'not-started': return 'bg-gray-100 text-gray-800';

      default: return 'bg-gray-100 text-gray-800';

    }

  };



  const getCriteriaLabel = (criteria) => {

    const labels = {

      vocalQuality: 'Vocal Quality',

      stagePresence: 'Stage Presence',

      songInterpretation: 'Song Interpretation',

      audienceImpact: 'Audience Impact'

    };

    return labels[criteria] || criteria;

  };



  const getEventNames = (assignedEvents) => {

    if (!assignedEvents || assignedEvents.length === 0) {

      return [];

    }

    

    return assignedEvents.map(eventId => {

      const event = events.find(e => e.id === eventId);

      return event ? event.eventName : `Event ${eventId}`;

    });

  };



  return (

    <div className="p-6">

      {/* Page Header */}

      <div className="flex justify-between items-center mb-8">

        <div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">Judge Management</h1>

          <p className="text-gray-600">Manage judge accounts and assignments</p>

        </div>

        <button

          onClick={() => setShowAddModal(true)}

          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-lg"

        >

          <span className="text-xl">➕</span>

          Add Judge

        </button>

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



      {/* Judges Table */}

      <div className="bg-white rounded-xl shadow-md overflow-hidden">

        <div className="overflow-x-auto lg:overflow-hidden">

          <table className="w-full min-w-[600px] lg:min-w-full">

            <thead className="bg-gray-50 border-b">

              <tr>

                <th className="px-3 lg:px-6 py-2 lg:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16 lg:w-auto">Name</th>

                <th className="px-3 lg:px-6 py-2 lg:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20 lg:w-auto">Email</th>

                <th className="px-3 lg:px-6 py-2 lg:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16 lg:w-auto">Status</th>

                <th className="px-3 lg:px-6 py-2 lg:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 lg:w-auto">Assigned Events</th>

                <th className="px-3 lg:px-6 py-2 lg:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20 lg:w-auto">Actions</th>

              </tr>

            </thead>

            <tbody className="bg-white divide-y divide-gray-200">

              {judges.map((judge) => (

                <tr key={judge.id} className="hover:bg-gray-50">

                  <td className="px-3 lg:px-6 py-2 lg:py-4 text-xs lg:text-sm font-medium text-gray-900 truncate max-w-[100px] lg:max-w-none">{judge.judgeName}</td>

                  <td className="px-3 lg:px-6 py-2 lg:py-4 text-xs lg:text-sm text-gray-900 truncate max-w-[120px] lg:max-w-none">{judge.email}</td>

                  <td className="px-3 lg:px-6 py-2 lg:py-4">

                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(judge.status)}`}>

                      <span className="hidden lg:inline">{judge.status || 'Active'}</span>

                      <span className="lg:hidden">{(judge.status || 'Active').substring(0, 8)}...</span>

                    </span>

                  </td>

                  <td className="px-3 lg:px-6 py-2 lg:py-4 text-xs lg:text-sm text-gray-900">

                    {judge.assignedEvents && judge.assignedEvents.length > 0 ? (

                      <div className="flex flex-wrap gap-1 max-w-[150px] lg:max-w-none">

                        {getEventNames(judge.assignedEvents).map((eventName, index) => (

                              <span

                                key={index}

                                className="inline-flex items-center px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs"

                              >

                                {eventName.length > 12 ? `${eventName.substring(0, 12)}...` : eventName}

                              </span>

                            ))}

                      </div>

                    ) : (

                      <span className="text-gray-500">No assigned events</span>

                    )}

                  </td>

                  <td className="px-3 lg:px-6 py-2 lg:py-4">

                    <button

                      onClick={(e) => openDropdown(e, judge.id)}

                      className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"

                    >

                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">

                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>

                      </svg>

                    </button>

                    {activeDropdown === judge.id && (

                      <div 

                        className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-[9999]"

                        style={{

                            top: `${dropdownPosition.top}px`,

                            right: `${dropdownPosition.right}px`

                          }}

                        >

                          <button

                            onClick={() => { openEditModal(judge); closeDropdown(); }}

                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"

                          >

                            <span>✏️</span>

                            <span>Edit Judge</span>

                          </button>

                          <button

                            onClick={() => { openEventAssignModal(judge); closeDropdown(); }}

                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"

                          >

                            <span>🎯</span>

                            <span>Assign Event</span>

                          </button>

                          <button

                            onClick={() => { openPasswordModal(judge); closeDropdown(); }}

                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"

                          >

                            <span>🔑</span>

                            <span>Reset Password</span>

                          </button>

                          <div className="border-t border-gray-200"></div>

                          <button

                            onClick={() => { openSubmitModal(judge); closeDropdown(); }}

                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"

                          >

                            <span>📤</span>

                            <span>Submit Scores</span>

                          </button>

                          <div className="border-t border-gray-200"></div>

                          <button

                            onClick={() => { openDeleteModal(judge); closeDropdown(); }}

                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"

                          >

                            <span>🗑️</span>

                            <span>Delete Judge</span>

                          </button>

                          <div className="border-t border-gray-200"></div>

                            <button

                            onClick={() => { handleToggleStatus(judge.id); closeDropdown(); }}

                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"

                          >

                            <span>{judge.status === 'active' ? '🔒' : '🔓'}</span>

                            <span>{judge.status === 'active' ? 'Disable Judge' : 'Enable Judge'}</span>

                          </button>

                        </div>

                    )}

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>



      {/* Empty State */}

      {judges.length === 0 && (

        <div className="text-center py-12">

          <div className="text-6xl mb-4">🧑‍⚖️</div>

          <h3 className="text-lg font-medium text-gray-900 mb-2">No judges yet</h3>

          <p className="text-gray-500 mb-4">Add your first judge to get started</p>

          <button

            onClick={() => setShowAddModal(true)}

            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"

          >

            Add Judge

          </button>

        </div>

      )}



      {/* Add Judge Modal */}

      {showAddModal && (

        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

          <div className="bg-white rounded-lg p-6 w-full max-w-md">

            <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Judge</h3>

            <form onSubmit={(e) => { e.preventDefault(); handleAddJudge(); }} className="space-y-4">

              {error && (

                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">

                  {error}

                </div>

              )}

              

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Judge Name</label>

                <input

                  type="text"

                  name="judgeName"

                  value={formData.judgeName}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                  placeholder="Enter judge's full name"

                  required

                />

              </div>

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>

                <input

                  type="email"

                  name="email"

                  value={formData.email}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                  required

                  disabled={loading}

                />

              </div>

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>

                <input

                  type="password"

                  name="password"

                  value={formData.password}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                  required

                  minLength="6"

                  placeholder="At least 6 characters"

                  disabled={loading}

                />

              </div>

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>

                <input

                  type="password"

                  name="confirmPassword"

                  value={formData.confirmPassword}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                  required

                  minLength="6"

                  placeholder="Re-enter password"

                  disabled={loading}

                />

              </div>

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>

                <select

                  name="status"

                  value={formData.status}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                >

                  <option value="active">Active</option>

                  <option value="inactive">Inactive</option>

                </select>

              </div>

              <div className="flex gap-3">

                <button

                  type="submit"

                  disabled={loading}

                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

                >

                  {loading ? 'Adding Judge...' : 'Add Judge'}

                </button>

                <button

                  type="button"

                  onClick={() => { setShowAddModal(false); resetForm(); }}

                  disabled={loading}

                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

                >

                  Cancel

                </button>

              </div>

            </form>

          </div>

        </div>

      )}



      {/* Edit Judge Modal */}

      {showEditModal && (

        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

          <div className="bg-white rounded-lg p-6 w-full max-w-md">

            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Judge</h3>

            <form onSubmit={(e) => { e.preventDefault(); handleEditJudge(); }} className="space-y-4">

              {error && (

                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">

                  {error}

                </div>

              )}

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Judge Name</label>

                <input

                  type="text"

                  name="judgeName"

                  value={formData.judgeName}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                  required

                />

              </div>

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>

                <input

                  type="email"

                  name="email"

                  value={formData.email}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                  required

                />

              </div>

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Category</label>

                <select

                  name="assignedCategory"

                  value={formData.assignedCategory}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                  required

                >

                  <option value="Vocal Quality">Vocal Quality</option>

                  <option value="Stage Presence">Stage Presence</option>

                  <option value="Song Interpretation">Song Interpretation</option>

                  <option value="Audience Impact">Audience Impact</option>

                  <option value="Overall Performance">Overall Performance</option>

                </select>

              </div>

              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>

                <select

                  name="status"

                  value={formData.status}

                  onChange={handleInputChange}

                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"

                >

                  <option value="active">Active</option>

                  <option value="inactive">Inactive</option>

                </select>

              </div>

              <div className="flex gap-3">

                <button

                  type="submit"

                  disabled={loading}

                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

                >

                  {loading ? 'Updating Judge...' : 'Update Judge'}

                </button>

                <button

                  type="button"

                  onClick={() => { setShowEditModal(false); setEditingJudge(null); resetForm(); }}

                  disabled={loading}

                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

                >

                  Cancel

                </button>

              </div>

            </form>

          </div>

        </div>

      )}



      {/* Assign Criteria Modal */}

      {showAssignModal && selectedJudge && (

        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

          <div className="bg-white rounded-lg p-6 w-full max-w-md">

            <h3 className="text-xl font-bold text-gray-900 mb-4">Assign Criteria - {selectedJudge.judgeName}</h3>

            <form onSubmit={(e) => { e.preventDefault(); handleAssignCriteria(); }} className="space-y-4">

              <div className="space-y-3">

                <label className="flex items-center gap-2">

                  <input

                    type="checkbox"

                    checked={criteriaAssignment.vocalQuality || false}

                    onChange={() => handleCriteriaChange('vocalQuality')}

                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"

                  />

                  <span>Vocal Quality</span>

                </label>

                <label className="flex items-center gap-2">

                  <input

                    type="checkbox"

                    checked={criteriaAssignment.stagePresence || false}

                    onChange={() => handleCriteriaChange('stagePresence')}

                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"

                  />

                  <span>Stage Presence</span>

                </label>

                <label className="flex items-center gap-2">

                  <input

                    type="checkbox"

                    checked={criteriaAssignment.songInterpretation || false}

                    onChange={() => handleCriteriaChange('songInterpretation')}

                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"

                  />

                  <span>Song Interpretation</span>

                </label>

                <label className="flex items-center gap-2">

                  <input

                    type="checkbox"

                    checked={criteriaAssignment.audienceImpact || false}

                    onChange={() => handleCriteriaChange('audienceImpact')}

                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"

                  />

                  <span>Audience Impact</span>

                </label>

              </div>

              <div className="flex gap-3">

                <button

                  type="submit"

                  disabled={loading}

                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

                >

                  {loading ? 'Assigning...' : 'Assign Criteria'}

                </button>

                <button

                  type="button"

                  onClick={() => { setShowAssignModal(false); setSelectedJudge(null); resetCriteriaAssignment(); }}

                  disabled={loading}

                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

                >

                  Cancel

                </button>

              </div>

            </form>

          </div>

        </div>

      )}



      {/* Event Assignment Modal */}

      {showEventAssignModal && selectedJudge && (

        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

          <div className="bg-white rounded-lg p-6 w-full max-w-md">

            <h3 className="text-xl font-bold text-gray-900 mb-4">Assign Events - {selectedJudge.judgeName}</h3>

            <div className="space-y-3 max-h-96 overflow-y-auto">

              {events.length > 0 ? (

                events.map((event) => (

                  <label key={event.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">

                    <input

                      type="checkbox"

                      checked={eventAssignment[event.id] || false}

                      onChange={() => handleEventChange(event.id)}

                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"

                    />

                    <div className="flex-1">

                      <div className="font-medium text-gray-900">{event.eventName}</div>

                      <div className="flex items-center gap-2 mt-1">

                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${

                          event.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :

                          event.status === 'ongoing' ? 'bg-yellow-100 text-yellow-800' :

                          event.status === 'completed' ? 'bg-green-100 text-green-800' :

                          'bg-gray-100 text-gray-800'

                        }`}>

                          {event.status.charAt(0).toUpperCase() + event.status.slice(1)}

                        </span>

                        {event.scoresLocked && (

                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">

                            Scores Locked

                          </span>

                        )}

                      </div>

                    </div>

                  </label>

                ))

              ) : (

                <div className="text-center py-8">

                  <p className="text-gray-500">No events available</p>

                </div>

              )}

            </div>

            <div className="flex gap-3 mt-4">

              <button

                onClick={handleAssignEvents}

                disabled={loading}

                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

              >

                {loading ? 'Assigning...' : 'Assign Events'}

              </button>

              <button

                onClick={() => { setShowEventAssignModal(false); setSelectedJudge(null); resetEventAssignment(); }}

                disabled={loading}

                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

              >

                Cancel

              </button>

            </div>

          </div>

        </div>

      )}



      {/* Reset Password Modal */}

      {showPasswordModal && selectedJudge && (

        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

          <div className="bg-white rounded-lg p-6 w-full max-w-md">

            <h3 className="text-xl font-bold text-gray-900 mb-4">Reset Password</h3>

            <div className="mb-6">

              <p className="text-gray-600 mb-4">

                Are you sure you want to reset the password for:

              </p>

              <div className="bg-gray-50 p-4 rounded-lg">

                <div className="font-medium text-gray-900">{selectedJudge.judgeName}</div>

                <div className="text-sm text-gray-500">{selectedJudge.email}</div>

              </div>

              <p className="text-sm text-gray-500 mt-4">

                A password reset link will be sent to the judge's email address.

              </p>

            </div>

            <div className="flex gap-3">

              <button

                onClick={handleResetPassword}

                disabled={loading}

                className="flex-1 bg-orange-600 text-white py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

              >

                {loading ? 'Sending...' : 'Send Reset Email'}

              </button>

              <button

                onClick={() => { setShowPasswordModal(false); setSelectedJudge(null); }}

                disabled={loading}

                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

              >

                Cancel

              </button>

            </div>

          </div>

        </div>

      )}



      {/* Submit Scores Modal */}

      {showSubmitModal && selectedJudge && (

        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

          <div className="bg-white rounded-lg p-6 w-full max-w-md">

            <div className="flex items-center gap-3 mb-4">

              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">

                <span className="text-2xl">📤</span>

              </div>

              <h3 className="text-xl font-bold text-gray-900">Submit Scores</h3>

            </div>

            <div className="mb-6">

              <p className="text-gray-600 mb-4">

                Are you sure you want to submit scores for this judge? This will update their submission status to 'completed'.

              </p>

              <div className="bg-green-50 border border-green-200 p-4 rounded-lg">

                <div className="font-medium text-gray-900">{selectedJudge.judgeName}</div>

                <div className="text-sm text-gray-500">{selectedJudge.email}</div>

                <div className="text-sm text-gray-500 mt-1">Current Status: {selectedJudge.submissionStatus || 'not-started'}</div>

              </div>

              <p className="text-sm text-green-600 mt-4">

                ✅ This action will mark the judge's scores as submitted to the admin.

              </p>

            </div>

            <div className="flex gap-3">

              <button

                onClick={handleSubmitScores}

                disabled={loading}

                className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

              >

                {loading ? 'Submitting...' : 'Submit Scores'}

              </button>

              <button

                onClick={() => { setShowSubmitModal(false); setSelectedJudge(null); }}

                disabled={loading}

                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

              >

                Cancel

              </button>

            </div>

          </div>

        </div>

      )}



      {/* Delete Judge Modal */}

      {showDeleteModal && selectedJudge && (

        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

          <div className="bg-white rounded-lg p-6 w-full max-w-md">

            <div className="flex items-center gap-3 mb-4">

              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">

                <span className="text-2xl">⚠️</span>

              </div>

              <h3 className="text-xl font-bold text-gray-900">Delete Judge</h3>

            </div>

            <div className="mb-6">

              <p className="text-gray-600 mb-4">

                Are you sure you want to delete this judge? This action cannot be undone.

              </p>

              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">

                <div className="font-medium text-gray-900">{selectedJudge.judgeName}</div>

                <div className="text-sm text-gray-500">{selectedJudge.email}</div>

                <div className="text-sm text-gray-500 mt-1">Category: {selectedJudge.assignedCategory}</div>

              </div>

              <p className="text-sm text-red-600 mt-4">

                ⚠️ All judge data and assignments will be permanently removed.

              </p>

            </div>

            <div className="flex gap-3">

              <button

                onClick={handleDeleteJudge}

                disabled={loading}

                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

              >

                {loading ? 'Deleting...' : 'Delete Judge'}

              </button>

              <button

                onClick={() => { setShowDeleteModal(false); setSelectedJudge(null); }}

                disabled={loading}

                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

              >

                Cancel

              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}

